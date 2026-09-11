import type postgres from 'postgres';
import type {Digest,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyRegisteredMigrationStructure,type MigrationStructureBinding} from './verify-registered-migration-structure.ts';
import type {MigrationStructureExpectation} from './verify-migration-structure.ts';
import {verifyStructureSignature,matchStructureSignature,type MigrationStructureReport,type MigrationStructureSigner} from './verify-structure-signature.ts';
export interface SignedStructureAdmission {
 /** Read current deployment-controlled key/environment under retained authority fences. */
 current():Promise<{signer:MigrationStructureSigner;environmentDigest:Digest;deploymentVersion:number}>;
 /** Authorize actual report/bundle provenance, installed package and deployment. */
 authorize(report:MigrationStructureReport,binding:Readonly<MigrationStructureBinding>):Promise<void>;
}
/** Actual Cosign signature plus registered target structural inspection. The host
 * still supplies report/bundle bytes and their current source/installation authority.
 * No persisted report reader, data verification, lifecycle or Enable is implied.
 */
export async function verifySignedMigrationStructure(tx:TenantTransaction,sql:postgres.ReservedSql,options:TransactionOptions,manifest:PackManifest,steps:readonly PackMigrationStep[],expectation:MigrationStructureExpectation,
 report:MigrationStructureReport,bundle:Uint8Array,admission:SignedStructureAdmission){
 const pack=structuredClone(manifest),plan=structuredClone(steps),expected=structuredClone(expectation),value=structuredClone(report),bytes=new Uint8Array(bundle),limits={...options};
 const read=admission.current.bind(admission),authorize=admission.authorize.bind(admission);
 const active=()=>{tx.assertActive();if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 const config=structuredClone(await read());active();
 if(config.environmentDigest!==value.environmentDigest||config.deploymentVersion!==value.deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
 const signature=await verifyStructureSignature(value,bytes,config.signer,limits);active();
 const current=async(binding:Readonly<MigrationStructureBinding>)=>{
  matchStructureSignature(signature,value,binding);
  await authorize(structuredClone(value),Object.freeze({...binding}));active();
  if(canonicalJson(await read())!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');active();
  matchStructureSignature(signature,value,binding);
 };
 const result=await verifyRegisteredMigrationStructure(tx,sql,limits,pack,plan,expected,current);
 const proof=matchStructureSignature(signature,value,result.binding);active();
 return {...result,signature:proof};
}
