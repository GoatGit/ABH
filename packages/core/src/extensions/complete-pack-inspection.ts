import type {ArtifactRecord,CompletePackInspectionCommand,EntityRef,PackInspectionJobRecord,PackMigrationStateObservation} from '@abh/contracts';
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
import {snapshotPackInspectionLease,requireObservationLease,type PackInspectionLeaseBinding} from './inspection-leases.ts';
import {matchInstalledMigrationState,type InstalledMigrationState} from './verify-installed-migration-state.ts';
export interface PackInspectionCompletionAdmission {
 fenceRefs(tx:TenantTransaction,observation:PackMigrationStateObservation):Promise<EntityRef[]>;
 /** Current signature/source, deployment and environment authority. */
 current(tx:TenantTransaction,job:PackInspectionJobRecord,observation:PackMigrationStateObservation):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
const instant=(value:string)=>{const [seconds,fraction='']=value.slice(0,-1).split('.');return `${seconds}.${fraction.padEnd(6,'0')}`;};
/** Technical completion only. Requires original live-verifier provenance and
 * equivalent actual Artifact bytes; matched=false remains a successful check. */
export async function completePackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,
 command:CompletePackInspectionCommand,grantRefs:readonly EntityRef[],lease:PackInspectionLeaseBinding,produced:InstalledMigrationState,checks:PackInspectionCompletionAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const input=contract('CompletePackInspectionCommand',JSON.parse(canonicalJson(command))),binding=snapshotPackInspectionLease(lease),captured=matchInstalledMigrationState(produced);
 const observation=contract('PackMigrationStateObservation',{result:captured.result,observedAt:captured.observedAt});
 const grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],limits={...options},c=context.tenant;
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks),read=checks.read.bind(checks);
 if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||observation.result.structure.binding.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(canonicalJson(input.payload.lease)!==canonicalJson(binding.token))throw new CoreError('INVALID_ARGUMENT');
 const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 const sources=[captured.result.structure.reportRef,captured.result.structure.bundleRef,captured.result.data.reportRef,captured.result.data.bundleRef];
 return database.transaction(context,limits,async tx=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},jobs=new PackInspectionJobOwner(),artifacts=new InlineArtifactOwner();let before:PackInspectionJobRecord|undefined;
  const grant=()=>assertCurrentGrants(tx,{objectRef:{...input.target,version:input.expectedVersion},scopeRefs:[scope],action:input.type},grants);
  const admit=async(job:PackInspectionJobRecord)=>{
   await grant();
   const result=observation.result,report=result.structure.signature.report;
   if(canonicalJson(job.packRef)!==canonicalJson(captured.ownerRef)||job.packageDigest!==result.structure.binding.packageDigest||job.environmentDigest!==report.environmentDigest||job.deploymentVersion!==report.deploymentVersion||job.deploymentVersion!==binding.installation.deploymentVersion)throw new CoreError('VERSION_CONFLICT');
   await current(tx,structuredClone(job),structuredClone(observation));await grant();
   await requireObservationLease(tx,limits,binding,job.packRef,job.packageDigest);
   const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp()<${job.expiresAt}::timestamptz AND clock_timestamp()<${report.expiresAt}::timestamptz AND clock_timestamp()<${result.data.signature.report.expiresAt}::timestamptz AS live`;
   if(!clock?.live)throw new CoreError('PRECONDITION_FAILED');tx.assertActive();
  };
  const verifyArtifact=async()=>{
   await artifacts.lockSources(tx,[input.payload.observationRef,...sources]);
   for(const source of sources)await artifacts.read(tx,source,artifact=>read(tx,artifact));
   const saved=await artifacts.read(tx,input.payload.observationRef,artifact=>read(tx,artifact));
   if(saved.record.mediaType!=='application/json'||canonicalJson(saved.record.ownerRef)!==canonicalJson(captured.ownerRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson(sources))throw new CoreError('PRECONDITION_FAILED');
   try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes),envelope=JSON.parse(text);
    if(!Array.isArray(envelope)||envelope.length!==2||envelope[0]!=='abh-pack-migration-state-observation-v1'||canonicalJson(envelope)!==text)throw new Error();
    const old=contract('PackMigrationStateObservation',envelope[1]),result=observation.result;
    const expected={...result,structure:{...result.structure,signature:{...result.structure.signature,verifiedAt:old.result.structure.signature.verifiedAt}},data:{...result.data,signature:{...result.data.signature,verifiedAt:old.result.data.signature.verifiedAt}}};
    if(instant(old.observedAt)>instant(observation.observedAt)||canonicalJson(old.result)!==canonicalJson(expected))throw new Error();
   }catch{throw new CoreError('PRECONDITION_FAILED');}
   tx.assertActive();
  };
  const result=await executeCommand(tx,identity,async()=>{
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...binding.grants,...await fences(tx,structuredClone(observation))]);await grant();
   const deployment=`${c.resourceOrganizationId}/Deployment`,key=`${c.resourceOrganizationId}/PackLoader/InspectionJob/${input.target.id}`;
   await tx.lock(4,deployment,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${deployment},0))`);
   await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT id FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id} FOR UPDATE`);
   const [row]=await tx.owner('PackLoader')`SELECT version FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.target.id}`;
   if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
   before=await jobs.read(tx,{...input.target,version:Number(row.version)},async()=>{});await admit(before);await verifyArtifact();
  },async()=>{
   if(!before)throw new CoreError('INTERNAL_ERROR');
   if(before.jobRef.version!==input.expectedVersion)throw new CoreError('VERSION_CONFLICT');
   const held=before.lease,wanted=input.payload.lease;
   if(before.status!=='Running'||!held||held.leaseRef.id!==wanted.leaseRef.id||held.workerId!==wanted.workerId||held.fencingToken!==wanted.fencingToken||instant(observation.observedAt)<instant(before.updatedAt))throw new CoreError('PRECONDITION_FAILED');
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const now=String(clock!.now),budget=measurePackInspectionElapsed(before,now);
   if(budget.expired||budget.elapsedMs>=before.budget.maxDurationMs||instant(now)<instant(observation.observedAt))throw new CoreError('PRECONDITION_FAILED');
   const next={...before,jobRef:{...before.jobRef,version:before.jobRef.version+1},status:'Succeeded' as const,updatedAt:now,budget:{...before.budget,elapsedMs:budget.elapsedMs},observation:{artifactRef:input.payload.observationRef,matched:observation.result.matched}};
   delete next.lease;delete next.diagnostic;
   const after=validatePackInspectionJobTransition(before,next);
   const rows=await tx.owner('PackLoader')`UPDATE extension.inspection_jobs SET version=${after.jobRef.version},status='Succeeded',record=${JSON.stringify(after)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${after.jobRef.id} AND version=${input.expectedVersion} RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command:identity,target:after.jobRef,eventType:'abh.pack-inspection-job.succeed',changedFields:['status','budget','lease','observation'],relatedRefs:[after.packRef,input.payload.observationRef]});return after.jobRef;
  });
  const ref=result.receipt.resultRef;
  if(ref.type!=='abh.pack-inspection-job'||ref.id!==input.target.id||ref.version!==input.expectedVersion+1)throw new CoreError('INTERNAL_ERROR');
  const after=await jobs.read(tx,ref,async job=>{if(job.status!=='Succeeded'||canonicalJson(job.observation?.artifactRef)!==canonicalJson(input.payload.observationRef)||job.observation?.matched!==observation.result.matched)throw new CoreError('PRECONDITION_FAILED');});
  await verifyArtifact();await admit(after);
  if(!result.replayed){
   // Final source admission is part of Running work. Settle again after all
   // callbacks, within this same version/transaction, before returning its Ref.
   if(!before)throw new CoreError('INTERNAL_ERROR');
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const now=String(clock!.now),spent=measurePackInspectionElapsed(before,now);
   if(spent.expired||spent.elapsedMs>=before.budget.maxDurationMs)throw new CoreError('PRECONDITION_FAILED');
   const settled=validatePackInspectionJobTransition(before,{...after,updatedAt:now,budget:{...after.budget,elapsedMs:spent.elapsedMs}});
   const rows=await tx.owner('PackLoader')`UPDATE extension.inspection_jobs SET record=${JSON.stringify(settled)}::text::jsonb,updated_at=clock_timestamp()
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version} AND status='Succeeded' AND record=${JSON.stringify(after)}::text::jsonb RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
  }
  tx.assertActive();return ref;
 });
}
