import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runDoctor} from '../src/doctor.mjs';
import {validateContract} from '@abh/contracts/schema';
async function invoke(args,env={}){let stdout='',stderr='';const code=await runDoctor(args,{env,stdout:{write:s=>{stdout+=s;}},stderr:{write:s=>{stderr+=s;}},signal:new AbortController().signal});return {code,stdout,stderr};}
test('strict CLI rejects missing configuration, unknown/duplicate flags and invalid deadlines without exposing input',async()=>{
 for(const flags of [[],['--unknown','secret'],['--timeout-ms','99'],['--timeout-ms','30001'],['--timeout-ms','1e3'],['--format','xml'],['--timeout-ms','100','--timeout-ms','200']]){
  const out=await invoke(['doctor','data','--format','json',...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});assert.equal(out.code,2);const record=JSON.parse(out.stdout);assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.commandRef,null);assert.deepEqual(record.evidenceRefs,[]);assert.equal(record.status,'Failed');assert.ok(!out.stdout.includes('secret'));assert.equal(out.stderr,'abh doctor data: INVALID_ARGUMENT\n');
 }
});
test('learning candidate doctor parsing stays strict and database failures remain bounded',async()=>{
 const base=['doctor','learning','--candidate','--organization-id','44444444-4444-4444-8444-444444444444','--format','json'];
 for(const flags of [['--unknown','secret'],['--limit','101'],['--limit','0'],['--candidate-id','no-uuid'],
  ['--organization-id','55555555-5555-4555-8555-555555555555'],['--timeout-ms','99'],['--limit','10','--limit','20']]){
  const out=await invoke([...base,...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});
  assert.equal(out.code,2);const record=JSON.parse(out.stdout);
  assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.checkId,'learning.candidate-readiness');
  assert.ok(!out.stdout.includes('secret'));assert.equal(out.stderr,'abh doctor learning: INVALID_ARGUMENT\n');
 }
 const unavailable=await invoke([...base],{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'});
 assert.equal(unavailable.code,6);const record=JSON.parse(unavailable.stdout);
 assert.equal(validateContract('CliDoctorLearningResult',record).success,true);
 assert.equal(record.errorCode,'DEPENDENCY_UNAVAILABLE');
 assert.ok(!(unavailable.stdout+unavailable.stderr).includes('secret'));
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
test('release doctor parsing stays strict and database failures remain bounded',async()=>{
 const base=['doctor','release','--organization-id','11111111-1111-4111-8111-111111111111',
  '--release-id','22222222-2222-4222-8222-222222222222','--format','json'];
 for(const flags of [[],['--unknown','secret'],['--release-id','no-uuid'],
  ['--workspace-id','no-uuid'],['--timeout-ms','99'],['--timeout-ms','30001'],
  ['--format','xml'],['--release-id','33333333-3333-4333-8333-333333333333',
  '--release-id','44444444-4444-4444-8444-444444444444']]){
  const out=await invoke([...base,...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});
  assert.equal(out.code,2);const record=JSON.parse(out.stdout);
  assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.checkId,'release.readiness');
  assert.equal(record.status,'Failed');assert.ok(!out.stdout.includes('secret'));
  assert.equal(out.stderr,'abh doctor release: INVALID_ARGUMENT\n');
  assert.equal(validateContract('CliDoctorReleaseResult',record).success,true);
 }
 const unavailable=await invoke([...base],{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'});
 assert.equal(unavailable.code,6);const record=JSON.parse(unavailable.stdout);
 assert.equal(validateContract('CliDoctorReleaseResult',record).success,true);
 assert.equal(record.errorCode,'DEPENDENCY_UNAVAILABLE');assert.deepEqual(record.releases,[]);
 assert.ok(!(unavailable.stdout+unavailable.stderr).includes('secret'));
});
test('operation doctor parsing stays strict and database failures remain bounded',async()=>{
 const base=['doctor','operation','--organization-id','11111111-1111-4111-8111-111111111111',
  '--operation-id','22222222-2222-4222-8222-222222222222','--format','json'];
 for(const flags of [[],['--unknown','secret'],['--operation-id','no-uuid'],
  ['--workspace-id','no-uuid'],['--timeout-ms','99'],['--timeout-ms','30001'],
  ['--format','xml'],['--operation-id','33333333-3333-4333-8333-333333333333',
  '--operation-id','44444444-4444-4444-8444-444444444444']]){
  const out=await invoke([...base,...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});
  assert.equal(out.code,2);const record=JSON.parse(out.stdout);
  assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.checkId,'operation.readiness');
  assert.deepEqual(record.operations,[]);assert.ok(!out.stdout.includes('secret'));
  assert.equal(out.stderr,'abh doctor operation: INVALID_ARGUMENT\n');
  assert.equal(validateContract('CliDoctorOperationResult',record).success,true);
 }
 const unavailable=await invoke([...base],{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'});
 assert.equal(unavailable.code,6);const record=JSON.parse(unavailable.stdout);
 assert.equal(validateContract('CliDoctorOperationResult',record).success,true);
 assert.equal(record.errorCode,'DEPENDENCY_UNAVAILABLE');assert.deepEqual(record.operations,[]);
 assert.ok(!(unavailable.stdout+unavailable.stderr).includes('secret'));
});
test('pack doctor parsing stays strict and database failures remain bounded',async()=>{
 const base=['doctor','pack','--organization-id','11111111-1111-4111-8111-111111111111',
  '--pack-id','org.example.pack','--pack-version','1.0.0','--format','json'];
 for(const flags of [[],['--unknown','secret'],['--pack-id','Bad Pack'],
  ['--pack-version','latest'],['--timeout-ms','99'],['--timeout-ms','30001'],
  ['--format','xml'],['--organization-id','33333333-3333-4333-8333-333333333333',
  '--organization-id','44444444-4444-4444-8444-444444444444']]){
  const out=await invoke([...base,...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});
  assert.equal(out.code,2);const record=JSON.parse(out.stdout);
  assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.checkId,'pack.install-readiness');
  assert.equal(record.status,'Failed');assert.deepEqual(record.packs,[]);assert.ok(!out.stdout.includes('secret'));
  assert.equal(out.stderr,'abh doctor pack: INVALID_ARGUMENT\n');
  assert.equal(validateContract('CliDoctorPackResult',record).success,true);
 }
 const unavailable=await invoke([...base],{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'});
 assert.equal(unavailable.code,6);const record=JSON.parse(unavailable.stdout);
 assert.equal(validateContract('CliDoctorPackResult',record).success,true);
 assert.equal(record.errorCode,'DEPENDENCY_UNAVAILABLE');assert.deepEqual(record.packs,[]);
 assert.ok(!(unavailable.stdout+unavailable.stderr).includes('secret'));
});
test('ledger doctor parsing stays strict and database failures remain bounded',async()=>{
 const base=['doctor','ledger','--organization-id','11111111-1111-4111-8111-111111111111',
  '--ledger-id','22222222-2222-4222-8222-222222222222','--format','json'];
 for(const flags of [[],['--unknown','secret'],['--ledger-id','no-uuid'],
  ['--timeout-ms','99'],['--timeout-ms','30001'],['--format','xml'],
  ['--organization-id','33333333-3333-4333-8333-333333333333',
  '--organization-id','44444444-4444-4444-8444-444444444444']]){
  const out=await invoke([...base,...flags],flags.length?{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'}:{});
  assert.equal(out.code,2);const record=JSON.parse(out.stdout);
  assert.equal(record.errorCode,'INVALID_ARGUMENT');assert.equal(record.checkId,'ledger.balance-audit');
  assert.equal(record.status,'Failed');assert.deepEqual(record.ledgers,[]);assert.ok(!out.stdout.includes('secret'));
  assert.equal(out.stderr,'abh doctor ledger: INVALID_ARGUMENT\n');
  assert.equal(validateContract('CliDoctorLedgerResult',record).success,true);
 }
 const unavailable=await invoke([...base],{ABH_DATABASE_RUNTIME_URL:'postgres://runtime:secret@127.0.0.1:1/db'});
 assert.equal(unavailable.code,6);const record=JSON.parse(unavailable.stdout);
 assert.equal(validateContract('CliDoctorLedgerResult',record).success,true);
 assert.equal(record.errorCode,'DEPENDENCY_UNAVAILABLE');assert.deepEqual(record.ledgers,[]);
 assert.ok(!(unavailable.stdout+unavailable.stderr).includes('secret'));
});
