import type {Digest,PackMigrationExecutionRecord} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignBlob,type OfflineCosignKey} from './cosign-blob.ts';

export interface MigrationResultSigner extends OfflineCosignKey {organizationId:string;packId:string;maxAgeMs:number}
export interface VerifiedMigrationResultSignature {record():PackMigrationExecutionRecord}
export interface MigrationResultSignatureProof {record:PackMigrationExecutionRecord;bundle:Uint8Array;keyDigest:Digest;bundleDigest:Digest;verifiedAt:string}
const verified=new WeakMap<object,{proof:MigrationResultSignatureProof;maxAgeMs:number}>();
export function migrationResultSignaturePayload(record:PackMigrationExecutionRecord):string{
 return canonicalJson(['abh-pack-migration-execution-v1',contract('PackMigrationExecutionRecord',record)]);
}
function current(record:PackMigrationExecutionRecord,maxAgeMs:number){
 const [whole,fraction='']=record.observedAt.slice(0,-1).split('.');
 const observed=BigInt(Date.parse(whole+'Z'))*1000n+BigInt(fraction.padEnd(6,'0')),now=BigInt(Date.now())*1000n;
 if(observed>now||now-observed>=BigInt(maxAgeMs)*1000n)throw new CoreError('PRECONDITION_FAILED');
}
/** Independent deployment capture key, bound to organization and Pack namespace.
 * This authenticates an execution observation, never actual target correctness,
 * recovery permission or Enable. Historical admission policy is host-controlled.
 */
export async function verifyMigrationResultSignature(record:PackMigrationExecutionRecord,bundle:Uint8Array,signer:MigrationResultSigner,options:TransactionOptions):Promise<VerifiedMigrationResultSignature>{
 const value=contract('PackMigrationExecutionRecord',JSON.parse(canonicalJson(record))),config=JSON.parse(canonicalJson(signer)) as MigrationResultSigner;
 contract('UUID',config.organizationId);
 if(config.organizationId!==value.attempt.organizationId||config.packId!==value.attempt.packId)throw new CoreError('FORBIDDEN');
 if(!Number.isSafeInteger(config.maxAgeMs)||config.maxAgeMs<1)throw new CoreError('INVALID_ARGUMENT');
 current(value,config.maxAgeMs);
 if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
 const bytes=new Uint8Array(bundle),limits={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
 await verifyCosignBlob(new TextEncoder().encode(migrationResultSignaturePayload(value)),bytes,config,limits);
 const proof:MigrationResultSignatureProof={record:value,bundle:bytes,keyDigest:await digestBytes(new TextEncoder().encode(config.publicKeyPem)),bundleDigest:await digestBytes(bytes),verifiedAt:new Date().toISOString()};
 current(value,config.maxAgeMs);
 if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
 const candidate=Object.freeze({record:()=>structuredClone(value)});verified.set(candidate,{proof,maxAgeMs:config.maxAgeMs});return candidate;
}
export function matchMigrationResultSignature(candidate:VerifiedMigrationResultSignature,record:PackMigrationExecutionRecord):MigrationResultSignatureProof{
 const entry=verified.get(candidate);
 if(!entry||canonicalJson(entry.proof.record)!==canonicalJson(record))throw new CoreError('FORBIDDEN');
 current(entry.proof.record,entry.maxAgeMs);return structuredClone(entry.proof);
}
