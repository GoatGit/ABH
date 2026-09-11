import type {Digest,PackMigrationEvidence} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignBlob,type OfflineCosignKey} from './cosign-blob.ts';

export interface MigrationEvidenceSigner extends OfflineCosignKey {
  organizationId:string;
  kind:PackMigrationEvidence['kind'];
  maxLifetimeMs:number;
}
export interface VerifiedMigrationSignature {report():PackMigrationEvidence}
export interface MigrationSignatureProof {report:PackMigrationEvidence;bundle:Uint8Array;keyDigest:Digest;bundleDigest:Digest;verifiedAt:string}
const verified=new WeakMap<object,MigrationSignatureProof>();
export function migrationSignaturePayload(report:PackMigrationEvidence):string{
  contract('PackMigrationEvidence',report);
  return canonicalJson(['abh-pack-migration-evidence-v1',report]);
}
function current(report:PackMigrationEvidence,maxLifetimeMs?:number){
  const micros=(value:string)=>{
    const [whole,fraction='']=value.slice(0,-1).split('.');
    return BigInt(Date.parse(whole+'Z'))*1000n+BigInt(fraction.padEnd(6,'0'));
  };
  const start=micros(report.issuedAt),end=micros(report.expiresAt),now=BigInt(Date.now())*1000n;
  if(start>now||end<=now||maxLifetimeMs!==undefined&&end-start>BigInt(maxLifetimeMs)*1000n)throw new CoreError('PRECONDITION_FAILED');
}
/** Deployment chooses the key and evidence kind; Pack-supplied keys grant no trust.
 * A valid signature proves provenance, not the truth of supporting facts or execution authority.
 */
export async function verifyMigrationSignature(report:PackMigrationEvidence,bundle:Uint8Array,signer:MigrationEvidenceSigner,options:TransactionOptions):Promise<VerifiedMigrationSignature>{
  const value=contract('PackMigrationEvidence',JSON.parse(canonicalJson(report))),config=JSON.parse(canonicalJson(signer)) as MigrationEvidenceSigner;
  contract('UUID',config.organizationId);
  if(config.organizationId!==value.organizationId||config.kind!==value.kind)throw new CoreError('FORBIDDEN');
  if(!Number.isSafeInteger(config.maxLifetimeMs)||config.maxLifetimeMs<1)throw new CoreError('INVALID_ARGUMENT');
  current(value,config.maxLifetimeMs);
  if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const proof=new Uint8Array(bundle),limits={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  await verifyCosignBlob(new TextEncoder().encode(migrationSignaturePayload(value)),proof,config,limits);
  const evidence={report:value,bundle:proof,keyDigest:await digestBytes(new TextEncoder().encode(config.publicKeyPem)),bundleDigest:await digestBytes(proof),verifiedAt:new Date().toISOString()};
  if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  current(value,config.maxLifetimeMs);
  const candidate=Object.freeze({report:()=>structuredClone(value)});verified.set(candidate,evidence);return candidate;
}
export function matchMigrationSignature(candidate:VerifiedMigrationSignature,report:PackMigrationEvidence):MigrationSignatureProof{
  const proof=verified.get(candidate);
  if(!proof||canonicalJson(proof.report)!==canonicalJson(report))throw new CoreError('FORBIDDEN');
  current(proof.report);return structuredClone(proof);
}
