import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runDoctor} from '../src/doctor.mjs';
async function invoke(args,env={}){let stdout='',stderr='';const code=await runDoctor(args,{env,stdout:{write:s=>{stdout+=s;}},stderr:{write:s=>{stderr+=s;}},signal:new AbortController().signal});return {code,stdout,stderr};}
test('strict CLI rejects missing configuration, unknown/duplicate flags and invalid deadlines without exposing input',async()=>{
 for(const flags of [[],['--unknown','secret'],['--timeout-ms','99'],['--timeout-ms','30001'],['--timeout-ms','1e3'],['--format','xml'],['--timeout-ms','100','--timeout-ms','200']]){
  const out=await invoke(['doctor','data','--format','json',...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});assert.equal(out.code,2);const record=JSON.parse(out.stdout);assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.commandRef,null);assert.deepEqual(record.evidenceRefs,[]);assert.equal(record.status,'Failed');assert.ok(!out.stdout.includes('secret'));assert.equal(out.stderr,'abh doctor data: INVALID_ARGUMENT\n');
 }
});
test('credential values and unrecognized environment do not reach output',async()=>{
 const out=await invoke(['doctor','data','--format','json'],{ABH_DATABASE_RUNTIME_URL:'not-a-url/secret',ABH_DATABASE_MIGRATION_URL:'postgres://secret@localhost/secret'});assert.equal(out.code,2);assert.ok(!JSON.stringify(out).includes('not-a-url'));assert.ok(!JSON.stringify(out).includes('postgres://'));
 const missing=await invoke(['doctor','data'],{DATABASE_URL:'postgres://secret@localhost/db'});assert.equal(missing.code,2);assert.match(missing.stdout,/ABH_DATABASE_RUNTIME_URL/);
});
test('projection doctor parsing stays strict and validation failures do not expose identifiers',async()=>{
 const base=['doctor','projection','--organization-id','11111111-1111-4111-8111-111111111111',
  '--subject-id','22222222-2222-4222-8222-222222222222','--format','json'];
 for(const flags of [[],['--unknown','secret'],['--timeout-ms','99'],['--format','xml'],
  ['--organization-id','33333333-3333-4333-8333-333333333333'],['--workspace-id','no-uuid']]){
  const out=await invoke([...base,...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});
  assert.equal(out.code,2);
  const record=JSON.parse(out.stdout);
  assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.status,'Failed');
  assert.equal(record.health.subjectId,'00000000-0000-4000-8000-000000000000');
  assert.ok(!out.stdout.includes('secret'));assert.equal(out.stderr,'abh doctor projection: INVALID_ARGUMENT\n');
 }
});
