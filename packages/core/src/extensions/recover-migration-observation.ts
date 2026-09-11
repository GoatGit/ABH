import type postgres from 'postgres';
import type {ArtifactRecord,EntityRef,PackMigrationAttemptRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions,TenantTransaction} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {contract} from '../data/journal.ts';
import {readPackMigrationJournal,recordPackMigrationObservation} from './migration-journal.ts';
import {readStoredMigrationExecutionResult} from './read-migration-result.ts';

/** Recover a missing raw observation from an existing Artifact, never dispatch SQL.
 * Source admission must independently verify producer/capture authority, not merely
 * JSON shape. Host acquires recovery authority fences before source locks. Actual
 * migration completion still requires a separate target-state verification process.
 * Maintenance commit may survive failure of the enclosing read transaction: retry
 * must reauthorize and replay the same Artifact; it must not execute the migration.
 */
export async function recoverMigrationObservation(database:Database,maintenance:postgres.Sql,context:VerifiedContext,options:TransactionOptions,
 attemptRef:EntityRef,artifactRef:EntityRef,admission:{authorize(tx:TenantTransaction,attempt:PackMigrationAttemptRecord):Promise<void>;source(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;authenticate?(tx:TenantTransaction,attempt:PackMigrationAttemptRecord,artifactRef:EntityRef):Promise<void>}){
 const ref=contract('EntityRef',JSON.parse(canonicalJson(attemptRef))),source=contract('EntityRef',JSON.parse(canonicalJson(artifactRef)));
 const authorize=admission.authorize.bind(admission),admitSource=admission.source.bind(admission),authenticate=admission.authenticate?.bind(admission),c=context.tenant,limits={...options};
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const history=await readPackMigrationJournal(maintenance,ref);
 if(history.attempt.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 return database.transaction(context,limits,async tx=>{
  await authorize(tx,structuredClone(history.attempt));tx.assertActive();
  const result=await readStoredMigrationExecutionResult(tx,source,history.attempt,artifact=>admitSource(tx,artifact));
  const observation=await recordPackMigrationObservation(maintenance,{attemptRef:history.attempt.attemptRef,kind:result.result.kind,evidenceRef:source},async current=>{
   if(canonicalJson(current)!==canonicalJson(history.attempt))throw new CoreError('VERSION_CONFLICT');
   tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
   // Authenticate after obtaining the maintenance lock and again after the write.
   // A signature checked before a lock wait may no longer be current.
   await authorize(tx,structuredClone(current));tx.assertActive();
   const refreshed=await readStoredMigrationExecutionResult(tx,source,current,artifact=>admitSource(tx,artifact));
   if(canonicalJson(refreshed)!==canonicalJson(result))throw new CoreError('VERSION_CONFLICT');
   await authenticate?.(tx,structuredClone(current),structuredClone(source));
   tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  });
  tx.assertActive();return {artifactRef:source,observation};
 });
}
