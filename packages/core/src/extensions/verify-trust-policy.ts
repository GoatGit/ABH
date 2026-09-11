import type {Digest,SignedTrustPolicyDocument} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignBlob,type OfflineCosignKey} from './cosign-blob.ts';
import {assertPackGovernanceSnapshot,type PackGovernanceSnapshot} from './validate-current-pack.ts';

export type {SignedTrustPolicyDocument} from '@abh/contracts';
export interface TrustPolicySigner extends OfflineCosignKey {
  organizationId:string;
  packId:string;
  policyId:string;
  maxLifetimeMs:number;
}
export interface VerifiedTrustPolicy {
  document():SignedTrustPolicyDocument;
}
interface Evidence {document:SignedTrustPolicyDocument;payload:string;bundle:Uint8Array;keyDigest:Digest;verifiedAt:string}
const verified=new WeakMap<object,Evidence>();

/** Deployment publisher signs this domain-separated original JSON, never a bare digest. */
export function trustPolicySignaturePayload(document:SignedTrustPolicyDocument):string{
  return canonicalJson(['abh-pack-trust-v1',document]);
}

export async function verifyTrustPolicy(document:SignedTrustPolicyDocument,bundle:Uint8Array,signer:TrustPolicySigner,options:TransactionOptions):Promise<VerifiedTrustPolicy>{
  const config=JSON.parse(canonicalJson(signer)) as TrustPolicySigner,value=JSON.parse(canonicalJson(document)) as SignedTrustPolicyDocument;
  if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const proof=Uint8Array.from(bundle),current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  if(!validateContract('SignedTrustPolicyDocument',value).success)throw new CoreError('INVALID_ARGUMENT');
  assertPackGovernanceSnapshot(value.snapshot,config.packId);
  if(!validateContract('UUID',value.organizationId).success||!validateContract('UUID',config.policyId).success||
    !validateContract('Time',value.issuedAt).success||!validateContract('Time',value.expiresAt).success||
    !Number.isSafeInteger(config.maxLifetimeMs)||config.maxLifetimeMs<1)throw new CoreError('INVALID_ARGUMENT');
  if(value.organizationId!==config.organizationId||value.snapshot.policyRef.id!==config.policyId||
    value.snapshot.policyRef.type!=='abh.pack-trust-policy')throw new CoreError('FORBIDDEN');
  const start=Date.parse(value.issuedAt),end=Date.parse(value.expiresAt);
  const check=()=>{if(start>Date.now()||end<=Date.now()||end<=start||end-start>config.maxLifetimeMs)throw new CoreError('PRECONDITION_FAILED');};
  check();const payload=trustPolicySignaturePayload(value);
  await verifyCosignBlob(new TextEncoder().encode(payload),proof,config,current);
  const keyDigest=await digestBytes(new TextEncoder().encode(config.publicKeyPem));check();
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  const result=Object.freeze({document:()=>structuredClone(value)});
  verified.set(result,{document:value,payload,bundle:proof,keyDigest,verifiedAt:new Date().toISOString()});return result;
}

/** Internal evidence access; a matching object shape does not constitute verified policy issuance. */
export function verifiedTrustPolicyEvidence(candidate:VerifiedTrustPolicy):Evidence{
  const evidence=verified.get(candidate);if(!evidence)throw new CoreError('FORBIDDEN');return structuredClone(evidence);
}
