import type {PackManifest,PackSchemaOwnership,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackMigrationPlan} from './pack-migration-plan.ts';
import {verifyPackContent,type PackContentSource} from './verify-pack-content.ts';

export interface PackMigrationContent {step:PackMigrationStep;sql:string}
/** Capture and hash the same bytes, then decode strict UTF-8. No second source read,
 * SQL parser, execution, signature admission or migration evidence verification.
 * The runner must obtain current persisted ownership and governed staging separately.
 */
export async function readPackMigrationContent(manifest:PackManifest,ownership:readonly PackSchemaOwnership[],steps:readonly PackMigrationStep[],source:PackContentSource,options:TransactionOptions):Promise<PackMigrationContent[]>{
  const pack=JSON.parse(canonicalJson(manifest)) as PackManifest;
  const pending=validatePackMigrationPlan(pack,ownership,steps);
  const refs=[...source.refs],open=source.open.bind(source),readOptions={...options};
  const plan=await pending;
  const migrations=new Map(pack.migrations.map(entry=>[entry.ref,entry]));
  for(const entry of migrations.values()){
    if(!['application/sql','text/sql'].includes(entry.mediaType))throw new CoreError('INVALID_ARGUMENT');
    if(entry.sizeBytes>8388608)throw new CoreError('LIMIT_EXCEEDED');
  }
  const captured=new Map<string,Uint8Array[]>();
  const snapshot:PackContentSource={refs,async open(ref,current){
    const stream=await open(ref,current),entry=migrations.get(ref);
    if(!entry)return stream;
    const chunks:Uint8Array[]=[];captured.set(ref,chunks);let size=0;
    return {async *[Symbol.asyncIterator](){
      for await(const chunk of stream){
        if(!(chunk instanceof Uint8Array))throw new CoreError('INVALID_ARGUMENT');
        size+=chunk.byteLength;
        if(size>entry.sizeBytes)throw new CoreError('LIMIT_EXCEEDED');
        // Buffer.slice aliases its storage; typed-array subclasses may also override
        // slice. The intrinsic constructor copies into an ordinary private Uint8Array.
        const copy=new Uint8Array(chunk);chunks.push(copy);yield copy;
      }
    }};
  }};
  await verifyPackContent(pack,snapshot,readOptions,{maxFileBytes:67108864,maxTotalBytes:67108864,maxFiles:10000});
  const result=plan.map(step=>{
    const entry=migrations.get(step.ref)!,bytes=new Uint8Array(entry.sizeBytes);let offset=0;
    for(const chunk of captured.get(step.ref)??[]){bytes.set(chunk,offset);offset+=chunk.length;}
    if(offset!==entry.sizeBytes)throw new CoreError('PRECONDITION_FAILED');
    let sql:string;
    try{sql=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new CoreError('INVALID_ARGUMENT');}
    // PostgreSQL text parameters cannot represent NUL, even in quoted SQL literals.
    if(sql.includes('\0'))throw new CoreError('INVALID_ARGUMENT');
    return {step,sql};
  });
  if(readOptions.signal.aborted||readOptions.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return result;
}
