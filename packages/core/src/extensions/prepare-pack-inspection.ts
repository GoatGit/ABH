import {InstalledPackOwner} from './installed-packs.ts';
import {snapshotPackInspectionLease} from './inspection-leases.ts';
import {selectMigrationState} from './select-migration-state.ts';
import type {MigrationStateDiscoveryAdmission} from './discover-migration-state.ts';
import type {Digest,EntityRef,InstalledPackRecord,PackInspectionBlockEvidence} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import type {PackDataImpactAdmission} from './data-impact-reports.ts';
import type {InstalledMigrationInput} from './prepare-installed-pack.ts';
import type {InstalledMigrationInspectionRun} from './run-installed-migration-inspection.ts';
import type {PreparedPackInspection,PackInspectionBlock} from './inspection-worker.ts';
import {selectCurrentPackDataImpact} from './select-pack-data-impact.ts';
import {connectMigrationTarget} from './connect-migration-target.ts';
import {verifyInstalledMigrationState,type InstalledStructureInspection,type InstalledDataInspection} from './verify-installed-migration-state.ts';

export interface PackInspectionPreparation {
 /** Trusted deployment settings, never a connection URL from Pack content. */
 root:string;targetUrl:string;environmentDigest:Digest;grants:readonly EntityRef[];
 impact:PackDataImpactAdmission;
 /** Authorize selection, including absent/ambiguous reports, retaining authority fences. */
 select(tx:TenantTransaction):Promise<void>;
 /** Additional Control fences used by select/impact during actual inspection. */
 inspectionFenceRefs?(tx:TenantTransaction):Promise<EntityRef[]>;
 migration:Omit<InstalledMigrationInput,'connection'>;
 structure:InstalledStructureInspection;data:InstalledDataInspection;
 observation:Omit<InstalledMigrationInspectionRun,'inspect'>;
 /** Optional automatic persistent recovery lookup; mutually exclusive with an explicit recovery Ref. */
 recoveryDiscovery?:{admission:MigrationStateDiscoveryAdmission;maxScanned?:number};
}
/** Compose the SQL-migration inspection path from actual persisted impact selection.
 * No target is acquired for blocked selection. Ready transfers a dedicated target to
 * the caller, which must run or dispose it. Re-select inside the inspection UoW;
 * neither a previously selected report nor this preparation proves completion.
 * Non-SQL/domain/backfill/projection paths require their own verification.
 */
export async function preparePackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,candidate:InstalledPackRecord,input:PackInspectionPreparation):Promise<PreparedPackInspection>{
 const pack=contract('InstalledPackRecord',structuredClone(candidate)),limits={...options},root=input.root,url=input.targetUrl,environment=contract('Digest',input.environmentDigest),grants=structuredClone(input.grants);
 const inspectionFences=input.inspectionFenceRefs?.bind(input),select=input.select.bind(input),policy=input.impact;
 const impact={signer:policy.signer.bind(policy),source:policy.source.bind(policy),fenceRefs:policy.fenceRefs.bind(policy),current:policy.current.bind(policy)};
 const admission=input.migration.admission;
 const migration={steps:structuredClone(input.migration.steps),signatures:structuredClone(input.migration.signatures),admission:{maxLifetimeMs:structuredClone(admission.maxLifetimeMs),reportSource:admission.reportSource.bind(admission),supportingFacts:admission.supportingFacts.bind(admission),signature:{signer:admission.signature.signer.bind(admission.signature),source:admission.signature.source.bind(admission.signature)}}};
 const structure={expectation:structuredClone(input.structure.expectation),reportRef:structuredClone(input.structure.reportRef),bundleRef:structuredClone(input.structure.bundleRef),sources:{source:input.structure.sources.source.bind(input.structure.sources),signer:input.structure.sources.signer.bind(input.structure.sources)}};
 const data={expectation:structuredClone(input.data.expectation),reportRef:structuredClone(input.data.reportRef),bundleRef:structuredClone(input.data.bundleRef),sources:{source:input.data.sources.source.bind(input.data.sources),signer:input.data.sources.signer.bind(input.data.sources)}};
 const observation=input.observation,saved={...(observation.lease?{lease:snapshotPackInspectionLease(observation.lease)}:{}),retention:structuredClone(observation.retention),admit:observation.admit.bind(observation),read:observation.read.bind(observation),...(observation.recovery?{recovery:structuredClone(observation.recovery)}:{})};
 const lookup=input.recoveryDiscovery,discovery=lookup&&{maxScanned:lookup.maxScanned??20,admission:{fenceRefs:lookup.admission.fenceRefs.bind(lookup.admission),admit:lookup.admission.admit.bind(lookup.admission),read:lookup.admission.read.bind(lookup.admission)}};
 if(discovery&&(saved.recovery||!Number.isInteger(discovery.maxScanned)||discovery.maxScanned<1||discovery.maxScanned>100))throw new CoreError('INVALID_ARGUMENT');
 if(pack.status!=='Staged'||!pack.manifest.migrations.length)throw new CoreError('PRECONDITION_FAILED');
 const resolve=async(tx:TenantTransaction,scoped:TransactionOptions)=>{
  const selected=await selectCurrentPackDataImpact(tx,scoped,pack.packRef,environment,pack.deploymentVersion,root,grants,impact,select);
  if(selected.status==='Selected'&&canonicalJson(selected.recovered.installation())!==canonicalJson(pack))throw new CoreError('VERSION_CONFLICT');
  return selected;
 };
 const blocked=async(reason:PackInspectionBlockEvidence['reason']):Promise<PackInspectionBlock>=>{
  const evidence=await database.transaction(context,limits,async tx=>{
   const actual=await new InstalledPackOwner().read(tx,pack.packRef,async()=>{});
   if(canonicalJson(actual)!==canonicalJson(pack))throw new CoreError('VERSION_CONFLICT');
   const c=tx.context.tenant;
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const [principal]=await tx.owner('Identity')`SELECT version FROM identity.principals WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${c.actor.id} AND deleted_at IS NULL`;
   if(!principal)throw new CoreError('FORBIDDEN');
   return contract('PackInspectionBlockEvidence',{resourceOrganizationId:c.resourceOrganizationId,packRef:pack.packRef,packageDigest:pack.manifest.integrity.packageDigest,environmentDigest:environment,deploymentVersion:pack.deploymentVersion,principalRef:{type:'abh.principal',id:c.actor.id,version:Number(principal.version)},observedAt:clock!.now,reason});
  });
  const result={status:reason};blocks.set(result,evidence);return result;
 };
 const selected=await database.transaction(context,limits,tx=>resolve(tx,limits));
 if(selected.status!=='Selected')return blocked(selected.status);
 if(discovery){
  const sources=[structure.reportRef,structure.bundleRef,data.reportRef,data.bundleRef] as const;
  const observed=await selectMigrationState(database,context,limits,{packRef:pack.packRef,packageDigest:pack.manifest.integrity.packageDigest,environmentDigest:environment,deploymentVersion:pack.deploymentVersion,sources},grants,discovery.admission,discovery.maxScanned);
  if(observed.status==='Ambiguous')return blocked('ObservationAmbiguous');
  if(observed.status==='Incomplete')return blocked('ObservationSearchIncomplete');
  if(observed.status==='Selected')saved.recovery={artifactRef:observed.artifactRef,sources};
 }
 const impactRef=structuredClone(selected.impactRef);
 const run:InstalledMigrationInspectionRun={...saved,fenceRefs:async tx=>[...grants,...(inspectionFences?await inspectionFences(tx):[])],inspect:async(tx,connection,scoped)=>{
  const current=await resolve(tx,scoped);
  if(current.status!=='Selected'||canonicalJson(current.impactRef)!==canonicalJson(impactRef))throw new CoreError('VERSION_CONFLICT');
  return verifyInstalledMigrationState(tx,scoped,impactRef,root,grants,impact,{...migration,connection},structure,data);
 }};
 return {status:'Ready',run,target:await connectMigrationTarget(url,limits)};
}

const blocks=new WeakMap<object,PackInspectionBlockEvidence>();
/** Only original actual preparation outcomes carry provenance. A diagnostic is a
 * historical blocked check, not proof the condition is still present. */
export function matchPackInspectionBlock(value:PackInspectionBlock):PackInspectionBlockEvidence {
 const evidence=blocks.get(value);
 if(!evidence||canonicalJson(value)!==canonicalJson({status:evidence.reason}))throw new CoreError('PRECONDITION_FAILED');
 return structuredClone(evidence);
}
