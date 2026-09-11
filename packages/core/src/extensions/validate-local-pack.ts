import type {ConformanceReport,PackValidationReport} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareLocalPack,type PreparedLocalPack} from './prepare-local-pack.ts';
import {verifyPackSignature,type PackSignerPolicy} from './verify-pack-signature.ts';
import {verifyPackProvenance,type PackProvenancePolicy} from './verify-pack-provenance.ts';
import {verifyPackConformance,type PackConformancePolicy} from './verify-pack-conformance.ts';

export interface ValidatedLocalPack extends PreparedLocalPack {
  conformance():ConformanceReport;
  validation():PackValidationReport;
}

/** Validate actual content and all three independently configured proofs from a single private snapshot.
 * Does not register capabilities, migrate data, persist installation state or grant execution authority.
 */
export async function validateLocalPack(input:Parameters<typeof prepareLocalPack>[0]&{
  trust:{signer:PackSignerPolicy;provenance:PackProvenancePolicy;conformance:PackConformancePolicy};
},options:TransactionOptions):Promise<ValidatedLocalPack>{
  const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)};
  const trust=JSON.parse(canonicalJson(input.trust)) as typeof input.trust;
  const policyBytes=new TextEncoder().encode(canonicalJson({deployment:input.policy,trust}));
  const prepared=await prepareLocalPack(input,current),manifest=prepared.manifest();
  const proof=prepared.files.proof;
  await verifyPackSignature(manifest,proof(manifest.integrity.signatureRef),trust.signer,current);
  await verifyPackProvenance(manifest,proof(manifest.integrity.provenanceRef),trust.provenance,current);
  const conformance=await verifyPackConformance(manifest,proof(manifest.integrity.conformanceRef),trust.conformance,current);
  const now=Date.now(),validUntil=Date.parse(conformance.finishedAt)+trust.conformance.maxAgeMs;
  if(!Number.isSafeInteger(validUntil)||validUntil<=now||validUntil>8640000000000000)throw new CoreError('PRECONDITION_FAILED');
  const validation:PackValidationReport={packId:manifest.metadata.id,packVersion:manifest.metadata.version,
    subjectDigest:manifest.integrity.packageDigest,manifestDigest:manifest.integrity.manifestDigest,artifactSetDigest:manifest.integrity.artifactSetDigest,
    deploymentPolicyDigest:await digestBytes(policyBytes),signatureBundleDigest:await digestBytes(proof(manifest.integrity.signatureRef)),
    provenanceBundleDigest:await digestBytes(proof(manifest.integrity.provenanceRef)),conformanceBundleDigest:await digestBytes(proof(manifest.integrity.conformanceRef)),
    conformanceReportDigest:conformance.reportDigest,validatedAt:new Date(now).toISOString(),validUntil:new Date(validUntil).toISOString(),
    profile:'LocalOfflinePublicKey',reportDigest:'sha256:'+'0'.repeat(64)};
  validation.reportDigest=await digestContract('PackValidationReport',validation);
  if(validUntil<=Date.now())throw new CoreError('PRECONDITION_FAILED');
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return Object.freeze({...prepared,conformance:()=>structuredClone(conformance),validation:()=>structuredClone(validation)});
}
