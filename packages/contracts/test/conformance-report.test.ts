import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {canonicalJson,digestContract} from '../src/digest.ts';
import {validateContract} from '../src/schema.ts';
const digest='sha256:'+'0'.repeat(64);
const report=()=>({subjectDigest:digest,suiteVersion:'1.0.0',status:'Complete',caseResults:[{caseId:'abh.test.integrity',status:'Passed',artifactRefs:[],reason:null}],claimedCapabilities:[],knownDeviations:[],environment:{profile:'Domain',environmentDigest:digest,fixtureSetDigest:digest,seed:'42'},startedAt:'2026-09-08T00:00:00Z',finishedAt:'2026-09-08T00:01:00Z',artifactRefs:[],reportDigest:digest,signatureRef:'proof/ctk.json'});
test('CTK report preserves incomplete/non-passing evidence and rejects ambiguous results',()=>{
 const value=report();assert.equal(validateContract('ConformanceReport',value).success,true);
 for(const patch of [{caseResults:[]},{caseResults:[...value.caseResults,...value.caseResults]},
  {caseResults:[{...value.caseResults[0],status:'NotRun',reason:'interrupted'}]},
  {caseResults:[{...value.caseResults[0],status:'Failed'}]},
  {knownDeviations:[{caseId:'abh.test.missing',reason:'missing'}]},
  {finishedAt:'2026-09-07T00:00:00Z'},{signatureRef:'proof./ctk.json'}])
  assert.equal(validateContract('ConformanceReport',{...value,...patch}).success,false);
 assert.equal(validateContract('ConformanceReport',{...value,status:'Incomplete',caseResults:[{...value.caseResults[0],status:'NotRun',reason:'interrupted'}]}).success,true);
 assert.equal(validateContract('ConformanceReport',{...value,caseResults:[{...value.caseResults[0],status:'Failed',reason:'wrong bytes'}]}).success,true);
});
test('CTK digest binds results, subject and environment while excluding self digest and signature discovery',async()=>{
 const value=report(),{reportDigest,signatureRef,...payload}=value;
 const expected='sha256:'+createHash('sha256').update(canonicalJson(payload)).digest('hex');
 assert.equal(await digestContract('ConformanceReport',value),expected);
 assert.equal(await digestContract('ConformanceReport',{...value,reportDigest:'sha256:'+'1'.repeat(64),signatureRef:'moved/bundle.json'}),expected);
 for(const patch of [{subjectDigest:'sha256:'+'1'.repeat(64)},{environment:{...value.environment,seed:'43'}},
  {caseResults:[{...value.caseResults[0],status:'Failed',reason:'failed'}]}])
  assert.notEqual(await digestContract('ConformanceReport',{...value,...patch}),expected);
});
