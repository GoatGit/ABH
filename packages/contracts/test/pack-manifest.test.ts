import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const manifest=()=>({apiVersion:'abh.open/v1',kind:'DomainPack',metadata:{id:'org.example.hello',version:'1.0.0',license:'Apache-2.0'},compatibility:{abh:'>=0.1.0 <1.0.0'},trust:{mode:'Declarative'},capabilities:{provides:[],requires:[]},permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},resources:{enforcement:'None'},artifacts:[],migrations:[],conformance:{suiteVersion:'1.0.0'},integrity:{manifestDigest:'sha256:'+'0'.repeat(64),artifactSetDigest:'sha256:'+'0'.repeat(64),packageDigest:'sha256:'+'0'.repeat(64),signatureFormat:'application/vnd.dev.sigstore.bundle.v0.3+json',signatureRef:'sig/bundle.json',provenanceRef:'proof/source.json',conformanceRef:'proof/ctk.json'}});
const entry=(ref:string)=>({ref,digest:'sha256:'+'0'.repeat(64),mediaType:'application/json',sizeBytes:0});
test('Pack Manifest closes fields and enforces trust resource, migration and permission boundaries',()=>{
  const value=manifest();assert.equal(validateContract('PackManifest',value).success,true);
  for(const patch of [{unknown:true},{resources:{enforcement:'HostProfile',profileRef:{type:'abh.profile',id:'11111111-1111-4111-8111-111111111111',version:1}}},{migrations:[entry('migration.sql')]},{permissions:{...value.permissions,networkEgress:['https://example.org']}},{permissions:{...value.permissions,secretClasses:['hello.token']}}])assert.equal(validateContract('PackManifest',{...value,...patch}).success,false);
  assert.equal(validateContract('PackManifest',{...value,trust:{mode:'Isolated'},resources:{enforcement:'IsolatedLimits',cpuMillis:0,memoryBytes:1024,processes:1,temporaryDiskBytes:0,outputBytes:100,wallTimeMs:100}}).success,true);
});
test('Pack Manifest rejects ambiguous payload/proof paths and undeclared resource fields',()=>{
  const value=manifest();
  for(const ref of ['../x','/x','a//b','a/../b','a\\b','e\u0301.json','a.'])assert.equal(validateContract('PackManifest',{...value,artifacts:[entry(ref)]}).success,false,ref);
  for(const artifacts of [[entry('sig/bundle.json')],[entry('A.json'),entry('a.json')]])assert.equal(validateContract('PackManifest',{...value,artifacts}).success,false);
  assert.equal(validateContract('PackManifest',{...value,resources:{enforcement:'None',cpuMillis:1}}).success,false);
});
