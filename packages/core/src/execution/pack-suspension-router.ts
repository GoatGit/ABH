import type {CapabilityRef,EntityRef} from '@abh/contracts';
import {contract} from '../data/journal.ts';
import type {InstalledOutboxRouter} from '../durable/outbox.ts';
import {CoreError} from '../internal/errors.ts';
import {actionPackSuspensionConsumerId} from './pack-suspension-consumer.ts';

/** Frozen, explicitly installed subscriptions for one suspension event. Supply
 * the entire installed fanout: a discovery page is NOT a subscription inventory.
 * This router neither discovers other scopes nor proves global scan completion.
 * Each consumer independently rechecks its actual Pin and current permission. */
export function actionPackSuspensionRouter(input:{ruleRef:EntityRef;eventRef:EntityRef;
 subscriptions:readonly {actionRef:EntityRef;capability:CapabilityRef;consumerRef:EntityRef}[];
 deliveryWindowMs?:number}):InstalledOutboxRouter{
 const value=structuredClone(input),window=value.deliveryWindowMs??86400000;
 contract('EntityRef',value.ruleRef);contract('EntityRef',value.eventRef);
 if(value.eventRef.type!=='abh.event'||value.eventRef.version!==1||!value.subscriptions.length||value.subscriptions.length>100
  ||!Number.isSafeInteger(window)||window<1000||window>604800000)throw new CoreError('INVALID_ARGUMENT');
 const subscriptions=value.subscriptions.map(subscription=>{
  contract('EntityRef',subscription.consumerRef);
  return {...subscription,consumerId:actionPackSuspensionConsumerId(subscription.actionRef,subscription.capability)};
 });
 if(new Set(subscriptions.map(item=>item.consumerId)).size!==subscriptions.length)throw new CoreError('INVALID_ARGUMENT');
 return {ruleRef:value.ruleRef,eventTypes:['abh.installed-pack.suspend'],route:async(tx,event)=>{
  if(event.eventId!==value.eventRef.id||event.type!=='abh.installed-pack.suspend'||event.aggregateRef.type!=='abh.installed-pack')throw new CoreError('PRECONDITION_FAILED');
  const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
  return subscriptions.map(subscription=>({consumerId:subscription.consumerId,consumerRef:structuredClone(subscription.consumerRef),
   job:contract('JobEnvelope',{jobType:'abh.action.advance',targetRef:subscription.actionRef,
    commandRef:{type:'abh.command',id:event.causationId,version:1},causeRef:structuredClone(value.eventRef),
    dedupeKey:`${event.eventId}/${subscription.consumerId}`,notBefore:clock!.now.toISOString(),
    deadline:new Date(clock!.now.getTime()+window).toISOString()})}));
 }};
}
