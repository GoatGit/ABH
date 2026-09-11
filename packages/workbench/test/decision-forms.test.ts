import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {DecisionView} from '@abh/contracts';
import {contractDecisionFormsAdapter} from '../src/lib/decision-forms.ts';
import {
  validateDecisionFormInput,validateDecisionFormTemplate,
} from '../src/lib/decision-forms-validation.ts';

const decision={
  decisionRef:{type:'abh.decision',id:'00000000-0000-4000-8000-000000000001',version:3},
  package:{allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)},
  status:'Pending',
} as unknown as DecisionView;

test('contract decision forms are registered per allowed response',async()=>{
  const forms=await contractDecisionFormsAdapter.resolve({
    session:{} as never,decision,
  });
  assert.equal(forms?.length,2);
  assert.ok(forms?.every(validateDecisionFormTemplate));
  assert.deepEqual(forms?.map(form=>form.response),['Approved','Rejected']);
});

test('decision form input accepts only bounded public payload fields',async()=>{
  const forms=await contractDecisionFormsAdapter.resolve({
    session:{} as never,decision,
  });
  const form=forms![0]!;
  const condition={type:'abh.condition',id:'00000000-0000-4000-8000-000000000002',version:2};
  const reauth={type:'abh.reauth-proof',id:'00000000-0000-4000-8000-000000000003',version:1};
  assert.equal(validateDecisionFormInput(form.inputSchema,{
    reason:'approved after review',conditionRefs:[condition],reauthProofRef:reauth,
  }).success,true);
  assert.equal(validateDecisionFormInput(form.inputSchema,{unexpected:'x'}).success,false);
  assert.equal(validateDecisionFormInput(form.inputSchema,{conditionRefs:[{
    ...condition,type:'abh.action'}]}).success,false);
  assert.equal(validateDecisionFormInput(form.inputSchema,{conditionRefs:[{
    ...condition,id:'not-a-uuid'}]}).success,false);
  assert.equal(validateDecisionFormInput(form.inputSchema,{reason:'   '}).success,false);
  assert.equal(validateDecisionFormInput(form.inputSchema,{reason:'x'.repeat(2001)}).success,false);
});
