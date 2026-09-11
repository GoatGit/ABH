import {constants} from 'node:fs';
import {lstat,opendir,open,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {canonicalJson} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import type {PackContentSource} from './verify-pack-content.ts';

export interface LocalPackFiles {
  payload:PackContentSource;
  /** Return a private copy of an integrity proof; reading it does not verify its signature. */
  proof(ref:string):Uint8Array;
}

/** Scan an immutable, deployment-owned staging directory. Never use an attacker-writable tree as staging. */
export async function readLocalPackFiles(root:string,manifest:unknown,options:TransactionOptions,
  limits:{maxFileBytes:number;maxTotalBytes:number;maxEntries:number}):Promise<LocalPackFiles>{
  const checked=validateContract('PackManifest',JSON.parse(canonicalJson(manifest)));
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const bounds={...limits},signal=options.signal,deadline=Math.min(options.deadline,Date.now()+30000);
  for(const value of [bounds.maxFileBytes,bounds.maxTotalBytes,bounds.maxEntries])if(!Number.isSafeInteger(value)||value<1)throw new CoreError('INVALID_ARGUMENT');
  // Snapshot API intentionally caps memory; larger production archives need a streaming scanner.
  if(bounds.maxTotalBytes>67108864||bounds.maxFileBytes>bounds.maxTotalBytes||bounds.maxEntries>10000)throw new CoreError('INVALID_ARGUMENT');
  const assertLive=()=>{if(signal.aborted||!Number.isFinite(deadline)||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
  assertLive();
  const base=resolve(root),rootStat=await lstat(base);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||await realpath(base)!==base)throw new CoreError('INVALID_ARGUMENT');
  const pack=checked.data,payloadRefs=[...pack.artifacts,...pack.migrations].map(entry=>entry.ref);
  const proofRefs=[pack.integrity.signatureRef,pack.integrity.provenanceRef,pack.integrity.conformanceRef];
  const expected=new Set([...payloadRefs,...proofRefs]),directories=new Set<string>();
  for(const ref of expected){const parts=ref.split('/');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));}
  const files=new Map<string,Uint8Array>();let entries=0,total=0;
  const scan=async(relative:string):Promise<void>=>{
    assertLive();const folder=await opendir(relative?join(base,relative):base);
    for await(const item of folder){
      assertLive();if(++entries>bounds.maxEntries)throw new CoreError('LIMIT_EXCEEDED');
      const ref=relative?`${relative}/${item.name}`:item.name,path=join(base,ref),stat=await lstat(path);
      if(stat.isSymbolicLink())throw new CoreError('INVALID_ARGUMENT');
      if(stat.isDirectory()){
        if(!directories.has(ref)||ref.split('/').length>64)throw new CoreError('INVALID_ARGUMENT');
        if(await realpath(path)!==path)throw new CoreError('INVALID_ARGUMENT');
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
        while(position<bytes.length){assertLive();const read=await handle.read(bytes,position,Math.min(65536,bytes.length-position),position);if(!read.bytesRead)throw new CoreError('PRECONDITION_FAILED');position+=read.bytesRead;}
        const after=await handle.stat();
        if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||after.nlink!==1)throw new CoreError('PRECONDITION_FAILED');
        total+=bytes.length;files.set(ref,bytes);
      }finally{await handle.close();}
    }
  };
  await scan('');assertLive();
  if(files.size!==expected.size)throw new CoreError('PRECONDITION_FAILED');
  const payloadNames=new Set(payloadRefs),proofNames=new Set(proofRefs);
  return {payload:{refs:Object.freeze([...payloadRefs]),open:async(ref,current)=>{
    if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
    if(!payloadNames.has(ref))throw new CoreError('FORBIDDEN');
    const bytes=files.get(ref)!;
    return {async *[Symbol.asyncIterator](){for(let offset=0;offset<bytes.length;offset+=65536){
      if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
      yield bytes.slice(offset,offset+65536);
    }}};
  }},proof:ref=>{if(!proofNames.has(ref))throw new CoreError('FORBIDDEN');return files.get(ref)!.slice();}};
}
