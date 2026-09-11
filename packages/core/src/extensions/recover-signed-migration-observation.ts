import type postgres from 'postgres';
import type {EntityRef,PackMigrationAttemptRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {recoverMigrationObservation} from './recover-migration-observation.ts';
import {readSignedMigrationExecutionResult,type SignedMigrationResultAdmission} from './read-signed-migration-result.ts';

/** Mandatory persisted capture signature for raw observation recovery. Caller
 * retains recovery/capture governance fences; this does not verify target state.
 */
export async function recoverSignedMigrationObservation(database:Database,maintenance:postgres.Sql,context:VerifiedContext,options:TransactionOptions,
 attemptRef:EntityRef,resultRef:EntityRef,bundleRef:EntityRef,authorize:(tx:TenantTransaction,attempt:PackMigrationAttemptRecord)=>Promise<void>,admission:SignedMigrationResultAdmission){
 const result=contract('EntityRef',JSON.parse(canonicalJson(resultRef))),bundle=contract('EntityRef',JSON.parse(canonicalJson(bundleRef)));
 const checks={signer:admission.signer.bind(admission),source:admission.source.bind(admission)};
 return recoverMigrationObservation(database,maintenance,context,options,attemptRef,result,{
  authorize:async(tx,attempt)=>{await authorize(tx,attempt);await new InlineArtifactOwner().lockSources(tx,[result,bundle]);},
  source:(tx,artifact)=>checks.source(artifact,'Result'),
  authenticate:async(tx,attempt,ref)=>{await readSignedMigrationExecutionResult(tx,options,attempt,ref,bundle,checks);},
 });
}
