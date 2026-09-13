import type {EntityRef,PackCapabilityBinding,PackCapabilityRegistration,PackManifest} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {verifyPackContent,type PackContentSource} from './verify-pack-content.ts';

export interface PackCapabilityBindingChecks {
 /** Trusted build-time schema compiler checks these exact verified bytes; never execute Pack tests/code here. */
 schema(binding:PackCapabilityBinding,bytes:Uint8Array,options:TransactionOptions):Promise<void>;
 /** Resolve the fixed implementation and health references from current deployment installation,
  * verify compatibility, identity, declared trust mode and isolation. No dynamic download or import. */
 implementation(binding:PackCapabilityBinding,manifest:PackManifest,options:TransactionOptions):Promise<void>;
}
/** Verify a complete explicit build-time capability map against actual package bytes.
 * Manifest paths are never guessed from capability names. Returns registration data only;
 * the lifecycle Owner must revalidate deployment admission and persist atomically with Enable. */
export async function preparePackCapabilities(manifest:PackManifest,packRef:EntityRef,bindings:readonly PackCapabilityBinding[],source:PackContentSource,
 options:TransactionOptions,checks:PackCapabilityBindingChecks):Promise<PackCapabilityRegistration[]>{
 const pack=contract('PackManifest',structuredClone(manifest)),reference=contract('EntityRef',structuredClone(packRef));
 if(reference.type!=='abh.installed-pack'||!Array.isArray(bindings)||bindings.length>1000)throw new CoreError('INVALID_ARGUMENT');
 const input=bindings.map(value=>contract('PackCapabilityBinding',structuredClone(value))),refs=[...source.refs],open=source.open.bind(source),schema=checks.schema.bind(checks),implementation=checks.implementation.bind(checks);
 const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)},active=()=>{if(current.signal.aborted||!Number.isSafeInteger(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 const key=(value:PackCapabilityBinding['capability'])=>canonicalJson(value),provided=new Set(pack.capabilities.provides.map(key)),seen=new Set<string>();
 if(input.length!==provided.size)throw new CoreError('PRECONDITION_FAILED');
 const paths=new Set<string>();
 for(const binding of input){
  const identity=key(binding.capability);
  if(!provided.has(identity)||seen.has(identity))throw new CoreError('PRECONDITION_FAILED');seen.add(identity);
  if(!pack.artifacts.some(entry=>entry.ref===binding.schemaPath))throw new CoreError('PRECONDITION_FAILED');paths.add(binding.schemaPath);
  for(const field of Object.keys(pack.permissions) as (keyof PackManifest['permissions'])[])if(binding.permissionEnvelope[field].some(item=>!pack.permissions[field].includes(item)))throw new CoreError('FORBIDDEN');
  if(binding.safetyStop===true&&!binding.permissionEnvelope.purposes.includes('abh.action.safety-stop'))throw new CoreError('FORBIDDEN');
}
 const chunks=new Map<string,Uint8Array[]>(),sizes=new Map<string,number>();
 const verifiedSource:PackContentSource={refs,open:async(path,work)=>{
  const stream=await open(path,work);
  return {async *[Symbol.asyncIterator](){
   for await(const bytes of stream){
    if(!(bytes instanceof Uint8Array))throw new CoreError('INVALID_ARGUMENT');
    if(paths.has(path)){
     const size=(sizes.get(path)??0)+bytes.byteLength;if(size>2097152)throw new CoreError('LIMIT_EXCEEDED');sizes.set(path,size);
     const copy=Uint8Array.from(bytes);const list=chunks.get(path)??[];list.push(copy);chunks.set(path,list);yield copy;
    }else yield bytes;
   }
  }};
 }};
 await verifyPackContent(pack,verifiedSource,current,{maxFileBytes:67108864,maxTotalBytes:67108864,maxFiles:10000});active();
 const schemas=new Map<string,Uint8Array>();
 for(const path of paths){const bytes=new Uint8Array(sizes.get(path)??0);let offset=0;for(const chunk of chunks.get(path)??[]){bytes.set(chunk,offset);offset+=chunk.byteLength;}schemas.set(path,bytes);}
 const result:PackCapabilityRegistration[]=[];
 for(const binding of [...input].sort((a,b)=>key(a.capability)<key(b.capability)?-1:1)){
  await boundedCallback(work=>schema(structuredClone(binding),Uint8Array.from(schemas.get(binding.schemaPath)!),work),current);active();
  await boundedCallback(work=>implementation(structuredClone(binding),structuredClone(pack),work),current);active();
  const record=contract('PackCapabilityRegistration',{...binding,safetyStop:binding.safetyStop===true,packRef:reference,subjectDigest:pack.integrity.packageDigest,schemaDigest:pack.artifacts.find(entry=>entry.ref===binding.schemaPath)!.digest,registrationDigest:'sha256:'+'0'.repeat(64)});
  result.push({...record,registrationDigest:await digestContract('PackCapabilityRegistration',record)});active();
 }
 return result;
}
