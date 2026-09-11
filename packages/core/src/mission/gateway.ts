import {randomUUID} from 'node:crypto';
import type {Digest,EntityRef,InvokeToolPayload,RegisteredName,ToolBinding,ToolCallInspection,ToolCallRecord,ToolCallResponse} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {ObjectArtifactOwner} from '../data/object-artifacts.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {CoreError} from '../internal/errors.ts';

const missionPurposeNames=['abh.mission.manage'];

export interface ToolAdapterRequest {
 readonly callRef:EntityRef & {readonly type:'abh.tool-call'};
 readonly binding:ToolBinding;
 readonly callKey:RegisteredName;
 readonly arguments:{readonly [key:string]:unknown};
 readonly targetRefs:readonly EntityRef[];
}

export type ToolAdapterResult={readonly status:'Completed';readonly output:unknown;readonly usage?:string}|{
 readonly status:'Failed';readonly errorDigest:Digest};

export interface ToolAdapterPort {
 call(request:ToolAdapterRequest,options:{readonly signal:AbortSignal}):Promise<ToolAdapterResult>;
}

export interface ToolResultStorageInput {
 readonly dataClass:RegisteredName;
 readonly region:string;
 readonly retentionPolicyRef:EntityRef;
}

export type ToolOutputValidator=(output:unknown)=>Promise<void>;

export type ToolPrepareOutcome={record:ToolCallRecord;replayed:boolean};

function decimalWithin(actual:string,reserved:string):boolean{
 const scale=12,normalize=(value:string)=>{
  const [whole,fraction='']=value.split('.'),padded=(fraction+'0'.repeat(scale)).slice(0,scale);
  return BigInt(`${whole}${padded}`);
 };
 return normalize(actual)<=normalize(reserved);
}

export type ToolCostInspection=ToolCallInspection['cost'];

export class ToolGatewayOwner {
 async bind(tx:TenantTransaction,invocationRef:import('@abh/contracts').EntityRef,capabilityRef:import('@abh/contracts').EntityRef,callLimit:number):Promise<ToolBinding>{
  const c=tx.context.tenant;
  invocationRef=contract('EntityRef',invocationRef);capabilityRef=contract('EntityRef',capabilityRef);
  if(invocationRef.type!=='abh.invocation'||capabilityRef.type!=='abh.tool-capability'
    ||!Number.isSafeInteger(callLimit)||callLimit<1||callLimit>10_000)throw new CoreError('INVALID_ARGUMENT');
  const bindingRef={type:'abh.tool-binding' as const,id:randomUUID(),version:1};
  const snapshotRef={type:'abh.release-pin-set' as const,id:randomUUID(),version:1};
  const invocationTyped={...invocationRef,type:'abh.invocation' as const};
  const capabilityTyped={...capabilityRef,type:'abh.tool-capability' as const};
  const binding:ToolBinding={bindingRef,resourceOrganizationId:c.resourceOrganizationId,
   invocationRef:invocationTyped,capabilityRef:capabilityTyped,authorizedSnapshotRef:snapshotRef,callLimit,status:'Active'};
  await tx.owner('MissionController')`INSERT INTO core.tool_bindings(resource_organization_id,id,workspace_id,purpose_names,record,invocation_id,status)
    VALUES (${c.resourceOrganizationId},${bindingRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(binding)}::text::jsonb,${invocationRef.id},'Active')`;
  return binding;
 }
async prepare(tx:TenantTransaction,input:InvokeToolPayload):Promise<ToolPrepareOutcome>{
  contract('InvokeToolPayload',structuredClone(input));
  const c=tx.context.tenant;
  const bindingId=input.bindingRef.id;
  const [binding]=await tx.owner('MissionController')`SELECT record,status,version FROM core.tool_bindings
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${bindingId} AND deleted_at IS NULL FOR UPDATE`;
  if(!binding)throw new CoreError('RESOURCE_NOT_FOUND');
  const bound=contract('ToolBinding',binding.record);
  if(bound.bindingRef.id!==bindingId||bound.resourceOrganizationId!==c.resourceOrganizationId
    ||bound.status!==(binding.status as ToolBinding['status'])||binding.status!=='Active')throw new CoreError('PRECONDITION_FAILED');
   if(bound.deadline&&Date.parse(bound.deadline)<=Date.now()){
    const expired=contract('ToolBinding',{...bound,status:'Expired'});
   const changed=await tx.owner('MissionController')`UPDATE core.tool_bindings SET status='Expired',
     record=${JSON.stringify(expired)}::text::jsonb,version=version+1,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${bindingId} AND version=${Number(binding.version)} AND status='Active' RETURNING id`;
   if(!changed.length)throw new CoreError('VERSION_CONFLICT');
   throw new CoreError('PRECONDITION_FAILED');
  }
  if(input.budget&&Date.parse(input.budget.expiresAt)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
  const argumentDigest=await digestBytes(new TextEncoder().encode(canonicalJson(input)));
  if(new TextEncoder().encode(canonicalJson(input.arguments)).byteLength>64*1024)throw new CoreError('INVALID_ARGUMENT');
  const [existing]=await tx.owner('MissionController')`SELECT record FROM core.tool_calls
    WHERE resource_organization_id=${c.resourceOrganizationId} AND binding_id=${input.bindingRef.id} AND call_key=${input.callKey}`;
  if(existing){
   const prior=contract('ToolCallRecord',existing.record);
   if(prior.argumentDigest!==argumentDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');
   const [link]=await tx.owner('MissionController')`SELECT budget_ledger_id,amount FROM core.tool_call_reservations
     WHERE resource_organization_id=${c.resourceOrganizationId} AND call_id=${prior.callRef.id} AND deleted_at IS NULL`;
   if((input.budget===undefined)!==(link===undefined))throw new CoreError('IDEMPOTENCY_CONFLICT');
   if(link&&(input.budget!.ledgerRef.id!==link.budget_ledger_id||input.budget!.amount!==link.amount))
     throw new CoreError('IDEMPOTENCY_CONFLICT');
   return {record:prior,replayed:true};
  }
  const [usage]=await tx.owner('MissionController')`SELECT count(*)::int AS calls FROM core.tool_calls
    WHERE resource_organization_id=${c.resourceOrganizationId} AND binding_id=${bindingId} AND deleted_at IS NULL`;
  if(Number(usage?.calls??0)>=bound.callLimit)throw new CoreError('LIMIT_EXCEEDED');
  const callRef={type:'abh.tool-call' as const,id:randomUUID(),version:1};
  let reservationRef:(EntityRef & {readonly type:'abh.reservation'})|undefined;
  if(input.budget){
   const command=await costCommand('reserve',callRef);
   const [reservation]=await new LedgerOwner().reserveAll(tx,command,{requestRef:callRef,bindingRef:bound.invocationRef,
     expiresAt:input.budget.expiresAt,requirements:[{ledgerRef:input.budget.ledgerRef,amount:input.budget.amount}]});
   reservationRef=reservation!.reservationRef;
  }
  const record:ToolCallRecord={callRef,resourceOrganizationId:c.resourceOrganizationId,bindingRef:input.bindingRef,
   callKey:input.callKey,argumentDigest,status:'Pending',startedAt:new Date().toISOString()};
  if(reservationRef)record.costReservationRef=reservationRef;
  await tx.owner('MissionController')`INSERT INTO core.tool_calls(resource_organization_id,id,workspace_id,purpose_names,record,binding_id,call_key,status)
    VALUES (${c.resourceOrganizationId},${callRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(record)}::text::jsonb,${input.bindingRef.id},${input.callKey},'Pending')`;
  if(reservationRef){
   await tx.owner('MissionController')`INSERT INTO core.tool_call_reservations(resource_organization_id,id,workspace_id,purpose_names,call_id,reservation_id,budget_ledger_id,amount,status)
     VALUES (${c.resourceOrganizationId},${randomUUID()},${c.workspaceId??null},${missionPurposeNames},
       ${callRef.id},${reservationRef.id},${input.budget!.ledgerRef.id},${input.budget!.amount},'Linked')`;
  }
  return {record,replayed:false};
 }

 async assertChargeHeld(tx:TenantTransaction,callId:string):Promise<void>{
  const charge=await this.#charge(tx,callId);if(!charge)return;
  const {reservation}=charge;
  if(reservation.status!=='Held'||Date.parse(reservation.expiresAt)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
 }

 async cost(tx:TenantTransaction,callId:string):Promise<ToolCostInspection>{
  const charge=await this.#charge(tx,callId);
  if(!charge)return {metered:false};
  const {reservation}=charge;
  return {metered:true,status:reservation.status as 'Held'|'Consumed'|'Released',reservationRef:reservation.reservationRef};
 }

 async #load(tx:TenantTransaction,callRef:EntityRef & {readonly type:'abh.tool-call'}):Promise<{record:ToolCallRecord;version:number}>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.tool_calls
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${callRef.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('ToolCallRecord',row.record);
  if(record.callRef.id!==callRef.id||record.callRef.version!==Number(row.version)||record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  return {record,version:Number(row.version)};
 }

 async binding(tx:TenantTransaction,id:string):Promise<ToolBinding>{
  contract('UUID',id);
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,status FROM core.tool_bindings
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const binding=contract('ToolBinding',row.record);
  if(binding.bindingRef.id!==id||binding.resourceOrganizationId!==c.resourceOrganizationId
    ||binding.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  return binding;
 }

async completeResult(tx:TenantTransaction,callRef:EntityRef & {readonly type:'abh.tool-call'},output:unknown,
   outputValidator:ToolOutputValidator,storage:ToolResultStorageInput,command:CommandIdentity,
   targetRefs:readonly EntityRef[]=[],actualUsage?:string,stagedArtifactRef?:EntityRef):Promise<ToolCallRecord>{
  contract('EntityRef',structuredClone(callRef));
  if(callRef.type!=='abh.tool-call')throw new CoreError('INVALID_ARGUMENT');
  await outputValidator(structuredClone(output));
  contract('RegisteredName',storage.dataClass);contract('EntityRef',structuredClone(storage.retentionPolicyRef));
  if(storage.retentionPolicyRef.type!=='abh.retention-policy'||typeof storage.region!=='string'
    ||storage.region.length<1||storage.region.length>128)throw new CoreError('INVALID_ARGUMENT');
  const {record,version}=await this.#load(tx,callRef);
  if(record.status!=='Pending')throw new CoreError('PRECONDITION_FAILED');
  if(actualUsage!==undefined)contract('NonnegativeDecimal',actualUsage);
  const [binding]=await tx.owner('MissionController')`SELECT record FROM core.tool_bindings
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${record.bindingRef.id} AND deleted_at IS NULL`;
  if(!binding)throw new CoreError('RESOURCE_NOT_FOUND');
  const bound=contract('ToolBinding',binding.record);
  const sources=[record.bindingRef,bound.capabilityRef,...targetRefs.map(ref=>contract('EntityRef',structuredClone(ref)))];
  const completedRef={...record.callRef,version:version+1};
  const document={kind:'ToolCallResult',callRef:completedRef,output};
  const artifact=stagedArtifactRef?(await new ObjectArtifactOwner().load(tx,stagedArtifactRef,
    async(stored,object)=>{if(stored.ownerRef.id!==completedRef.id||stored.ownerRef.type!=='abh.tool-call'
      ||JSON.stringify(stored.sourceRefs)!==JSON.stringify(sources)||stored.mediaType!=='application/json'
      ||stored.dataClass!==storage.dataClass||stored.region!==storage.region
      ||stored.retentionPolicyRef.id!==storage.retentionPolicyRef.id
      ||object.digest!==stored.contentDigest||object.sizeBytes!==stored.sizeBytes)throw new CoreError('PRECONDITION_FAILED');})).record
  :await new InlineArtifactOwner().store(tx,command,{
   ownerRef:completedRef,mediaType:'application/json',dataClass:storage.dataClass,
   purposeNames:[tx.context.tenant.purposeOfUse],sourceRefs:sources,
   region:storage.region,retentionPolicyRef:storage.retentionPolicyRef,content:canonicalJson(document),
  },async refs=>{if(refs.length!==4)throw new CoreError('PRECONDITION_FAILED');});
  await this.#settle(tx,record.callRef.id,actualUsage===undefined
   ?{verdict:'Completed',evidenceRef:artifact.artifactRef}
   :{verdict:'Completed',evidenceRef:artifact.artifactRef,actualUsage});
  const next=contract('ToolCallRecord',{...record,callRef:completedRef,
   resultArtifactRef:artifact.artifactRef,status:'Completed',completedAt:new Date().toISOString()});
  const changed=await tx.owner('MissionController')`UPDATE core.tool_calls SET status='Completed',record=${JSON.stringify(next)}::text::jsonb,
   version=version+1,updated_at=CURRENT_TIMESTAMP
   WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${record.callRef.id} AND version=${version} AND status='Pending' RETURNING id`;
  if(!changed.length)throw new CoreError('VERSION_CONFLICT');
  return next;
 }

async fail(tx:TenantTransaction,callRef:EntityRef & {readonly type:'abh.tool-call'},errorDigest:Digest):Promise<ToolCallRecord>{
  contract('EntityRef',structuredClone(callRef));contract('Digest',errorDigest);
  if(callRef.type!=='abh.tool-call')throw new CoreError('INVALID_ARGUMENT');
  const {record,version}=await this.#load(tx,callRef);
  if(record.status!=='Pending')throw new CoreError('PRECONDITION_FAILED');
  await this.#charge(tx,record.callRef.id);
  const next=contract('ToolCallRecord',{...record,callRef:{...record.callRef,version:version+1},errorDigest,
   status:'Failed',completedAt:new Date().toISOString()});
  const changed=await tx.owner('MissionController')`UPDATE core.tool_calls SET status='Failed',record=${JSON.stringify(next)}::text::jsonb,
   version=version+1,updated_at=CURRENT_TIMESTAMP
   WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${record.callRef.id} AND version=${version} AND status='Pending' RETURNING id`;
  if(!changed.length)throw new CoreError('VERSION_CONFLICT');
  return next;
 }

 async reconcileFail(tx:TenantTransaction,callRef:EntityRef & {readonly type:'abh.tool-call'},errorDigest:Digest,
   evidenceRef:EntityRef):Promise<ToolCallRecord>{
  contract('EntityRef',structuredClone(callRef));contract('Digest',errorDigest);contract('EntityRef',structuredClone(evidenceRef));
  if(callRef.type!=='abh.tool-call'||evidenceRef.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
  const {record,version}=await this.#load(tx,callRef);
  if(record.status!=='Pending')throw new CoreError('PRECONDITION_FAILED');
  const binding=await this.binding(tx,record.bindingRef.id);
  const artifacts=new InlineArtifactOwner();
  await artifacts.lockSources(tx,[evidenceRef]);
  const document={kind:'ToolCallNoEffect',callRef:{...record.callRef,version:version+1},errorDigest};
  const {record:evidenceRecord,bytes:evidenceBytes}=await artifacts.read(tx,evidenceRef,async item=>{
   if(canonicalJson(item.ownerRef)!==canonicalJson(binding.invocationRef)
     ||item.sourceRefs.length!==1||canonicalJson(item.sourceRefs[0])!==canonicalJson(record.callRef)
     ||item.mediaType!=='application/json')throw new CoreError('PRECONDITION_FAILED');
  });
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(evidenceBytes));}catch{throw new CoreError('PRECONDITION_FAILED');}
  if(canonicalJson(parsed)!==canonicalJson(document))throw new CoreError('PRECONDITION_FAILED');
  await this.#settle(tx,record.callRef.id,{verdict:'ConfirmedNoEffect',evidenceRef:evidenceRecord.artifactRef});
  const next=contract('ToolCallRecord',{...record,callRef:document.callRef,errorDigest,failureEvidenceRef:evidenceRecord.artifactRef,
   status:'Failed',completedAt:new Date().toISOString()});
  const changed=await tx.owner('MissionController')`UPDATE core.tool_calls SET status='Failed',record=${JSON.stringify(next)}::text::jsonb,
   version=version+1,updated_at=CURRENT_TIMESTAMP
   WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${record.callRef.id} AND version=${version} AND status='Pending' RETURNING id`;
  if(!changed.length)throw new CoreError('VERSION_CONFLICT');
  return next;
 }
 async get(tx:TenantTransaction,id:string):Promise<ToolCallRecord>{
  contract('UUID',id);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record FROM core.tool_calls
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  return contract('ToolCallRecord',row.record);
 }

 async pendingRecovery(tx:TenantTransaction,limit=100,afterId?:string,
   minimumAgeMs=1000):Promise<(EntityRef & {readonly type:'abh.tool-call'})[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(minimumAgeMs)||minimumAgeMs<0
    ||minimumAgeMs>3_600_000)throw new CoreError('INVALID_ARGUMENT');
  if(afterId!==undefined)contract('UUID',afterId);
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
  const rows=await tx.owner('MissionController')`SELECT id,version FROM core.tool_calls
    WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL AND status='Pending'
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND updated_at<=clock_timestamp()-(${String(minimumAgeMs)}||' milliseconds')::interval
      AND (${afterId??null}::uuid IS NULL OR id>${afterId??null}::uuid)
    ORDER BY id LIMIT ${limit}`;
  return rows.map(row=>({type:'abh.tool-call' as const,id:String(row.id),version:Number(row.version)}));
 }

 async #charge(tx:TenantTransaction,callId:string):Promise<
   {reservationId:string;reservation:Awaited<ReturnType<LedgerOwner['getReservation']>>}|undefined>{
  const c=tx.context.tenant;
  const [link]=await tx.owner('MissionController')`SELECT reservation_id,status FROM core.tool_call_reservations
    WHERE resource_organization_id=${c.resourceOrganizationId} AND call_id=${callId} AND deleted_at IS NULL FOR UPDATE`;
  if(!link)return undefined;
  if(link.status!=='Linked')throw new CoreError('INTERNAL_ERROR');
  const reservation=await new LedgerOwner().getReservation(tx,link.reservation_id);
  return {reservationId:link.reservation_id,reservation};
 }

 async #settle(tx:TenantTransaction,callId:string,
   evidence:{verdict:'Completed'|'ConfirmedNoEffect';evidenceRef:import('@abh/contracts').EntityRef;actualUsage?:string}):Promise<void>{
  const charge=await this.#charge(tx,callId);
  if(!charge)return;
  const {reservation}=charge,ledgerOwner=new LedgerOwner(),command=await costCommand(
    evidence.verdict==='Completed'?'consume':'release',{type:'abh.tool-call',id:callId,version:1});
  if(reservation.status!=='Held')throw new CoreError('INTERNAL_ERROR');
  const ledger=await ledgerOwner.get(tx,reservation.ledgerRef.id);
  if(evidence.verdict==='Completed'&&ledger.meteringMode==='capacity'){
   await ledgerOwner.release(tx,command,{reservationRef:reservation.reservationRef,evidence});
  }else if(evidence.verdict==='Completed'){
   if(!evidence.actualUsage||!decimalWithin(evidence.actualUsage,reservation.amount))throw new CoreError('PRECONDITION_FAILED');
   await ledgerOwner.consume(tx,command,{reservationRef:reservation.reservationRef,actualUsage:evidence.actualUsage,
     receiptRef:evidence.evidenceRef});
  }else{
   await ledgerOwner.release(tx,command,{reservationRef:reservation.reservationRef,evidence});
  }
  await tx.owner('MissionController')`UPDATE core.tool_call_reservations SET status=${evidence.verdict==='Completed'?'Consumed':'Released'},
    version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=${tx.context.tenant.actor.id}
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND call_id=${callId} AND status='Linked'`;
 }
}

async function costCommand(operation:'reserve'|'consume'|'release',callRef:EntityRef):Promise<CommandIdentity>{
 const type=`abh.tools.${operation}`,payload={operation,callRef};
 return {commandId:randomUUID(),type,idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
}
