import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import type {ArtifactRecord,EntityRef,PackMigrationAttemptRecord,PackMigrationExecutionRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {readStoredMigrationExecutionResult} from './read-migration-result.ts';
import {verifyMigrationResultSignature,matchMigrationResultSignature,type MigrationResultSigner} from './verify-migration-result-signature.ts';

export interface SignedMigrationResultAdmission {
 signer(record:PackMigrationExecutionRecord):Promise<MigrationResultSigner>;
 source(artifact:ArtifactRecord,role:'Result'|'Bundle'):Promise<void>;
}
/** Read and authenticate actual persisted result and Bundle in one management UoW.
 * Caller obtains current capture/recovery authority fences before entry. Signature
 * proves observation provenance, not actual database results or recovery permission.
 */
export async function readSignedMigrationExecutionResult(tx:TenantTransaction,options:TransactionOptions,attempt:PackMigrationAttemptRecord,resultRef:EntityRef,bundleRef:EntityRef,admission:SignedMigrationResultAdmission){
 const expected=contract('PackMigrationAttemptRecord',JSON.parse(canonicalJson(attempt))),result=contract('EntityRef',JSON.parse(canonicalJson(resultRef))),bundle=contract('EntityRef',JSON.parse(canonicalJson(bundleRef)));
 const signer=admission.signer.bind(admission),source=admission.source.bind(admission),current=migrationWorkOptions(tx,options);
 const active=()=>assertMigrationWorkActive(tx,current);
 const c=tx.context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||expected.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const owner=new InlineArtifactOwner();await owner.lockSources(tx,[result,bundle]);active();
 const stored=await readStoredMigrationExecutionResult(tx,result,expected,async artifact=>{active();await source(artifact,'Result');active();});
 const record:PackMigrationExecutionRecord={attempt:stored.attempt,result:stored.result,observedAt:stored.observedAt};
 const config=JSON.parse(canonicalJson(await signer(structuredClone(record)))) as MigrationResultSigner;active();
 const signature=await owner.read(tx,bundle,async artifact=>{
  if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536||canonicalJson(artifact.ownerRef)!==canonicalJson(expected.attemptRef)||!artifact.sourceRefs.some(ref=>canonicalJson(ref)===canonicalJson(result)))throw new CoreError('PRECONDITION_FAILED');
  active();await source(artifact,'Bundle');active();
 });
 const proof=await verifyMigrationResultSignature(record,signature.bytes,config,current);
 // Refresh both source admissions and configured capture key after crypto work.
 active();await source(structuredClone(stored.artifact),'Result');active();await source(structuredClone(signature.record),'Bundle');active();
 if(canonicalJson(await signer(structuredClone(record)))!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');
 active();matchMigrationResultSignature(proof,record);tx.assertActive();
 if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
 return {record,resultRef:result,bundleRef:bundle,proof};
}
