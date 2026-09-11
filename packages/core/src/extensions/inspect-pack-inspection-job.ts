import type {ArtifactRecord,EntityRef,PackInspectionJobRecord,PackInspectionDiagnostic} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {requireVerifiedContext} from '../internal/context.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
import {PackInspectionDeliveryOwner} from './inspection-deliveries.ts';
import {assessPackInspectionLeaseLoss,PackInspectionLeaseStillCurrentError} from './inspection-lease-loss.ts';
import {measurePackInspectionElapsed} from './inspection-timeout.ts';
export interface PackInspectionDiagnosticAdmission {
 fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
 current(tx:TenantTransaction,job:PackInspectionJobRecord):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
export type {PackInspectionDiagnostic} from '@abh/contracts';
/** Internal doctor backend. Short locked snapshot under organization-wide management
 * discovery authority. Verifies referenced Artifact bytes but returns only Refs.
 * Suggestions are not command permissions or an Enable/verification decision.
 * No business writes, queue calls, lease changes or implicit recovery commands. */
export async function inspectPackInspectionJob(database:Database,context:VerifiedContext,options:TransactionOptions,jobRef:EntityRef,
 grantRefs:readonly EntityRef[],checks:PackInspectionDiagnosticAdmission):Promise<PackInspectionDiagnostic>{
 requireVerifiedContext(context);
 const c=context.tenant,ref=contract('EntityRef',structuredClone(jobRef)),grants=structuredClone(grantRefs),limits={...options};
 if(ref.type!=='abh.pack-inspection-job')throw new CoreError('INVALID_ARGUMENT');
 if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks),read=checks.read.bind(checks);
 return database.transaction(context,limits,async tx=>{
  const organization={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[organization,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx)]);
  const authorize=()=>assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.packs.record-data-impact'},grants);
  await authorize();
  const deployment=`${c.resourceOrganizationId}/Deployment`,key=`${c.resourceOrganizationId}/PackLoader/InspectionJob/${ref.id}`;
  await tx.lock(4,deployment,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${deployment},0))`);
  await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT id FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} FOR UPDATE`);
  const job=await new PackInspectionJobOwner().readCurrent(tx,ref,value=>current(tx,value));
  await authorize();
  const evidenceRefs:EntityRef[]=job.observation?[job.observation.artifactRef]:[...(job.diagnostic?.evidenceRefs??[])];
  const artifacts=new InlineArtifactOwner();await artifacts.lockSources(tx,evidenceRefs);
  for(const evidence of evidenceRefs)await artifacts.read(tx,evidence,value=>read(tx,value));
  const terminal=['Succeeded','Failed','Cancelled'].includes(job.status);
  const accepted=!terminal&&job.status!=='Running'?await new PackInspectionDeliveryOwner().findAccepted(tx,job.jobRef,async()=>{}):undefined;
  let assessedAt:string,leaseRef:EntityRef|undefined,leaseLoss:'Expired'|'Replaced'|undefined;
  if(job.status==='Running'){
   const observed=await new WorkLeaseOwner().observe(tx,job.packRef);assessedAt=observed.assessedAt;leaseRef=observed.record.leaseRef;
   try{leaseLoss=assessPackInspectionLeaseLoss(job,observed.record,assessedAt).cause;}
   catch(error){if(!(error instanceof PackInspectionLeaseStillCurrentError))throw error;}
  }else{
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   assessedAt=String(clock!.now);
  }
  const measured=terminal?{elapsedMs:job.budget.elapsedMs,expired:false}:measurePackInspectionElapsed(job,assessedAt);
  const expired=!terminal&&(measured.expired||measured.elapsedMs>=job.budget.maxDurationMs);
  const nextStep:PackInspectionDiagnostic['nextStep']=terminal?'Terminal':expired?'SettleExpired':leaseLoss?'SettleLostLease':job.status==='Running'?'ObserveRunning':accepted?'AttemptExecution':'AwaitDelivery';
  await current(tx,structuredClone(job));await authorize();tx.assertActive();
  return contract('PackInspectionDiagnostic',{jobRef:job.jobRef,status:job.status,assessedAt,nextStep,...(accepted?{deliveryRef:accepted.deliveryRef}:{}),...(leaseRef?{leaseRef}:{}),...(leaseLoss?{leaseLoss}:{}),evidenceRefs,
   elapsedMs:measured.elapsedMs,remainingDurationMs:Math.max(0,job.budget.maxDurationMs-measured.elapsedMs),remainingAttempts:job.budget.maxAttempts-job.budget.attempts});
 });
}
