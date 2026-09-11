import {createHash,randomUUID} from 'node:crypto';
import type {CancelDurableWaitPayload,DurableWaitRecord,DurableWaitSource,DurableWakeupRecord,EntityRef,EventEnvelope,RecheckDurableWaitPayload,RegisterDurableWaitPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {currentIdentity} from '../identity/owner.ts';
import {CoreError} from '../internal/errors.ts';
import {readCommittedEvent} from './inbox.ts';

export type WaitPermission='abh.runtime.register-wait'|'abh.runtime.recheck-wait'|'abh.runtime.cancel-wait';
/** Installed condition/Owner implementation. All callbacks use this UoW; none may do external I/O. */
export interface InstalledWaitCondition {
  readonly conditionRef:EntityRef;
  readonly eventTypes:readonly EventEnvelope['type'][];
  fenceRefs(tx:TenantTransaction,input:RegisterDurableWaitPayload):Promise<EntityRef[]>;
  /** Revalidate current Service, authority, source read permission and waiting Owner scope, including replay. */
  admit(tx:TenantTransaction,input:RegisterDurableWaitPayload,target:EntityRef,permission:WaitPermission):Promise<void>;
  /** Persist the real Owner's Waiting intent in the same transaction; called only for a new registration. */
  enterWaiting(tx:TenantTransaction,command:CommandIdentity,input:RegisterDurableWaitPayload,waitRef:EntityRef):Promise<EntityRef>;
  /** Read authoritative durable source facts, never event payload or process memory. */
  readSource(tx:TenantTransaction,input:RegisterDurableWaitPayload):Promise<DurableWaitSource>;
}
export const waitRegistration=(record:RegisterDurableWaitPayload):RegisterDurableWaitPayload=>({ownerRef:record.ownerRef,waitKey:record.waitKey,dueAt:record.dueAt,causeRef:record.causeRef,authorityRef:record.authorityRef,conditionRef:record.conditionRef,sourceRef:record.sourceRef});
const same=(left:EntityRef,right:EntityRef)=>canonicalJson(left)===canonicalJson(right);
const sameObject=(left:EntityRef,right:EntityRef)=>left.type===right.type&&left.id===right.id;
const zeroDigest='sha256:'+'0'.repeat(64);
export function durableWaitRef(org:string,input:Pick<RegisterDurableWaitPayload,'ownerRef'|'waitKey'>):DurableWaitRecord['waitRef']{
  const h=createHash('sha256').update(canonicalJson([org,input.ownerRef.type,input.ownerRef.id,input.waitKey])).digest('hex');
  return {type:'abh.durable-wait',id:`${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`,version:1};
}

/** Single writer of durable waiting and notification facts. A wakeup never decides the waiting business outcome. */
export class DurableWaitOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<DurableWaitRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.durable-wait')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,rows=await tx.owner('DurableExecution')`SELECT record,version,status,owner_type,owner_id,wait_key,due_at FROM runtime.waits
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],record=contract('DurableWaitRecord',row.record);
    if(record.waitRef.id!==ref.id||record.waitRef.version!==Number(row.version)||record.resourceOrganizationId!==c.resourceOrganizationId||record.status!==row.status||record.ownerRef.type!==row.owner_type||record.ownerRef.id!==row.owner_id||record.waitKey!==row.wait_key||Date.parse(record.dueAt)!==row.due_at.getTime()
      ||await inputDigest(waitRegistration(record))!==record.registrationDigest||await digestContract('DurableWaitRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  /** Tenant-scoped bounded compensation scan. Every candidate must reenter current admission in a fresh command. */
  async pending(tx:TenantTransaction,limit=100,afterId?:string,conditionRef?:EntityRef,authorityRef?:EntityRef):Promise<EntityRef[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    if(afterId)contract('UUID',afterId);if(conditionRef)contract('EntityRef',conditionRef);if(authorityRef)contract('EntityRef',authorityRef);
    const condition=conditionRef?JSON.stringify(conditionRef):null,authority=authorityRef?JSON.stringify(authorityRef):null,c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    const rows=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.waits WHERE resource_organization_id=${c.resourceOrganizationId}
      AND status='Pending' AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND (${afterId??null}::uuid IS NULL OR id>${afterId??null}::uuid)
      AND (${condition}::text::jsonb IS NULL OR record->'conditionRef'=${condition}::text::jsonb)
      AND (${authority}::text::jsonb IS NULL OR record->'authorityRef'=${authority}::text::jsonb)
      ORDER BY id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.durable-wait',id:row.id,version:Number(row.version)}));
  }
  async getWakeup(tx:TenantTransaction,ref:EntityRef):Promise<DurableWakeupRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.durable-wakeup')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('DurableExecution')`SELECT record,version,wait_id FROM runtime.wakeups WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],record=contract('DurableWakeupRecord',row.record);
    if(!same(record.wakeupRef,ref)||record.wakeupRef.version!==Number(row.version)||record.waitRef.id!==row.wait_id||record.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('DurableWakeupRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  /** Call from executeCommand.authorize as well, so a saved Command receipt never bypasses current admission. */
  async admit(tx:TenantTransaction,input:RegisterDurableWaitPayload,installed:InstalledWaitCondition,permission:WaitPermission):Promise<void>{
    contract('RegisterDurableWaitPayload',input);const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver'||!same(installed.conditionRef,input.conditionRef))throw new CoreError('FORBIDDEN');
    // Semantic lock precedes source/Owner locks, preserving the usual Control -> Ledger -> aggregate lock order.
    const ref=durableWaitRef(c.resourceOrganizationId,input),key=`~wait/${c.resourceOrganizationId}/${ref.id}`;
    await tx.lock(0,key,()=>tx.owner('DurableExecution')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...await installed.fenceRefs(tx,input)]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    if((await currentIdentity(tx)).scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');
    await installed.admit(tx,structuredClone(input),ref,permission);
  }
  async #source(tx:TenantTransaction,input:RegisterDurableWaitPayload,installed:InstalledWaitCondition,previous?:DurableWaitSource):Promise<DurableWaitSource>{
    const source=contract('DurableWaitSource',await installed.readSource(tx,structuredClone(input))),baseline=previous?.sourceRef??input.sourceRef;
    if(!sameObject(source.sourceRef,baseline)||source.sourceRef.version<baseline.version
      ||previous&&source.sourceRef.version===baseline.version&&(source.eventOrdinal<previous.eventOrdinal
        ||source.eventOrdinal===previous.eventOrdinal&&canonicalJson(source)!==canonicalJson(previous)))throw new CoreError('PRECONDITION_FAILED');return source;
  }
  async register(tx:TenantTransaction,command:CommandIdentity,input:RegisterDurableWaitPayload,installed:InstalledWaitCondition):Promise<DurableWaitRecord>{
    await this.admit(tx,input,installed,'abh.runtime.register-wait');const c=tx.context.tenant,ref=durableWaitRef(c.resourceOrganizationId,input),digest=await inputDigest(input);
    const prior=await tx.owner('DurableExecution')`SELECT id FROM runtime.waits WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}`;
    if(prior[0]){const record=await this.get(tx,ref);if(record.registrationDigest!==digest)throw new CoreError('IDEMPOTENCY_CONFLICT');return record;}
    const waitingIntentRef=contract('EntityRef',await installed.enterWaiting(tx,command,structuredClone(input),ref));
    const source=await this.#source(tx,input,installed),[clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('DurableWaitRecord',{waitRef:ref,resourceOrganizationId:c.resourceOrganizationId,...input,registrationDigest:digest,waitingIntentRef,status:'Pending',source,registeredAt:clock!.now.toISOString(),digest:zeroDigest});
    const record=contract('DurableWaitRecord',{...unsigned,digest:await digestContract('DurableWaitRecord',unsigned)});
    await tx.owner('DurableExecution')`INSERT INTO runtime.waits(resource_organization_id,id,workspace_id,purpose_names,owner_type,owner_id,wait_key,due_at,status,record)
      VALUES (${c.resourceOrganizationId},${ref.id},${c.workspaceId??null},${[c.purposeOfUse]},${input.ownerRef.type},${input.ownerRef.id},${input.waitKey},${input.dueAt},'Pending',${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:ref,eventType:'abh.durable-wait.registered',changedFields:['ownerRef','source','status'],relatedRefs:[waitingIntentRef,input.causeRef,input.authorityRef]});
    return this.#resolve(tx,command,record,source,clock!.now);
  }
  async recheck(tx:TenantTransaction,command:CommandIdentity,input:RecheckDurableWaitPayload,installed:InstalledWaitCondition):Promise<DurableWaitRecord>{
    contract('RecheckDurableWaitPayload',input);const initial=await this.get(tx,input.waitRef),reg=waitRegistration(initial);
    await this.admit(tx,reg,installed,'abh.runtime.recheck-wait');const current=await this.get(tx,input.waitRef);
    if(input.waitRef.version>current.waitRef.version)throw new CoreError('VERSION_CONFLICT');
    if(input.triggerEventRef){
      const event=await readCommittedEvent(tx,input.triggerEventRef);
      if(!installed.eventTypes.includes(event.type)||!sameObject(event.aggregateRef,current.sourceRef))throw new CoreError('FORBIDDEN');
    }
    if(current.status!=='Pending')return current;
    const source=await this.#source(tx,reg,installed,current.source),[clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    if(input.triggerEventRef){const event=await readCommittedEvent(tx,input.triggerEventRef);if(source.sourceRef.version<event.aggregateVersion||source.sourceRef.version===event.aggregateVersion&&source.eventOrdinal<event.eventOrdinal)throw new CoreError('PRECONDITION_FAILED');}
    return this.#resolve(tx,command,current,source,clock!.now,input.triggerEventRef);
  }
  async #resolve(tx:TenantTransaction,command:CommandIdentity,current:DurableWaitRecord,source:DurableWaitSource,now:Date,triggerEventRef?:EntityRef):Promise<DurableWaitRecord>{
    if(!source.satisfied&&now.getTime()<Date.parse(current.dueAt)){
      if(canonicalJson(source)===canonicalJson(current.source))return current;
      const unsigned=contract('DurableWaitRecord',{...current,waitRef:{...current.waitRef,version:current.waitRef.version+1},source,digest:zeroDigest});
      const next=contract('DurableWaitRecord',{...unsigned,digest:await digestContract('DurableWaitRecord',unsigned)});
      await this.#save(tx,current,next);
      await appendChange(tx,{command,target:next.waitRef,eventType:'abh.durable-wait.observed',changedFields:['source'],relatedRefs:source.evidenceRefs});return next;
    }
    const c=tx.context.tenant,ref={...current.waitRef,version:current.waitRef.version+1};
    const unsigned=contract('DurableWakeupRecord',{wakeupRef:{type:'abh.durable-wakeup',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,waitRef:ref,ownerRef:current.ownerRef,authorityRef:current.authorityRef,
      reason:source.satisfied?'Condition':'Deadline',source,...(triggerEventRef?{triggerEventRef}:{}),createdAt:now.toISOString(),digest:zeroDigest});
    const wakeup=contract('DurableWakeupRecord',{...unsigned,digest:await digestContract('DurableWakeupRecord',unsigned)});
    const nextUnsigned=contract('DurableWaitRecord',{...current,waitRef:ref,status:'Succeeded',source,resolvedAt:now.toISOString(),wakeupRef:wakeup.wakeupRef,digest:zeroDigest});
    const next=contract('DurableWaitRecord',{...nextUnsigned,digest:await digestContract('DurableWaitRecord',nextUnsigned)});
    await this.#save(tx,current,next);
    await tx.owner('DurableExecution')`INSERT INTO runtime.wakeups(resource_organization_id,id,workspace_id,purpose_names,wait_id,record)
      VALUES (${c.resourceOrganizationId},${wakeup.wakeupRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${current.waitRef.id},${JSON.stringify(wakeup)}::text::jsonb)`;
    await appendChange(tx,{command,target:next.waitRef,eventType:'abh.durable-wait.succeed',changedFields:['status','source','wakeupRef'],relatedRefs:[wakeup.wakeupRef]});
    await appendChange(tx,{command,target:wakeup.wakeupRef,eventType:'abh.durable-wakeup.created',changedFields:['reason','source'],relatedRefs:[next.waitRef,current.ownerRef,current.authorityRef]});return next;
  }
  async cancel(tx:TenantTransaction,command:CommandIdentity,input:CancelDurableWaitPayload,installed:InstalledWaitCondition):Promise<{wait:DurableWaitRecord;disposition:'Prevented'|'AlreadyClaimed'|'AlreadyTerminal'}>{
    contract('CancelDurableWaitPayload',input);const initial=await this.get(tx,input.waitRef);await this.admit(tx,waitRegistration(initial),installed,'abh.runtime.cancel-wait');
    const current=await this.get(tx,input.waitRef);
    if(input.waitRef.version>current.waitRef.version||input.expectedVersion>current.waitRef.version)throw new CoreError('VERSION_CONFLICT');
    if(current.status!=='Pending')return {wait:current,disposition:current.status==='Succeeded'?'AlreadyClaimed':'AlreadyTerminal'};
    if(input.waitRef.version!==input.expectedVersion||input.expectedVersion!==current.waitRef.version)throw new CoreError('VERSION_CONFLICT');
    const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('DurableWaitRecord',{...current,waitRef:{...current.waitRef,version:current.waitRef.version+1},status:'Cancelled',cancelReason:input.reason,resolvedAt:clock!.now.toISOString(),digest:zeroDigest});
    const next=contract('DurableWaitRecord',{...unsigned,digest:await digestContract('DurableWaitRecord',unsigned)});await this.#save(tx,current,next);
    await appendChange(tx,{command,target:next.waitRef,eventType:'abh.durable-wait.cancel',changedFields:['status','cancelReason'],relatedRefs:[current.ownerRef]});return {wait:next,disposition:'Prevented'};
  }
  async #save(tx:TenantTransaction,current:DurableWaitRecord,next:DurableWaitRecord):Promise<void>{
    const c=tx.context.tenant,rows=await tx.owner('DurableExecution')`UPDATE runtime.waits SET record=${JSON.stringify(next)}::text::jsonb,version=${next.waitRef.version},status=${next.status},updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.waitRef.id} AND version=${current.waitRef.version} AND status='Pending' RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
  }
}

/** Internal ingress shared by installed controllers and recovery workers; receipt replay rechecks admission. */
export async function executeDurableWait(
  database:import('../data/uow.ts').Database,context:import('../internal/context.ts').VerifiedContext,options:import('../data/uow.ts').TransactionOptions,
  command:CommandIdentity,operation:
    | {kind:'Register';input:RegisterDurableWaitPayload}
    | {kind:'Recheck';input:RecheckDurableWaitPayload}
    | {kind:'Cancel';input:CancelDurableWaitPayload},installed:InstalledWaitCondition,
):Promise<DurableWaitRecord>{
  const owner=new DurableWaitOwner(),permission:WaitPermission=operation.kind==='Register'?'abh.runtime.register-wait':operation.kind==='Recheck'?'abh.runtime.recheck-wait':'abh.runtime.cancel-wait';
  if(command.type!==permission||command.digest!==await inputDigest(operation.input))throw new CoreError('INVALID_ARGUMENT');
  const {executeCommand}=await import('../data/journal.ts');
  const result=await database.transaction(context,options,tx=>executeCommand(tx,command,async()=>{
    const input=operation.kind==='Register'?operation.input:waitRegistration(await owner.get(tx,operation.input.waitRef));
    await owner.admit(tx,input,installed,permission);
  },async()=>{
    if(operation.kind==='Register')return (await owner.register(tx,command,operation.input,installed)).waitRef;
    if(operation.kind==='Recheck')return (await owner.recheck(tx,command,operation.input,installed)).waitRef;
    return (await owner.cancel(tx,command,operation.input,installed)).wait.waitRef;
  }));
  return database.transaction(context,options,tx=>owner.get(tx,result.receipt.resultRef));
}
