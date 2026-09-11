import {validateContract} from '@abh/contracts/schema';
import {createHash,randomUUID} from 'node:crypto';
import type {CancelWakeupRequest,CancelledWakeup,DurableWaitRecord,EntityRef,InspectDeliveryRequest,PortCallContext,RegisterDurableWaitPayload,ScheduleWakeupRequest,ScheduledWakeup,SignalWaitRequest,SignalledWait,WaitPortReceiptRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import {createErrorResponse,type ErrorCode} from '@abh/contracts/errors';
import {validatePortRequest,type DurableExecutionPort,type PortCallOptions} from '@abh/contracts/ports';
import {Database,type TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {DurableWaitOwner,durableWaitRef,waitRegistration,executeDurableWait,type InstalledWaitCondition,type WaitPermission} from './waits.ts';

/** Process-scoped handles issued by authenticated server Ingress. JSON-shaped contexts cannot register themselves. */
export class WaitContextDirectory {
  #contexts=new Map<string,{context:VerifiedContext;grantRefs:readonly EntityRef[]}>();
  register(context:VerifiedContext,grantRefs:readonly EntityRef[]):PortCallContext['requestContextRef']{
    requireVerifiedContext(context);for(const ref of grantRefs)contract('EntityRef',ref);
    for(const [key,value] of this.#contexts)if(Date.parse(value.context.tenant.contextExpiresAt)<=Date.now())this.#contexts.delete(key);
    if(this.#contexts.size>=1000&&!this.#contexts.has(context.tenant.requestId))throw new CoreError('LIMIT_EXCEEDED');
    if(this.#contexts.has(context.tenant.requestId))throw new CoreError('IDEMPOTENCY_CONFLICT');
    this.#contexts.set(context.tenant.requestId,{context,grantRefs:structuredClone(grantRefs)});
    return {type:'abh.request-context',id:context.tenant.requestId,version:1};
  }
  revoke(ref:EntityRef):void{this.#contexts.delete(ref.id);}
  resolve(call:PortCallContext){
    const entry=this.#contexts.get(call.requestContextRef.id);
    if(!entry||call.requestContextRef.type!=='abh.request-context'||call.requestContextRef.version!==1)throw new CoreError('FORBIDDEN');
    requireVerifiedContext(entry.context);
    if(entry.context.tenant.purposeOfUse!=='abh.runtime.deliver'||entry.context.tenant.actor.type!=='Service')throw new CoreError('FORBIDDEN');return entry;
  }
}
export interface WaitPortInstallation {
  /** Narrow recovery to the authority bound by this Owner installation; candidates still require current admission. */
  recoveryAuthorityRef?: EntityRef;
  condition:InstalledWaitCondition;
  /** Resolve from the actual waiting Owner and its installed policy. Caller does not choose authority or predicate. */
  registration(tx:TenantTransaction,request:ScheduleWakeupRequest):Promise<RegisterDurableWaitPayload>;
}
type WriteMethod='scheduleWakeup'|'cancelWakeup'|'signal';
type WriteRequest=ScheduleWakeupRequest|CancelWakeupRequest|SignalWaitRequest;
type Data=ScheduledWakeup|CancelledWakeup|SignalledWait;
const idFor=(value:unknown)=>{const h=createHash('sha256').update(canonicalJson(value)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};

export class DurableWaitPort implements Pick<DurableExecutionPort,'scheduleWakeup'|'cancelWakeup'|'signal'|'inspect'> {
  private database:Database;private contexts:WaitContextDirectory;private installation:WaitPortInstallation;
  constructor(database:Database,contexts:WaitContextDirectory,installation:WaitPortInstallation){this.database=database;this.contexts=contexts;this.installation={...installation,...(installation.recoveryAuthorityRef?{recoveryAuthorityRef:structuredClone(contract('EntityRef',installation.recoveryAuthorityRef))}:{})};}
  async #receipt(tx:TenantTransaction,ref:EntityRef):Promise<WaitPortReceiptRecord>{
    const c=tx.context.tenant,[row]=await tx.owner('DurableExecution')`SELECT record,wait_id FROM runtime.wait_port_receipts WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('WaitPortReceiptRecord',row.record);
    if(canonicalJson(record.receiptRef)!==canonicalJson(ref)||record.waitRef.id!==row.wait_id||record.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('WaitPortReceiptRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async #write(method:WriteMethod,original:WriteRequest,options:PortCallOptions){
    const callId=validateContract('UUID',original?.context?.callId).success?original.context.callId:randomUUID();
    const reject=(code:ErrorCode)=>({status:'Rejected' as const,error:createErrorResponse(code,callId)});
    if(!validatePortRequest(`DurableExecutionPort.${method}`,original).success)return reject('INVALID_ARGUMENT');
    const request=structuredClone(original),deadline=Date.parse(request.context.deadline);
    if(options.signal.aborted)return {status:'Cancelled' as const,effect:'None' as const};
    if(deadline<=Date.now())return reject('CONTEXT_EXPIRED');
    let entry:ReturnType<WaitContextDirectory['resolve']>;
    try{entry=this.contexts.resolve(request.context);}catch{return reject('FORBIDDEN');}
    const owner=new DurableWaitOwner(),ref='waitRef' in request?request.waitRef:durableWaitRef(entry.context.tenant.resourceOrganizationId,request);
    const {context:_context,...semantic}=request;
    const digest=await inputDigest(semantic),key=idFor([ref.id,method,method==='signal'?(request as SignalWaitRequest).committedEventRef:method==='cancelWakeup'?(request as CancelWakeupRequest).expectedVersion:'registration']);
    const command={type:'abh.runtime.execute-wait-port',commandId:randomUUID(),idempotencyKey:key,digest};
    const base=this.installation.condition,installed:InstalledWaitCondition={...base,fenceRefs:async(tx,input)=>[...await base.fenceRefs(tx,input),...entry.grantRefs]};
    const permission:WaitPermission=method==='scheduleWakeup'?'abh.runtime.register-wait':method==='signal'?'abh.runtime.recheck-wait':'abh.runtime.cancel-wait';
    try{
      const data=await this.database.transaction(entry.context,{deadline,signal:options.signal},async tx=>{
        let input:RegisterDurableWaitPayload;
        if(method==='scheduleWakeup'){
          input=contract('RegisterDurableWaitPayload',await this.installation.registration(tx,request as ScheduleWakeupRequest));
          const r=request as ScheduleWakeupRequest;
          if(canonicalJson(input.ownerRef)!==canonicalJson(r.ownerRef)||input.waitKey!==r.waitKey||input.dueAt!==r.dueAt||canonicalJson(input.causeRef)!==canonicalJson(r.causeRef))throw new CoreError('FORBIDDEN');
        }else input=waitRegistration(await owner.get(tx,ref));
        const result=await executeCommand(tx,command,async()=>{
          await owner.admit(tx,input,installed,permission);await assertCurrentGrants(tx,request.context.target,entry.grantRefs);
          if('ownerRef' in request&&(canonicalJson(request.ownerRef)!==canonicalJson(input.ownerRef)||request.waitKey!==input.waitKey))throw new CoreError('IDEMPOTENCY_CONFLICT');
        },async()=>{
          const receiptRef={type:'abh.wait-port-receipt',id:idFor([entry.context.tenant.resourceOrganizationId,key]),version:1};
          const prior=await tx.owner('DurableExecution')`SELECT id FROM runtime.wait_port_receipts WHERE resource_organization_id=${entry.context.tenant.resourceOrganizationId} AND id=${receiptRef.id}`;
          if(prior[0]){const saved=await this.#receipt(tx,receiptRef);if(saved.inputDigest!==digest||saved.method!==method)throw new CoreError('IDEMPOTENCY_CONFLICT');return receiptRef;}
          let wait:DurableWaitRecord,result:Data;
          if(method==='scheduleWakeup'){wait=await owner.register(tx,command,input,installed);result={waitRef:wait.waitRef};}
          else if(method==='cancelWakeup'){
            const r=request as CancelWakeupRequest,cancelled=await owner.cancel(tx,command,{waitRef:r.waitRef,expectedVersion:r.expectedVersion,reason:r.reason},installed);
            wait=cancelled.wait;result={waitRef:wait.waitRef,disposition:cancelled.disposition,receiptRef};
          }else{
            wait=await owner.recheck(tx,command,{waitRef:ref,triggerEventRef:(request as SignalWaitRequest).committedEventRef},installed);
            // This is the durable signal acceptance reference. Actual condition/deadline notification is wait.wakeupRef.
            result={waitRef:wait.waitRef,wakeupRef:receiptRef};
          }
          const c=tx.context.tenant,[clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
          const unsigned=contract('WaitPortReceiptRecord',{receiptRef,resourceOrganizationId:c.resourceOrganizationId,waitRef:wait.waitRef,method,inputDigest:digest,result,...(method==='signal'?{triggerEventRef:(request as SignalWaitRequest).committedEventRef}:{}),recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
          const record=contract('WaitPortReceiptRecord',{...unsigned,digest:await digestContract('WaitPortReceiptRecord',unsigned)});
          await tx.owner('DurableExecution')`INSERT INTO runtime.wait_port_receipts(resource_organization_id,id,workspace_id,purpose_names,wait_id,record)
            VALUES (${c.resourceOrganizationId},${receiptRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${wait.waitRef.id},${JSON.stringify(record)}::text::jsonb)`;
          await appendChange(tx,{command,target:receiptRef,eventType:'abh.wait-port-receipt.created',changedFields:['method','result'],relatedRefs:[wait.waitRef]});return receiptRef;
        });
        const receipt=await this.#receipt(tx,result.receipt.resultRef);
        if(receipt.method!==method||receipt.inputDigest!==digest)throw new CoreError('IDEMPOTENCY_CONFLICT');return receipt.result;
      });
      return {status:'Completed' as const,data};
    }catch(error){
      if(!(error instanceof CoreError)||['DEPENDENCY_TIMEOUT','DEPENDENCY_UNAVAILABLE'].includes(error.code))return {status:'Tracked' as const,trackingRef:ref};
      const code=['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT'].includes(error.code)&&method==='cancelWakeup'?'VERSION_CONFLICT':error.code==='IDEMPOTENCY_CONFLICT'&&method!=='cancelWakeup'?'IDEMPOTENCY_CONFLICT':error.code==='RESOURCE_NOT_FOUND'?'RESOURCE_NOT_FOUND':error.code==='INVALID_ARGUMENT'?'INVALID_ARGUMENT':error.code==='INTERNAL_ERROR'?'INTERNAL_ERROR':'FORBIDDEN';
      return reject(code);
    }
  }
  async scheduleWakeup(request:ScheduleWakeupRequest,options:PortCallOptions){return await this.#write('scheduleWakeup',request,options) as Awaited<ReturnType<DurableExecutionPort['scheduleWakeup']>>;}
  async cancelWakeup(request:CancelWakeupRequest,options:PortCallOptions){return await this.#write('cancelWakeup',request,options) as Awaited<ReturnType<DurableExecutionPort['cancelWakeup']>>;}
  async signal(request:SignalWaitRequest,options:PortCallOptions){return await this.#write('signal',request,options) as Awaited<ReturnType<DurableExecutionPort['signal']>>;}
  /** One bounded recovery sweep for an installed tenant Worker; restart the cursor after each complete sweep. */
  async recoverPending(context:PortCallContext,options:PortCallOptions,afterId?:string):Promise<{checkedRefs:EntityRef[];nextAfterId?:string}>{
    contract('PortCallContext',context);const entry=this.contexts.resolve(context),deadline=Date.parse(context.deadline),owner=new DurableWaitOwner();
    const candidates=await this.database.transaction(entry.context,{deadline,signal:options.signal},async tx=>{
      await assertCurrentGrants(tx,{objectRef:{type:'abh.durable-wait',id:context.requestContextRef.id,version:1},scopeRefs:[{type:'abh.organization',id:entry.context.tenant.resourceOrganizationId,version:1}],action:'abh.runtime.recheck-wait'},entry.grantRefs);
      return owner.pending(tx,100,afterId,this.installation.condition.conditionRef,this.installation.recoveryAuthorityRef);
    });
    const checkedRefs:EntityRef[]=[];
    for(const waitRef of candidates){
      const input=contract('RecheckDurableWaitPayload',{waitRef}),command={type:'abh.runtime.recheck-wait',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(input)};
      const base=this.installation.condition,installed:InstalledWaitCondition={...base,
        fenceRefs:async(tx,input)=>[...await base.fenceRefs(tx,input),...entry.grantRefs],
        admit:async(tx,registration,target,permission)=>{
          await base.admit(tx,registration,target,permission);
          await assertCurrentGrants(tx,{objectRef:waitRef,scopeRefs:[{type:'abh.organization',id:entry.context.tenant.resourceOrganizationId,version:1}],action:'abh.runtime.recheck-wait'},entry.grantRefs);
        }};
      const result=await executeDurableWait(this.database,entry.context,{deadline,signal:options.signal},command,{kind:'Recheck',input},installed);
      checkedRefs.push(result.waitRef);
    }
    return {checkedRefs,...(candidates.length===100?{nextAfterId:candidates[candidates.length-1]!.id}:{})};
  }
  async inspect(request:InspectDeliveryRequest,options:PortCallOptions):ReturnType<DurableExecutionPort['inspect']>{
    const callId=validateContract('UUID',request?.context?.callId).success?request.context.callId:randomUUID();
    const reject=(code:ErrorCode)=>({status:'Rejected' as const,error:createErrorResponse(code,callId)});
    if(!validatePortRequest('DurableExecutionPort.inspect',request).success||request.subjectRef.type!=='abh.durable-wait')return reject('INVALID_ARGUMENT');
    if(options.signal.aborted)return {status:'Cancelled',effect:'None'};
    try{
      const entry=this.contexts.resolve(request.context),owner=new DurableWaitOwner(),base=this.installation.condition;
      const data=await this.database.transaction(entry.context,{deadline:Date.parse(request.context.deadline),signal:options.signal},async tx=>{
        const wait=await owner.get(tx,request.subjectRef);
        await owner.admit(tx,waitRegistration(wait),{...base,fenceRefs:async(tx,input)=>[...await base.fenceRefs(tx,input),...entry.grantRefs]},'abh.runtime.recheck-wait');
        await assertCurrentGrants(tx,request.context.target,entry.grantRefs);
        return {subjectRef:wait.waitRef,queueAgeMs:Math.max(0,Date.now()-Date.parse(wait.registeredAt)),deliveryCount:wait.wakeupRef?1:0,...(wait.wakeupRef?{ownerResultRef:wait.wakeupRef}:{})};
      });return {status:'Completed',data};
    }catch(error){if(options.signal.aborted)return {status:'Cancelled',effect:'None'};return reject(error instanceof CoreError&&error.code==='RESOURCE_NOT_FOUND'?'RESOURCE_NOT_FOUND':error instanceof CoreError&&error.code==='DEPENDENCY_TIMEOUT'?'DEPENDENCY_TIMEOUT':'FORBIDDEN');}
  }
}

/** Compose one public Port while keeping native delivery and durable waiting under their separate storage Owners. */
export function composeDurableExecutionPort(delivery:Pick<DurableExecutionPort,'enqueue'|'inspect'|'drain'>,waits:DurableWaitPort):DurableExecutionPort{
  return {enqueue:(r,o)=>delivery.enqueue(r,o),drain:(r,o)=>delivery.drain(r,o),scheduleWakeup:(r,o)=>waits.scheduleWakeup(r,o),cancelWakeup:(r,o)=>waits.cancelWakeup(r,o),signal:(r,o)=>waits.signal(r,o),inspect:(r,o)=>r?.subjectRef?.type==='abh.job'?delivery.inspect(r,o):waits.inspect(r,o)};
}
