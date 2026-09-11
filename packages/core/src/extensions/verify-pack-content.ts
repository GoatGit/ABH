import {validateContract} from '@abh/contracts/schema';
import {createHash} from 'node:crypto';
import {canonicalJson,digestPackManifest,type PackDigestEntry,type PackIntegrityDigests} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';

export interface PackContentSource {
  /** Archive scanning must first reject links and duplicates; only declared payload files belong here. */
  refs:readonly string[];
  open(ref:string,options:TransactionOptions):Promise<AsyncIterable<Uint8Array>>;
}

/** Verify all declared Artifact/Migration bytes without parsing or executing their content. Not signature/trust admission. */
export async function verifyPackContent(manifest:unknown,source:PackContentSource,options:TransactionOptions,
  limits:{maxFileBytes:number;maxTotalBytes:number;maxFiles:number}):Promise<PackIntegrityDigests>{
  options={...options};
  const readOptions={...options,deadline:Math.min(options.deadline,Date.now()+30000),readOnly:true};
  if(!Number.isFinite(readOptions.deadline)||readOptions.deadline<=Date.now()||options.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
  const snapshot=JSON.parse(canonicalJson(manifest)),refs=[...source.refs],open=source.open.bind(source),bounds={...limits};
  for(const value of [bounds.maxFiles,bounds.maxFileBytes,bounds.maxTotalBytes])if(!Number.isSafeInteger(value)||value<1)throw new CoreError('INVALID_ARGUMENT');
  if(bounds.maxFiles>10000||bounds.maxFileBytes>bounds.maxTotalBytes)throw new CoreError('INVALID_ARGUMENT');
  const checked=validateContract('PackManifest',snapshot);
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const computed=await digestPackManifest(checked.data);
  const entries:PackDigestEntry[]=[...checked.data.artifacts,...checked.data.migrations];
  const names=new Set(entries.map(entry=>entry.ref));
  if(entries.length>bounds.maxFiles||refs.length!==entries.length||new Set(refs).size!==refs.length||refs.some(ref=>!names.has(ref)))throw new CoreError('INVALID_ARGUMENT');
  let declared=0;
  for(const entry of entries){declared+=entry.sizeBytes;if(entry.sizeBytes>bounds.maxFileBytes||!Number.isSafeInteger(declared)||declared>bounds.maxTotalBytes)throw new CoreError('LIMIT_EXCEEDED');}
  const integrity=checked.data.integrity;
  if(!integrity||computed.manifestDigest!==integrity.manifestDigest||computed.artifactSetDigest!==integrity.artifactSetDigest||computed.packageDigest!==integrity.packageDigest)throw new CoreError('PRECONDITION_FAILED');
  // The complete read shares a single bounded deadline. Late callback outputs never resume verification.
  for(const entry of entries){
    const stop=new AbortController(),cancel=()=>stop.abort(options.signal.reason);
    options.signal.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>stop.abort(),Math.max(1,readOptions.deadline-Date.now()));
    if(options.signal.aborted)cancel();
    const streamOptions={...readOptions,signal:stop.signal};
    let iterator:AsyncIterator<Uint8Array>|undefined,ended=false,size=0,chunks=0;
    const hash=createHash('sha256');
    try{
      const stream=await boundedCallback(()=>open(entry.ref,streamOptions),streamOptions);
      iterator=stream[Symbol.asyncIterator]();
      while(true){
        const next=await boundedCallback(()=>iterator!.next(),streamOptions);
        if(next.done){ended=true;break;}
        if(!(next.value instanceof Uint8Array))throw new CoreError('INVALID_ARGUMENT');
        // Include empty chunks in the bound to reject streams that never advance.
        if(++chunks>100000)throw new CoreError('LIMIT_EXCEEDED');
        size+=next.value.byteLength;
        if(size>entry.sizeBytes||size>bounds.maxFileBytes)throw new CoreError('LIMIT_EXCEEDED');
        hash.update(next.value);
      }
      if(size!==entry.sizeBytes||`sha256:${hash.digest('hex')}`!==entry.digest)throw new CoreError('PRECONDITION_FAILED');
    }finally{
      clearTimeout(timer);options.signal.removeEventListener('abort',cancel);stop.abort();
      if(!ended&&iterator?.return){
        // Best effort cancellation must not hide the verification failure or hang the caller.
        try{void Promise.resolve(iterator.return()).catch(()=>{});}catch{}
      }
    }
  }
  if(options.signal.aborted||readOptions.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return computed;
}
