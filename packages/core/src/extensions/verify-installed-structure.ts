import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareInstalledPack,type InstalledMigrationInput} from './prepare-installed-pack.ts';
import type {PackDataImpactAdmission} from './data-impact-reports.ts';
import type {MigrationStructureExpectation} from './verify-migration-structure.ts';
import type {StoredStructureAdmission} from './read-signed-structure.ts';
import {verifyStoredMigrationStructure} from './verify-stored-migration-structure.ts';
/** Installed staging/impact and reviewed migration evidence drive the target
 * inspection; callers cannot substitute a Manifest or owner Ref. Requires a live
 * dedicated read-only REPEATABLE READ connection and retained authority fences.
 * Host supplies actual source/key authorities. This is structural evidence only,
 * not data verification, migration execution or Enable.
 */
export async function verifyInstalledMigrationStructure(tx:TenantTransaction,options:TransactionOptions,impactRef:EntityRef,root:string,grants:readonly EntityRef[],checks:PackDataImpactAdmission,
 migration:InstalledMigrationInput,expectation:MigrationStructureExpectation,reportRef:EntityRef,bundleRef:EntityRef,sources:StoredStructureAdmission){
 const ref=structuredClone(impactRef),permissions=structuredClone(grants),expected=structuredClone(expectation),report=structuredClone(reportRef),bundle=structuredClone(bundleRef),limits={...options,signal:AbortSignal.any([options.signal,tx.signal])};
 const impactChecks={signer:checks.signer.bind(checks),source:checks.source.bind(checks),fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks)};
 const admission=migration.admission,policy=canonicalJson(admission.maxLifetimeMs);
 const work:InstalledMigrationInput={connection:migration.connection,steps:structuredClone(migration.steps),signatures:structuredClone(migration.signatures),admission:{maxLifetimeMs:structuredClone(admission.maxLifetimeMs),reportSource:admission.reportSource.bind(admission),supportingFacts:admission.supportingFacts.bind(admission),signature:{signer:admission.signature.signer.bind(admission.signature),source:admission.signature.source.bind(admission.signature)}}};
 const source=sources.source.bind(sources),signer=sources.signer.bind(sources);
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');if(canonicalJson(admission.maxLifetimeMs)!==policy)throw new CoreError('VERSION_CONFLICT');};
 const prepare=async()=>{active();const result=await prepareInstalledPack(tx,limits,ref,root,permissions,impactChecks,work);active();if(result.status!=='MigrationPrepared')throw new CoreError('PRECONDITION_FAILED');return result;};
 const initial=await prepare();
 const result=await verifyStoredMigrationStructure(tx,work.connection,limits,initial.installation.manifest,work.steps,expected,initial.installation.packRef,report,bundle,{
  source,signer,current:async()=>{
   const latest=await prepare();
   if(canonicalJson(latest.installation)!==canonicalJson(initial.installation)||canonicalJson(latest.impact)!==canonicalJson(initial.impact))throw new CoreError('VERSION_CONFLICT');
   return {environmentDigest:latest.impact.environmentDigest,deploymentVersion:latest.impact.deploymentVersion};
  },
 });active();return result;
}
