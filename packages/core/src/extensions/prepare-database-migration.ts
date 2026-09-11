import {migrationWorkOptions} from './migration-work-options.ts';
import type postgres from 'postgres';
import type {Digest,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareMigrationContent} from './prepare-migration-content.ts';
import {verifyRegisteredPackMigrationDatabase} from './pack-migration-database.ts';
import type {PackContentSource} from './verify-pack-content.ts';
import type {MigrationSignatureBinding,SignedMigrationPlanAdmission} from './signed-migration-plan.ts';
import {assertEvidenceCurrent} from './migration-evidence.ts';

/** Bind actual migration preparation to a pinned, directly authenticated target role.
 * Use only for nonempty migrations. Empty migrations use the data-impact path.
 * Requires current installed content and deployment authority fences from the host.
 * No SQL execution, transaction/recovery claims or Enable authority are produced.
 */
export async function prepareDatabaseMigration(tx:TenantTransaction,sql:postgres.ReservedSql,options:TransactionOptions,manifest:PackManifest,steps:readonly PackMigrationStep[],source:PackContentSource,binding:{environmentDigest:Digest;deploymentVersion:number},signatures:readonly MigrationSignatureBinding[],admission:SignedMigrationPlanAdmission,authorize:()=>Promise<void>){
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest))),plan=JSON.parse(canonicalJson(steps)) as PackMigrationStep[],expected={...binding},links=JSON.parse(canonicalJson(signatures)) as MigrationSignatureBinding[];
  const current=migrationWorkOptions(tx,options),payload={refs:[...source.refs],open:source.open.bind(source)},lifetimes={...admission.maxLifetimeMs};
  if(!plan.length)throw new CoreError('PRECONDITION_FAILED');
  await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,authorize);
  const result=await prepareMigrationContent(tx,current,pack,plan,payload,expected,links,admission,authorize);
  // Authority fences acquired by the caller remain held; avoid another user callback
  // after evidence checks, while rereading actual role/catalog and ownership facts.
  await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,async()=>{});
  if(canonicalJson(admission.maxLifetimeMs)!==canonicalJson(lifetimes))throw new CoreError('VERSION_CONFLICT');
  for(const item of result.evidence)for(const report of item.reports)assertEvidenceCurrent(report.evidence,lifetimes);
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  tx.assertActive();return result;
}
