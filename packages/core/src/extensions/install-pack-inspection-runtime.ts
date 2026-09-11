import type {EntityRef} from '@abh/contracts';
import type {ContextSource} from '../identity/context-source.ts';
import type {TenantRuntimeOptions} from '../durable/runtime-host.ts';
import type {InstalledOutboxRouter} from '../durable/outbox.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {createPackInspectionJobRouter} from './inspection-job-router.ts';
import {createPackInspectionJobConsumer,type PackInspectionDeliveryAdmission} from './inspection-deliveries.ts';
import {snapshotPackInspectionJobWorker,type PackInspectionJobWorkerOptions} from './inspection-job-worker.ts';

type Runtime=Omit<TenantRuntimeOptions,'signal'>;
export interface PackInspectionRuntimeInstallation {
 /** One shared Publisher and one background fetcher; existing consumers stay installed.
  * Its queue admission directory must include abh.pack-inspection-job.advance. */
 runtime:Runtime;
 routing:Parameters<typeof createPackInspectionJobRouter>[0];
 /** New rule identity for the complete composed subscription set. */
 combinedRuleRef:EntityRef;
 runtimeContext:ContextSource;
 acceptanceGrants:readonly EntityRef[];
 acceptance:PackInspectionDeliveryAdmission;
 worker:Omit<PackInspectionJobWorkerOptions,'signal'|'requireDelivery'>;
}
/** Assemble into the existing tenant host, preserving its single Publisher and
 * background queue fetcher. Separate publisher loops could compete for frozen
 * routes; separate background fetchers could claim each other's consumers.
 * No queue connections or work start during assembly. Host supervision and drain
 * still own dependency lifetime. All permissions remain current Owner checks. */
export function installPackInspectionRuntime(input:PackInspectionRuntimeInstallation):Runtime {
 const runtime=input.runtime,backgrounds=(runtime.deliveries??[]).filter(item=>item.queueClass==='background');
 if(runtime.packInspectionJobs||backgrounds.length!==1)throw new CoreError('INVALID_ARGUMENT');
 const background=backgrounds[0]!,consumer=createPackInspectionJobConsumer(input.acceptanceGrants,input.acceptance);
 if((runtime.deliveries??[]).some(item=>item.consumers.some(value=>value.id===consumer.id)))throw new CoreError('INVALID_ARGUMENT');
 const inspection=createPackInspectionJobRouter(input.routing),previous=runtime.publisher.router;
 if(previous.eventTypes.some(type=>inspection.eventTypes.includes(type)))throw new CoreError('INVALID_ARGUMENT');
 const ruleRef=contract('EntityRef',structuredClone(input.combinedRuleRef)),oldTypes=[...previous.eventTypes],route=previous.route.bind(previous),newTypes=[...inspection.eventTypes];
 if(new Set(oldTypes).size!==oldTypes.length||oldTypes.length+newTypes.length>100)throw new CoreError('INVALID_ARGUMENT');
 const router:InstalledOutboxRouter={ruleRef,eventTypes:[...oldTypes,...newTypes],route:async(tx,event)=>{
  if(newTypes.includes(event.type))return inspection.route(tx,event);
  if(oldTypes.includes(event.type))return route(tx,event);
  throw new CoreError('FORBIDDEN');
 }};
 const source=input.runtimeContext.bind(input),oldContext=background.context.bind(background);
 const installedWorker=snapshotPackInspectionJobWorker(input.worker);
 const {signal:_signal,...worker}=installedWorker;
 const publisher=runtime.publisher,port=publisher.port,checks=publisher.checks;
 return {...runtime,packInspectionJobs:{...worker,requireDelivery:true},
  publisher:{...publisher,router,context:publisher.context.bind(publisher),port:{enqueue:port.enqueue.bind(port)},
   checks:{fenceRefs:checks.fenceRefs.bind(checks),admit:checks.admit.bind(checks)},enqueueContext:publisher.enqueueContext.bind(publisher),
   ...(publisher.releaseEnqueueContext?{releaseEnqueueContext:publisher.releaseEnqueueContext.bind(publisher)}:{}),
   ...(publisher.onPage?{onPage:publisher.onPage.bind(publisher)}:{}),
  },
  deliveries:(runtime.deliveries??[]).map(item=>item!==background?item:{...background,
   queue:{fetch:background.queue.fetch.bind(background.queue),complete:background.queue.complete.bind(background.queue)},
   consumers:[...background.consumers.map(value=>({id:value.id,eventTypes:[...value.eventTypes],fenceRefs:value.fenceRefs.bind(value),admit:value.admit.bind(value),handle:value.handle.bind(value)})),consumer],
   context:async(delivery,options)=>{
    if(delivery.consumerId!==consumer.id)return oldContext(delivery,options);
    const current=await source(options),c=current.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||c.resourceOrganizationId!==delivery.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    return current;
   },...(background.onHandled?{onHandled:background.onHandled.bind(background)}:{}),
  }),
 };
}
