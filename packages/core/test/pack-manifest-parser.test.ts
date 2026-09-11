import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stringify} from 'yaml';
import {parsePackManifest} from '../src/extensions/parse-pack-manifest.ts';
import {packManifest} from './pack-fixture.ts';
const bytes=(text:string)=>new TextEncoder().encode(text);
const options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
test('bounded Manifest parser accepts equivalent JSON/YAML and snapshots input bytes',async()=>{
 const manifest=await packManifest(),json=bytes(JSON.stringify(manifest));
 const pending=parsePackManifest(json,'json',options());json.fill(0);
 assert.deepEqual(await pending,manifest);
 assert.deepEqual(await parsePackManifest(bytes(stringify(manifest)),'yaml',options()),manifest);
});
test('Manifest parser rejects duplicate keys, aliases, tags, multiple documents and unsafe values',async()=>{
 const manifest=await packManifest(),yaml=stringify(manifest),json=JSON.stringify(manifest);
 for(const [source,format] of [
  [json.replace('"apiVersion":','"apiVersion":"abh.open/v1","apiVersion":'),'json'],
  [yaml+'apiVersion: abh.open/v1\n','yaml'],
  [yaml.replace('artifacts:','extra: &a [x]\ncopy: *a\nartifacts:'),'yaml'],
  [yaml.replace('artifacts:','extra: !!str x\nartifacts:'),'yaml'],
  [yaml+'---\nfoo: bar\n','yaml'],
  [yaml.replace('sizeBytes: 3','sizeBytes: .inf'),'yaml'],
  [yaml.replace('sizeBytes: 3','sizeBytes: 9007199254740993'),'yaml'],
  ['%YAML 1.1\n---\n'+yaml,'yaml'],
  [yaml,'json'],
  ['? [a, b]\n: x\n','yaml'],
  ['x: '+ '['.repeat(1000)+'0'+']'.repeat(1000),'yaml'],
 ] as const)await assert.rejects(parsePackManifest(bytes(source),format,options()),{code:'INVALID_ARGUMENT'});
 await assert.rejects(parsePackManifest(Uint8Array.of(0xff),'yaml',options()),{code:'INVALID_ARGUMENT'});
});
test('Manifest parser enforces byte limits and cancellation without leaving workers alive',async()=>{
 await assert.rejects(parsePackManifest(new Uint8Array(1048577),'json',options()),{code:'LIMIT_EXCEEDED'});
 const input=bytes(JSON.stringify(await packManifest()));
 await assert.rejects(parsePackManifest(input,'json',{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
 const stop=new AbortController(),pending=parsePackManifest(input,'json',{...options(),signal:stop.signal});stop.abort();
 await assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});
 await assert.rejects(parsePackManifest(input,'json',{...options(),deadline:Date.now()+1}),{code:'DEPENDENCY_TIMEOUT'});
});
