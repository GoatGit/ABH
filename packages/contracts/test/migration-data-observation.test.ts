import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const digest='sha256:'+'a'.repeat(64),otherDigest='sha256:'+'b'.repeat(64);
const binding={kind:'DataInvariants',organizationId:'11111111-1111-4111-8111-111111111111',packId:'org.example.pack',packVersion:'1.0.0',packageDigest:digest,planDigest:digest,expectedDigest:digest};
const report={binding,environmentDigest:digest,deploymentVersion:1,issuedAt:'2026-09-08T00:00:00.123456Z',expiresAt:'2026-09-08T00:01:00Z'};
const observation={result:{matched:true,expectedDigest:digest,binding,reportRef:{type:'abh.artifact',id:'22222222-2222-4222-8222-222222222222',version:1},bundleRef:{type:'abh.artifact',id:'33333333-3333-4333-8333-333333333333',version:1},signature:{report,keyDigest:digest,bundleDigest:digest,verifiedAt:'2026-09-08T00:00:00.123457Z'},results:[{schema:'example',table:'items',rowCount:'2',nulls:[{column:'id',count:'0'}],duplicates:[{columns:['id','label'],groups:'0'}],matched:true}]},observedAt:'2026-09-08T00:00:00.123458Z'};
const valid=(value:unknown)=>validateContract('PackMigrationDataObservation',value).success;
test('data observations represent exact counts and preserve mismatch evidence',()=>{
 assert.equal(valid(observation),true);
 const mismatch=structuredClone(observation);mismatch.result.matched=false;mismatch.result.results[0]!.matched=false;mismatch.result.results[0]!.duplicates[0]!.groups='1';assert.equal(valid(mismatch),true);
 const maximum=structuredClone(observation);maximum.result.results[0]!.rowCount='9223372036854775807';assert.equal(valid(maximum),true);
 for(const count of ['9223372036854775808','01','-1','1e2']){const value=structuredClone(observation);value.result.results[0]!.rowCount=count;assert.equal(valid(value),false);}
 assert.equal(valid({...observation,extra:true}),false);
 assert.equal(valid({...observation,result:{...observation.result,extra:true}}),false);
 assert.equal(valid({...observation,result:{...observation.result,signature:{...observation.result.signature,bundle:[]}}}),false);
});
test('observation rejects inconsistent binding, sources and microsecond ordering',()=>{
 for(const mutate of [
  (v:typeof observation)=>{v.result.expectedDigest=otherDigest;},
  (v:typeof observation)=>{v.result.signature.report.binding={...v.result.binding,planDigest:otherDigest};},
  (v:typeof observation)=>{v.result.bundleRef={...v.result.reportRef};},
  (v:typeof observation)=>{v.result.reportRef.type='abh.action';},
  (v:typeof observation)=>{v.observedAt='2026-09-08T00:00:00.123456Z';},
  (v:typeof observation)=>{v.result.signature.verifiedAt='2026-09-08T00:00:00.123455Z';},
  (v:typeof observation)=>{v.result.signature.report.expiresAt=v.result.signature.verifiedAt;},
 ]){const value=structuredClone(observation);mutate(value);assert.equal(valid(value),false);}
});
test('observation rejects impossible counts, contradictory matches and duplicate scopes',()=>{
 for(const mutate of [
  (v:typeof observation)=>{v.result.matched=false;},
  (v:typeof observation)=>{v.result.results[0]!.nulls[0]!.count='1';},
  (v:typeof observation)=>{v.result.results[0]!.duplicates[0]!.groups='1';},
  (v:typeof observation)=>{v.result.matched=false;v.result.results[0]!.matched=false;v.result.results[0]!.nulls[0]!.count='3';},
  (v:typeof observation)=>{v.result.matched=false;v.result.results[0]!.matched=false;v.result.results[0]!.duplicates[0]!.groups='2';},
  (v:typeof observation)=>{v.result.results.push(structuredClone(v.result.results[0]!));},
  (v:typeof observation)=>{v.result.results[0]!.nulls.push({column:'id',count:'0'});},
  (v:typeof observation)=>{v.result.results[0]!.duplicates.push({columns:['label','id'],groups:'0'});},
 ]){const value=structuredClone(observation);mutate(value);assert.equal(valid(value),false);}
});
test('observation digest covers actual data, sources, signature and observation time',async()=>{
 const original=await digestContract('PackMigrationDataObservation',observation);
 for(const mutate of [
  (v:typeof observation)=>{v.result.results[0]!.rowCount='3';},
  (v:typeof observation)=>{v.result.signature.keyDigest=otherDigest;},
  (v:typeof observation)=>{v.result.signature.bundleDigest=otherDigest;},
  (v:typeof observation)=>{v.result.reportRef.id='44444444-4444-4444-8444-444444444444';},
  (v:typeof observation)=>{v.observedAt='2026-09-08T00:00:00.123459Z';},
 ]){const value=structuredClone(observation);mutate(value);assert.notEqual(await digestContract('PackMigrationDataObservation',value),original);}
});
