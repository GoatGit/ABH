import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {extract} from 'tar-stream';
import {canonicalJson} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validateCurrentPack,type PackGovernanceSource,type GovernedLocalPack} from './validate-current-pack.ts';

/** Unpack a bounded tar/tar.gz into private staging, validate everything, then remove staging even on failure. */
export async function validatePackArchive(input:{bytes:Uint8Array;format:'tar'|'tar.gz';manifest:{ref:string;format:'json'|'yaml'};
  limits:{maxArchiveBytes:number;maxExpandedBytes:number;maxFileBytes:number;maxTotalBytes:number;maxEntries:number}},
  source:PackGovernanceSource,options:TransactionOptions):Promise<GovernedLocalPack>{
  const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)};
  const {limits,manifest}=JSON.parse(canonicalJson({limits:input.limits,manifest:input.manifest})) as Pick<typeof input,'limits'|'manifest'>;
  const format=input.format,read=source.current.bind(source);
  const validPath=(ref:string)=>validateContract('PackPath',ref).success&&ref.normalize('NFC')===ref&&!ref.includes('\uFFFD')&&ref.split('/').every(part=>!part.endsWith('.'));
  if(!validPath(manifest.ref)||dirname(manifest.ref)!=='.'||!['json','yaml'].includes(manifest.format)||!['tar','tar.gz'].includes(format))throw new CoreError('INVALID_ARGUMENT');
  if(Object.values(limits).some(value=>!Number.isSafeInteger(value)||value<1)||limits.maxArchiveBytes>104857600||limits.maxExpandedBytes>524288000||
    limits.maxTotalBytes>67108864||limits.maxFileBytes>limits.maxTotalBytes||limits.maxEntries>10000)throw new CoreError('INVALID_ARGUMENT');
  if(!(input.bytes instanceof Uint8Array)||input.bytes.length>limits.maxArchiveBytes)throw new CoreError('LIMIT_EXCEEDED');
  const archive=Buffer.from(input.bytes);
  const check=()=>{if(current.signal.aborted||!Number.isFinite(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
  check();const root=await mkdtemp(join(tmpdir(),'abh-pack-archive-'));
  const stop=new AbortController(),cancel=()=>stop.abort();current.signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,Math.max(1,current.deadline-Date.now()));if(current.signal.aborted)cancel();
  try{
    const parser=extract(),names=new Set<string>();let entries=0,total=0,expanded=0,foundManifest=false,nextOffset=0;
    let tail=Buffer.alloc(0);
    const chargeMetadata=(bytes:number)=>{
      if(!Number.isSafeInteger(bytes)||bytes<0||bytes%512!==0)throw new CoreError('INVALID_ARGUMENT');
      // tar-stream hides PAX/GNU headers. Charge every hidden block, including their bodies, conservatively.
      entries+=bytes/512;if(entries>limits.maxEntries)throw new CoreError('LIMIT_EXCEEDED');
    };
    const meter=new Transform({transform(chunk:Buffer,_encoding,done){expanded+=chunk.length;
      tail=chunk.length>=1024?Buffer.from(chunk.subarray(chunk.length-1024)):Buffer.concat([tail,chunk]).subarray(-1024);
      if(expanded>limits.maxExpandedBytes)done(new CoreError('LIMIT_EXCEEDED'));else done(null,chunk);}});
    const incoming=Readable.from((function*(){for(let offset=0;offset<archive.length;offset+=65536)yield archive.subarray(offset,offset+65536);})());
    const consume=(async()=>{
      for await(const entry of parser){
        check();const header=entry.header,ref=header.type==='directory'?header.name.replace(/\/$/,''):header.name;
        chargeMetadata(entry.offset-nextOffset);
        if(++entries>limits.maxEntries)throw new CoreError('LIMIT_EXCEEDED');
        if(!['file','directory'].includes(header.type??'')||!validPath(ref)||names.has(ref.toLowerCase())||header.linkname)throw new CoreError('INVALID_ARGUMENT');
        names.add(ref.toLowerCase());
        if(!Number.isSafeInteger(header.size)||header.size!<0)throw new CoreError('INVALID_ARGUMENT');
        nextOffset=entry.offset+512+Math.ceil(header.size/512)*512;
        if(header.type==='directory'){
          if(header.size!==0)throw new CoreError('INVALID_ARGUMENT');
          await mkdir(join(root,ref),{recursive:true,mode:0o700});entry.resume();continue;
        }
        const max=ref===manifest.ref?Math.min(1048576,limits.maxFileBytes):limits.maxFileBytes;
        if(header.size!>max||total+header.size!>limits.maxTotalBytes)throw new CoreError('LIMIT_EXCEEDED');
        const chunks:Buffer[]=[];let length=0;
        for await(const chunk of entry){check();if(!Buffer.isBuffer(chunk))throw new CoreError('INVALID_ARGUMENT');length+=chunk.length;if(length>max||length>header.size!)throw new CoreError('LIMIT_EXCEEDED');chunks.push(Buffer.from(chunk));}
        if(length!==header.size)throw new CoreError('PRECONDITION_FAILED');total+=length;
        await mkdir(dirname(join(root,ref)),{recursive:true,mode:0o700});
        await writeFile(join(root,ref),Buffer.concat(chunks),{flag:'wx',mode:0o600});
        if(ref===manifest.ref)foundManifest=true;
      }
    })().catch(error=>{parser.destroy(error as Error);throw error;});
    const transfer=format==='tar.gz'?pipeline(incoming,createGunzip(),meter,parser,{signal:stop.signal}):pipeline(incoming,meter,parser,{signal:stop.signal});
    const results=await Promise.allSettled([consume,transfer]);check();
    for(const result of results)if(result.status==='rejected')throw result.reason;
    if(tail.length!==1024||tail.some(byte=>byte!==0)||expanded-nextOffset<1024)throw new CoreError('INVALID_ARGUMENT');
    chargeMetadata(expanded-nextOffset-1024);
    if(!foundManifest)throw new CoreError('PRECONDITION_FAILED');
    const bytes=await readFile(join(root,manifest.ref));await rm(join(root,manifest.ref));
    // Manifest is a transport envelope; only declared payload/proof files remain for the strict scanner.
    return await validateCurrentPack({root:await realpath(root),limits,manifestDocument:{bytes,format:manifest.format}},{current:read},current);
  }catch(error){
    check();if(stop.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    if(error instanceof CoreError)throw error;throw new CoreError('INVALID_ARGUMENT');
  }finally{clearTimeout(timer);current.signal.removeEventListener('abort',cancel);stop.abort();await rm(root,{recursive:true,force:true});}
}
