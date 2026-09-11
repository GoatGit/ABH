import {packManifest} from './pack-fixture.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {digestPackManifest} from '@abh/contracts/digest';
import {verifyPackContent,type PackContentSource} from '../src/extensions/verify-pack-content.ts';
const bytes=new TextEncoder().encode('abc');
const limits={maxFileBytes:32,maxTotalBytes:64,maxFiles:10};
const options=()=>({deadline:Date.now()+1000,signal:new AbortController().signal});
const manifest=packManifest;
const source=(value=bytes):PackContentSource=>({refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield value.subarray(0,1);yield value.subarray(1);}})});

test('Pack content checks actual chunked bytes and all three integrity digests before returning',async()=>{
  const value=await manifest();assert.deepEqual(await verifyPackContent(value,source(),options(),limits),await digestPackManifest(value));
  for(const input of [new TextEncoder().encode('abd'),bytes.subarray(1)])await assert.rejects(verifyPackContent(value,source(input),options(),limits),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyPackContent(value,source(new Uint8Array(4)),options(),limits),{code:'LIMIT_EXCEEDED'});
  for(const name of ['manifestDigest','artifactSetDigest','packageDigest'] as const)await assert.rejects(verifyPackContent({...value,integrity:{...value.integrity,[name]:'sha256:'+'0'.repeat(64)}},source(),options(),limits),{code:'PRECONDITION_FAILED'});
});

test('Pack content rejects missing, duplicate, extra files and declared oversize before opening',async()=>{
  let opened=0;const value=await manifest();
  for(const refs of [[],['input.json','input.json'],['other.json']])await assert.rejects(verifyPackContent(value,{refs,open:async()=>{opened++;return source().open('',options());}},options(),limits));
  await assert.rejects(verifyPackContent(value,{...source(),open:async()=>{opened++;return source().open('',options());}},options(),{...limits,maxFileBytes:2}),{code:'LIMIT_EXCEEDED'});
  assert.equal(opened,0);
});

test('Pack stream timeout requests cleanup and never accepts a late result',async()=>{
  let returned=0,streamSignal:AbortSignal|undefined;
  const stalled:PackContentSource={refs:['input.json'],open:async(_ref,options)=>{streamSignal=options.signal;return {[Symbol.asyncIterator]:()=>({next:async()=>new Promise(()=>{}),return:async()=>{returned++;return {done:true,value:undefined};}})};}};
  await assert.rejects(verifyPackContent(await manifest(),stalled,{...options(),deadline:Date.now()+20},limits),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(returned,1);assert.equal(streamSignal?.aborted,true);
});


test('Pack verification snapshots declaration, file refs and limits before opening content',async()=>{
  const value=await manifest(),installed=source(),bounds={...limits};
  const result=verifyPackContent(value,installed,options(),bounds);
  value.artifacts[0]!.digest='sha256:'+'0'.repeat(64);
  installed.refs=['other'];installed.open=async()=>{throw new Error('replaced source');};bounds.maxFileBytes=1;
  assert.equal((await result).packageDigest,value.integrity.packageDigest);
});


test('Pack metadata schema and trust rules reject before opening even when all hashes agree',async()=>{
  const value=await manifest();let opened=0;
  const reader={...source(),open:async()=>{opened++;return source().open('',options());}};
  for(const patch of [{trust:{mode:'Isolated'}},{permissions:{...value.permissions,networkEgress:['https://example.org']}},{metadata:{...value.metadata,version:'latest'}},{extra:true}]){
    const invalid={...value,...patch};const {signaturePayload:_,...digests}=await digestPackManifest(invalid);
    await assert.rejects(verifyPackContent({...invalid,integrity:{...value.integrity,...digests}},reader,options(),limits),{code:'INVALID_ARGUMENT'});
  }
  await assert.rejects(verifyPackContent({...value,integrity:{...value.integrity,signatureRef:'input.json'}},reader,options(),limits),{code:'INVALID_ARGUMENT'});
  assert.equal(opened,0);
});
