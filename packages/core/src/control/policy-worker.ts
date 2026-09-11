import {parentPort,workerData} from 'node:worker_threads';
import {loadPolicy} from '@open-policy-agent/opa-wasm';

// No custom host builtins. The SDK implements only deterministic JSON/string/regex/YAML helpers.
// stdout/stderr are isolated and discarded by the parent; policy print/abort text is never logged.
const port=parentPort!;
try{
  const policy=await loadPolicy(new Uint8Array(workerData.bytes),{initial:5,maximum:512});
  if(!Object.hasOwn(policy.entrypoints,workerData.entrypoint))throw new Error();
  port.on('message',({id,input}:{id:number;input:unknown})=>{
    try{port.postMessage({id,result:policy.evaluate(input,workerData.entrypoint)});}
    catch{port.postMessage({id,error:'POLICY_DENIED'});}
  });
  port.postMessage({ready:true});
}catch{
  port.postMessage({error:'POLICY_DENIED'});port.close();
}
