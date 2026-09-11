import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const digest='sha256:'+'a'.repeat(64),other='sha256:'+'b'.repeat(64);
const ref=(n:number)=>({type:'abh.artifact',id:`${n}1111111-1111-4111-8111-111111111111`,version:1});
const binding={organizationId:'11111111-1111-4111-8111-111111111111',packId:'org.example.pack',packVersion:'1.0.0',packageDigest:digest,planDigest:digest,expectedDigest:digest};
const report={binding,environmentDigest:digest,deploymentVersion:1,issuedAt:'2026-09-09T00:00:00.123456Z',expiresAt:'2026-09-09T00:01:00Z'};
const signature={report,keyDigest:digest,bundleDigest:digest,verifiedAt:'2026-09-09T00:00:00.123457Z'};
const table={schema:'example',name:'items',owner:'example_owner',kind:'r',rls:false,forceRls:false,partition:{key:null,bound:null,parents:[]},columns:[],indexes:[],policies:[],triggers:[],constraints:[]};
const structure={matched:true,requiresAdditionalVerification:[],expectedDigest:digest,inventory:{matched:true,expectedDigest:digest,results:[{schema:'example',actual:[{name:'items',kind:'r'}],missing:[],unexpected:[],changed:[]}]},tables:{matched:true,expectedDigest:digest,results:[{schema:'example',name:'items',actual:table,differences:[] as string[]}]},sequences:null,views:null,acl:null,binding,reportRef:ref(2),bundleRef:ref(3),signature};
const dataBinding={...binding,kind:'DataInvariants'},data={matched:true,expectedDigest:digest,results:[{schema:'example',table:'items',rowCount:'2',nulls:[{column:'id',count:'0'}],duplicates:[],matched:true}],binding:dataBinding,reportRef:ref(4),bundleRef:ref(5),signature:{...signature,report:{...report,binding:dataBinding}}};
const observedAt='2026-09-09T00:00:00.123458Z',state={result:{matched:true,structure,data},observedAt};
const valid=(v:unknown)=>validateContract('PackMigrationStateObservation',v).success;
test('formal structural and combined observations retain mismatches and closed detailed catalog data',()=>{
 assert.equal(validateContract('PackMigrationStructureObservation',{result:structure,observedAt}).success,true);
 assert.equal(valid(state),true);
 const mismatch=structuredClone(state);mismatch.result.matched=false;mismatch.result.structure.matched=false;mismatch.result.structure.tables.matched=false;mismatch.result.structure.tables.results[0]!.differences=['columns'];assert.equal(valid(mismatch),true);
 for(const value of [{...state,extra:true},{...state,result:{...state.result,extra:true}},{...state,result:{...state.result,structure:{...structure,tables:{...structure.tables,results:[{...structure.tables.results[0],actual:{...table,sql:'DROP TABLE items'}}]}}}}])assert.equal(valid(value),false);
});
test('combined observation rejects cross-package, plan, environment, deployment and shared sources',()=>{
 for(const mutate of [
  (v:typeof state)=>{v.result.data.binding={...dataBinding,planDigest:other};v.result.data.signature.report.binding={...v.result.data.binding};},
  (v:typeof state)=>{v.result.data.binding={...dataBinding,packVersion:'2.0.0'};v.result.data.signature.report.binding={...v.result.data.binding};},
  (v:typeof state)=>{v.result.data.signature.report.environmentDigest=other;},
  (v:typeof state)=>{v.result.data.signature.report.deploymentVersion=2;},
  (v:typeof state)=>{v.result.data.reportRef=ref(2);},
  (v:typeof state)=>{v.result.matched=false;},
 ]){const v=structuredClone(state);mutate(v);assert.equal(valid(v),false);}
});
test('combined observation validates child counts, microseconds, component differences and identities',()=>{
 for(const mutate of [
  (v:typeof state)=>{v.result.data.results[0]!.nulls[0]!.count='3';},
  (v:typeof state)=>{v.observedAt=report.issuedAt;},
  (v:typeof state)=>{v.result.structure.signature.verifiedAt=report.expiresAt;},
  (v:typeof state)=>{v.result.structure.expectedDigest=other;},
  (v:typeof state)=>{v.result.structure.tables.results[0]!.differences=['owner'];},
  (v:typeof state)=>{v.result.structure.tables.results[0]!.actual.name='other';},
  (v:typeof state)=>{v.result.structure.inventory.results.push(structuredClone(v.result.structure.inventory.results[0]!));},
  (v:typeof state)=>{v.result.structure.tables.results.push(structuredClone(v.result.structure.tables.results[0]!));},
 ]){const v=structuredClone(state);mutate(v);assert.equal(valid(v),false);}
});
test('combined digest binds both observations and the observation time',async()=>{
 const original=await digestContract('PackMigrationStateObservation',state);
 for(const mutate of [
  (v:typeof state)=>{v.result.structure.signature.keyDigest=other;},
  (v:typeof state)=>{v.result.data.results[0]!.rowCount='3';},
  (v:typeof state)=>{v.observedAt='2026-09-09T00:00:00.123459Z';},
 ]){const v=structuredClone(state);mutate(v);assert.notEqual(await digestContract('PackMigrationStateObservation',v),original);}
});
