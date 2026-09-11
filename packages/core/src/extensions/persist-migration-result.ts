import type postgres from 'postgres';
import type {ArtifactRecord,EntityRef,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {matchMigrationExecutionResult,type MigrationExecutionResult} from './migration-execution-result.ts';
import {readPackMigrationJournal,recordPackMigrationObservation} from './migration-journal.ts';

type ResultRetention=Pick<StoreInlineArtifactPayload,'dataClass'|'region'|'retentionPolicyRef'>;
/** Post-execution evidence persistence, in a fresh management transaction. Retry
 * only this function on failure: it cannot execute SQL. Artifact commit precedes
 * maintenance observation commit; failure between them leaves a replayable Artifact.
 * Host admission must govern evidence capture independently of execution revocation.
 * This is an unsigned raw observation, never a migration verification/Enable proof.
 */
export async function persistMigrationExecutionResult(database:Database,maintenance:postgres.Sql,context:VerifiedContext,options:TransactionOptions,result:MigrationExecutionResult,
 retention:ResultRetention,admit:(refs:readonly EntityRef[])=>Promise<void>,readAdmission:(artifact:ArtifactRecord)=>Promise<void>){
 const captured=matchMigrationExecutionResult(result),fixed=JSON.parse(canonicalJson(retention)) as ResultRetention;
 const authorize=admit,authorizeRead=readAdmission,c=context.tenant,limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||c.resourceOrganizationId!==captured.attempt.organizationId)throw new CoreError('FORBIDDEN');
 const history=await readPackMigrationJournal(maintenance,captured.attempt.attemptRef);
 if(canonicalJson(history.attempt)!==canonicalJson(captured.attempt))throw new CoreError('PRECONDITION_FAILED');
 const payload=contract('StoreInlineArtifactPayload',{
  ...fixed,ownerRef:captured.attempt.attemptRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],
  sourceRefs:[...new Map([captured.attempt.impactRef,...captured.attempt.evidenceRefs].map(ref=>[canonicalJson(ref),ref])).values()],
  content:canonicalJson(['abh-pack-migration-execution-v1',contract('PackMigrationExecutionRecord',{attempt:captured.attempt,result:captured.result,observedAt:captured.observedAt})]),
 });
 const command={commandId:captured.commandId,type:'abh.artifacts.store-inline',idempotencyKey:captured.commandId,digest:await inputDigest(payload)};
 const artifactRef=await database.transaction(context,limits,async tx=>{
  const owner=new InlineArtifactOwner();
  const saved=await executeCommand(tx,command,async()=>{await authorize([payload.ownerRef,payload.retentionPolicyRef,...payload.sourceRefs]);tx.assertActive();},async()=>
   (await owner.store(tx,command,payload,async()=>{tx.assertActive();})).artifactRef);
  const actual=await owner.read(tx,saved.receipt.resultRef,authorizeRead);
  if(actual.record.mediaType!==payload.mediaType||new TextDecoder().decode(actual.bytes)!==payload.content||canonicalJson(actual.record.ownerRef)!==canonicalJson(payload.ownerRef)||canonicalJson(actual.record.sourceRefs)!==canonicalJson(payload.sourceRefs))throw new CoreError('PRECONDITION_FAILED');
  await authorize(structuredClone([payload.ownerRef,payload.retentionPolicyRef,...payload.sourceRefs]));tx.assertActive();active();
  return actual.record.artifactRef;
 });
 // Separate connection/transaction: no false atomicity across management evidence
 // and the dedicated SQL transaction. A crash here must never cause SQL replay.
 active();
 const observation=await recordPackMigrationObservation(maintenance,{attemptRef:captured.attempt.attemptRef,kind:captured.result.kind,evidenceRef:artifactRef});
 return {artifactRef,observation};
}
