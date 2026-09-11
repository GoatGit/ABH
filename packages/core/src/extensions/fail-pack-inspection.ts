import type {ArtifactRecord,EntityRef,FailPackInspectionCommand,PackInspectionJobRecord,PackInspectionFailureEvidence} from '@abh/contracts';
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
import {assessPackInspectionFailure,matchPackInspectionFailure,type PackInspectionFailure} from './inspection-failure.ts';
import {measurePackInspectionElapsed} from './inspection-timeout.ts';
import {snapshotPackInspectionLease,requireObservationLease,type PackInspectionLeaseBinding} from './inspection-leases.ts';
export interface PackInspectionFailureAdmission {
 fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
 /** Current cleanup policy, not an assertion that expired work may run. */
 current(tx:TenantTransaction,job:PackInspectionJobRecord):Promise<void>;
 references(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
const envelope='abh-pack-inspection-failure-v1';
function failed(evidence:PackInspectionFailureEvidence,artifactRef:EntityRef,settledAt=evidence.assessedAt):PackInspectionJobRecord {
 if(artifactRef.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
 const spent=measurePackInspectionElapsed(evidence.job,settledAt);
 const instant=(v:string)=>{const [seconds,fraction='']=v.slice(0,-1).split('.');return `${seconds}.${fraction.padEnd(6,'0')}`;};
 if(instant(settledAt)<instant(evidence.assessedAt)||spent.elapsedMs<evidence.elapsedMs)throw new CoreError('PRECONDITION_FAILED');
 const code:PackInspectionFailureEvidence['disposition']=spent.elapsedMs>=evidence.job.budget.maxDurationMs?'BudgetExhausted':spent.expired?'Expired':'InspectionFailed';
 const next={...evidence.job,jobRef:{...evidence.job.jobRef,version:evidence.job.jobRef.version+1},status:'Failed' as const,updatedAt:settledAt,
  budget:{...evidence.job.budget,elapsedMs:spent.elapsedMs},diagnostic:{code,evidenceRefs:[{...artifactRef,type:'abh.artifact' as const}]}};
 delete next.lease;
 return validatePackInspectionJobTransition(evidence.job,next);
}
/** Settle an actual rejected attempt under its still-current lease and an
 * independent failure Grant. Cleanup metadata is not proof remote work stopped. */
export async function failPackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,
 command:FailPackInspectionCommand,grantRefs:readonly EntityRef[],lease:PackInspectionLeaseBinding,failure:PackInspectionFailure,checks:PackInspectionFailureAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const binding=snapshotPackInspectionLease(lease),captured=matchPackInspectionFailure(failure);
 const input=contract('FailPackInspectionCommand',JSON.parse(canonicalJson(command))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],limits={...options},c=context.tenant;
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks),references=checks.references.bind(checks),read=checks.read.bind(checks);
 if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(canonicalJson(input.payload.lease)!==canonicalJson(binding.token))throw new CoreError('INVALID_ARGUMENT');
 const original=captured.job.lease;
 if(!original||original.leaseRef.id!==binding.token.leaseRef.id||original.workerId!==binding.token.workerId||original.fencingToken!==binding.token.fencingToken)throw new CoreError('PRECONDITION_FAILED');
 if(captured.job.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},jobs=new PackInspectionJobOwner(),artifacts=new InlineArtifactOwner();
  let before:PackInspectionJobRecord|undefined;
  const grant=()=>assertCurrentGrants(tx,{objectRef:{...input.target,version:input.expectedVersion},scopeRefs:[scope],action:input.type},grants);
  const admit=async(job:PackInspectionJobRecord)=>{await grant();await current(tx,structuredClone(job));await grant();
   if(job.deploymentVersion!==binding.installation.deploymentVersion)throw new CoreError('VERSION_CONFLICT');
   await requireObservationLease(tx,limits,binding,job.packRef,job.packageDigest);tx.assertActive();};
  const result=await executeCommand(tx,identity,async()=>{
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...binding.grants,...await fences(tx)]);await grant();
   const deployment=`${c.resourceOrganizationId}/Deployment`,key=`${c.resourceOrganizationId}/PackLoader/InspectionJob/${input.target.id}`;
   await tx.lock(4,deployment,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${deployment},0))`);
   await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT id FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id} FOR UPDATE`);
   const [row]=await tx.owner('PackLoader')`SELECT version FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id}`;
   if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
   before=await jobs.read(tx,{...input.target,version:Number(row.version)},async()=>{});await admit(before);
  },async()=>{
   if(!before)throw new CoreError('INTERNAL_ERROR');
   if(before.jobRef.version!==input.expectedVersion)throw new CoreError('VERSION_CONFLICT');
   if(before.status!=='Running')throw new CoreError('PRECONDITION_FAILED');
   const held=before.lease,wanted=binding.token;
   if(!held||held.leaseRef.id!==wanted.leaseRef.id||held.workerId!==wanted.workerId||held.fencingToken!==wanted.fencingToken)throw new CoreError('PRECONDITION_FAILED');
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const evidence=assessPackInspectionFailure(failure,before,String(clock!.now));
   const artifact=await artifacts.store(tx,identity,{dataClass:input.payload.dataClass,region:input.payload.region,retentionPolicyRef:input.payload.retentionPolicyRef,ownerRef:before.jobRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:[before.packRef,evidence.job.lease!.leaseRef],content:canonicalJson([envelope,evidence])},refs=>references(tx,structuredClone(refs)));
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
  if(after.status!=='Failed'||!diagnostic||diagnostic.evidenceRefs.length!==1||!['InspectionFailed','Expired','BudgetExhausted'].includes(diagnostic.code))throw new CoreError('PRECONDITION_FAILED');
  await artifacts.lockSources(tx,diagnostic.evidenceRefs);
  const saved=await artifacts.read(tx,diagnostic.evidenceRefs[0]!,artifact=>read(tx,artifact));
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes));}catch{throw new CoreError('PRECONDITION_FAILED');}
  if(!Array.isArray(parsed)||parsed.length!==2||parsed[0]!==envelope)throw new CoreError('PRECONDITION_FAILED');
  const evidence=contract('PackInspectionFailureEvidence',parsed[1]);
  if(canonicalJson(evidence)!==canonicalJson(assessPackInspectionFailure(failure,captured.job,evidence.assessedAt))||evidence.job.jobRef.id!==ref.id||evidence.job.jobRef.version!==input.expectedVersion||canonicalJson(failed(evidence,saved.record.artifactRef,after.updatedAt))!==canonicalJson(after)||
   canonicalJson(saved.record.ownerRef)!==canonicalJson(evidence.job.jobRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson([after.packRef,evidence.job.lease!.leaseRef])||
   canonicalJson(saved.record.purposeNames)!==canonicalJson(['abh.pack.manage'])||saved.record.mediaType!=='application/json'||saved.record.dataClass!==input.payload.dataClass||saved.record.region!==input.payload.region||canonicalJson(saved.record.retentionPolicyRef)!==canonicalJson(input.payload.retentionPolicyRef)||
   canonicalJson(parsed)!==new TextDecoder().decode(saved.bytes))throw new CoreError('PRECONDITION_FAILED');
  await references(tx,[evidence.job.jobRef,input.payload.retentionPolicyRef,...saved.record.sourceRefs]);await admit(after);
  if(!result.replayed){
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const settled=failed(evidence,saved.record.artifactRef,String(clock!.now));
   const rows=await tx.owner('PackLoader')`UPDATE extension.inspection_jobs SET record=${JSON.stringify(settled)}::text::jsonb,updated_at=clock_timestamp()
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version} AND status='Failed' AND record=${JSON.stringify(after)}::text::jsonb RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
  }
  return ref;
 });
}
