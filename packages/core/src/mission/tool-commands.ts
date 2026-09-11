import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {AuthorizedContextRef,InvokeToolCommand,EntityRef,RegisteredName,ToolBinding,ToolCallRecord,ToolCallResponse} from '@abh/contracts';
import type {ObjectStorePort} from '@abh/contracts/ports';
import {canonicalJson} from '@abh/contracts/digest';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {storeObjectArtifact} from '../data/object-artifacts.ts';
import {ToolGatewayOwner,type ToolAdapterPort,type ToolAdapterResult,type ToolOutputValidator,type ToolResultStorageInput} from './gateway.ts';

export interface InvokeToolPorts {
 readonly adapter:ToolAdapterPort;
 readonly outputValidator:ToolOutputValidator;
 readonly resultStorage:ToolResultStorageInput;
 readonly objectStore?:ObjectStorePort;
 readonly authorizedContextRef?:AuthorizedContextRef;
 readonly inspectionGrants?:(context:VerifiedContext,id:string,options:TransactionOptions)=>Promise<readonly EntityRef[]>;
}

type CompletedToolAdapterResult=Extract<ToolAdapterResult,{status:'Completed'}>;

async function completeCompletedToolCall(database:Database,context:VerifiedContext,options:TransactionOptions,
  current:ToolCallRecord,binding:ToolBinding,result:CompletedToolAdapterResult,targetRefs:readonly EntityRef[],
  storage:{readonly outputValidator:ToolOutputValidator;readonly resultStorage:ToolResultStorageInput;
    readonly objectStore?:ObjectStorePort;readonly authorizedContextRef?:AuthorizedContextRef},
  actualUsage?:string):Promise<ToolCallRecord>{
 const sources=[current.bindingRef,binding.capabilityRef,...targetRefs],owner=new ToolGatewayOwner(),
  completedRef={...current.callRef,version:current.callRef.version+1},
  document=canonicalJson({kind:'ToolCallResult',callRef:completedRef,output:result.output});
 const inline=async()=>database.transaction(context,options,async tx=>owner.completeResult(tx,current.callRef,result.output,
   storage.outputValidator,storage.resultStorage,{commandId:randomUUID(),type:'abh.tools.invoke',idempotencyKey:randomUUID(),
     digest:await inputDigest({operation:'tool-complete',callRef:current.callRef})},targetRefs,actualUsage));
 if(new TextEncoder().encode(document).byteLength<=65_536||!storage.objectStore)return inline();
 if(!storage.authorizedContextRef)throw new CoreError('INVALID_ARGUMENT');
 await storage.outputValidator(structuredClone(result.output));
 const stored=await storeObjectArtifact(database,context,options,{content:document,
  payload:{ownerRef:completedRef,mediaType:'application/json',dataClass:storage.resultStorage.dataClass,
   purposeNames:[context.tenant.purposeOfUse],sourceRefs:sources,region:storage.resultStorage.region,
   retentionPolicyRef:storage.resultStorage.retentionPolicyRef},
  objectStore:storage.objectStore,authorizedContextRef:storage.authorizedContextRef,
  verifyReferences:async refs=>{if(refs.length!==sources.length+2)throw new CoreError('PRECONDITION_FAILED');}});
 if(stored.status!=='Available')throw new CoreError('DEPENDENCY_TIMEOUT');
 return database.transaction(context,options,async tx=>owner.completeResult(tx,current.callRef,result.output,
   storage.outputValidator,storage.resultStorage,{commandId:randomUUID(),type:'abh.tools.invoke',idempotencyKey:randomUUID(),
     digest:await inputDigest({operation:'tool-complete-staged',callRef:current.callRef})},targetRefs,actualUsage,
   stored.record.artifactRef));
}

export interface ToolRecoveryRequest {
 readonly callRef:EntityRef & {readonly type:'abh.tool-call'};
 readonly binding:ToolBinding;
 readonly callKey:RegisteredName;
}

export interface ToolRecoveryPort {
 recover(request:ToolRecoveryRequest,options:{readonly signal:AbortSignal;readonly deadline:number}):
   Promise<ToolAdapterResult|undefined>;
}

function response(record:ToolCallRecord):ToolCallResponse{
 return {callRef:record.callRef,...(record.resultArtifactRef?{resultArtifactRef:record.resultArtifactRef}:{}),
  ...(record.errorDigest?{errorDigest:record.errorDigest}:{}),status:record.status as 'Completed'|'Failed'};
}

export type ReconcileToolCallInput=
 {readonly callRef:string;readonly verdict:'Completed';readonly output:unknown;
  readonly outputValidator:ToolOutputValidator;readonly resultStorage:ToolResultStorageInput;readonly usage?:string}
|{readonly callRef:string;readonly verdict:'Failed';readonly errorDigest:import('@abh/contracts').Digest;
  readonly noEffectEvidenceRef:EntityRef};

function isTerminal(record:ToolCallRecord):record is ToolCallRecord & {status:'Completed'|'Failed'}{
 return record.status==='Completed'||record.status==='Failed';
}

export async function reconcileToolCall(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ReconcileToolCallInput,grants:readonly EntityRef[]){
 requireVerifiedContext(context);
 if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
 const input=supplied,refs=structuredClone(grants),owner=new ToolGatewayOwner();
 const callRef={type:'abh.tool-call' as const,id:contract('UUID',input.callRef),version:1};
 const record=await database.transaction(context,options,async tx=>{
  const locked=await lockFences(tx,[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1},...refs]);
  if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
  const current=await owner.get(tx,callRef.id);
  await assertCurrentGrants(tx,{objectRef:{...current.bindingRef,version:1},scopeRefs:[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1}],action:'abh.tools.invoke'},refs);
  if(input.verdict==='Completed')return owner.completeResult(tx,{...callRef,version:current.callRef.version},input.output,
    input.outputValidator,input.resultStorage,{commandId:randomUUID(),type:'abh.tools.invoke',idempotencyKey:randomUUID(),
      digest:await inputDigest({operation:'tool-reconcile',callRef:current.callRef,verdict:'Completed'})},[],input.usage);
  return owner.reconcileFail(tx,{...callRef,version:current.callRef.version},input.errorDigest,input.noEffectEvidenceRef);
 });
 return response(record);
}

export async function invokeTool(database:Database,context:VerifiedContext,options:TransactionOptions,supplied:InvokeToolCommand,
  grants:readonly EntityRef[],ports:InvokeToolPorts){
 requireVerifiedContext(context);
 if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
 const input=contract('InvokeToolCommand',structuredClone(supplied)),refs=structuredClone(grants),limits={...options};
 const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 const owner=new ToolGatewayOwner();
 let commandReplayed=false;
 const prepared=await database.transaction(context,limits,async tx=>{
  const owner=new ToolGatewayOwner(),scope=input.target;
  const admissionTarget={...scope,version:1};
  const organization={type:'abh.organization' as const,id:context.tenant.resourceOrganizationId,version:1};
  const admit=async()=>{await assertCurrentGrants(tx,{objectRef:admissionTarget,scopeRefs:[organization],action:input.type},refs);};
  const result=await executeCommand(tx,command,async()=>{
   const locked=await lockFences(tx,[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1},...refs]);
   if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
   await admit();
  },async()=>{
   await admit();
   if(input.target.id!==input.payload.bindingRef.id)throw new CoreError('INVALID_ARGUMENT');
   const {record,replayed}=await owner.prepare(tx,input.payload);
   if(replayed&&record.status==='Pending')throw new CoreError('DEPENDENCY_TIMEOUT');
   return record.callRef;
   });
  commandReplayed=result.replayed;
  return owner.get(tx,result.receipt.resultRef.id);
 });
 if(isTerminal(prepared))return response(prepared);
 if(commandReplayed)throw new CoreError('DEPENDENCY_TIMEOUT');
 if(options.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
 await database.transaction(context,limits,tx=>owner.assertChargeHeld(tx,prepared.callRef.id));
 try {
  const result=await ports.adapter.call({
   callRef:prepared.callRef,binding:await database.transaction(context,limits,tx=>new ToolGatewayOwner().binding(tx,prepared.bindingRef.id)),
   callKey:prepared.callKey,arguments:input.payload.arguments,...(input.payload.targetRefs?{targetRefs:input.payload.targetRefs}:{targetRefs:[]}),
  },{signal:options.signal});
  if(result.status==='Failed'){
   const failed=await database.transaction(context,limits,tx=>owner.fail(tx,prepared.callRef,result.errorDigest));
   return {...response(failed),errorDigest:result.errorDigest};
  }
  if(result.status!=='Completed')throw new CoreError('DEPENDENCY_TIMEOUT');
  const binding=await database.transaction(context,limits,tx=>new ToolGatewayOwner().binding(tx,prepared.bindingRef.id));
  return response(await completeCompletedToolCall(database,context,limits,prepared,binding,result,
    input.payload.targetRefs??[],ports,result.usage));
 } catch(error) {
  console.error(error);
  const record=await database.transaction(context,{...limits,signal:AbortSignal.any([options.signal,AbortSignal.timeout(1000)])},
    tx=>owner.get(tx,prepared.callRef.id));
  if(record.status==='Pending')throw new CoreError('DEPENDENCY_TIMEOUT');
  return response(record);
 }
}

export interface ToolRecoveryOptions {
 readonly workerId:string;
 readonly context:ContextSource;
 readonly grants:readonly EntityRef[];
 readonly outputValidator:ToolOutputValidator;
 readonly resultStorage:ToolResultStorageInput;
 readonly objectStore?:ObjectStorePort;
 readonly authorizedContextRef?:AuthorizedContextRef;
 readonly recovery:ToolRecoveryPort;
 readonly signal:AbortSignal;
 readonly pageSize?:number;
 readonly intervalMs?:number;
 readonly transactionTimeoutMs?:number;
 readonly minimumAgeMs?:number;
 readonly leaseSeconds?:number;
 onPage?(result:{readonly scanned:number;readonly recovered:number},options:TransactionOptions):Promise<void>;
}

export async function recoverPendingToolCall(database:Database,context:VerifiedContext,options:TransactionOptions,
  callRef:EntityRef & {readonly type:'abh.tool-call'},input:ToolRecoveryOptions):Promise<ToolCallResponse|undefined>{
 requireVerifiedContext(context);contract('EntityRef',structuredClone(callRef));
 if(context.tenant.actor.type!=='Service'||context.tenant.purposeOfUse!=='abh.mission.manage'||callRef.type!=='abh.tool-call')
  throw new CoreError('FORBIDDEN');
 const workerId=contract('UUID',input.workerId),leaseSeconds=input.leaseSeconds??30;
 if(!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>30)throw new CoreError('INVALID_ARGUMENT');
 const owner=new ToolGatewayOwner(),leases=new WorkLeaseOwner(),refs=structuredClone(input.grants);
 const claimPayload={targetRef:callRef,workerId,leaseSeconds};
 const claimCommand={commandId:randomUUID(),type:'abh.tools.recover',idempotencyKey:randomUUID(),
  digest:await inputDigest(claimPayload)};
 let lease:Awaited<ReturnType<WorkLeaseOwner['get']>>;
 try{
  lease=await database.transaction(context,options,async tx=>{
   const locked=await lockFences(tx,[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1},...refs]);
   if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
   const current=await owner.get(tx,callRef.id);
   await assertCurrentGrants(tx,{objectRef:{...current.bindingRef,version:1},scopeRefs:[{type:'abh.organization',
     id:context.tenant.resourceOrganizationId,version:1}],action:'abh.tools.invoke'},refs);
   if(current.callRef.version!==callRef.version||current.status!=='Pending')throw new CoreError('PRECONDITION_FAILED');
   await owner.assertChargeHeld(tx,callRef.id);
   return leases.claim(tx,claimCommand,claimPayload,async(tx,target)=>{
    const record=await owner.get(tx,target.id);
    if(record.status!=='Pending')throw new CoreError('PRECONDITION_FAILED');
    return ['abh.mission.manage'];
   });
  });
 }catch(error){
  if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return undefined;
  throw error;
 }
 const release=async()=>{try{
  await database.transaction(context,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(1000)])},
   async tx=>leases.release(tx,{commandId:randomUUID(),type:'abh.tools.recover',idempotencyKey:randomUUID(),
     digest:await inputDigest({workerId,fencingToken:lease.fencingToken})},lease.leaseRef,workerId,lease.fencingToken));
 }catch{}};
 try{
  const current=await database.transaction(context,options,async tx=>owner.get(tx,callRef.id));
  if(current.status!=='Pending')return undefined;
  const binding=await database.transaction(context,options,tx=>owner.binding(tx,current.bindingRef.id));
  const deadline=Math.min(options.deadline,Date.parse(lease.leaseUntil));
  const result=await boundedCallback(recoveryOptions=>input.recovery.recover(
    {callRef,binding,callKey:current.callKey},recoveryOptions),{deadline,signal:options.signal});
  if(!result)return undefined;
 const admitted=result.status==='Completed'?await completeCompletedToolCall(database,context,
   {...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(1000)])},current,binding,result,[],input,result.usage)
  :await database.transaction(context,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(1000)])},
   async tx=>{
    await assertCurrentGrants(tx,{objectRef:{...current.bindingRef,version:1},scopeRefs:[{type:'abh.organization',
      id:context.tenant.resourceOrganizationId,version:1}],action:'abh.tools.invoke'},refs);
    const admitted=await owner.fail(tx,callRef,result.errorDigest);
    await leases.requireCurrent(tx,lease.leaseRef,workerId,lease.fencingToken,callRef);
    return admitted;
   });
  return {callRef:admitted.callRef,...(admitted.resultArtifactRef?{resultArtifactRef:admitted.resultArtifactRef}:{}),
    ...(admitted.errorDigest?{errorDigest:admitted.errorDigest}:{}),status:admitted.status as 'Completed'|'Failed'};
 }catch(error){
  if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))return undefined;
  throw error;
 }finally{await release();}
}

export async function runToolRecoveryWorker(database:Database,input:ToolRecoveryOptions):Promise<void>{
 const pageSize=input.pageSize??100,intervalMs=input.intervalMs??1000,timeout=input.transactionTimeoutMs??10000,
  minimumAgeMs=input.minimumAgeMs??5000;
 contract('UUID',input.workerId);
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(intervalMs)||intervalMs<1||intervalMs>60000
   ||!Number.isInteger(timeout)||timeout<1||timeout>30000||!Number.isSafeInteger(minimumAgeMs)||minimumAgeMs<0
   ||minimumAgeMs>3_600_000)throw new CoreError('INVALID_ARGUMENT');
 let cursor:string|undefined,tenantKey:string|undefined;
 const currentContext=async()=>{
  const value=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+timeout,signal:input.signal}),c=value.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.mission.manage')throw new CoreError('FORBIDDEN');
  const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actor.id,c.actingOrganizationId]);
  if(tenantKey!==undefined&&tenantKey!==key)throw new CoreError('FORBIDDEN');
  tenantKey=key;return value;
 };
 const options=():TransactionOptions=>({deadline:Date.now()+timeout,signal:input.signal});
 while(!input.signal.aborted){
  try{
   const current=await currentContext();
   const page=await database.transaction(current,options(),async tx=>new ToolGatewayOwner().pendingRecovery(
     tx,pageSize,cursor,minimumAgeMs));
   let recovered=0;
   for(const callRef of page){
    if(input.signal.aborted)break;
    if(await recoverPendingToolCall(database,await currentContext(),options(),callRef,input))recovered++;
   }
   if(input.signal.aborted)return;
   cursor=page.length===pageSize?page.at(-1)!.id:undefined;
   if(input.onPage)await boundedCallback(options=>input.onPage?.({scanned:page.length,recovered},options)??Promise.resolve(),
     {deadline:Date.now()+10000,signal:input.signal});
   await delay(intervalMs,undefined,{signal:input.signal});
  }catch(error){if(input.signal.aborted)return;throw error;}
 }
}
