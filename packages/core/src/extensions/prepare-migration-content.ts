import {migrationWorkOptions} from './migration-work-options.ts';
import type {Digest,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {contract} from '../data/journal.ts';
import {PackSchemaOwnershipOwner} from './schema-ownership.ts';
import {readPackMigrationContent} from './pack-migration-content.ts';
import type {PackContentSource} from './verify-pack-content.ts';
import {readSignedMigrationPlan,type MigrationSignatureBinding,type SignedMigrationPlanAdmission} from './signed-migration-plan.ts';
import {assertEvidenceCurrent} from './migration-evidence.ts';

/** Prepare immutable SQL text and signed evidence in one management transaction.
 * Host must supply the currently recovered installed Pack, deployment binding and
 * authority fences; this is not a migration permit and does not execute SQL.
 * Database role preflight and execution-time currentness remain runner obligations.
 */
export async function prepareMigrationContent(tx:TenantTransaction,options:TransactionOptions,manifest:PackManifest,steps:readonly PackMigrationStep[],source:PackContentSource,binding:{environmentDigest:Digest;deploymentVersion:number},signatures:readonly MigrationSignatureBinding[],admission:SignedMigrationPlanAdmission,authorize:()=>Promise<void>){
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest))),plan=JSON.parse(canonicalJson(steps)) as PackMigrationStep[],expected={...binding},links=JSON.parse(canonicalJson(signatures)) as MigrationSignatureBinding[];
  const current=migrationWorkOptions(tx,options),payload={refs:[...source.refs],open:source.open.bind(source)},owner=new PackSchemaOwnershipOwner(),lifetimes={...admission.maxLifetimeMs};
  const ownership=await owner.read(tx,authorize);
  const content=await readPackMigrationContent(pack,ownership,plan,payload,current);
  const latest=await owner.read(tx,authorize);
  if(canonicalJson(latest)!==canonicalJson(ownership))throw new CoreError('VERSION_CONFLICT');
  const evidence=await readSignedMigrationPlan(tx,current,pack,ownership,plan,expected,links,admission);
  // Pure persistent read at the end: do not introduce a late callback after evidence expiry checks.
  const finalOwnership=await owner.read(tx,async()=>{});
  if(canonicalJson(finalOwnership)!==canonicalJson(ownership))throw new CoreError('VERSION_CONFLICT');
  if(canonicalJson(admission.maxLifetimeMs)!==canonicalJson(lifetimes))throw new CoreError('VERSION_CONFLICT');
  for(const item of evidence)for(const report of item.reports)assertEvidenceCurrent(report.evidence,lifetimes);
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  tx.assertActive();
  return {packageDigest:pack.integrity.packageDigest,...expected,content,evidence};
}
