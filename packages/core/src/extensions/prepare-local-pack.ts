import type {PackManifest} from '@abh/contracts';
import type {PackIntegrityDigests} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {admitPackDeployment,type PackDeploymentPolicy} from './pack-policy.ts';
import {readLocalPackFiles,type LocalPackFiles} from './local-pack-source.ts';
import {verifyPackContent} from './verify-pack-content.ts';

export interface PreparedLocalPack {
  /** Every read returns an independent copy; this candidate has no execution or trust authority. */
  manifest():PackManifest;
  integrity():PackIntegrityDigests;
  files:LocalPackFiles;
}

/** Static policy → immutable file snapshot → actual digest checks. Does not verify signatures or enable the Pack. */
export async function prepareLocalPack(input:{root:string;manifest:unknown;policy:PackDeploymentPolicy;
  limits:{maxFileBytes:number;maxTotalBytes:number;maxEntries:number}},options:TransactionOptions):Promise<PreparedLocalPack>{
  const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)};
  if(!Number.isFinite(current.deadline)||current.deadline<=Date.now()||current.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
  // Policy and Manifest snapshot/admission happen synchronously before any filesystem operation.
  const manifest=admitPackDeployment(input.manifest,input.policy),root=input.root,limits={...input.limits};
  const files=await readLocalPackFiles(root,manifest,current,limits);
  const integrity=await verifyPackContent(manifest,files.payload,current,{maxFileBytes:limits.maxFileBytes,maxTotalBytes:limits.maxTotalBytes,maxFiles:limits.maxEntries});
  // Preserve source methods privately as well as bytes; caller changes cannot substitute later reads.
  const open=files.payload.open.bind(files.payload),proof=files.proof.bind(files);
  const immutableFiles=Object.freeze({payload:Object.freeze({refs:Object.freeze([...files.payload.refs]),open}),proof});
  return Object.freeze({manifest:()=>structuredClone(manifest),integrity:()=>structuredClone(integrity),files:immutableFiles});
}
