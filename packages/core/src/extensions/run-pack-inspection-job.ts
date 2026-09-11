import {failPackInspection,type PackInspectionFailureAdmission} from './fail-pack-inspection.ts';
import {observePackInspectionAttempt} from './inspection-failure.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,PackInspectionJobRecord,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {withPackInspectionLease} from './inspection-lease-scope.ts';
import {startPackInspection,type PackInspectionStartAdmission} from './start-pack-inspection.ts';
import {waitPackInspection,type PackInspectionWaitingAdmission} from './wait-pack-inspection.ts';
import {completePackInspection,type PackInspectionCompletionAdmission} from './complete-pack-inspection.ts';
import {runInstalledMigrationInspection} from './run-installed-migration-inspection.ts';
import {disposeMigrationInspectionTarget,requireMigrationInspectionDisposal,type MigrationInspectionTarget} from './inspect-migration-target.ts';
import type {PreparedPackInspection} from './inspection-worker.ts';
/** Explicit command authority; omitted entries use grants. An empty entry denies
 * that action and never falls back. The base grants still own the work lease. */
export type PackInspectionGrantSets=Partial<Record<'start'|'waiting'|'completion'|'failure'|'discovery'|'expiry'|'leaseLoss',readonly EntityRef[]>>;
/** Validate and copy once at host assembly and again at direct execution. */
export function snapshotPackInspectionGrantSets(input:PackInspectionGrantSets|undefined):PackInspectionGrantSets {
 if(input===undefined)return {};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new CoreError('INVALID_ARGUMENT');
 const result:PackInspectionGrantSets={};
 for(const [key,value] of Object.entries(input)){
  if(!['start','waiting','completion','failure','discovery','expiry','leaseLoss'].includes(key)||!Array.isArray(value)||value.length>100)throw new CoreError('INVALID_ARGUMENT');
  const refs=value.map(ref=>contract('EntityRef',structuredClone(ref)));
  if(refs.some(ref=>ref.type!=='abh.grant')||new Set(refs.map(ref=>ref.id)).size!==refs.length)throw new CoreError('INVALID_ARGUMENT');
  result[key as keyof PackInspectionGrantSets]=refs;
 }
 return result;
}
export interface PackInspectionJobExecution {
 context:ContextSource;signal:AbortSignal;jobRef:EntityRef;workerId:string;grants:readonly EntityRef[];
 timeoutMs?:number;heartbeatMs?:number;grantSets?:PackInspectionGrantSets;
 /** Current read/selection admission; invoked again after commits. */
 read(tx:TenantTransaction,job:PackInspectionJobRecord):Promise<void>;
 start:PackInspectionStartAdmission;waiting:PackInspectionWaitingAdmission;completion:PackInspectionCompletionAdmission;
 /** Explicit failure settlement policy; requires its own fail Grant. */
 failure?:PackInspectionFailureAdmission;
 diagnostic:Pick<StoreInlineArtifactPayload,'dataClass'|'region'|'retentionPolicyRef'>;
 /** Trusted preparation must return its original blocker or dedicated Ready target.
  * Use the supplied context and budget; no independently configured lease. */
 prepare(context:VerifiedContext,job:PackInspectionJobRecord,installation:InstalledPackRecord,options:TransactionOptions):Promise<PreparedPackInspection>;
}
/** Execute one exact discovered Pending/Waiting version. No implicit creation or
 * restart: stale delivery rejects; failures settle only with explicit admission.
 * Each Owner separately enforces current authority, CAS, evidence and fencing.
 * Queue acknowledgements and sweeps are deliberately outside this entry point. */
export async function runPackInspectionJob(database:Database,input:PackInspectionJobExecution):Promise<PackInspectionJobRecord>{
 const ref=contract('EntityRef',structuredClone(input.jobRef)),workerId=contract('UUID',input.workerId),grants=structuredClone(input.grants),parent=input.signal;
 const grantSets=snapshotPackInspectionGrantSets(input.grantSets),authority=(action:keyof PackInspectionGrantSets)=>grantSets[action]??grants;
 if(ref.type!=='abh.pack-inspection-job')throw new CoreError('INVALID_ARGUMENT');
 const timeout=input.timeoutMs??30000,heartbeat=input.heartbeatMs??10000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>30000||!Number.isInteger(heartbeat)||heartbeat<10||heartbeat>10000)throw new CoreError('INVALID_ARGUMENT');
 const source=input.context.bind(input),readAdmission=input.read.bind(input),prepare=input.prepare.bind(input),diagnostic=structuredClone(input.diagnostic);
 const startChecks={fenceRefs:input.start.fenceRefs.bind(input.start),current:input.start.current.bind(input.start)};
 const waiting={fenceRefs:input.waiting.fenceRefs.bind(input.waiting),current:input.waiting.current.bind(input.waiting),references:input.waiting.references.bind(input.waiting),read:input.waiting.read.bind(input.waiting)};
 const completion={fenceRefs:input.completion.fenceRefs.bind(input.completion),current:input.completion.current.bind(input.completion),read:input.completion.read.bind(input.completion)};
 const f=input.failure,failureChecks=f?{fenceRefs:f.fenceRefs.bind(f),current:f.current.bind(f),references:f.references.bind(f),read:f.read.bind(f)}:undefined;
 let identity:string|undefined;
 const context=async(limits:TransactionOptions)=>{
  const current=await requestVerifiedContext(source,limits),c=current.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const key=canonicalJson([c.resourceOrganizationId,c.actingOrganizationId,c.actor.id]);
  if(identity!==undefined&&identity!==key)throw new CoreError('FORBIDDEN');identity=key;return current;
 };
 const readActions={start:'abh.pack-inspection-jobs.start',waiting:'abh.pack-inspection-jobs.wait',completion:'abh.pack-inspection-jobs.complete',failure:'abh.pack-inspection-jobs.fail'} as const;
 const load=async(jobRef:EntityRef,limits:TransactionOptions,action:keyof typeof readActions='start')=>database.transaction(await context(limits),limits,async tx=>{
  const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const authorize=()=>assertCurrentGrants(tx,{objectRef:jobRef,scopeRefs:[scope],action:readActions[action]},authority(action));
  await authorize();
  const job=await new PackInspectionJobOwner().read(tx,jobRef,async value=>{await readAdmission(tx,value);});
  const installation=await new InstalledPackOwner().read(tx,job.packRef,async pack=>{
   if(pack.manifest.integrity.packageDigest!==job.packageDigest||pack.deploymentVersion!==job.deploymentVersion)throw new CoreError('VERSION_CONFLICT');
  });
  await authorize();tx.assertActive();return {job,installation};
 });
 const initial=await load(ref,{deadline:Date.now()+timeout,signal:parent});
 if(!['Pending','Waiting'].includes(initial.job.status))throw new CoreError('PRECONDITION_FAILED');
 return withPackInspectionLease(database,{context,signal:parent,installation:initial.installation,grants,workerId,heartbeatMs:heartbeat,timeoutMs:timeout},async scope=>{
  const limits=scope.options(),binding=scope.binding();
  const runningRef=await startPackInspection(database,await context(limits),limits,{
   type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:ref.version,
   payload:{lease:{...binding.token,leaseRef:{...binding.token.leaseRef,type:'abh.work-lease'}}},
  },authority('start'),binding,startChecks);
  const running=(await load(runningRef,scope.options())).job;
  // Conservative local scheduling bound; every committing Owner uses DB time.
  const deadline=Math.min(Date.parse(running.expiresAt),Date.parse(running.updatedAt)+running.budget.maxDurationMs-running.budget.elapsedMs);
  if(!Number.isSafeInteger(deadline)||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  const budgetStop=new AbortController(),timer=setTimeout(()=>budgetStop.abort(),Math.min(2147483647,Math.max(1,deadline-Date.now())));
  const progressStop=new AbortController(),watchStop=new AbortController();let progressFailure:unknown,progressFailed=false;
  const options=()=>{const current=scope.options();return {deadline:Math.min(current.deadline,deadline),signal:AbortSignal.any([current.signal,budgetStop.signal,progressStop.signal])};};
  // Observe only the stop predicate. Taking Grant/aggregate locks here could
  // contend with the inspector's own in-flight transaction. No permission is
  // inferred from an unchanged version; lease and committing Owners authorize.
  let watchedSignal:AbortSignal|undefined;
  const watcher=(async()=>{
   try{
    while(!watchStop.signal.aborted){
     const current=options(),limits={...current,signal:AbortSignal.any([current.signal,watchStop.signal]),readOnly:true};
     watchedSignal=limits.signal;
     await database.transaction(await context(limits),limits,tx=>new PackInspectionJobOwner().assertRunning(tx,runningRef));
     await delay(heartbeat,undefined,{signal:limits.signal});
    }
   }catch(error){if(!watchStop.signal.aborted&&!watchedSignal?.aborted){progressFailure=error;progressFailed=true;progressStop.abort(error);}}
  })();
  const stopWatching=async()=>{watchStop.abort();await watcher;if(progressFailed)throw progressFailure;};
  let target:MigrationInspectionTarget|undefined,handed=false,failed=false,failure:unknown;
  const outcome=await observePackInspectionAttempt(running,async phase=>{
  try{
   const prepared=await boundedCallback(async scoped=>{
    const result=await prepare(await context(scoped),structuredClone(running),structuredClone(initial.installation),scoped);
    if(result.status==='Ready'){
     if(scoped.signal.aborted||scoped.deadline<=Date.now()){
      if(!await disposeMigrationInspectionTarget(result.target.dispose.bind(result.target)))throw new CoreError('DEPENDENCY_TIMEOUT');
      throw new CoreError('DEPENDENCY_TIMEOUT');
     }
     target=result.target;
    }
    return result;
   },options());
   const token=()=>{const value=scope.binding();return {binding:value,lease:{...value.token,leaseRef:{...value.token.leaseRef,type:'abh.work-lease' as const}}};};
   let finished:EntityRef;
   if(prepared.status!=='Ready'){
    await stopWatching();
    const current=token(),limits=options();
    finished=await waitPackInspection(database,await context(limits),limits,{type:'abh.pack-inspection-jobs.wait',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:runningRef.version,payload:{...diagnostic,lease:current.lease}},authority('waiting'),current.binding,prepared,waiting);
   }else{
    phase('Inspection');
    if(prepared.run.lease)throw new CoreError('INVALID_ARGUMENT');
    const limits=options(),current=await context(limits),ownership=scope.binding();
    const task={...prepared.run,...(prepared.run.fenceRefs?{fenceRefs:prepared.run.fenceRefs.bind(prepared.run)}:{}),inspect:prepared.run.inspect.bind(prepared.run),admit:prepared.run.admit.bind(prepared.run),read:prepared.run.read.bind(prepared.run),lease:ownership};
    handed=true;
    const observed=await runInstalledMigrationInspection(database,current,limits,prepared.target,task);
    await stopWatching();
    phase('Completion');
    const owned=token(),finishLimits=options();
    finished=await completePackInspection(database,await context(finishLimits),finishLimits,{type:'abh.pack-inspection-jobs.complete',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:runningRef.version,payload:{lease:owned.lease,observationRef:{...observed.observationRef,type:'abh.artifact'}}},authority('completion'),owned.binding,observed.state,completion);
   }
   return {ref:finished,action:prepared.status==='Ready'?'completion' as const:'waiting' as const};
  }catch(error){failed=true;failure=progressFailed?progressFailure:error;throw failure;}finally{
   watchStop.abort();await watcher;
   clearTimeout(timer);budgetStop.abort();
   if(target&&!handed)await requireMigrationInspectionDisposal(target.dispose.bind(target),failed?{error:failure}:undefined);
  }
  });
  // A committed result read is not another execution attempt. Read denial must
  // not manufacture failure evidence or try to change the committed state.
  if(outcome.ok)return (await load(outcome.value.ref,scope.options(),outcome.value.action)).job;
  if(!failureChecks)throw outcome.error;
  // Use the still-owned lease scope, not the exhausted attempt budget signal.
  // Parent cancellation and lease loss still abort this scope and deny settlement.
  try{
   const limits=scope.options(),owned=scope.binding();
   const failedRef=await failPackInspection(database,await context(limits),limits,{
    type:'abh.pack-inspection-jobs.fail',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:runningRef.version,
    payload:{...diagnostic,lease:{...owned.token,leaseRef:{...owned.token.leaseRef,type:'abh.work-lease'}}},
   },authority('failure'),owned,outcome.failure,failureChecks);
   return (await load(failedRef,scope.options(),'failure')).job;
  }catch(error){throw new AggregateError([outcome.error,error],'Inspection and failure settlement failed');}
 });
}
