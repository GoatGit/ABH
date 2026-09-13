import {createHash} from 'node:crypto';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {signCosignBlob,verifyCosignBlob} from './cosign-blob.ts';

export interface PackSignatureDiagnostic {
  packId:string;
  packVersion:string;
  packageDigest:string;
  bundleDigest:string;
  bundleBytes:number;
}

/** Create signature evidence for an already locally verified manifest. Does not prove provenance, CTK or admission. */
export async function signPackManifest(manifest:unknown,key:{executable:string;privateKeyPem:string;publicKeyPem:string;password?:string;
  expectedPackId:string},options:TransactionOptions):Promise<{bundle:Uint8Array;diagnostic:PackSignatureDiagnostic}>{
  const checked=validateContract('PackManifest',JSON.parse(canonicalJson(manifest)));
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const pack=checked.data;
  if(pack.metadata.id!==key.expectedPackId)throw new CoreError('FORBIDDEN');
  const computed=await digestPackManifest(pack);
  for(const field of ['manifestDigest','artifactSetDigest','packageDigest'] as const)
    if(computed[field]!==pack.integrity[field])throw new CoreError('PRECONDITION_FAILED');
  const bundle=await signCosignBlob(new TextEncoder().encode(computed.signaturePayload),key,options);
  if(bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bundle));}catch{throw new CoreError('PRECONDITION_FAILED');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||(parsed as Record<string,unknown>).mediaType!==
    'application/vnd.dev.sigstore.bundle.v0.3+json')throw new CoreError('PRECONDITION_FAILED');
  await verifyCosignBlob(new TextEncoder().encode(computed.signaturePayload),bundle,
    {executable:key.executable,mode:'OfflinePublicKey',publicKeyPem:key.publicKeyPem},options);
  const diagnostic={packId:pack.metadata.id,packVersion:pack.metadata.version,packageDigest:computed.packageDigest,
    bundleDigest:`sha256:${createHash('sha256').update(bundle).digest('hex')}`,bundleBytes:bundle.byteLength};
  return Object.freeze({bundle:Object.freeze(bundle),diagnostic:Object.freeze(diagnostic)});
}
