import {randomUUID} from 'node:crypto';
import type {ActionWaitRecord,EntityRef,NotifyActionWaitPayload,RegisterDurableWaitPayload} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import type {TenantTransaction} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {DecisionOwner} from '../human/decisions.ts';
import {DurableWaitOwner} from '../durable/waits.ts';
import type {WaitPortInstallation} from '../durable/wait-port.ts';
import type {InstalledOutboxRouter} from '../durable/outbox.ts';
import type {InstalledEventConsumer} from '../durable/inbox.ts';
import {ActionOwner} from './actions.ts';
import {lockAction,sameRef} from './shared.ts';

export const approvalWaitConditionRef={type:'abh.wait-condition',id:'931777ea-2867-4c5b-bd25-fd5d14cb99e5',version:1} as const;
/** Action-owned waiting intent, separate from authorization. Closing a request only permits a fresh T1 evaluation. */
export class ActionApprovalWaitOwner {
  async #facts(tx:TenantTransaction,input:RegisterDurableWaitPayload){
    if(input.ownerRef.type!=='abh.action'||input.sourceRef.type!=='abh.responsibility-request'||!sameRef(input.causeRef,input.sourceRef))throw new CoreError('FORBIDDEN');
    const action=await new ActionOwner().get(tx,input.ownerRef.id),request=await new DecisionOwner().getRequest(tx,input.sourceRef.id);
    if(request.kind!=='Authorization'||request.subjectRef.type!=='abh.action'||request.subjectRef.id!==action.actionRef.id||request.proposalDigest!==action.payloadDigest||request.requestRef.version<input.sourceRef.version)throw new CoreError('FORBIDDEN');
    return {action,request};
  }
  install(authorityRef:EntityRef):WaitPortInstallation{
    authorityRef=structuredClone(contract('EntityRef',authorityRef));
    if(authorityRef.type!=='abh.grant')throw new CoreError('INVALID_ARGUMENT');
    return {
      recoveryAuthorityRef:structuredClone(authorityRef),
      registration:async(tx,request)=>{
        const input=contract('RegisterDurableWaitPayload',{ownerRef:request.ownerRef,waitKey:request.waitKey,dueAt:request.dueAt,causeRef:request.causeRef,sourceRef:request.causeRef,authorityRef,conditionRef:approvalWaitConditionRef});
        await this.#facts(tx,input);return input;
      },
      condition:{conditionRef:approvalWaitConditionRef,eventTypes:['abh.responsibility-request.route','abh.responsibility-request.unroute','abh.responsibility-request.route-revised','abh.responsibility-request.close','abh.responsibility-request.withdraw'],fenceRefs:async()=>[authorityRef],
        admit:async(tx,input,target,permission)=>{
          if(!sameRef(input.authorityRef,authorityRef))throw new CoreError('FORBIDDEN');
          await assertCurrentGrants(tx,{objectRef:target,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:permission},[authorityRef]);
          await this.#facts(tx,input);
        },
        enterWaiting:async(tx,command,input,waitRef)=>{
          await lockAction(tx,input.ownerRef.id);const {action,request}=await this.#facts(tx,input);
          if(!sameRef(action.actionRef,input.ownerRef)||action.position.lifecycle!=='Validated'||Date.parse(input.dueAt)>Date.parse(request.expiresAt))throw new CoreError('PRECONDITION_FAILED');
          const c=tx.context.tenant,[clock]=await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
          const unsigned=contract('ActionWaitRecord',{bindingRef:{type:'abh.action-wait',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,actionRef:action.actionRef,requestRef:input.sourceRef,waitRef,authorityRef,
            payloadDigest:action.payloadDigest,outcome:'Waiting',recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
          const record=contract('ActionWaitRecord',{...unsigned,digest:await digestContract('ActionWaitRecord',unsigned)});
          await tx.owner('ActionEngine')`INSERT INTO execution.action_waits(resource_organization_id,id,workspace_id,purpose_names,wait_id,record)
            VALUES (${c.resourceOrganizationId},${record.bindingRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${waitRef.id},${JSON.stringify(record)}::text::jsonb)`;
          await appendChange(tx,{command,target:record.bindingRef,eventType:'abh.action-wait.created',changedFields:['outcome','waitRef'],relatedRefs:[action.actionRef,input.sourceRef,waitRef]});return record.bindingRef;
        },
        readSource:async(tx,input)=>{
          const {request}=await this.#facts(tx,input);
          const c=tx.context.tenant;
          const [event]=await tx.owner('DurableExecution')`SELECT COALESCE(MAX(event_ordinal),0) AS ordinal FROM data.outbox WHERE resource_organization_id=${c.resourceOrganizationId}
            AND aggregate_type='abh.responsibility-request' AND aggregate_id=${request.requestRef.id} AND aggregate_version=${request.requestRef.version} AND deleted_at IS NULL`;
          return {sourceRef:request.requestRef,eventOrdinal:Number(event!.ordinal),satisfied:request.status==='Closed'||request.status==='Withdrawn',evidenceRefs:[request.requestRef]};
        },
      },
    };
  }
  /** Installed routing derives notification targets only from persisted Action-owned waits. */
  router(ruleRef:EntityRef,consumerRef:EntityRef,deliveryWindowMs=86400000):InstalledOutboxRouter{
    contract('EntityRef',ruleRef);contract('EntityRef',consumerRef);
    if(!Number.isInteger(deliveryWindowMs)||deliveryWindowMs<1000||deliveryWindowMs>604800000)throw new CoreError('INVALID_ARGUMENT');
    const installedConsumer={...consumerRef};
    return {ruleRef:{...ruleRef},eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],route:async(tx,event)=>{
      const waits=new DurableWaitOwner();
      const wake=event.type==='abh.durable-wakeup.created'?await waits.getWakeup(tx,event.aggregateRef):undefined;
      if(!wake&&event.type!=='abh.durable-wait.cancel')throw new CoreError('FORBIDDEN');
      const wait=await waits.get(tx,wake?.waitRef??event.aggregateRef);
      if(wait.ownerRef.type!=='abh.action'||wait.waitingIntentRef.type!=='abh.action-wait')throw new CoreError('PRECONDITION_FAILED');
      if(wake?wait.wakeupRef?.id!==wake.wakeupRef.id:wait.status!=='Cancelled')throw new CoreError('PRECONDITION_FAILED');
      const binding=await this.get(tx,wait.waitingIntentRef);
      if(binding.waitRef.id!==wait.waitRef.id||!sameRef(binding.actionRef,wait.ownerRef)||!sameRef(binding.authorityRef,wait.authorityRef))throw new CoreError('FORBIDDEN');
      const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
      return [{consumerId:'abh.action.wait-notification',consumerRef:{...installedConsumer},job:contract('JobEnvelope',{
        jobType:'abh.action.advance',targetRef:binding.actionRef,commandRef:{type:'abh.command',id:event.causationId,version:1},
        dedupeKey:`${event.eventId}/abh.action.wait-notification`,causeRef:{type:'abh.event',id:event.eventId,version:1},
        notBefore:clock!.now.toISOString(),deadline:new Date(clock!.now.getTime()+deliveryWindowMs).toISOString(),
      })}];
    }};
  }
  /** Durable wakeup event -> Inbox -> Action Owner, with current notification rights even on replay. */
  consumer(grantRefs:EntityRef[]):InstalledEventConsumer{
    const inputFor=async(tx:TenantTransaction,event:import('@abh/contracts').EventEnvelope)=>{
      const waits=new DurableWaitOwner();
      if(event.type==='abh.durable-wait.cancel'){
        const wait=await waits.get(tx,event.aggregateRef);if(wait.status!=='Cancelled')throw new CoreError('PRECONDITION_FAILED');
        return {bindingRef:wait.waitingIntentRef,waitRef:wait.waitRef};
      }
      const wake=await waits.getWakeup(tx,event.aggregateRef),wait=await waits.get(tx,wake.waitRef);
      return {bindingRef:wait.waitingIntentRef,wakeupRef:wake.wakeupRef};
    };
    return {id:'abh.action.wait-notification',eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],fenceRefs:async()=>grantRefs,
      admit:async(tx,event)=>{
        await assertCurrentGrants(tx,{objectRef:{type:'abh.event',id:event.eventId,version:1},scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.runtime.consume-event'},grantRefs);
        await this.#admitBinding(tx,(await inputFor(tx,event)).bindingRef,grantRefs);
      },
      handle:async(tx,command,event)=>{
        const input=await inputFor(tx,event);
        if(input.waitRef)return (await this.notifyCancelled(tx,command,input.waitRef,grantRefs)).bindingRef;
        return (await this.notify(tx,command,contract('NotifyActionWaitPayload',input),grantRefs)).bindingRef;
      }};
  }
  async #admitBinding(tx:TenantTransaction,bindingRef:EntityRef,grantRefs:EntityRef[]):Promise<void>{
    await assertCurrentGrants(tx,{objectRef:bindingRef,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.actions.notify-wait'},grantRefs);
  }
  async notifyCancelled(tx:TenantTransaction,command:CommandIdentity,waitRef:EntityRef,grantRefs:EntityRef[]):Promise<ActionWaitRecord>{
    const wait=await new DurableWaitOwner().get(tx,waitRef);
    if(wait.status!=='Cancelled')throw new CoreError('PRECONDITION_FAILED');
    await this.#admitBinding(tx,wait.waitingIntentRef,grantRefs);
    const initial=await this.get(tx,wait.waitingIntentRef);await lockAction(tx,initial.actionRef.id);
    const current=await this.get(tx,wait.waitingIntentRef);
    if(current.waitRef.id!==wait.waitRef.id||!sameRef(current.actionRef,wait.ownerRef)||!sameRef(current.authorityRef,wait.authorityRef))throw new CoreError('FORBIDDEN');
    if(current.outcome==='Cancelled')return current;
    if(current.outcome!=='Waiting')throw new CoreError('PRECONDITION_FAILED');
    const unsigned=contract('ActionWaitRecord',{...current,bindingRef:{...current.bindingRef,version:current.bindingRef.version+1},outcome:'Cancelled',cancelledWaitRef:wait.waitRef,digest:'sha256:'+'0'.repeat(64)});
    const next=contract('ActionWaitRecord',{...unsigned,digest:await digestContract('ActionWaitRecord',unsigned)}),c=tx.context.tenant;
    const rows=await tx.owner('ActionEngine')`UPDATE execution.action_waits SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.bindingRef.id} AND version=${current.bindingRef.version} RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.bindingRef,eventType:'abh.action-wait.notified',changedFields:['outcome','cancelledWaitRef'],relatedRefs:[current.actionRef,wait.waitRef]});return next;
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<ActionWaitRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.action-wait')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const [row]=await tx.owner('ActionEngine')`SELECT record,version,wait_id FROM execution.action_waits WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('ActionWaitRecord',row.record);
    if(record.bindingRef.id!==ref.id||record.bindingRef.version!==Number(row.version)||record.waitRef.id!==row.wait_id||record.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('ActionWaitRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async admitNotification(tx:TenantTransaction,input:NotifyActionWaitPayload,grantRefs:EntityRef[]):Promise<void>{
    contract('NotifyActionWaitPayload',input);
    await assertCurrentGrants(tx,{objectRef:input.bindingRef,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.actions.notify-wait'},grantRefs);
  }
  async notify(tx:TenantTransaction,command:CommandIdentity,input:NotifyActionWaitPayload,grantRefs:EntityRef[]):Promise<ActionWaitRecord>{
    await this.admitNotification(tx,input,grantRefs);const initial=await this.get(tx,input.bindingRef);await lockAction(tx,initial.actionRef.id);
    const current=await this.get(tx,input.bindingRef),waits=new DurableWaitOwner(),wait=await waits.get(tx,current.waitRef),wake=await waits.getWakeup(tx,input.wakeupRef);
    if(!wait.wakeupRef||!sameRef(wait.wakeupRef,input.wakeupRef)||!sameRef(wake.waitRef,wait.waitRef)||!sameRef(wait.waitingIntentRef,{...current.bindingRef,version:1})||!sameRef(wake.ownerRef,current.actionRef)||!sameRef(wake.authorityRef,current.authorityRef))throw new CoreError('FORBIDDEN');
    const {action,request}=await this.#facts(tx,wait);
    if((action.position.lifecycle!=='Validated'&&!(action.position.lifecycle==='Cancelled'&&request.status==='Withdrawn'))||action.payloadDigest!==current.payloadDigest)throw new CoreError('PRECONDITION_FAILED');
    if(wake.reason==='Condition'&&!['Closed','Withdrawn'].includes(request.status))throw new CoreError('PRECONDITION_FAILED');
    if(current.outcome!=='Waiting'){if(!current.wakeupRef||!sameRef(current.wakeupRef,input.wakeupRef))throw new CoreError('IDEMPOTENCY_CONFLICT');return current;}
    const unsigned=contract('ActionWaitRecord',{...current,bindingRef:{...current.bindingRef,version:current.bindingRef.version+1},outcome:wake.reason==='Deadline'?'Deadline':'SourceClosed',wakeupRef:input.wakeupRef,digest:'sha256:'+'0'.repeat(64)});
    const next=contract('ActionWaitRecord',{...unsigned,digest:await digestContract('ActionWaitRecord',unsigned)}),c=tx.context.tenant;
    const changed=await tx.owner('ActionEngine')`UPDATE execution.action_waits SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.bindingRef.id} AND version=${current.bindingRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.bindingRef,eventType:'abh.action-wait.notified',changedFields:['outcome','wakeupRef'],relatedRefs:[current.actionRef,input.wakeupRef,request.requestRef]});return next;
  }
}
