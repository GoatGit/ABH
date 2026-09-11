import {guardMigrationConnection} from './guard-migration-connection.ts';
import type postgres from 'postgres';
import type {EntityRef,PackMigrationAttemptRecord,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {executeNewMigrationClaim} from './execute-migration-step.ts';
import type {NewMigrationClaim} from './migration-journal.ts';
import {prepareInstalledPack,type InstalledMigrationInput} from './prepare-installed-pack.ts';
import type {PackDataImpactAdmission} from './data-impact-reports.ts';
import type {MigrationSignatureBinding,SignedMigrationPlanAdmission} from './signed-migration-plan.ts';

/** Governed installed preparation on both sides of actual SQL execution. The host
 * retains all deployment/migration fences in tx and supplies actual result checking.
 * This is internal assembly, not Enable or durable result/observation persistence.
 * The target belongs to this call and is destroyed by the execution primitive.
 */
export async function executeInstalledMigrationClaim(tx:TenantTransaction,target:{connection:postgres.ReservedSql;dispose():Promise<void>},options:TransactionOptions,
  claim:NewMigrationClaim,root:string,grants:readonly EntityRef[],checks:PackDataImpactAdmission,migration:Omit<InstalledMigrationInput,'connection'>,
  verifyResults:(record:PackMigrationAttemptRecord,connection:postgres.ReservedSql,signal:AbortSignal)=>Promise<void>){
  let fixed:{grants:EntityRef[];steps:PackMigrationStep[];signatures:MigrationSignatureBinding[];policy:string;admission:SignedMigrationPlanAdmission;checks:PackDataImpactAdmission;verify:typeof verifyResults}|undefined;
  const guarded=(signal:AbortSignal)=>{
    const check=()=>{if(signal.aborted||options.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');tx.assertActive();};
    return guardMigrationConnection(target.connection,check);
  };
  const prepare=async(record:PackMigrationAttemptRecord,signal:AbortSignal)=>{
    // Snapshot inside the execution primitive's cleanup scope, before any await.
    fixed??={grants:JSON.parse(canonicalJson(grants)),steps:JSON.parse(canonicalJson(migration.steps)),signatures:JSON.parse(canonicalJson(migration.signatures)),policy:canonicalJson(migration.admission.maxLifetimeMs),admission:{maxLifetimeMs:migration.admission.maxLifetimeMs,reportSource:migration.admission.reportSource.bind(migration.admission),supportingFacts:migration.admission.supportingFacts.bind(migration.admission),signature:{signer:migration.admission.signature.signer.bind(migration.admission.signature),source:migration.admission.signature.source.bind(migration.admission.signature)}},
      checks:{signer:checks.signer.bind(checks),source:checks.source.bind(checks),fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks)},verify:verifyResults};
    if(signal.aborted||canonicalJson(migration.admission.maxLifetimeMs)!==fixed.policy)throw new CoreError('PRECONDITION_FAILED');
    const current=await prepareInstalledPack(tx,options,record.impactRef,root,fixed.grants,fixed.checks,{connection:guarded(signal),steps:fixed.steps,signatures:fixed.signatures,admission:fixed.admission});
    if(signal.aborted||current.status!=='MigrationPrepared'||canonicalJson(migration.admission.maxLifetimeMs)!==fixed.policy||current.impact.environmentDigest!==record.environmentDigest||current.impact.deploymentVersion!==record.deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
    const selected=current.prepared!.content.find(item=>canonicalJson(item.step)===canonicalJson(record.step));
    const reports=current.prepared!.evidence.find(item=>canonicalJson(item.step)===canonicalJson(record.step))?.reports;
    if(!selected||!reports)throw new CoreError('PRECONDITION_FAILED');
    const refs=reports.flatMap(report=>{
      const link=fixed!.signatures.find(link=>canonicalJson(link.reportRef)===canonicalJson(report.ref));
      if(!link)throw new CoreError('PRECONDITION_FAILED');return [report.ref,link.bundleRef];
    });
    const normalized=(refs:readonly EntityRef[])=>canonicalJson(refs.map(ref=>canonicalJson(ref)).sort());
    if(normalized(refs)!==normalized(record.evidenceRefs))throw new CoreError('PRECONDITION_FAILED');
    return {manifest:current.installation.manifest,steps:fixed.steps,sql:selected.sql};
  };
  return executeNewMigrationClaim(tx,target,options,claim,{
    prepare,
    beforeCommit:async(record,signal)=>{
      await fixed!.verify(structuredClone(record),guarded(signal),signal);
      await prepare(record,signal);
    },
  });
}
