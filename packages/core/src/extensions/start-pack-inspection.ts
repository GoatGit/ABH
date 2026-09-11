import type {EntityRef,PackInspectionJobRecord,StartPackInspectionCommand} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
import {validatePackInspectionJobTransition} from './inspection-job-transition.ts';
import {snapshotPackInspectionLease,requireObservationLease,type PackInspectionLeaseBinding} from './inspection-leases.ts';
export interface PackInspectionStartAdmission {
 /** Declare every additional Control fence before deployment/job/lease locks. */
 fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
 /** Revalidate current deployment/environment policy; may only reuse declared locks. */
 current(tx:TenantTransaction,job:PackInspectionJobRecord):Promise<void>;
}
/** Pending/Waiting -> Running only. Replays recheck the live lease and exact
 * resulting progress, never reopen terminal work or reset cumulative budgets. */
export async function startPackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,
 command:StartPackInspectionCommand,grantRefs:readonly EntityRef[],lease:PackInspectionLeaseBinding,checks:PackInspectionStartAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const input=contract('StartPackInspectionCommand',JSON.parse(canonicalJson(command))),binding=snapshotPackInspectionLease(lease);
 const grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],limits={...options},c=context.tenant;
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks);
 if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(canonicalJson(input.payload.lease)!==canonicalJson(binding.token))throw new CoreError('INVALID_ARGUMENT');
 const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},owner=new PackInspectionJobOwner();
  let before:PackInspectionJobRecord|undefined;
  const grant=()=>assertCurrentGrants(tx,{objectRef:{...input.target,version:input.expectedVersion},scopeRefs:[scope],action:input.type},grants);
  const admit=async(job:PackInspectionJobRecord)=>{
   await grant();
   if(job.deploymentVersion!==binding.installation.deploymentVersion)throw new CoreError('VERSION_CONFLICT');
   await current(tx,structuredClone(job));await grant();
   await requireObservationLease(tx,limits,binding,job.packRef,job.packageDigest);
   const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp()<${job.expiresAt}::timestamptz AS live`;
   if(!clock?.live)throw new CoreError('PRECONDITION_FAILED');tx.assertActive();
  };
  const result=await executeCommand(tx,identity,async()=>{
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...binding.grants,...await fences(tx)]);
   await grant();
   const deployment=`${c.resourceOrganizationId}/Deployment`,key=`${c.resourceOrganizationId}/PackLoader/InspectionJob/${input.target.id}`;
   await tx.lock(4,deployment,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${deployment},0))`);
   await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT id FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id} FOR UPDATE`);
   const [row]=await tx.owner('PackLoader')`SELECT version FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id}`;
   if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
   before=await owner.read(tx,{...input.target,version:Number(row.version)},async()=>{});
   await admit(before);
  },async()=>{
   if(!before)throw new CoreError('INTERNAL_ERROR');
   if(before.jobRef.version!==input.expectedVersion)throw new CoreError('VERSION_CONFLICT');
   if(!['Pending','Waiting'].includes(before.status))throw new CoreError('PRECONDITION_FAILED');
   const [competing]=await tx.owner('PackLoader')`SELECT id FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND pack_id=${before.packRef.id} AND status='Running' AND id<>${before.jobRef.id}`;
   if(competing)throw new CoreError('PRECONDITION_FAILED');
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const next={...before,jobRef:{...before.jobRef,version:before.jobRef.version+1},status:'Running' as const,updatedAt:clock!.now as string,
    budget:{...before.budget,attempts:before.budget.attempts+1},lease:input.payload.lease};
   delete next.diagnostic;
   const after=validatePackInspectionJobTransition(before,next);
   const rows=await tx.owner('PackLoader')`UPDATE extension.inspection_jobs SET version=${after.jobRef.version},status='Running',record=${JSON.stringify(after)}::text::jsonb,
    updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${after.jobRef.id} AND version=${input.expectedVersion} RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command:identity,target:after.jobRef,eventType:'abh.pack-inspection-job.start',changedFields:['status','budget','lease'],relatedRefs:[after.packRef,input.payload.lease.leaseRef]});
   return after.jobRef;
  });
  const ref=result.receipt.resultRef;
  if(ref.type!=='abh.pack-inspection-job'||ref.id!==input.target.id||ref.version!==input.expectedVersion+1)throw new CoreError('INTERNAL_ERROR');
  const after=await owner.read(tx,ref,async job=>{
   if(job.status!=='Running'||canonicalJson(job.lease)!==canonicalJson(input.payload.lease))throw new CoreError('PRECONDITION_FAILED');
  });
  await admit(after);return ref;
 });
}
