import {Worker} from 'node:worker_threads';
import type {PackManifest} from '@abh/contracts';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';

/** Parse one bounded UTF-8 JSON/YAML document; no aliases, duplicate/non-string keys, tags or unsafe numbers. */
export async function parsePackManifest(bytes:Uint8Array,format:'json'|'yaml',options:TransactionOptions):Promise<PackManifest>{
  const current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>1048576)throw new CoreError('LIMIT_EXCEEDED');
  if(!['json','yaml'].includes(format))throw new CoreError('INVALID_ARGUMENT');
  const check=()=>{if(!Number.isFinite(current.deadline)||current.deadline<=Date.now()||current.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');};
  check();
  const worker=new Worker(new URL(`./pack-manifest-worker.${import.meta.url.endsWith('.ts')?'ts':'js'}`,import.meta.url),{
    workerData:{bytes:Uint8Array.from(bytes),format},resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:2},
  });
  let timer:ReturnType<typeof setTimeout>|undefined,cancel=()=>{};
  try{
    const result=await new Promise<PackManifest>((resolve,reject)=>{
      cancel=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));
      current.signal.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(cancel,Math.max(1,current.deadline-Date.now()));
      worker.once('message',(message:{ok:boolean;manifest?:PackManifest})=>{
        if(message.ok&&message.manifest)resolve(message.manifest);else reject(new CoreError('INVALID_ARGUMENT'));
      });
      worker.once('error',()=>reject(new CoreError('INVALID_ARGUMENT')));
      worker.once('exit',()=>reject(new CoreError('INVALID_ARGUMENT')));
      if(current.signal.aborted)cancel();
    });
    check();return result;
  }finally{
    if(timer)clearTimeout(timer);current.signal.removeEventListener('abort',cancel);
    await worker.terminate();
  }
}
