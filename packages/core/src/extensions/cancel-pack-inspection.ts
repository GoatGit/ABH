import type {ArtifactRecord,EntityRef,CancelPackInspectionCommand,PackInspectionJobRecord,PackInspectionCancellationEvidence} from '@abh/contracts';
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
import {measurePackInspectionElapsed} from './inspection-timeout.ts';
export interface PackInspectionCancellationAdmission {
 fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
 /** Verify current cancellation policy and semantic basis against actual bytes. */
 current(tx:TenantTransaction,job:PackInspectionJobRecord,basis:{record:ArtifactRecord;bytes:Uint8Array},reason:CancelPackInspectionCommand['payload']['reason']):Promise<void>;
 references(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
const envelope='abh-pack-inspection-cancellation-v1';
function terminated(evidence:PackInspectionCancellationEvidence,artifactRef:EntityRef):PackInspectionJobRecord {
 if(artifactRef.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
 const next={...evidence.job,jobRef:{...evidence.job.jobRef,version:evidence.job.jobRef.version+1},status:evidence.disposition==='Cancelled'?'Cancelled' as const:'Failed' as const,updatedAt:evidence.assessedAt,
  budget:{...evidence.job.budget,elapsedMs:evidence.elapsedMs},diagnostic:{code:evidence.disposition,evidenceRefs:[{...artifactRef,type:'abh.artifact' as const}]}};
 delete next.lease;
 return validatePackInspectionJobTransition(evidence.job,next);
}
/** Governed cancellation, independent of a surviving worker lease. Preserves
 * duration exhaustion as Failed/BudgetExhausted; does not claim work has stopped. */
export async function cancelPackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,
 command:CancelPackInspectionCommand,grantRefs:readonly EntityRef[],checks:PackInspectionCancellationAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const input=contract('CancelPackInspectionCommand',JSON.parse(canonicalJson(command))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],limits={...options},c=context.tenant;
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks),references=checks.references.bind(checks),read=checks.read.bind(checks);
 if(!['Human','Service'].includes(c.actor.type)||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},jobs=new PackInspectionJobOwner(),artifacts=new InlineArtifactOwner();
  let before:PackInspectionJobRecord|undefined;
  const grant=()=>assertCurrentGrants(tx,{objectRef:{...input.target,version:input.expectedVersion},scopeRefs:[scope],action:input.type},grants);
  const admit=async(job:PackInspectionJobRecord)=>{
   await grant();await artifacts.lockSources(tx,[input.payload.basisRef]);
   const basis=await artifacts.read(tx,input.payload.basisRef,artifact=>read(tx,artifact));
   await current(tx,structuredClone(job),{record:structuredClone(basis.record),bytes:new Uint8Array(basis.bytes)},input.payload.reason);
   await grant();tx.assertActive();
  };
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
   const now=String(clock!.now),spent=measurePackInspectionElapsed(before,now);
   const [principal]=await tx.owner('Identity')`SELECT version FROM identity.principals WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${c.actor.id} AND deleted_at IS NULL`;
   if(!principal)throw new CoreError('FORBIDDEN');
   const evidence=contract('PackInspectionCancellationEvidence',{job:before,assessedAt:now,elapsedMs:spent.elapsedMs,disposition:spent.elapsedMs>=before.budget.maxDurationMs?'BudgetExhausted':'Cancelled',reason:input.payload.reason,basisRef:input.payload.basisRef,actorRef:{type:'abh.principal',id:c.actor.id,version:Number(principal.version)},commandId:input.commandId});
   const artifact=await artifacts.store(tx,identity,{dataClass:input.payload.dataClass,region:input.payload.region,retentionPolicyRef:input.payload.retentionPolicyRef,ownerRef:before.jobRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:[input.payload.basisRef,before.packRef,...(before.lease?[before.lease.leaseRef]:[])],content:canonicalJson([envelope,evidence])},refs=>references(tx,structuredClone(refs)));
   const after=terminated(evidence,artifact.artifactRef);
   const rows=await tx.owner('PackLoader')`UPDATE extension.inspection_jobs SET version=${after.jobRef.version},status=${after.status},record=${JSON.stringify(after)}::text::jsonb,
    updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${after.jobRef.id} AND version=${input.expectedVersion} RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command:identity,target:after.jobRef,eventType:after.status==='Cancelled'?'abh.pack-inspection-job.cancel':'abh.pack-inspection-job.fail',changedFields:['status','budget','lease','diagnostic'],relatedRefs:[artifact.artifactRef,after.packRef]});
   return after.jobRef;
  });
  const ref=result.receipt.resultRef;
  if(ref.type!=='abh.pack-inspection-job'||ref.id!==input.target.id||ref.version!==input.expectedVersion+1)throw new CoreError('INTERNAL_ERROR');
  const after=await jobs.read(tx,ref,async()=>{}),diagnostic=after.diagnostic;
  if(!['Cancelled','Failed'].includes(after.status)||!diagnostic||diagnostic.evidenceRefs.length!==1||!['Cancelled','BudgetExhausted'].includes(diagnostic.code))throw new CoreError('PRECONDITION_FAILED');
  await artifacts.lockSources(tx,[...diagnostic.evidenceRefs,input.payload.basisRef]);
  const saved=await artifacts.read(tx,diagnostic.evidenceRefs[0]!,artifact=>read(tx,artifact));
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes));}catch{throw new CoreError('PRECONDITION_FAILED');}
  if(!Array.isArray(parsed)||parsed.length!==2||parsed[0]!==envelope)throw new CoreError('PRECONDITION_FAILED');
  const evidence=contract('PackInspectionCancellationEvidence',parsed[1]);
  if(evidence.commandId!==result.receipt.commandRef.id||evidence.actorRef.id!==c.actor.id||evidence.reason!==input.payload.reason||canonicalJson(evidence.basisRef)!==canonicalJson(input.payload.basisRef)||evidence.job.jobRef.id!==ref.id||evidence.job.jobRef.version!==input.expectedVersion||canonicalJson(terminated(evidence,saved.record.artifactRef))!==canonicalJson(after)||
   canonicalJson(saved.record.ownerRef)!==canonicalJson(evidence.job.jobRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson([input.payload.basisRef,after.packRef,...(evidence.job.lease?[evidence.job.lease.leaseRef]:[])])||
   saved.record.mediaType!=='application/json'||saved.record.dataClass!==input.payload.dataClass||saved.record.region!==input.payload.region||canonicalJson(saved.record.retentionPolicyRef)!==canonicalJson(input.payload.retentionPolicyRef)||
   canonicalJson(parsed)!==new TextDecoder().decode(saved.bytes))throw new CoreError('PRECONDITION_FAILED');
  await references(tx,[evidence.job.jobRef,input.payload.retentionPolicyRef,...saved.record.sourceRefs]);await admit(after);return ref;
 });
}
