import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {EntityRef} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {defineBusiness} from '../src/business.ts';
import {compileBusinessPack} from '../src/business-pack.ts';

const options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
const principal=(id:string):EntityRef=>({type:'abh.principal',id,version:1});
const action={actionType:'hello.publish',title:'Publish internal brief',
  description:'Propose publication of one approved internal brief.',
  inputSchema:{type:'object' as const,properties:{message:{type:'string' as const,minLength:1,maxLength:200}},
    required:['message'],additionalProperties:false as const},
  executionPrincipalRef:principal('00000000-0000-4000-8000-000000000001'),
  completionPolicyRef:principal('00000000-0000-4000-8000-000000000002'),
  riskClass:'hello.low-risk',requiredBehaviorSlots:['hello.execution'],maxOperations:10,
  intentExpirySeconds:3600,purposeNames:['abh.action.prepare']};
const input={name:'hello.business',version:'0.1.0',mode:'ActionOnly' as const,actions:[action]};

test('compiles a business definition into a bounded local manifest and explicit CTK plan',async()=>{
  const business=await defineBusiness(input),compiled=await compileBusinessPack({business},options());
  assert.equal(validateContract('PackManifest',compiled.manifest).success,true);
  assert.deepEqual(compiled.manifest.capabilities.provides,[
    {kind:'abh.business',id:'hello.business.definition',version:'0.1.0'},
    {kind:'abh.action',id:'hello.publish',version:'0.1.0'}]);
  assert.deepEqual(compiled.manifest.permissions.commands,['hello.publish']);
  assert.deepEqual(compiled.manifest.permissions.purposes,['abh.action.prepare']);
  assert.equal(compiled.manifest.artifacts.length,1);
  assert.equal(compiled.manifest.artifacts[0]!.ref,'business.json');
  assert.equal(compiled.manifest.artifacts[0]!.sizeBytes,compiled.declaration.byteLength);
  assert.equal(compiled.manifest.artifacts[0]!.digest,await digestBytes(compiled.declaration));
  assert.equal(compiled.ctk.status,'NotRun');
  assert.equal(compiled.ctk.subjectDigest,compiled.manifest.integrity.packageDigest);
  const {digest,...unsignedCtk}=compiled.ctk;
  assert.equal(digest,await digestBytes(new TextEncoder().encode(canonicalJson(unsignedCtk))));
});

test('compilation is deterministic and rejects declarations whose digest was changed',async()=>{
  const business=await defineBusiness(input);
  const first=await compileBusinessPack({business},options());
  const second=await compileBusinessPack({business},options());
  assert.deepEqual(second.manifest,first.manifest);
  assert.deepEqual(second.ctk,first.ctk);
  await assert.rejects(compileBusinessPack({business:{...business,digest:'sha256:'+'0'.repeat(64)}},options()),
    {code:'INVALID_ARGUMENT'});
  await assert.rejects(compileBusinessPack({business:null as unknown as typeof business},options()),
    {code:'INVALID_ARGUMENT'});
});
