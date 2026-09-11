import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PackManifest} from '@abh/contracts';
import {packManifest} from './pack-fixture.ts';
import {resolvePackDependencies,PackDependencyError} from '../src/extensions/pack-dependencies.ts';
const pack=async(id:string,provides:string[]=[],requires:string[]=[]):Promise<PackManifest>=>({...await packManifest(),metadata:{id,version:'1.0.0',license:'Apache-2.0'},capabilities:{provides:provides.map(id=>({kind:'hello.schema',id,version:'1.0.0'})),requires:requires.map(id=>({kind:'hello.schema',id,versionRange:'^1.0.0'}))}} as PackManifest);
const reason=(expected:string)=>(error:unknown)=>error instanceof PackDependencyError&&error.reason===expected;
test('Pack dependencies resolve providers first independent of discovery order',async()=>{
 const a=await pack('org.example.a',['org.example.a.input']),b=await pack('org.example.b',['org.example.b.output'],['org.example.a.input']),c=await pack('org.example.c',[],['org.example.b.output']);
 const result=resolvePackDependencies([c,a,b]);assert.deepEqual(result.order.map(p=>p.id),['org.example.a','org.example.b','org.example.c']);assert.deepEqual(resolvePackDependencies([b,c,a]),result);
 result.dependencies[0]!.capability.id='changed';assert.equal(b.capabilities.provides[0]!.id,'org.example.b.output');
});
test('Pack dependencies reject missing, incompatible, duplicate and cyclic graphs with a chain',async()=>{
 const a=await pack('org.example.a',['org.example.a.input'],['org.example.b.output']),b=await pack('org.example.b',['org.example.b.output'],['org.example.a.input']);
 assert.throws(()=>resolvePackDependencies([a]),reason('Missing'));
 assert.throws(()=>resolvePackDependencies([a,b]),error=>reason('Cycle')(error)&&(error as PackDependencyError).chain.length===3);
 assert.throws(()=>resolvePackDependencies([a,a]),reason('Conflict'));
 const self=await pack('org.example.self',['org.example.self.value'],['org.example.self.value']);assert.throws(()=>resolvePackDependencies([self]),reason('Cycle'));
 b.capabilities.provides[0]!.version='2.0.0';assert.throws(()=>resolvePackDependencies([a,b]),reason('Missing'));
});
test('multiple satisfying versions require exact deployment selection and stale selections reject',async()=>{
 const a=await pack('org.example.a',['org.example.a.value']),b=structuredClone(a);b.metadata.version='1.1.0';b.capabilities.provides[0]!.version='1.1.0';
 const c=await pack('org.example.c',[],['org.example.a.value']);assert.throws(()=>resolvePackDependencies([a,b,c]),reason('Ambiguous'));
 const choice={consumer:c.metadata,provider:b.metadata,kind:'hello.schema',id:'org.example.a.value',versionRange:'^1.0.0',capabilityVersion:'1.1.0'};
 assert.equal(resolvePackDependencies([a,b,c],[choice]).dependencies[0]!.provider.version,'1.1.0');
 assert.throws(()=>resolvePackDependencies([a,b,c],[{...choice,capabilityVersion:'9.0.0'}]),reason('Selection'));
 assert.throws(()=>resolvePackDependencies([a,b],[choice]),reason('Selection'));
 b.capabilities.provides[0]!.version='1.0.0';assert.throws(()=>resolvePackDependencies([a,b]),reason('Conflict'));
});
