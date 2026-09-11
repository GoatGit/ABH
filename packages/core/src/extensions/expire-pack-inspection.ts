import type {ArtifactRecord,EntityRef,ExpirePackInspectionCommand,PackInspectionJobRecord,PackInspectionTimeoutEvidence} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
import {validatePackInspectionJobTransition} from './inspection-job-transition.ts';
import {assessPackInspectionTimeout} from './inspection-timeout.ts';
export interface PackInspectionExpiryAdmission {
 fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
 /** Current cleanup policy, not an assertion that expired work may run. */
 current(tx:TenantTransaction,job:PackInspectionJobRecord):Promise<void>;
 references(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
const envelope='abh-pack-inspection-timeout-v1';
function failed(evidence:PackInspectionTimeoutEvidence,artifactRef:EntityRef):PackInspectionJobRecord {
 if(artifactRef.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
 const next={...evidence.job,jobRef:{...evidence.job.jobRef,version:evidence.job.jobRef.version+1},status:'Failed' as const,updatedAt:evidence.assessedAt,
  budget:{...evidence.job.budget,elapsedMs:evidence.elapsedMs},diagnostic:{code:evidence.cause,evidenceRefs:[{...artifactRef,type:'abh.artifact' as const}]}};
 delete next.lease;
 return validatePackInspectionJobTransition(evidence.job,next);
}
/** Atomic deadline cleanup. No lease requirement: a dead worker cannot prevent
 * expiry. Failing progress does not prove the worker stopped or any SQL succeeded. */
export async function expirePackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,
 command:ExpirePackInspectionCommand,grantRefs:readonly EntityRef[],checks:PackInspectionExpiryAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const input=contract('ExpirePackInspectionCommand',JSON.parse(canonicalJson(command))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],limits={...options},c=context.tenant;
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks),references=checks.references.bind(checks),read=checks.read.bind(checks);
 if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},jobs=new PackInspectionJobOwner(),artifacts=new InlineArtifactOwner();
  let before:PackInspectionJobRecord|undefined;
  const grant=()=>assertCurrentGrants(tx,{objectRef:{...input.target,version:input.expectedVersion},scopeRefs:[scope],action:input.type},grants);
  const admit=async(job:PackInspectionJobRecord)=>{await grant();await current(tx,structuredClone(job));await grant();tx.assertActive();};
  const result=await executeCommand(tx,identity,async()=>{
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx)]);await grant();
   const deployment=`${c.resourceOrganizationId}/Deployment`,key=`${c.resourceOrganizationId}/PackLoader/InspectionJob/${input.target.id}`;
   await tx.lock(4,deployment,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${deployment},0))`);
   await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT id FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id} FOR UPDATE`);
   const [row]=await tx.owner('PackLoader')`SELECT version FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id}`;
   if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
   before=await jobs.read(tx,{...input.target,version:Number(row.version)},async()=>{});await admit(before);
  },async()=>{
   if(!before)throw new CoreError('INTERNAL_ERROR');
   if(before.jobRef.version!==input.expectedVersion)throw new CoreError('VERSION_CONFLICT');
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const evidence=assessPackInspectionTimeout(before,String(clock!.now));
   const artifact=await artifacts.store(tx,identity,{...input.payload,ownerRef:before.jobRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:[before.packRef,...(before.lease?[before.lease.leaseRef]:[])],content:canonicalJson([envelope,evidence])},refs=>references(tx,structuredClone(refs)));
   const after=failed(evidence,artifact.artifactRef);
   const rows=await tx.owner('PackLoader')`UPDATE extension.inspection_jobs SET version=${after.jobRef.version},status='Failed',record=${JSON.stringify(after)}::text::jsonb,
    updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${after.jobRef.id} AND version=${input.expectedVersion} RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command:identity,target:after.jobRef,eventType:'abh.pack-inspection-job.fail',changedFields:['status','budget','lease','diagnostic'],relatedRefs:[artifact.artifactRef,after.packRef]});
   return after.jobRef;
  });
  const ref=result.receipt.resultRef;
  if(ref.type!=='abh.pack-inspection-job'||ref.id!==input.target.id||ref.version!==input.expectedVersion+1)throw new CoreError('INTERNAL_ERROR');
  const after=await jobs.read(tx,ref,async()=>{}),diagnostic=after.diagnostic;
  if(after.status!=='Failed'||!diagnostic||diagnostic.evidenceRefs.length!==1||!['Expired','BudgetExhausted'].includes(diagnostic.code))throw new CoreError('PRECONDITION_FAILED');
  await artifacts.lockSources(tx,diagnostic.evidenceRefs);
  const saved=await artifacts.read(tx,diagnostic.evidenceRefs[0]!,artifact=>read(tx,artifact));
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes));}catch{throw new CoreError('PRECONDITION_FAILED');}
  if(!Array.isArray(parsed)||parsed.length!==2||parsed[0]!==envelope)throw new CoreError('PRECONDITION_FAILED');
  const evidence=contract('PackInspectionTimeoutEvidence',parsed[1]);
  if(evidence.job.jobRef.id!==ref.id||evidence.job.jobRef.version!==input.expectedVersion||canonicalJson(failed(evidence,saved.record.artifactRef))!==canonicalJson(after)||
   canonicalJson(saved.record.ownerRef)!==canonicalJson(evidence.job.jobRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson([after.packRef,...(evidence.job.lease?[evidence.job.lease.leaseRef]:[])])||
   saved.record.mediaType!=='application/json'||saved.record.dataClass!==input.payload.dataClass||saved.record.region!==input.payload.region||canonicalJson(saved.record.retentionPolicyRef)!==canonicalJson(input.payload.retentionPolicyRef)||
   canonicalJson(parsed)!==new TextDecoder().decode(saved.bytes))throw new CoreError('PRECONDITION_FAILED');
  await references(tx,[evidence.job.jobRef,input.payload.retentionPolicyRef,...saved.record.sourceRefs]);await admit(after);return ref;
 });
}
