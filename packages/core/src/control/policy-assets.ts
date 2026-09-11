import type {CompiledPolicyManifest,Digest,PolicyDecision,PolicyVersionRecord} from '@abh/contracts';
import {digestBytes} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {WasmPolicy} from './policy.ts';

/** Deployment-installed compiled assets. Installation verifies bytes but grants no publish/activation rights. */
export class InstalledPolicyAssets {
  #assets=new Map<string,{manifest:CompiledPolicyManifest;runtimes:Map<string,WasmPolicy>}>();
  async install(manifestBytes:Uint8Array,wasmBytes:Uint8Array,signal:AbortSignal):Promise<Digest>{
    if(signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    if(manifestBytes.length>65_536)throw new CoreError('LIMIT_EXCEEDED');
    let input:unknown;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));}catch{throw new CoreError('INVALID_ARGUMENT');}
    const manifest=contract('CompiledPolicyManifest',input),digest=await digestBytes(manifestBytes);
    const bytes=new Uint8Array(wasmBytes);if(await digestBytes(bytes)!==manifest.wasmDigest)throw new CoreError('POLICY_DENIED');
    if(this.#assets.has(digest))return digest;
    const runtimes=new Map<string,WasmPolicy>();
    try{
      for(const entrypoint of manifest.entrypoints)runtimes.set(entrypoint,await WasmPolicy.load(bytes,manifest.wasmDigest,entrypoint,{signal}));
      // Concurrent preparation may finish together. Keep one complete installed set and close the unused workers.
      if(this.#assets.has(digest)){for(const runtime of runtimes.values())await runtime.close();}
      else this.#assets.set(digest,{manifest,runtimes});
      return digest;
    }catch(error){await Promise.all([...runtimes.values()].map(runtime=>runtime.close()));throw error;}
  }
  assertInstalled(policy:PolicyVersionRecord):void{
    const asset=this.#assets.get(policy.manifestDigest);
    if(!asset||asset.manifest.wasmDigest!==policy.wasmDigest||!asset.runtimes.has(policy.entrypoint))throw new CoreError('POLICY_DENIED');
  }
  async evaluate(policy:PolicyVersionRecord,input:unknown,signal:AbortSignal):Promise<PolicyDecision>{
    this.assertInstalled(policy);return this.#assets.get(policy.manifestDigest)!.runtimes.get(policy.entrypoint)!.evaluate(input,signal);
  }
  async close():Promise<void>{
    const assets=[...this.#assets.values()];this.#assets.clear();
    await Promise.all(assets.flatMap(asset=>[...asset.runtimes.values()].map(runtime=>runtime.close())));
  }
}
