import type {CapabilityRef,Digest,PackDataImpactRecord} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignBlob,type OfflineCosignKey} from './cosign-blob.ts';

export interface ImpactCompilerSigner extends OfflineCosignKey {
  organizationId:string;
  compilerRef:CapabilityRef;
  maxLifetimeMs:number;
}
export interface VerifiedImpactSignature {report():PackDataImpactRecord}
export interface ImpactSignatureEvidence {
  organizationId:string;report:PackDataImpactRecord;bundle:Uint8Array;keyDigest:Digest;bundleDigest:Digest;verifiedAt:string;
}
const verified=new WeakMap<object,ImpactSignatureEvidence>();
/** Internal domain-separated signature profile. The exact complete report binds source refs, contents and environment. */
export function impactSignaturePayload(organizationId:string,report:PackDataImpactRecord):string{
  contract('UUID',organizationId);contract('PackDataImpactRecord',report);
  return canonicalJson(['abh-pack-data-impact-v1',organizationId,report]);
}
/** Fixed compiler public key comes from deployment trust, never from the report or Pack. No authorization is granted by a signature. */
export async function verifyImpactSignature(organizationId:string,report:PackDataImpactRecord,bundle:Uint8Array,
  signer:ImpactCompilerSigner,options:TransactionOptions):Promise<VerifiedImpactSignature>{
  const value=contract('PackDataImpactRecord',JSON.parse(canonicalJson(report))),config=JSON.parse(canonicalJson(signer)) as ImpactCompilerSigner;
  contract('UUID',organizationId);contract('UUID',config.organizationId);contract('CapabilityRef',config.compilerRef);
  if(config.compilerRef.kind!=='Compiler'||organizationId!==config.organizationId||canonicalJson(config.compilerRef)!==canonicalJson(value.compilerRef))throw new CoreError('FORBIDDEN');
  if(!Number.isSafeInteger(config.maxLifetimeMs)||config.maxLifetimeMs<1)throw new CoreError('INVALID_ARGUMENT');
  const checkTime=()=>{
    const start=Date.parse(value.issuedAt),end=Date.parse(value.expiresAt),now=Date.now();
    if(start>now||end<=now||end-start>config.maxLifetimeMs)throw new CoreError('PRECONDITION_FAILED');
  };
  checkTime();
  if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const proof=Uint8Array.from(bundle),current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  await verifyCosignBlob(new TextEncoder().encode(impactSignaturePayload(organizationId,value)),proof,config,current);
  const evidence={organizationId,report:value,bundle:proof,keyDigest:await digestBytes(new TextEncoder().encode(config.publicKeyPem)),bundleDigest:await digestBytes(proof),verifiedAt:new Date().toISOString()};
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  checkTime();
  const candidate=Object.freeze({report:()=>structuredClone(value)});verified.set(candidate,evidence);return candidate;
}
/** Use inside current admission, then independently check signer revocation, source authority and current deployment. */
export function matchImpactSignature(candidate:VerifiedImpactSignature,organizationId:string,report:PackDataImpactRecord):ImpactSignatureEvidence{
  const evidence=verified.get(candidate);
  if(!evidence||evidence.organizationId!==organizationId||canonicalJson(evidence.report)!==canonicalJson(report))throw new CoreError('FORBIDDEN');
  if(Date.parse(evidence.report.issuedAt)>Date.now()||Date.parse(evidence.report.expiresAt)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
  return structuredClone(evidence);
}
