import type postgres from 'postgres';
import type {EntityRef,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {recoverImpactCheckedPack,type PackDataImpactAdmission} from './data-impact-reports.ts';
import {prepareDatabaseMigration} from './prepare-database-migration.ts';
import type {MigrationSignatureBinding,SignedMigrationPlanAdmission} from './signed-migration-plan.ts';
import {assertEvidenceCurrent} from './migration-evidence.ts';
import {verifyRegisteredPackMigrationDatabase} from './pack-migration-database.ts';

export interface InstalledMigrationInput {
  connection:postgres.ReservedSql;
  steps:readonly PackMigrationStep[];
  signatures:readonly MigrationSignatureBinding[];
  admission:SignedMigrationPlanAdmission;
}
/** Installed preparation always derives Manifest, bytes, environment and deployment
 * from current persisted impact admission. Caller acquires all extra migration authority
 * fences before entry. No result here enables a Pack or proves migration completion.
 */
export async function prepareInstalledPack(tx:TenantTransaction,options:TransactionOptions,impactRef:EntityRef,root:string,grants:readonly EntityRef[],checks:PackDataImpactAdmission,migration?:InstalledMigrationInput){
  const ref=contract('EntityRef',JSON.parse(canonicalJson(impactRef))),current={...options,signal:AbortSignal.any([options.signal,tx.signal])};
  if(current.signal.aborted||!Number.isSafeInteger(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  tx.assertActive();
  const work=migration?{connection:migration.connection,steps:JSON.parse(canonicalJson(migration.steps)) as PackMigrationStep[],signatures:JSON.parse(canonicalJson(migration.signatures)) as MigrationSignatureBinding[],admission:migration.admission}:undefined;
  const lifetimes=work?{...work.admission.maxLifetimeMs}:undefined;
  const recovered=await recoverImpactCheckedPack(tx,current,ref,root,grants,checks),impact=recovered.impact(),installation=recovered.installation();
  if(installation.status!=='Staged'||impact.impact.status==='Incomplete')throw new CoreError('PRECONDITION_FAILED');
  if(!installation.manifest.migrations.length){
    if(work)throw new CoreError('INVALID_ARGUMENT');
    // Changed projections/definitions with no SQL still require actual data verification.
    return {status:impact.impact.status==='NotApplicable'?'NotApplicable' as const:'DataVerificationRequired' as const,impactRef:ref,impact,installation};
  }
  if(!work||impact.impact.status!=='Required')throw new CoreError('PRECONDITION_FAILED');
  const prepared=await prepareDatabaseMigration(tx,work.connection,current,installation.manifest,work.steps,recovered.files.payload,
    {environmentDigest:impact.environmentDigest,deploymentVersion:impact.deploymentVersion},work.signatures,work.admission,async()=>{});
  // Revalidate current impact/governance and signed compiler evidence after expensive preparation.
  const latest=await recoverImpactCheckedPack(tx,current,ref,root,grants,checks);
  if(canonicalJson(latest.impact())!==canonicalJson(impact)||canonicalJson(latest.installation())!==canonicalJson(installation))throw new CoreError('VERSION_CONFLICT');
  // Impact admission can invoke host callbacks. Recheck the actual target after
  // those callbacks, without introducing another callback after this boundary.
  await verifyRegisteredPackMigrationDatabase(tx,work.connection,installation.manifest,work.steps,async()=>{});
  if(canonicalJson(work.admission.maxLifetimeMs)!==canonicalJson(lifetimes))throw new CoreError('VERSION_CONFLICT');
  for(const item of prepared.evidence)for(const report of item.reports)assertEvidenceCurrent(report.evidence,lifetimes!);
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  tx.assertActive();return {status:'MigrationPrepared' as const,impactRef:ref,impact,installation,prepared};
}
