import {withPackInspectionLease,type PackInspectionLeaseScope} from './inspection-lease-scope.ts';
import {WorkLeaseBusyError} from '../durable/work-leases.ts';
import {contract} from '../data/journal.ts';
import {snapshotPackInspectionLease} from './inspection-leases.ts';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {discoverStagedPacks,type StagedPackDiscoveryAdmission} from './discover-staged-packs.ts';
import {disposeMigrationInspectionTarget,type MigrationInspectionTarget} from './inspect-migration-target.ts';
import {runInstalledMigrationInspection,type InstalledMigrationInspectionRun} from './run-installed-migration-inspection.ts';
import {matchInstalledMigrationState} from './verify-installed-migration-state.ts';
export type PackInspectionBlock={status:'Missing'}|{status:'Ambiguous'}|{status:'ObservationAmbiguous'}|{status:'ObservationSearchIncomplete'}|{status:'LeaseBusy'};
export type PreparedPackInspection=PackInspectionBlock|{status:'Ready';target:MigrationInspectionTarget;run:InstalledMigrationInspectionRun};
export interface PackInspectionWorkerOptions {
 signal:AbortSignal;context:ContextSource;grants:readonly EntityRef[];discovery:StagedPackDiscoveryAdmission;
 /** Resolve exact current impact and governed expectations; acquire a dedicated target only for Ready. */
 prepare(candidate:InstalledPackRecord,options:TransactionOptions):Promise<PreparedPackInspection>;
 pageSize?:number;intervalMs?:number;timeoutMs?:number;
 /** Enable automatic ownership; workerId must identify this running instance. */
 lease?:{workerId:string;heartbeatMs?:number};
 /** Per-candidate preparation diagnostic, not durable verification evidence. */
 onBlocked?(candidate:InstalledPackRecord,reason:PackInspectionBlock,options:TransactionOptions):Promise<void>;
 onObservation?(candidate:InstalledPackRecord,result:Awaited<ReturnType<typeof runInstalledMigrationInspection>>,options:TransactionOptions):Promise<void>;
 onPage?(result:{scanned:number;observed:number;mismatched:number;missing:number;ambiguous:number;observationAmbiguous:number;observationSearchIncomplete:number;leaseBusy:number},options:TransactionOptions):Promise<void>;
}
/** Read-only installation recovery sweeps. Repeated workers may inspect again;
 * optional work leases coordinate inspection but never dispatch SQL. Durable verified Artifact state,
 * not this cursor or counters, governs subsequent recovery. No Enable transition.
 */
export async function runPackInspectionWorker(database:Database,input:PackInspectionWorkerOptions):Promise<void>{
 const size=input.pageSize??20,interval=input.intervalMs??1000,timeout=input.timeoutMs??30000;
 if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000||!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
 const lease=input.lease?{workerId:contract('UUID',input.lease.workerId),heartbeatMs:input.lease.heartbeatMs??10000}:undefined;
 if(lease&&(!Number.isInteger(lease.heartbeatMs)||lease.heartbeatMs<10||lease.heartbeatMs>10000))throw new CoreError('INVALID_ARGUMENT');
 const signal=input.signal,source=input.context.bind(input),grants=structuredClone(input.grants),prepare=input.prepare.bind(input),onPage=input.onPage?.bind(input),onBlocked=input.onBlocked?.bind(input),onObservation=input.onObservation?.bind(input);
 const discovery={fenceRefs:input.discovery.fenceRefs.bind(input.discovery),admit:input.discovery.admit.bind(input.discovery),canRead:input.discovery.canRead.bind(input.discovery)};
 const options=():TransactionOptions=>({deadline:Date.now()+timeout,signal});let cursor:number|undefined,binding:string|undefined;
 const context=async(limits=options())=>{const value=await requestVerifiedContext(source,limits),c=value.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const key=canonicalJson([c.resourceOrganizationId,c.actingOrganizationId,c.actor.id]);if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return value;};
 while(!signal.aborted){try{
  const page=await discoverStagedPacks(database,await context(),options(),size,cursor,grants,discovery),stats={scanned:page.scanned,observed:0,mismatched:0,missing:0,ambiguous:0,observationAmbiguous:0,observationSearchIncomplete:0,leaseBusy:0};
  for(const candidate of page.candidates){
   if(signal.aborted)return;
   const inspectCandidate=async(scope?:PackInspectionLeaseScope)=>{
   const scopedOptions=scope?scope.options:options;
   let acquired:MigrationInspectionTarget|undefined,handed=false;
   try{
    const prepared=await boundedCallback(async scoped=>{
     const value=await prepare(structuredClone(candidate),scoped);
     if(value.status==='Ready'){
      if(scoped.signal.aborted||scoped.deadline<=Date.now()){await disposeMigrationInspectionTarget(value.target.dispose.bind(value.target));throw new CoreError('DEPENDENCY_TIMEOUT');}
      acquired=value.target;
     }
     return value;
    },scopedOptions());
    if(prepared.status!=='Ready'){
     const status=prepared.status;
     if(status==='Missing')stats.missing++;else if(status==='Ambiguous')stats.ambiguous++;else if(status==='ObservationAmbiguous')stats.observationAmbiguous++;else if(status==='ObservationSearchIncomplete')stats.observationSearchIncomplete++;else stats.leaseBusy++;
     if(onBlocked)await boundedCallback(limits=>onBlocked(structuredClone(candidate),{status},limits),scopedOptions());
     return;
    }
    if(scope&&prepared.run.lease)throw new CoreError('INVALID_ARGUMENT');
    const current=await context(scopedOptions()),inspect=prepared.run.inspect.bind(prepared.run);
    const task:InstalledMigrationInspectionRun={...(scope?{lease:scope.binding()}:prepared.run.lease?{lease:snapshotPackInspectionLease(prepared.run.lease)}:{}),retention:structuredClone(prepared.run.retention),admit:prepared.run.admit.bind(prepared.run),read:prepared.run.read.bind(prepared.run),...(prepared.run.recovery?{recovery:structuredClone(prepared.run.recovery)}:{}),inspect:async(tx,sql,limits)=>{
     const state=await inspect(tx,sql,limits),captured=matchInstalledMigrationState(state,tx,sql);
     if(canonicalJson(captured.ownerRef)!==canonicalJson(candidate.packRef)||captured.result.structure.binding.packageDigest!==candidate.manifest.integrity.packageDigest)throw new CoreError('VERSION_CONFLICT');return state;
    }};
    handed=true;
    const result=await runInstalledMigrationInspection(database,current,scopedOptions(),prepared.target,task);
    stats.observed++;if(!result.state.matched)stats.mismatched++;
    if(onObservation)await boundedCallback(limits=>onObservation(structuredClone(candidate),result,limits),scopedOptions());
   }finally{if(acquired&&!handed&&!await disposeMigrationInspectionTarget(acquired.dispose.bind(acquired)))throw new CoreError('DEPENDENCY_TIMEOUT');}
   };
   let entered=false;
   try{
    if(lease)await withPackInspectionLease(database,{context,signal,installation:candidate,grants,...lease,timeoutMs:timeout},async scope=>{entered=true;await inspectCandidate(scope);});
    else {entered=true;await inspectCandidate();}
   }catch(error){
    if(entered||!(error instanceof WorkLeaseBusyError))throw error;
    stats.leaseBusy++;if(onBlocked)await boundedCallback(limits=>onBlocked(structuredClone(candidate),{status:'LeaseBusy'},limits),options());
   }
  }
  cursor=page.next;if(onPage)await boundedCallback(limits=>onPage({...stats},limits),options());
  if(signal.aborted)return;await delay(interval,undefined,{signal});
 }catch(error){if(signal.aborted)return;throw error;}}
}
