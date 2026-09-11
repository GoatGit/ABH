import {runPackInspectionJobWorker,snapshotPackInspectionJobWorker,type PackInspectionJobWorkerOptions} from '../extensions/inspection-job-worker.ts';
import {runSuspensionRecoveryWorker,snapshotSuspensionRecoveryWorker,type SuspensionRecoveryWorkerOptions} from '../execution/suspension-recovery-worker.ts';
import {runPackInspectionWorker,type PackInspectionWorkerOptions} from '../extensions/inspection-worker.ts';
import {runDeliveryWorker,type DeliveryWorkerOptions} from './delivery-worker.ts';
import {runAuthorizationWorker,type AuthorizationWorkerOptions} from '../execution/authorization-worker.ts';
import {runResponsibilityRoutingWorker,type ResponsibilityRoutingWorkerOptions} from '../human/routing-worker.ts';
import {runControlEffectWorker,type ControlEffectWorkerOptions} from '../human/control-effect-worker.ts';
import {runResponsibilityExpiryWorker,type ResponsibilityExpiryWorkerOptions} from '../human/expiry-worker.ts';
import {CoreError} from '../internal/errors.ts';
import {runExceptionWorker,type ExceptionWorkerOptions} from '../human/exception-worker.ts';
import type {ContextSource} from '../identity/context-source.ts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {runRecoveryWorker,type RecoveryWorkerOptions} from '../execution/recovery-worker.ts';
import {runTerminalReconciliationWorker,type TerminalReconciliationWorkerOptions} from '../execution/terminal-reconciliation-worker.ts';
import {runOutboxPublisher} from './publisher.ts';
import {runWaitRecoveryWorker} from './wait-worker.ts';
import {runConsumptionWorker,type ConsumptionWorkerOptions} from './consumption-worker.ts';
import {runToolRecoveryWorker,type ToolRecoveryOptions} from '../mission/tool-commands.ts';
import {runObjectCleanupWorker,type ObjectCleanupOptions} from '../data/object-cleanup-worker.ts';
import {runMissionSummaryProjectionWorker} from '../workbench/projections.ts';
import {runResponsibilityInboxProjectionWorker} from '../workbench/responsibility-inbox-projection.ts';
import type {EntityRef} from '@abh/contracts';

export interface TenantRuntimeOptions {
  signal:AbortSignal;
  deliveries?:readonly Omit<DeliveryWorkerOptions,'signal'>[];
  /** Explicit management installation; no implicit Pack execution or Enable. */
  packInspection?:Omit<PackInspectionWorkerOptions,'signal'>;
  packInspectionJobs?:Omit<PackInspectionJobWorkerOptions,'signal'>;
  suspensionRecovery?:readonly Omit<SuspensionRecoveryWorkerOptions,'signal'>[];
  actionAuthorization?:Omit<AuthorizationWorkerOptions,'signal'>;
  recovery:Omit<RecoveryWorkerOptions,'signal'>;
  publisher:Omit<Parameters<typeof runOutboxPublisher>[1],'signal'>;
  consumption:Omit<ConsumptionWorkerOptions,'signal'>;
  waits?:readonly Omit<Parameters<typeof runWaitRecoveryWorker>[1],'signal'>[];
  terminalReconciliation?:Omit<TerminalReconciliationWorkerOptions,'signal'>;
  responsibilityRouting?:Omit<ResponsibilityRoutingWorkerOptions,'signal'>;
  controlEffects?:Omit<ControlEffectWorkerOptions,'signal'>;
  responsibilityExpiry?:Omit<ResponsibilityExpiryWorkerOptions,'signal'>;
  exceptions?:Omit<ExceptionWorkerOptions,'signal'>;
  toolRecovery?:Omit<ToolRecoveryOptions,'signal'>;
  objectCleanup?:Omit<ObjectCleanupOptions,'signal'>;
  missionSummaryProjection?:{
    context:ContextSource;grantRefs:readonly EntityRef[];
    pageSize?:number;intervalMs?:number;
    onPage?(result:{scanned:number;handled:number},options:TransactionOptions):Promise<void>;
  };
  responsibilityInboxProjection?:{
    context:ContextSource;grantRefs:readonly EntityRef[];
    pageSize?:number;intervalMs?:number;
    onPage?(result:{scanned:number;handled:number;repaired:number},options:TransactionOptions):Promise<void>;
  };
}

/** Join installed loops before the caller drains/closes dependencies. A failed loop cancels its peers. */
export async function joinRuntimeLoops(signal:AbortSignal,loops:readonly ((signal:AbortSignal)=>Promise<void>)[]):Promise<void>{
  if(signal.aborted)return;
  const stop=new AbortController(),cancel=()=>stop.abort(signal.reason);
  signal.addEventListener('abort',cancel,{once:true});
  const failures:unknown[]=[];
  try{
    await Promise.all(loops.map(async loop=>{
      try{await loop(stop.signal);if(!stop.signal.aborted)throw new Error('RUNTIME_LOOP_EXITED');}
      catch(error){failures.push(error);stop.abort(error);}
    }));
  }finally{signal.removeEventListener('abort',cancel);}
  if(failures.length===1)throw failures[0];
  if(failures.length>1)throw new AggregateError(failures,'Tenant runtime loops failed');
}

/** Share one tenant binding across independently supervised loops. Create a fresh set per service lifetime. */
export function createTenantRuntimeLoops(database:Database,input:Omit<TenantRuntimeOptions,'signal'>):readonly ((signal:AbortSignal)=>Promise<void>)[]{
  let tenant:string|undefined;
  const bind=(source:ContextSource):ContextSource=>async options=>{
    const context=await source(options),c=context.tenant,key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId]);
    if(tenant!==undefined&&tenant!==key)throw new CoreError('FORBIDDEN');tenant=key;return context;
  };
  // Capture the installed Pack configuration before any loop starts. Callbacks
  // keep their receiver but replacement fields cannot redirect a running service.
  const installedPack=input.packInspection;
  const packInspection=installedPack&&{
    context:bind(installedPack.context.bind(installedPack)),grants:structuredClone(installedPack.grants),
    discovery:{fenceRefs:installedPack.discovery.fenceRefs.bind(installedPack.discovery),admit:installedPack.discovery.admit.bind(installedPack.discovery),canRead:installedPack.discovery.canRead.bind(installedPack.discovery)},
    prepare:installedPack.prepare.bind(installedPack),
    ...(installedPack.lease?{lease:structuredClone(installedPack.lease)}:{}),
    ...(installedPack.pageSize!==undefined?{pageSize:installedPack.pageSize}:{}),
    ...(installedPack.intervalMs!==undefined?{intervalMs:installedPack.intervalMs}:{}),
    ...(installedPack.timeoutMs!==undefined?{timeoutMs:installedPack.timeoutMs}:{}),
    ...(installedPack.onBlocked?{onBlocked:installedPack.onBlocked.bind(installedPack)}:{}),
    ...(installedPack.onPage?{onPage:installedPack.onPage.bind(installedPack)}:{}),
    ...(installedPack.onObservation?{onObservation:installedPack.onObservation.bind(installedPack)}:{}),
  };
  const installedJobs=input.packInspectionJobs;
  const packInspectionJobs=installedJobs&&snapshotPackInspectionJobWorker(installedJobs);
  if(packInspectionJobs)packInspectionJobs.context=bind(packInspectionJobs.context);
  const suspensionRecovery=(input.suspensionRecovery??[]).map(installation=>{
    const worker=snapshotSuspensionRecoveryWorker(installation);
    worker.pageContext=bind(worker.pageContext);
    const source=worker.delivery.context;
    worker.delivery.context=(target,options)=>bind(current=>source(target,current))(options);
    return worker;
  });
  const installedToolRecovery=input.toolRecovery;
  const toolRecoveryReceiver=installedToolRecovery;
  const toolRecoveryContext=installedToolRecovery?.context;
  const toolRecoveryOutputValidator=installedToolRecovery?.outputValidator;
  const toolRecoveryRecover=installedToolRecovery?.recovery.recover;
  const toolRecoveryOnPage=installedToolRecovery?.onPage;
  const toolRecovery=installedToolRecovery&&{
    workerId:installedToolRecovery.workerId,
    context:bind(async options=>toolRecoveryContext!.call(toolRecoveryReceiver,options)),
    grants:structuredClone(installedToolRecovery.grants),
    outputValidator:async (output:unknown)=>toolRecoveryOutputValidator!.call(toolRecoveryReceiver,output),
    resultStorage:structuredClone(installedToolRecovery.resultStorage),
    recovery:{
      recover:async (
        request:Parameters<ToolRecoveryOptions['recovery']['recover']>[0],
        options:Parameters<ToolRecoveryOptions['recovery']['recover']>[1],
      )=>toolRecoveryRecover!.call(toolRecoveryReceiver,request,options),
    },
    ...(installedToolRecovery.pageSize!==undefined?{pageSize:installedToolRecovery.pageSize}:{}),
    ...(installedToolRecovery.intervalMs!==undefined?{intervalMs:installedToolRecovery.intervalMs}:{}),
    ...(installedToolRecovery.transactionTimeoutMs!==undefined?{transactionTimeoutMs:installedToolRecovery.transactionTimeoutMs}:{}),
    ...(installedToolRecovery.minimumAgeMs!==undefined?{minimumAgeMs:installedToolRecovery.minimumAgeMs}:{}),
    ...(installedToolRecovery.leaseSeconds!==undefined?{leaseSeconds:installedToolRecovery.leaseSeconds}:{}),
    ...(installedToolRecovery.onPage?{
      onPage:async (
        result:Parameters<NonNullable<ToolRecoveryOptions['onPage']>>[0],
        options:Parameters<NonNullable<ToolRecoveryOptions['onPage']>>[1],
      )=>toolRecoveryOnPage?.call(toolRecoveryReceiver,result,options),
    }:{}),
  };
  const installedObjectCleanup=input.objectCleanup;
  const objectCleanup=installedObjectCleanup&&{
    ...installedObjectCleanup,
    workerId:installedObjectCleanup.workerId,
    context:bind(installedObjectCleanup.context.bind(installedObjectCleanup)),
    grantRefs:structuredClone(installedObjectCleanup.grantRefs),
    objectStore:installedObjectCleanup.objectStore,
    authorizedContextRef:structuredClone(installedObjectCleanup.authorizedContextRef),
    ...(installedObjectCleanup.pageSize!==undefined?{pageSize:installedObjectCleanup.pageSize}:{}),
    ...(installedObjectCleanup.intervalMs!==undefined?{intervalMs:installedObjectCleanup.intervalMs}:{}),
    ...(installedObjectCleanup.transactionTimeoutMs!==undefined?{transactionTimeoutMs:installedObjectCleanup.transactionTimeoutMs}:{}),
    ...(installedObjectCleanup.minimumAgeMs!==undefined?{minimumAgeMs:installedObjectCleanup.minimumAgeMs}:{}),
    ...(installedObjectCleanup.leaseSeconds!==undefined?{leaseSeconds:installedObjectCleanup.leaseSeconds}:{}),
    ...(installedObjectCleanup.onPage?{onPage:installedObjectCleanup.onPage.bind(installedObjectCleanup)}:{}),
  };
  const installedProjection=input.missionSummaryProjection;
  const missionSummaryProjection=installedProjection&&{
    context:bind(installedProjection.context.bind(installedProjection)),grantRefs:structuredClone(installedProjection.grantRefs),
    ...(installedProjection.pageSize!==undefined?{pageSize:installedProjection.pageSize}:{}),
    ...(installedProjection.intervalMs!==undefined?{intervalMs:installedProjection.intervalMs}:{}),
    ...(installedProjection.onPage?{onPage:installedProjection.onPage.bind(installedProjection)}:{}),
  };
  const installedInboxProjection=input.responsibilityInboxProjection;
  const responsibilityInboxProjection=installedInboxProjection&&{
    context:bind(installedInboxProjection.context.bind(installedInboxProjection)),
    grantRefs:structuredClone(installedInboxProjection.grantRefs),
    ...(installedInboxProjection.pageSize!==undefined?{pageSize:installedInboxProjection.pageSize}:{}),
    ...(installedInboxProjection.intervalMs!==undefined?{intervalMs:installedInboxProjection.intervalMs}:{}),
    ...(installedInboxProjection.onPage?{onPage:installedInboxProjection.onPage.bind(installedInboxProjection)}:{}),
  };
  return [
    ...suspensionRecovery.map(worker=>(signal:AbortSignal)=>runSuspensionRecoveryWorker(database,{...worker,signal})),
    ...(packInspectionJobs?[(signal:AbortSignal)=>runPackInspectionJobWorker(database,{...packInspectionJobs,signal})]:[]),
    ...(packInspection?[(signal:AbortSignal)=>runPackInspectionWorker(database,{...packInspection,signal})]:[]),
    ...(input.deliveries??[]).map(delivery=>(signal:AbortSignal)=>runDeliveryWorker(database,{...delivery,context:(job,options)=>bind(current=>delivery.context(job,current))(options),signal})),
    ...(input.actionAuthorization?[(signal:AbortSignal)=>runAuthorizationWorker(database,{...input.actionAuthorization!,context:bind(input.actionAuthorization!.context),...(input.actionAuthorization!.authorization?{authorization:{...input.actionAuthorization!.authorization,context:bind(input.actionAuthorization!.authorization.context)}}:{}),signal})]:[]),
    signal=>runRecoveryWorker(database,{...input.recovery,context:bind(input.recovery.context),signal}),
    signal=>runOutboxPublisher(database,{...input.publisher,context:bind(input.publisher.context),signal}),
    signal=>runConsumptionWorker(database,{...input.consumption,context:bind(input.consumption.context),signal}),
    ...(input.waits??[]).map(wait=>(signal:AbortSignal)=>runWaitRecoveryWorker(database,{...wait,context:bind(wait.context),signal})),
    ...(input.terminalReconciliation?[(signal:AbortSignal)=>runTerminalReconciliationWorker(database,{...input.terminalReconciliation!,context:bind(input.terminalReconciliation!.context),signal})]:[]),
    ...(input.controlEffects?[(signal:AbortSignal)=>runControlEffectWorker(database,{...input.controlEffects!,context:bind(input.controlEffects!.context),signal})]:[]),
    ...(input.responsibilityRouting?[(signal:AbortSignal)=>runResponsibilityRoutingWorker(database,{...input.responsibilityRouting!,context:bind(input.responsibilityRouting!.context),signal})]:[]),
    ...(input.responsibilityExpiry?[(signal:AbortSignal)=>runResponsibilityExpiryWorker(database,{...input.responsibilityExpiry!,context:bind(input.responsibilityExpiry!.context),signal})]:[]),
    ...(input.exceptions?[(signal:AbortSignal)=>runExceptionWorker(database,{...input.exceptions!,context:bind(input.exceptions!.context),signal})]:[]),
    ...(toolRecovery?[(signal:AbortSignal)=>runToolRecoveryWorker(database,{...toolRecovery,signal})]:[]),
    ...(objectCleanup?[(signal:AbortSignal)=>runObjectCleanupWorker(database,{...objectCleanup,signal})]:[]),
    ...(missionSummaryProjection?[(signal:AbortSignal)=>runMissionSummaryProjectionWorker(database,{...missionSummaryProjection,signal})]:[]),
    ...(responsibilityInboxProjection?[(signal:AbortSignal)=>runResponsibilityInboxProjectionWorker(
      database,{...responsibilityInboxProjection,signal})]:[]),
  ];
}

/** Internal standalone tenant host; process/HTTP services should supervise the loop set directly. */
export async function runTenantRuntime(database:Database,input:TenantRuntimeOptions):Promise<void>{
  return joinRuntimeLoops(input.signal,createTenantRuntimeLoops(database,input));
}
