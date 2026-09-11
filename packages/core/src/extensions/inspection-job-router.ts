import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {readCommittedEvent} from '../durable/inbox.ts';
import type {InstalledOutboxRouter} from '../durable/outbox.ts';

/** Publish only actual request/retry lifecycle events. OutboxOwner freezes these
 * routes under its current publication admission. The delivery window is a queue
 * window, never the Job's business budget or evidence of execution authority. */
export function createPackInspectionJobRouter(input:{ruleRef:EntityRef;consumerRef:EntityRef;deliveryWindowMs?:number;retryDelayMs?:number}):InstalledOutboxRouter {
 const rule=contract('EntityRef',structuredClone(input.ruleRef)),consumer=contract('EntityRef',structuredClone(input.consumerRef));
 const window=input.deliveryWindowMs??60000,delay=input.retryDelayMs??1000,consumerId='abh.pack-inspection-job.advance';
 if(!Number.isInteger(window)||window<1||window>86400000||!Number.isInteger(delay)||delay<0||delay>60000||delay>=window)throw new CoreError('INVALID_ARGUMENT');
 return {ruleRef:rule,eventTypes:['abh.pack-inspection-job.requested','abh.pack-inspection-job.wait'],route:async(tx,supplied)=>{
  const c=tx.context.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const hint=contract('EventEnvelope',structuredClone(supplied));
  if(!['abh.pack-inspection-job.requested','abh.pack-inspection-job.wait'].includes(hint.type)||hint.aggregateRef.type!=='abh.pack-inspection-job')throw new CoreError('FORBIDDEN');
  const event=await readCommittedEvent(tx,{type:'abh.event',id:hint.eventId,version:1});
  if(canonicalJson(event)!==canonicalJson(hint))throw new CoreError('IDEMPOTENCY_CONFLICT');
  const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
  const now=(clock!.now as Date).getTime();tx.assertActive();
  return [{consumerId,consumerRef:structuredClone(consumer),job:contract('JobEnvelope',{
   jobType:'abh.pack-inspection-job.advance',targetRef:event.aggregateRef,commandRef:{type:'abh.command',id:event.causationId,version:1},
   causeRef:{type:'abh.event',id:event.eventId,version:1},dedupeKey:`${event.eventId}/${consumerId}`,
   notBefore:new Date(now+(event.type==='abh.pack-inspection-job.wait'?delay:0)).toISOString(),deadline:new Date(now+window).toISOString(),
  })}];
 }};
}
