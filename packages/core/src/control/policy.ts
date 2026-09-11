import {Worker} from 'node:worker_threads';
import type {Digest,PolicyDecision} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

/** Reject private WASM memories: OPA must use only the host's 32 MiB bounded memory. */
function validateModule(bytes:Uint8Array):void{
  if(bytes.length<8)throw new CoreError('POLICY_DENIED');
  let offset=8;
  const uint=()=>{let value=0;for(let i=0;i<5;i++){const byte=bytes[offset++];if(byte===undefined||(i===4&&byte>15))throw new CoreError('POLICY_DENIED');value+=(byte&127)*2**(7*i);if(byte<128)return value;}throw new CoreError('POLICY_DENIED');};
  while(offset<bytes.length){
    const section=bytes[offset++],size=uint(),end=offset+size;
    if(end>bytes.length)throw new CoreError('POLICY_DENIED');
    if(section===5&&uint()!==0)throw new CoreError('POLICY_DENIED');
    offset=end;
  }
}

/** Loaded from a verified immutable policy Artifact before the authorization UoW; evaluate runs against frozen local inputs. */
export class WasmPolicy {
  readonly digest:Digest;
  #worker:Worker;
  #closed=false;
  #sequence=0;
  #pending:{id:number;resolve:(value:unknown)=>void;reject:(error:CoreError)=>void}|undefined;
  #timeLimit:number;
  private constructor(worker:Worker,digest:Digest,timeLimit:number){
    this.#worker=worker;this.digest=digest;this.#timeLimit=timeLimit;
    worker.on('message',message=>{
      const pending=this.#pending;
      if(pending&&(message.ready&&pending.id===0||message.id===pending.id||message.error&&pending.id===0)){
        if(message.error)pending.reject(new CoreError('POLICY_DENIED'));else pending.resolve(message.ready?true:message.result);
      }
    });
    worker.on('error',()=>this.#fail());worker.on('exit',()=>this.#fail());
  }
  #fail():void{this.#closed=true;this.#pending?.reject(new CoreError('POLICY_DENIED'));}
  static async load(bytes:Uint8Array,expectedDigest:Digest,entrypoint:string,options:{timeLimitMs?:number;signal?:AbortSignal}={}):Promise<WasmPolicy>{
    contract('Digest',expectedDigest);
    const timeLimit=options.timeLimitMs??20;
    if(!Number.isInteger(timeLimit)||timeLimit<1||timeLimit>20||!/^[a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*$/.test(entrypoint)||entrypoint.length>200||bytes.byteLength>4_194_304)throw new CoreError('INVALID_ARGUMENT');
    if(options.signal?.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    const copy=new Uint8Array(bytes);if(await digestBytes(copy)!==expectedDigest)throw new CoreError('POLICY_DENIED');validateModule(copy);
    const worker=new Worker(new URL(import.meta.url.endsWith('.ts')?'./policy-worker.ts':'./policy-worker.js',import.meta.url),{
      workerData:{bytes:copy,entrypoint},resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:2},stdout:true,stderr:true,
    });
    worker.stdout.resume();worker.stderr.resume();
    const runtime=new WasmPolicy(worker,expectedDigest,timeLimit);
    try{await runtime.#wait(0,2000,options.signal,()=>{});return runtime;}
    catch(error){await runtime.close();throw error;}
  }
  async #wait(id:number,timeout:number,signal:AbortSignal|undefined,start:()=>void):Promise<unknown>{
    if(this.#closed)throw new CoreError('POLICY_DENIED');
    if(this.#pending)throw new CoreError('DEPENDENCY_UNAVAILABLE');
    let timer:ReturnType<typeof setTimeout>|undefined,onAbort=()=>{};
    try{
      return await new Promise((resolve,reject)=>{
        const stop=()=>{this.#closed=true;reject(new CoreError('DEPENDENCY_TIMEOUT'));void this.#worker.terminate();};
        this.#pending={id,resolve,reject};timer=setTimeout(stop,timeout);onAbort=stop;signal?.addEventListener('abort',onAbort,{once:true});
        if(signal?.aborted)stop();else start();
      });
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);this.#pending=undefined;}
  }
  async evaluate(input:unknown,signal:AbortSignal):Promise<PolicyDecision>{
    const encoded=canonicalJson(input);if(new TextEncoder().encode(encoded).length>65_536)throw new CoreError('LIMIT_EXCEEDED');
    const id=++this.#sequence;
    const output=await this.#wait(id,this.#timeLimit,signal,()=>this.#worker.postMessage({id,input:JSON.parse(encoded)}));
    // Undefined, multiple answers, malformed data and extra fields are never truthy authorization.
    if(!Array.isArray(output)||output.length!==1||!output[0]||typeof output[0]!=='object'||Object.keys(output[0]).length!==1||!Object.hasOwn(output[0],'result'))throw new CoreError('POLICY_DENIED');
    try{return contract('PolicyDecision',output[0].result);}catch{throw new CoreError('POLICY_DENIED');}
  }
  async close():Promise<void>{this.#closed=true;this.#pending?.reject(new CoreError('DEPENDENCY_UNAVAILABLE'));await this.#worker.terminate();}
}

/** Both policy families are mandatory; an explicit empty Behavior policy still produces a real result. */
export function intersectPolicies(evaluations:readonly {kind:'Mandatory'|'Behavior';decision:PolicyDecision}[]):PolicyDecision{
  if(!evaluations.some(e=>e.kind==='Mandatory')||!evaluations.some(e=>e.kind==='Behavior'))throw new CoreError('POLICY_DENIED');
  const obligations=new Map<string,PolicyDecision['obligationRefs'][number]>(),reasons=new Set<string>();
  let allow=true;
  for(const evaluation of evaluations){
    const decision=contract('PolicyDecision',evaluation.decision);allow&&=decision.allow;
    for(const ref of decision.obligationRefs){
      const key=`${ref.type}/${ref.id}`,previous=obligations.get(key);
      if(previous&&previous.version!==ref.version)throw new CoreError('OBLIGATION_CONFLICT');obligations.set(key,ref);
    }
    for(const reason of decision.reasonCodes)reasons.add(reason);
  }
  return {allow,obligationRefs:[...obligations].sort(([a],[b])=>a<b?-1:1).map(([,ref])=>ref),reasonCodes:[...reasons].sort()};
}
