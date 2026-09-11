import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {PackCapabilityBinding,PackManifest} from '@abh/contracts';
import {digestBytes,digestContract,digestPackManifest} from '@abh/contracts/digest';
import {packManifest} from './pack-fixture.ts';
import {preparePackCapabilities,type PackCapabilityBindingChecks} from '../src/extensions/prepare-pack-capabilities.ts';
import type {PackContentSource} from '../src/extensions/verify-pack-content.ts';
const bytes=new TextEncoder().encode('{"type":"object"}');
const ref=(type:string)=>({type,id:randomUUID(),version:1});
const packRef=ref('abh.installed-pack'),capability={kind:'abh.tool',id:'org.example.hello.tool',version:'1.0.0'};
const options=()=>({deadline:Date.now()+2000,signal:new AbortController().signal});
const source=(body=bytes):PackContentSource=>({refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield body;}})});
const checks:PackCapabilityBindingChecks={schema:async(_b,content)=>{assert.deepEqual(JSON.parse(new TextDecoder().decode(content)),{type:'object'});},implementation:async()=>{}};
async function fixture(){
 const raw=await packManifest();raw.artifacts=[{ref:'input.json',sizeBytes:bytes.length,mediaType:'application/json',digest:await digestBytes(bytes)}];
 const value={...raw,capabilities:{provides:[capability],requires:[]},permissions:{...raw.permissions,commands:['org.example.hello.execute']}};
 const {signaturePayload:_,...digests}=await digestPackManifest(value);const manifest={...value,integrity:{...value.integrity,...digests}} as PackManifest;
 const binding:PackCapabilityBinding={capability,schemaPath:'input.json',implementationRef:ref('abh.artifact'),healthRef:ref('abh.artifact'),permissionEnvelope:structuredClone(manifest.permissions)};
 return {manifest,binding};
}
test('explicit capability bindings use verified bytes, exact identities and semantic registration digests',async()=>{
 const {manifest,binding}=await fixture();let schemas=0,implementations=0;
 const result=await preparePackCapabilities(manifest,packRef,[binding],source(),options(),{schema:async(...args)=>{schemas++;await checks.schema(...args);},implementation:async()=>{implementations++;}});
 assert.equal(schemas,1);assert.equal(implementations,1);assert.equal(result.length,1);
 const record=result[0]!;assert.equal(record.schemaDigest,await digestBytes(bytes));assert.equal(record.subjectDigest,manifest.integrity.packageDigest);assert.deepEqual(record.packRef,packRef);assert.equal(record.registrationDigest,await digestContract('PackCapabilityRegistration',record));
 for(const patch of [{schemaDigest:'sha256:'+'b'.repeat(64)},{implementationRef:ref('abh.artifact')},{healthRef:ref('abh.artifact')},{packRef:{...packRef,version:2}},{permissionEnvelope:{...binding.permissionEnvelope,commands:[]}}])assert.notEqual(await digestContract('PackCapabilityRegistration',{...record,...patch}),record.registrationDigest);
});
test('missing, duplicate, foreign, guessed-path and expanded-permission mappings fail before source access',async()=>{
 const {manifest,binding}=await fixture();let opened=0;const input={...source(),open:async()=>{opened++;throw new Error('must not open');}};
 for(const bindings of [[],[binding,binding],[{...binding,capability:{...capability,version:'2.0.0'}}],[{...binding,schemaPath:'tool.json'}],[{...binding,permissionEnvelope:{...binding.permissionEnvelope,commands:['org.other.execute']}}]])await assert.rejects(preparePackCapabilities(manifest,packRef,bindings,input,options(),checks));
 assert.equal(opened,0);
});
test('tampered and oversized schemas never reach compiler or implementation admission',async()=>{
 const {manifest,binding}=await fixture();let callbacks=0;const admission={schema:async()=>{callbacks++;},implementation:async()=>{callbacks++;}};
 await assert.rejects(preparePackCapabilities(manifest,packRef,[binding],source(Uint8Array.from(bytes,()=>0)),options(),admission),{code:'PRECONDITION_FAILED'});
 await assert.rejects(preparePackCapabilities(manifest,packRef,[binding],source(new Uint8Array(2097153)),options(),admission),{code:'LIMIT_EXCEEDED'});
 assert.equal(callbacks,0);
});
test('snapshot inputs and callback receivers survive caller mutation and schema callbacks cannot rewrite registration',async()=>{
 const {manifest,binding}=await fixture(),original=structuredClone(binding);let calls=0;
 const admission={marker:7,schema:async function(b:PackCapabilityBinding,content:Uint8Array){assert.equal(this.marker,7);content.fill(0);b.permissionEnvelope.commands=[];calls++;},implementation:async function(b:PackCapabilityBinding){assert.equal(this.marker,7);assert.deepEqual(b,original);calls++;}};
 const reader=source(),pending=preparePackCapabilities(manifest,packRef,[binding],reader,options(),admission);
 binding.capability={...capability,version:'9.0.0'};reader.open=async()=>{throw new Error('replaced');};admission.marker=7;
 admission.schema=async()=>{throw new Error('replaced schema');};
 const [saved]=await pending;assert.deepEqual(saved!.capability,original.capability);assert.deepEqual(saved!.permissionEnvelope,original.permissionEnvelope);assert.equal(calls,2);
});
test('schema/implementation rejection and cancellation stop preparation without returning partial registrations',async()=>{
 const {manifest,binding}=await fixture();
 await assert.rejects(preparePackCapabilities(manifest,packRef,[binding],source(),options(),{...checks,schema:async()=>{throw new Error('invalid schema');}}),/invalid schema/);
 await assert.rejects(preparePackCapabilities(manifest,packRef,[binding],source(),options(),{...checks,implementation:async()=>{throw new Error('unavailable isolation');}}),/unavailable isolation/);
 const stop=new AbortController();let implementations=0;
 await assert.rejects(preparePackCapabilities(manifest,packRef,[binding],source(),{...options(),signal:stop.signal},{schema:async()=>{stop.abort();},implementation:async()=>{implementations++;}}),{code:'DEPENDENCY_TIMEOUT'});assert.equal(implementations,0);
 await assert.rejects(preparePackCapabilities(manifest,packRef,[binding],source(),{...options(),deadline:Date.now()+30},{...checks,implementation:async()=>new Promise(()=>{})}),{code:'DEPENDENCY_TIMEOUT'});
});
