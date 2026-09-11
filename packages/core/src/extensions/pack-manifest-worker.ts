import {parentPort,workerData} from 'node:worker_threads';
import {isAlias,isMap,isPair,isScalar,isSeq,parseDocument} from 'yaml';
import {canonicalJson} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';

// A dedicated worker bounds synchronous parser CPU/stack/heap before any manifest content is interpreted.
try{
  const {bytes,format}=workerData as {bytes:Uint8Array;format:'json'|'yaml'};
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(format==='json')JSON.parse(source); // Require actual JSON grammar, not YAML's JSON-compatible superset.
  const document=parseDocument(source,{version:'1.2',schema:'core',strict:true,uniqueKeys:true,merge:false});
  if(document.errors.length||document.warnings.length||document.directives?.yaml.version!=='1.2')throw new Error();
  let nodes=0;
  function inspect(node:unknown,depth:number):void{
    if(++nodes>100000||depth>64)throw new Error();
    if(isAlias(node))throw new Error();
    if(isPair(node)){
      if(!isScalar(node.key)||typeof node.key.value!=='string'||node.key.value==='<<')throw new Error();
      inspect(node.key,depth+1);inspect(node.value,depth+1);
    }else if(isMap(node)||isSeq(node)){
      if(node.anchor||node.tag)throw new Error();
      for(const child of node.items)inspect(child,depth+1);
    }else if(isScalar(node)){
      if(node.anchor||node.tag||typeof node.value==='number'&&(!Number.isFinite(node.value)||Number.isInteger(node.value)&&!Number.isSafeInteger(node.value)))throw new Error();
    }else if(node!==null)throw new Error();
  }
  inspect(document.contents,0);
  const manifest=JSON.parse(canonicalJson(document.toJS({maxAliasCount:0})));
  const checked=validateContract('PackManifest',manifest);
  if(!checked.success)throw new Error();
  parentPort?.postMessage({ok:true,manifest:checked.data});
}catch{parentPort?.postMessage({ok:false});}
