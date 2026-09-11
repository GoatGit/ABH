import type {Digest,PackMigrationStructureReport} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignBlob,type OfflineCosignKey} from './cosign-blob.ts';
import type {MigrationStructureBinding} from './verify-registered-migration-structure.ts';

export type MigrationStructureReport = PackMigrationStructureReport;
export interface MigrationStructureSigner extends OfflineCosignKey {organizationId:string;packId:string;maxLifetimeMs:number}
export interface VerifiedStructureSignature {report():MigrationStructureReport}
export interface StructureSignatureProof {report:MigrationStructureReport;bundle:Uint8Array;keyDigest:Digest;bundleDigest:Digest;verifiedAt:string}
const verified=new WeakMap<object,{proof:StructureSignatureProof;maxLifetimeMs:number}>();
function validate(report:MigrationStructureReport){contract('PackMigrationStructureReport',report);}
function current(report:MigrationStructureReport,maxLifetimeMs:number){
 const micros=(value:string)=>{const [whole,fraction='']=value.slice(0,-1).split('.');return BigInt(Date.parse(whole+'Z'))*1000n+BigInt(fraction.padEnd(6,'0'));};
 const start=micros(report.issuedAt),end=micros(report.expiresAt),now=BigInt(Date.now())*1000n;
 if(end<=start||start>now||end<=now||end-start>BigInt(maxLifetimeMs)*1000n)throw new CoreError('PRECONDITION_FAILED');
}
export function structureSignaturePayload(report:MigrationStructureReport){validate(report);return canonicalJson(['abh-pack-migration-structure-expectation-v1',report]);}
/** Authenticates an expected structure digest, not correctness of the expectation
 * or actual migration completion. Deployment chooses the independent trusted key.
 */
export async function verifyStructureSignature(report:MigrationStructureReport,bundle:Uint8Array,signer:MigrationStructureSigner,options:TransactionOptions):Promise<VerifiedStructureSignature>{
 const value=JSON.parse(canonicalJson(report)) as MigrationStructureReport,config=JSON.parse(canonicalJson(signer)) as MigrationStructureSigner,limits={...options};validate(value);
 if(config.organizationId!==value.binding.organizationId||config.packId!==value.binding.packId)throw new CoreError('FORBIDDEN');
 if(!Number.isSafeInteger(config.maxLifetimeMs)||config.maxLifetimeMs<1)throw new CoreError('INVALID_ARGUMENT');current(value,config.maxLifetimeMs);
 if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');const bytes=new Uint8Array(bundle);
 await verifyCosignBlob(new TextEncoder().encode(structureSignaturePayload(value)),bytes,config,limits);
 const proof={report:value,bundle:bytes,keyDigest:await digestBytes(new TextEncoder().encode(config.publicKeyPem)),bundleDigest:await digestBytes(bytes),verifiedAt:new Date().toISOString()};
 current(value,config.maxLifetimeMs);if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
 const candidate=Object.freeze({report:()=>structuredClone(value)});verified.set(candidate,{proof,maxLifetimeMs:config.maxLifetimeMs});return candidate;
}
export function matchStructureSignature(candidate:VerifiedStructureSignature,report:MigrationStructureReport,binding:MigrationStructureBinding):StructureSignatureProof{
 const entry=verified.get(candidate);
 if(!entry||canonicalJson(entry.proof.report)!==canonicalJson(report)||canonicalJson(report.binding)!==canonicalJson(binding))throw new CoreError('FORBIDDEN');
 current(entry.proof.report,entry.maxLifetimeMs);return structuredClone(entry.proof);
}
