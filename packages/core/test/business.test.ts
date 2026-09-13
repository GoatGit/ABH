import assert from 'node:assert/strict';
import {test} from 'node:test';
import {defineBusiness,validateBusinessInput,type BusinessDefinitionInput} from '../src/business.ts';

const action:BusinessDefinitionInput['actions'][number]={
  actionType:'hello.publish',title:'Publish brief',description:'Publish an approved internal brief.',
  inputSchema:{type:'object' as const,properties:{message:{type:'string' as const,minLength:1,maxLength:200},priority:{type:'string' as const,enum:['low','normal']}},
    required:['message'],additionalProperties:false},
  executionPrincipalRef:{type:'abh.principal',id:'00000000-0000-4000-8000-000000000001',version:1},
  completionPolicyRef:{type:'hello.completion-policy',id:'00000000-0000-4000-8000-000000000002',version:1},
  riskClass:'hello.low-risk',requiredBehaviorSlots:['hello.execution'],maxOperations:10,intentExpirySeconds:3600,
  purposeNames:['abh.action.prepare'],
};
const input:BusinessDefinitionInput={name:'hello.business',version:'0.1.0',mode:'ActionOnly',actions:[action]};

test('defineBusiness creates a closed declaration with a stable digest',async()=>{
  const first=await defineBusiness(input),second=await defineBusiness(input);
  assert.equal(first.kind,'abh.business-definition');assert.equal(first.schemaVersion,'0.1.0');
  assert.match(first.digest,/^sha256:[0-9a-f]{64}$/);assert.equal(first.digest,second.digest);
  await assert.rejects(defineBusiness({...input,extra:1} as unknown as BusinessDefinitionInput),{code:'INVALID_ARGUMENT'});
  await assert.rejects(defineBusiness({...input,actions:[action,{...action,title:'Duplicate'}]}),{code:'INVALID_ARGUMENT'});
});

test('business input validation enforces the declared bounded schema',async()=>{
  const definition=await defineBusiness(input);
  assert.deepEqual(validateBusinessInput(definition,'hello.publish',{message:'approved',priority:'low'}),{message:'approved',priority:'low'});
  assert.throws(()=>validateBusinessInput(definition,'hello.publish',{message:'',priority:'low'}),{code:'INVALID_ARGUMENT'});
  assert.throws(()=>validateBusinessInput(definition,'hello.publish',{message:'approved',extra:1}),{code:'INVALID_ARGUMENT'});
  assert.throws(()=>validateBusinessInput(definition,'hello.missing',{}),{code:'INVALID_ARGUMENT'});
});
