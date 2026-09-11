import type postgres from 'postgres';
import type {Digest,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyRegisteredMigrationData,type MigrationDataBinding} from './verify-registered-migration-data.ts';
import type {MigrationDataCheck} from './verify-migration-data.ts';
import {verifyDataSignature,matchDataSignature,type MigrationDataReport,type MigrationDataSigner} from './verify-data-signature.ts';
export interface SignedDataAdmission {
 /** Read current deployment-controlled key/environment under retained authority fences. */
 current():Promise<{signer:MigrationDataSigner;environmentDigest:Digest;deploymentVersion:number}>;
 /** Authorize actual report/bundle provenance, installed package and deployment. */
 authorize(report:MigrationDataReport,binding:Readonly<MigrationDataBinding>):Promise<void>;
}
/** Actual Cosign signature plus registered target data inspection. The host
 * still supplies report/bundle bytes and their current source/installation authority.
 * No persisted report reader, complete domain verification, lifecycle or Enable is implied.
 */
export async function verifySignedMigrationData(tx:TenantTransaction,sql:postgres.ReservedSql,options:TransactionOptions,manifest:PackManifest,steps:readonly PackMigrationStep[],expectation:readonly MigrationDataCheck[],
 report:MigrationDataReport,bundle:Uint8Array,admission:SignedDataAdmission){
 const pack=structuredClone(manifest),plan=structuredClone(steps),expected=structuredClone(expectation),value=structuredClone(report),bytes=new Uint8Array(bundle),limits={...options,signal:AbortSignal.any([options.signal,tx.signal])};
 const read=admission.current.bind(admission),authorize=admission.authorize.bind(admission);
 const active=()=>{tx.assertActive();if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 const config=structuredClone(await read());active();
 if(config.environmentDigest!==value.environmentDigest||config.deploymentVersion!==value.deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
 const signature=await verifyDataSignature(value,bytes,config.signer,limits);active();
 const current=async(binding:Readonly<MigrationDataBinding>)=>{
  matchDataSignature(signature,value,binding);
  await authorize(structuredClone(value),Object.freeze({...binding}));active();
  if(canonicalJson(await read())!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');active();
  matchDataSignature(signature,value,binding);
 };
 const result=await verifyRegisteredMigrationData(tx,sql,limits,pack,plan,expected,current);
 const proof=matchDataSignature(signature,value,result.binding);active();
 return {...result,signature:proof};
}
