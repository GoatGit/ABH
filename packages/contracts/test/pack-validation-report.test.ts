import assert from 'node:assert/strict';
import {test} from 'node:test';
import {digestContract,digestCommandIntent} from '../src/digest.ts';
import {protocolRegistry} from '../src/http.ts';
import type {RecordPackValidationCommand} from '../src/index.ts';
import {validateContract} from '../src/schema.ts';
const digest='sha256:'+'0'.repeat(64);
const report=()=>({packId:'org.example.hello',packVersion:'1.0.0',subjectDigest:digest,manifestDigest:digest,artifactSetDigest:digest,
 deploymentPolicyDigest:digest,signatureBundleDigest:digest,provenanceBundleDigest:digest,conformanceBundleDigest:digest,conformanceReportDigest:digest,
 validatedAt:'2026-09-08T00:00:00Z',validUntil:'2026-09-08T00:01:00Z',profile:'LocalOfflinePublicKey',reportDigest:digest});
test('validation evidence binds policy, proof bytes, subject and lifetime without self-reference',async()=>{
 const value=report();assert.equal(validateContract('PackValidationReport',value).success,true);
 const original=await digestContract('PackValidationReport',value);
 assert.equal(await digestContract('PackValidationReport',{...value,reportDigest:'sha256:'+'1'.repeat(64)}),original);
 for(const field of ['subjectDigest','deploymentPolicyDigest','signatureBundleDigest','provenanceBundleDigest','conformanceBundleDigest','conformanceReportDigest'])
  assert.notEqual(await digestContract('PackValidationReport',{...value,[field]:'sha256:'+'1'.repeat(64)}),original);
 assert.notEqual(await digestContract('PackValidationReport',{...value,validUntil:'2026-09-08T00:02:00Z'}),original);
 for(const validUntil of ['2026-09-08T00:00:00Z','2026-09-07T23:59:59Z'])assert.equal(validateContract('PackValidationReport',{...value,validUntil}).success,false);
});
test('record Pack validation is internal and separates command intent from the report digest',async()=>{
 const command:RecordPackValidationCommand={commandId:'11111111-1111-4111-8111-111111111111',type:'abh.packs.record-validation',schemaVersion:'0.1.0',
  idempotencyKey:'record-pack-proof',target:{type:'abh.organization',id:'22222222-2222-4222-8222-222222222222'},
  payload:{reportDigest:digest,governanceRef:{type:'abh.pack-trust-policy',id:'33333333-3333-4333-8333-333333333333',version:1},governanceDigest:digest}};
 assert.equal(validateContract('RecordPackValidationCommand',command).success,true);
 assert.equal(protocolRegistry.commands.find(entry=>entry.type===command.type)?.visibility,'Internal');
 const intent=await digestCommandIntent(command);assert.notEqual(intent,digest);
 assert.equal(await digestCommandIntent({...command,commandId:'44444444-4444-4444-8444-444444444444'}),intent);
 assert.notEqual(await digestCommandIntent({...command,payload:{...command.payload,governanceDigest:'sha256:'+'1'.repeat(64)}}),intent);
 assert.equal(validateContract('RecordPackValidationPayload',{...command.payload,grant:{}}).success,false);
});
