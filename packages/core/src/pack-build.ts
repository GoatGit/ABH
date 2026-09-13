import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,opendir,open,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {canonicalJson,digestPackManifest,type PackDigestEntry,type PackIntegrityDigests} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {PackManifest} from '@abh/contracts';
import type {TransactionOptions} from './data/uow.ts';
import {CoreError} from './internal/errors.ts';

export interface PackBuildDiagnostic {
  packId:string;
  packVersion:string;
  kind:string;
  trustMode:string;
  license:string;
  artifactCount:number;
  migrationCount:number;
  integrity:PackIntegrityDigests;
}

/** Build an unsigned, local development manifest. Proof files are named but never created or trusted. */
export async function buildPackManifest(input:{root:string;draft:unknown},
  options:TransactionOptions):Promise<{manifest:PackManifest;diagnostic:PackBuildDiagnostic}>{
  const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)};
  if(!Number.isFinite(current.deadline)||current.deadline<=Date.now()||current.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
  const draft=JSON.parse(canonicalJson(input.draft)) as Record<string,unknown>;
  if(!draft||typeof draft!=='object'||Array.isArray(draft)||'integrity' in draft)throw new CoreError('INVALID_ARGUMENT');
  const bounds={maxFileBytes:4_194_304,maxTotalBytes:67_108_864,maxEntries:10_000};
  const proof={signatureFormat:'application/vnd.dev.sigstore.bundle.v0.3+json' as const,
    signatureRef:'signatures/pack.sigstore.json',provenanceRef:'provenance/pack.intoto.jsonl',
    conformanceRef:'conformance/pack.ctk.json'};
  const dummy='sha256:'+'0'.repeat(64);
  const declared:{artifacts:PackDigestEntry[];migrations:PackDigestEntry[]}={artifacts:[],migrations:[]};
  for(const field of ['artifacts','migrations'] as const){
    const source=draft[field];
    if(!Array.isArray(source)||source.length>bounds.maxEntries)throw new CoreError('INVALID_ARGUMENT');
    for(const item of source){
      if(!item||typeof item!=='object'||Array.isArray(item))throw new CoreError('INVALID_ARGUMENT');
      const record=item as Record<string,unknown>;
      if(Object.keys(record).sort().join(',')!=='mediaType,ref'||typeof record.ref!=='string'||typeof record.mediaType!=='string')
        throw new CoreError('INVALID_ARGUMENT');
      declared[field].push({ref:record.ref,digest:dummy,mediaType:record.mediaType,sizeBytes:0});
    }
  }
  const candidate={...draft,artifacts:declared.artifacts,migrations:declared.migrations,
    integrity:{...proof,manifestDigest:dummy,artifactSetDigest:dummy,packageDigest:dummy}} as unknown;
  const checked=validateContract('PackManifest',candidate);
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const manifest=checked.data,base=resolve(input.root);
  const rootStat=await lstat(base);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||await realpath(base)!==base)throw new CoreError('INVALID_ARGUMENT');
  const expected=new Set([...manifest.artifacts,...manifest.migrations].map(entry=>entry.ref));
  if(expected.size!==manifest.artifacts.length+manifest.migrations.length)throw new CoreError('INVALID_ARGUMENT');
  const directories=new Set<string>();
  for(const ref of expected){const parts=ref.split('/');for(let index=1;index<parts.length;index++)directories.add(parts.slice(0,index).join('/'));}
  const files=new Map<string,Uint8Array>();let entries=0,total=0;
  const assertLive=()=>{if(current.signal.aborted||!Number.isFinite(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
  const scan=async(relative:string):Promise<void>=>{
    assertLive();const folder=await opendir(relative?join(base,relative):base);
    for await(const item of folder){
      assertLive();if(++entries>bounds.maxEntries)throw new CoreError('LIMIT_EXCEEDED');
      const ref=relative?`${relative}/${item.name}`:item.name,path=join(base,ref),stat=await lstat(path);
      if(stat.isSymbolicLink())throw new CoreError('INVALID_ARGUMENT');
      if(stat.isDirectory()){
        if(!directories.has(ref)||ref.split('/').length>64||await realpath(path)!==path)throw new CoreError('INVALID_ARGUMENT');
        await scan(ref);continue;
      }
      if(!stat.isFile()||stat.nlink!==1||!expected.has(ref)||files.has(ref))throw new CoreError('INVALID_ARGUMENT');
      if(stat.size>bounds.maxFileBytes||total+stat.size>bounds.maxTotalBytes)throw new CoreError('LIMIT_EXCEEDED');
      const canonical=await realpath(path);
      if(canonical!==path||!canonical.startsWith(base+sep))throw new CoreError('INVALID_ARGUMENT');
      const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      try{
        const opened=await handle.stat();
        if(!opened.isFile()||opened.nlink!==1||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)throw new CoreError('PRECONDITION_FAILED');
        const bytes=new Uint8Array(stat.size);let position=0;
        while(position<bytes.length){assertLive();const read=await handle.read(bytes,position,Math.min(65536,bytes.length-position),position);
          if(read.bytesRead===0)throw new CoreError('PRECONDITION_FAILED');position+=read.bytesRead;}
        const after=await handle.stat();
        if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||after.nlink!==1)throw new CoreError('PRECONDITION_FAILED');
        total+=bytes.length;files.set(ref,bytes);
      }finally{await handle.close();}
    }
  };
  await scan('');assertLive();
  if(files.size!==expected.size)throw new CoreError('PRECONDITION_FAILED');
  for(const field of ['artifacts','migrations'] as const)for(const entry of manifest[field]){
    const bytes=files.get(entry.ref)!;entry.sizeBytes=bytes.length;
    entry.digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
  const digests=await digestPackManifest(manifest),{signaturePayload:_,...manifestDigests}=digests;
  const output={...manifest,integrity:{...manifestDigests,...proof}};
  const outputCheck=validateContract('PackManifest',output);
  if(!outputCheck.success||await digestPackManifest(outputCheck.data).then(value=>value.packageDigest)!==output.integrity.packageDigest)
    throw new CoreError('PRECONDITION_FAILED');
  const encoded=new TextEncoder().encode(canonicalJson(output)+'\n'),diagnostic={packId:output.metadata.id,packVersion:output.metadata.version,
    kind:output.kind,trustMode:output.trust.mode,license:output.metadata.license,artifactCount:output.artifacts.length,
    migrationCount:output.migrations.length,integrity:{manifestDigest:digests.manifestDigest,
      artifactSetDigest:digests.artifactSetDigest,packageDigest:digests.packageDigest,signaturePayload:digests.signaturePayload}};
  return Object.freeze({manifest:structuredClone(output),diagnostic:Object.freeze({...diagnostic,outputBytes:encoded.length})});
}
