import {retryDatabaseConflict} from '../data/retry-conflict.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,InboxRecord,JobEnvelope} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {requestVerifiedContext} from '../identity/context-source.ts';
import type {TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {consumeCommittedEvent,readCommittedEvent,type InstalledEventConsumer} from './inbox.ts';
import {OutboxOwner} from './outbox.ts';

export interface EventDelivery {
  readonly jobRef:EntityRef;
  readonly resourceOrganizationId:string;
  readonly consumerId:string;
  readonly job:JobEnvelope;
}
export interface EventDeliveryQueue {
  fetch(queueClass:'control'|'reconcile'|'interactive'|'background',signal:AbortSignal):Promise<EventDelivery|undefined>;
  complete(delivery:EventDelivery,resultRef:EntityRef):Promise<void>;
}

/** Process only installed frozen Outbox routes. Queue envelopes are delivery hints, never business authority. */
export async function consumeOutboxDelivery(database:Database,context:VerifiedContext,signal:AbortSignal,delivery:EventDelivery,
  consumer:InstalledEventConsumer):Promise<InboxRecord>{
  contract('JobEnvelope',delivery.job);contract('EntityRef',delivery.jobRef);
  const c=context.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver'||c.resourceOrganizationId!==delivery.resourceOrganizationId
    ||consumer.id!==delivery.consumerId||delivery.jobRef.type!=='abh.job')throw new CoreError('FORBIDDEN');
  const options={deadline:Date.now()+10000,signal};
  const input=await database.transaction(context,options,async tx=>{
    const event=await readCommittedEvent(tx,delivery.job.causeRef);
    const [row]=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.outbox_routings
      WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${event.eventId} AND deleted_at IS NULL`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const routing=await new OutboxOwner().getRouting(tx,{type:'abh.outbox-routing',id:row.id,version:Number(row.version)});
    const frozen=routing.deliveries.find(item=>item.consumerId===consumer.id);
    if(!frozen||canonicalJson(frozen.job)!==canonicalJson(delivery.job)||routing.eventDigest!==await inputDigest(event))throw new CoreError('IDEMPOTENCY_CONFLICT');
    return {eventRef:routing.eventRef,eventDigest:routing.eventDigest,consumerId:consumer.id};
  });
  return consumeCommittedEvent(database,context,options,input,consumer);
}

export interface DeliveryWorkerOptions {
  signal:AbortSignal;
  queue:EventDeliveryQueue;
  queueClass:'control'|'reconcile'|'interactive'|'background';
  /** Installed resolver must authenticate the minimal tenant hint; it cannot trust a serialized Context in the Job. */
  context(delivery:EventDelivery,options:TransactionOptions):Promise<VerifiedContext>;
  consumers:readonly InstalledEventConsumer[];
  intervalMs?:number;
  onHandled?(result:InboxRecord,options:TransactionOptions):Promise<void>;
}

/** Sequential bounded Owner calls. Failed acknowledgement leaves native retry and the committed Inbox intact. */
export async function runDeliveryWorker(database:Database,input:DeliveryWorkerOptions):Promise<void>{
  const source=input,queue=input.queue;
  input={...input,context:source.context.bind(source),queue:{fetch:queue.fetch.bind(queue),complete:queue.complete.bind(queue)},
    ...(source.onHandled?{onHandled:source.onHandled.bind(source)}:{}),
    consumers:input.consumers.map(consumer=>({id:consumer.id,eventTypes:[...consumer.eventTypes],
      fenceRefs:consumer.fenceRefs.bind(consumer),admit:consumer.admit.bind(consumer),handle:consumer.handle.bind(consumer)}))};
  const interval=input.intervalMs??500;
  if(!Number.isInteger(interval)||interval<1||interval>60000||!['control','reconcile','interactive','background'].includes(input.queueClass))throw new CoreError('INVALID_ARGUMENT');
  const consumers=new Map(input.consumers.map(consumer=>[consumer.id,consumer]));
  if(consumers.size!==input.consumers.length)throw new CoreError('INVALID_ARGUMENT');
  while(!input.signal.aborted){
    try{
      const delivery=await input.queue.fetch(input.queueClass,input.signal);
      if(input.signal.aborted)return;
      if(!delivery){await delay(interval,undefined,{signal:input.signal});continue;}
      const consumer=consumers.get(delivery.consumerId);if(!consumer)throw new CoreError('FORBIDDEN');
      const result=await retryDatabaseConflict({deadline:Date.now()+30000,signal:input.signal},async options=>
        consumeOutboxDelivery(database,await requestVerifiedContext(current=>input.context(structuredClone(delivery),current),options),options.signal,delivery,consumer));
      // Even if shutdown arrives after commit, finish this acknowledgement before returning to the host.
      await input.queue.complete(delivery,result.inboxRef);
      if(input.onHandled&&!input.signal.aborted)await boundedCallback(options=>input.onHandled!(structuredClone(result),options),{deadline:Date.now()+10000,signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
