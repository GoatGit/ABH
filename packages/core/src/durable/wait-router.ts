import type {EntityRef} from '@abh/contracts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {DurableWaitOwner} from './waits.ts';
import type {InstalledOutboxRouter} from './outbox.ts';

/** Select by the persisted owner, not request data or a trial-and-error permission fallback. */
export function composeWaitNotificationRouter(ruleRef:EntityRef,owners:ReadonlyMap<string,InstalledOutboxRouter>):InstalledOutboxRouter{
  contract('EntityRef',ruleRef);const installed=new Map(owners);
  return {ruleRef:{...ruleRef},eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],route:async(tx,event)=>{
    const waits=new DurableWaitOwner();
    const wake=event.type==='abh.durable-wakeup.created'?await waits.getWakeup(tx,event.aggregateRef):undefined;
    if(!wake&&event.type!=='abh.durable-wait.cancel')throw new CoreError('FORBIDDEN');
    const wait=await waits.get(tx,wake?.waitRef??event.aggregateRef),router=installed.get(wait.ownerRef.type);
    if(!router||!router.eventTypes.includes(event.type))throw new CoreError('PRECONDITION_FAILED');
    return router.route(tx,event);
  }};
}
