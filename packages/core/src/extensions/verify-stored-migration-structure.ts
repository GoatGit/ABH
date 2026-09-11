import {randomUUID} from 'node:crypto';
import type postgres from 'postgres';
import type {Digest,EntityRef,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyRegisteredMigrationStructure,type MigrationStructureBinding} from './verify-registered-migration-structure.ts';
import type {MigrationStructureExpectation} from './verify-migration-structure.ts';
import {readSignedStructureExpectation,type StoredStructureAdmission} from './read-signed-structure.ts';
import {matchStructureSignature,type MigrationStructureReport,type MigrationStructureSigner} from './verify-structure-signature.ts';
export interface StoredStructureInspectionAdmission extends StoredStructureAdmission {
 /** Authorize installed package/deployment and retain all relevant fences in tx. */
 current(report:MigrationStructureReport,binding:Readonly<MigrationStructureBinding>):Promise<{environmentDigest:Digest;deploymentVersion:number}>;
}
/** Composes persisted expectation/Bundle verification with the actual registered
 * target. All admission passes reread immutable Artifact bytes and current source
 * policy. Host retains installation/deployment authority and target lifecycle.
 * Returned matching structure is not data verification or Enable authorization.
 */
export async function verifyStoredMigrationStructure(tx:TenantTransaction,sql:postgres.ReservedSql,options:TransactionOptions,manifest:PackManifest,steps:readonly PackMigrationStep[],expectation:MigrationStructureExpectation,
 ownerRef:EntityRef,reportRef:EntityRef,bundleRef:EntityRef,admission:StoredStructureInspectionAdmission){
 const pack=structuredClone(manifest),plan=structuredClone(steps),expected=structuredClone(expectation),owner=structuredClone(ownerRef),report=structuredClone(reportRef),bundle=structuredClone(bundleRef),limits={...options};
 const source=admission.source.bind(admission),signer=admission.signer.bind(admission),current=admission.current.bind(admission);
 let configuration:MigrationStructureSigner|undefined,stored:Awaited<ReturnType<typeof readSignedStructureExpectation>>|undefined;
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 const authenticate=async(binding:Readonly<MigrationStructureBinding>)=>{
  active();
  const sources:StoredStructureAdmission={source,signer:async value=>{
   const config=structuredClone(await signer(value));active();
   if(configuration&&canonicalJson(configuration)!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');configuration??=config;return config;
  }};
  stored=await readSignedStructureExpectation(tx,limits,binding,owner,report,bundle,sources);
  const deployment=await current(structuredClone(stored.report),Object.freeze({...binding}));active();
  if(deployment.environmentDigest!==stored.report.environmentDigest||deployment.deploymentVersion!==stored.report.deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
  // Deployment admission may revoke sources or rotate the key; refresh after it.
  stored=await readSignedStructureExpectation(tx,limits,binding,owner,report,bundle,sources);
  matchStructureSignature(stored.proof,stored.report,binding);
 };
 const result=await verifyRegisteredMigrationStructure(tx,sql,limits,pack,plan,expected,authenticate);
 active();if(!stored)throw new CoreError('PRECONDITION_FAILED');
 const output={...result,reportRef:stored.reportRef,bundleRef:stored.bundleRef,signature:matchStructureSignature(stored.proof,stored.report,result.binding)};
 producers.set(output,tx);
 captured.set(output,{ownerRef:owner,result:snapshot(output),observedAt:new Date().toISOString(),commandId:randomUUID()});
 return output;
}

export type StoredMigrationStructureResult=Awaited<ReturnType<typeof verifyStoredMigrationStructure>>;
function snapshot(value:StoredMigrationStructureResult){
 const {bundle,...signature}=value.signature;
 return structuredClone({...value,signature});
}
const producers=new WeakMap<object,TenantTransaction>();
const captured=new WeakMap<object,{ownerRef:EntityRef;result:ReturnType<typeof snapshot>;observedAt:string;commandId:string}>();
/** Only the original successful inspection return object has producer provenance.
 * Signature Bundle bytes are represented by the persisted Ref and verified digest.
 */
export function matchStoredMigrationStructureResult(value:StoredMigrationStructureResult,transaction?:TenantTransaction){
 if(transaction&&producers.get(value)!==transaction)throw new CoreError('PRECONDITION_FAILED');
 const record=captured.get(value);
 if(!record||canonicalJson(record.result)!==canonicalJson(snapshot(value)))throw new CoreError('PRECONDITION_FAILED');
 return structuredClone(record);
}
