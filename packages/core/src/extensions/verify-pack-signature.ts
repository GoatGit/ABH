import type {PackSignerPolicy} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignBlob} from './cosign-blob.ts';

export type {PackSignerPolicy} from '@abh/contracts';

/** Signature evidence only. Actual payload, provenance, CTK and installation admission remain mandatory. */
export async function verifyPackSignature(manifest:unknown,bundle:Uint8Array,policy:PackSignerPolicy,options:TransactionOptions):Promise<{packId:string;version:string;packageDigest:string}>{
  if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const config={...policy},proof=Uint8Array.from(bundle),current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  const checked=validateContract('PackManifest',JSON.parse(canonicalJson(manifest)));
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const pack=checked.data;
  if(pack.metadata.id!==config.packId)throw new CoreError('FORBIDDEN');
  const computed=await digestPackManifest(pack);
  for(const field of ['manifestDigest','artifactSetDigest','packageDigest'] as const)
    if(computed[field]!==pack.integrity[field])throw new CoreError('PRECONDITION_FAILED');
  await verifyCosignBlob(new TextEncoder().encode(computed.signaturePayload),proof,config,current);
  return Object.freeze({packId:pack.metadata.id,version:pack.metadata.version,packageDigest:computed.packageDigest});
}
