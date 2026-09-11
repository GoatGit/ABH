import type {PackCapabilityRegistration,PackManifest} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract,digestPackManifest} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import type {PackContentSource} from './verify-pack-content.ts';

/** Read only the exact registered Schema after the caller admits current Enabled
 * installation, trust and assignment. Never interprets Schema or loads Pack code.
 * Returns private bytes; this helper alone proves no execution authority. */
export async function readCapabilitySchema(manifest:PackManifest,input:PackCapabilityRegistration,source:PackContentSource,options:TransactionOptions):Promise<Uint8Array>{
 const pack=contract('PackManifest',structuredClone(manifest)),entry=contract('PackCapabilityRegistration',structuredClone(input));
 const refs=[...source.refs],open=source.open.bind(source),limits={...options};
 const computed=await digestPackManifest(pack);
 if(computed.packageDigest!==pack.integrity.packageDigest||computed.manifestDigest!==pack.integrity.manifestDigest||computed.artifactSetDigest!==pack.integrity.artifactSetDigest||
  await digestContract('PackCapabilityRegistration',entry)!==entry.registrationDigest||entry.subjectDigest!==computed.packageDigest||
  !pack.capabilities.provides.some(value=>canonicalJson(value)===canonicalJson(entry.capability)))throw new CoreError('PRECONDITION_FAILED');
 const artifact=pack.artifacts.find(value=>value.ref===entry.schemaPath);
 if(!artifact||artifact.digest!==entry.schemaDigest||refs.filter(value=>value===entry.schemaPath).length!==1)throw new CoreError('PRECONDITION_FAILED');
 if(artifact.sizeBytes>2097152)throw new CoreError('LIMIT_EXCEEDED');
 for(const field of Object.keys(pack.permissions) as (keyof typeof pack.permissions)[])if(entry.permissionEnvelope[field].some(value=>!pack.permissions[field].includes(value)))throw new CoreError('FORBIDDEN');
 return boundedCallback(async work=>{
  const stream=await open(entry.schemaPath,work),iterator=stream[Symbol.asyncIterator]();
  const bytes=new Uint8Array(artifact.sizeBytes);let offset=0,chunks=0,finished=false;
  let cleanupStarted=false;
  const cleanup=()=>{if(cleanupStarted||finished)return;cleanupStarted=true;try{void Promise.resolve(iterator.return?.()).catch(()=>{});}catch{/* best effort */}};
  work.signal.addEventListener('abort',cleanup,{once:true});
  try{
   while(true){
    if(work.signal.aborted||Date.now()>=work.deadline)throw new CoreError('DEPENDENCY_TIMEOUT');
    const next=await iterator.next();
    if(next.done){finished=true;break;}
    if(++chunks>100000)throw new CoreError('LIMIT_EXCEEDED');
    if(!(next.value instanceof Uint8Array))throw new CoreError('INVALID_ARGUMENT');
    if(typeof SharedArrayBuffer!=='undefined'&&next.value.buffer instanceof SharedArrayBuffer)throw new CoreError('INVALID_ARGUMENT');
    if(offset+next.value.byteLength>bytes.byteLength)throw new CoreError('PRECONDITION_FAILED');
    // Copy before advancing a generator that may reuse or mutate its buffer.
    bytes.set(next.value,offset);offset+=next.value.byteLength;
   }
   if(offset!==artifact.sizeBytes||await digestBytes(bytes)!==entry.schemaDigest)throw new CoreError('PRECONDITION_FAILED');
   return bytes;
  }finally{
   work.signal.removeEventListener('abort',cleanup);cleanup();
  }
 },limits);
}
