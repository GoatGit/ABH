import {randomUUID} from 'node:crypto';
import type {OperationWaitRecord,EntityRef,NotifyOperationWaitPayload,RegisterDurableWaitPayload} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import type {TenantTransaction} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {OperationOwner} from './operations.ts';
import {DurableWaitOwner} from '../durable/waits.ts';
import type {WaitPortInstallation} from '../durable/wait-port.ts';
import type {InstalledOutboxRouter} from '../durable/outbox.ts';
import type {InstalledEventConsumer} from '../durable/inbox.ts';
import {ActionOwner} from './actions.ts';
import {lockAction,sameRef} from './shared.ts';

export const operationWaitConditionRef={type:'abh.wait-condition',id:'bf4cd710-1ee3-4f34-b39f-78380326e7b9',version:1} as const;
/** Operation-owned reconciliation waiting. Notifications never issue a query authority or another dispatch attempt. */
export class OperationReconciliationWaitOwner {
  async #facts(tx:TenantTransaction,input:RegisterDurableWaitPayload){
    if(input.ownerRef.type!=='abh.operation'||!sameRef(input.ownerRef,input.sourceRef)||!sameRef(input.causeRef,input.sourceRef))throw new CoreError('FORBIDDEN');
    const operation=await new OperationOwner().get(tx,input.ownerRef.id),action=await new ActionOwner().get(tx,operation.actionRef.id);
    if(operation.operationRef.version<input.sourceRef.version||operation.attemptCount<1)throw new CoreError('PRECONDITION_FAILED');
    return {action,operation};
  }
  install(authorityRef:EntityRef):WaitPortInstallation{
    authorityRef=structuredClone(contract('EntityRef',authorityRef));
    if(authorityRef.type!=='abh.grant')throw new CoreError('INVALID_ARGUMENT');
    return {
      recoveryAuthorityRef:structuredClone(authorityRef),
      registration:async(tx,request)=>{
        const input=contract('RegisterDurableWaitPayload',{ownerRef:request.ownerRef,waitKey:request.waitKey,dueAt:request.dueAt,causeRef:request.causeRef,sourceRef:request.causeRef,authorityRef,conditionRef:operationWaitConditionRef});
        await this.#facts(tx,input);return input;
      },
      condition:{conditionRef:operationWaitConditionRef,eventTypes:['abh.operation.observe','abh.operation.close'],fenceRefs:async()=>[authorityRef],
        admit:async(tx,input,target,permission)=>{
          if(!sameRef(input.authorityRef,authorityRef))throw new CoreError('FORBIDDEN');
          await assertCurrentGrants(tx,{objectRef:target,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:permission},[authorityRef]);
          await this.#facts(tx,input);
        },
        enterWaiting:async(tx,command,input,waitRef)=>{
          const initial=await this.#facts(tx,input);await lockAction(tx,initial.action.actionRef.id);const {action,operation}=await this.#facts(tx,input);
          if(!sameRef(operation.operationRef,input.ownerRef)||!['Dispatching','Observing','Closed'].includes(operation.position.lifecycle))throw new CoreError('PRECONDITION_FAILED');
          const c=tx.context.tenant,[clock]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;
          const unsigned=contract('OperationWaitRecord',{bindingRef:{type:'abh.operation-wait',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,actionRef:action.actionRef,operationRef:input.sourceRef,waitRef,authorityRef,
            payloadDigest:action.payloadDigest,outcome:'Waiting',recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
          const record=contract('OperationWaitRecord',{...unsigned,digest:await digestContract('OperationWaitRecord',unsigned)});
          await tx.owner('OperationController')`INSERT INTO execution.operation_waits(resource_organization_id,id,workspace_id,purpose_names,wait_id,record)
            VALUES (${c.resourceOrganizationId},${record.bindingRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${waitRef.id},${JSON.stringify(record)}::text::jsonb)`;
          await appendChange(tx,{command,target:record.bindingRef,eventType:'abh.operation-wait.created',changedFields:['outcome','waitRef'],relatedRefs:[action.actionRef,input.sourceRef,waitRef]});return record.bindingRef;
        },
        readSource:async(tx,input)=>{
          const {operation}=await this.#facts(tx,input);
          return {sourceRef:operation.operationRef,eventOrdinal:0,satisfied:operation.position.lifecycle==='Closed',evidenceRefs:[operation.operationRef,...(operation.reconciliationRef?[operation.reconciliationRef]:[])]};
        },
      },
    };
  }
  /** Installed routing derives notification targets only from persisted Operation-owned waits. */
  router(ruleRef:EntityRef,consumerRef:EntityRef,deliveryWindowMs=86400000):InstalledOutboxRouter{
    contract('EntityRef',ruleRef);contract('EntityRef',consumerRef);
    if(!Number.isInteger(deliveryWindowMs)||deliveryWindowMs<1000||deliveryWindowMs>604800000)throw new CoreError('INVALID_ARGUMENT');
    const installedConsumer={...consumerRef};
    return {ruleRef:{...ruleRef},eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],route:async(tx,event)=>{
      const waits=new DurableWaitOwner();
      const wake=event.type==='abh.durable-wakeup.created'?await waits.getWakeup(tx,event.aggregateRef):undefined;
      if(!wake&&event.type!=='abh.durable-wait.cancel')throw new CoreError('FORBIDDEN');
      const wait=await waits.get(tx,wake?.waitRef??event.aggregateRef);
      if(wait.ownerRef.type!=='abh.operation'||wait.waitingIntentRef.type!=='abh.operation-wait')throw new CoreError('PRECONDITION_FAILED');
      if(wake?wait.wakeupRef?.id!==wake.wakeupRef.id:wait.status!=='Cancelled')throw new CoreError('PRECONDITION_FAILED');
      const binding=await this.get(tx,wait.waitingIntentRef);
      if(binding.waitRef.id!==wait.waitRef.id||!sameRef(binding.operationRef,wait.ownerRef)||!sameRef(binding.authorityRef,wait.authorityRef))throw new CoreError('FORBIDDEN');
      const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
      return [{consumerId:'abh.operation.wait-notification',consumerRef:{...installedConsumer},job:contract('JobEnvelope',{
        jobType:'abh.operation.notify-wait',targetRef:binding.operationRef,commandRef:{type:'abh.command',id:event.causationId,version:1},
        dedupeKey:`${event.eventId}/abh.operation.wait-notification`,causeRef:{type:'abh.event',id:event.eventId,version:1},
        notBefore:clock!.now.toISOString(),deadline:new Date(clock!.now.getTime()+deliveryWindowMs).toISOString(),
      })}];
    }};
  }
  /** Durable event -> Inbox -> Operation Owner with current notification rights. */
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
    return {id:'abh.operation.wait-notification',eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],fenceRefs:async()=>grantRefs,
      admit:async(tx,event)=>{
        await assertCurrentGrants(tx,{objectRef:{type:'abh.event',id:event.eventId,version:1},scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.runtime.consume-event'},grantRefs);
        await this.#admitBinding(tx,(await inputFor(tx,event)).bindingRef,grantRefs);
      },
      handle:async(tx,command,event)=>{
        const input=await inputFor(tx,event);
        if(input.waitRef)return (await this.notifyCancelled(tx,command,input.waitRef,grantRefs)).bindingRef;
        return (await this.notify(tx,command,contract('NotifyOperationWaitPayload',input),grantRefs)).bindingRef;
      }};
  }
  async #admitBinding(tx:TenantTransaction,bindingRef:EntityRef,grantRefs:EntityRef[]):Promise<void>{
    await assertCurrentGrants(tx,{objectRef:bindingRef,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.operations.notify-wait'},grantRefs);
  }
  async notifyCancelled(tx:TenantTransaction,command:CommandIdentity,waitRef:EntityRef,grantRefs:EntityRef[]):Promise<OperationWaitRecord>{
    const wait=await new DurableWaitOwner().get(tx,waitRef);
    if(wait.status!=='Cancelled')throw new CoreError('PRECONDITION_FAILED');
    await this.#admitBinding(tx,wait.waitingIntentRef,grantRefs);
    const initial=await this.get(tx,wait.waitingIntentRef);await lockAction(tx,initial.actionRef.id);
    const current=await this.get(tx,wait.waitingIntentRef);
    if(current.waitRef.id!==wait.waitRef.id||!sameRef(current.operationRef,wait.ownerRef)||!sameRef(current.authorityRef,wait.authorityRef))throw new CoreError('FORBIDDEN');
    if(current.outcome==='Cancelled')return current;
    if(current.outcome!=='Waiting')throw new CoreError('PRECONDITION_FAILED');
    const unsigned=contract('OperationWaitRecord',{...current,bindingRef:{...current.bindingRef,version:current.bindingRef.version+1},outcome:'Cancelled',cancelledWaitRef:wait.waitRef,digest:'sha256:'+'0'.repeat(64)});
    const next=contract('OperationWaitRecord',{...unsigned,digest:await digestContract('OperationWaitRecord',unsigned)}),c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`UPDATE execution.operation_waits SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.bindingRef.id} AND version=${current.bindingRef.version} RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.bindingRef,eventType:'abh.operation-wait.notified',changedFields:['outcome','cancelledWaitRef'],relatedRefs:[current.actionRef,wait.waitRef]});return next;
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<OperationWaitRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.operation-wait')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const [row]=await tx.owner('OperationController')`SELECT record,version,wait_id FROM execution.operation_waits WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('OperationWaitRecord',row.record);
    if(record.bindingRef.id!==ref.id||record.bindingRef.version!==Number(row.version)||record.waitRef.id!==row.wait_id||record.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('OperationWaitRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async admitNotification(tx:TenantTransaction,input:NotifyOperationWaitPayload,grantRefs:EntityRef[]):Promise<void>{
    contract('NotifyOperationWaitPayload',input);
    await assertCurrentGrants(tx,{objectRef:input.bindingRef,scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],action:'abh.operations.notify-wait'},grantRefs);
  }
  async notify(tx:TenantTransaction,command:CommandIdentity,input:NotifyOperationWaitPayload,grantRefs:EntityRef[]):Promise<OperationWaitRecord>{
    await this.admitNotification(tx,input,grantRefs);const initial=await this.get(tx,input.bindingRef);await lockAction(tx,initial.actionRef.id);
    const current=await this.get(tx,input.bindingRef),waits=new DurableWaitOwner(),wait=await waits.get(tx,current.waitRef),wake=await waits.getWakeup(tx,input.wakeupRef);
    if(!wait.wakeupRef||!sameRef(wait.wakeupRef,input.wakeupRef)||!sameRef(wake.waitRef,wait.waitRef)||!sameRef(wait.waitingIntentRef,{...current.bindingRef,version:1})||!sameRef(wake.ownerRef,current.operationRef)||!sameRef(wake.authorityRef,current.authorityRef))throw new CoreError('FORBIDDEN');
    const {action,operation}=await this.#facts(tx,wait);
    if(action.payloadDigest!==current.payloadDigest||operation.actionRef.id!==current.actionRef.id)throw new CoreError('PRECONDITION_FAILED');
    if(wake.reason==='Condition'&&operation.position.lifecycle!=='Closed')throw new CoreError('PRECONDITION_FAILED');
    if(current.outcome!=='Waiting'){if(!current.wakeupRef||!sameRef(current.wakeupRef,input.wakeupRef))throw new CoreError('IDEMPOTENCY_CONFLICT');return current;}
    const unsigned=contract('OperationWaitRecord',{...current,bindingRef:{...current.bindingRef,version:current.bindingRef.version+1},outcome:wake.reason==='Deadline'?'Deadline':'SourceClosed',wakeupRef:input.wakeupRef,digest:'sha256:'+'0'.repeat(64)});
    const next=contract('OperationWaitRecord',{...unsigned,digest:await digestContract('OperationWaitRecord',unsigned)}),c=tx.context.tenant;
    const changed=await tx.owner('OperationController')`UPDATE execution.operation_waits SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.bindingRef.id} AND version=${current.bindingRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.bindingRef,eventType:'abh.operation-wait.notified',changedFields:['outcome','wakeupRef'],relatedRefs:[current.actionRef,input.wakeupRef,operation.operationRef]});return next;
  }
}
