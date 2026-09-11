import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestContract} from '../src/digest.ts';
const ref=(type:string)=>({type,id:'00000000-0000-4000-8000-000000000001',version:1});
const source={sourceRef:ref('abh.ledger'),eventOrdinal:0,satisfied:false,evidenceRefs:[ref('abh.ledger')]};
const wait={waitRef:ref('abh.durable-wait'),resourceOrganizationId:ref('abh.organization').id,ownerRef:ref('abh.mission'),waitKey:'condition-1',dueAt:'2026-09-07T10:00:00.000Z',causeRef:ref('abh.event'),authorityRef:ref('abh.mission-authority'),conditionRef:ref('hello.condition'),sourceRef:ref('abh.ledger'),registrationDigest:'sha256:'+'1'.repeat(64),waitingIntentRef:ref('abh.mission'),status:'Pending',source,registeredAt:'2026-09-07T09:00:00.000Z',digest:'sha256:'+'0'.repeat(64)};
test('durable wait terminal state requires matching evidence and a nonregressing source',()=>{
  assert.equal(validateContract('DurableWaitRecord',wait).success,true);
  for(const changed of [{status:'Succeeded'},{status:'Cancelled'},{resolvedAt:'2026-09-07T09:01:00.000Z'},{source:{...source,sourceRef:ref('abh.action')}}])assert.equal(validateContract('DurableWaitRecord',{...wait,...changed}).success,false);
  assert.equal(validateContract('DurableWaitRecord',{...wait,status:'Cancelled',resolvedAt:'2026-09-07T09:01:00.000Z',cancelReason:'Owner cancelled'}).success,true);
  assert.equal(validateContract('DurableWaitRecord',{...wait,status:'Succeeded',resolvedAt:'2026-09-07T09:01:00.000Z',wakeupRef:ref('abh.durable-wakeup')}).success,true);
});
test('wakeup reason binds the source verdict and its digest binds the authority and watermark',async()=>{
  const wake={wakeupRef:ref('abh.durable-wakeup'),resourceOrganizationId:wait.resourceOrganizationId,waitRef:wait.waitRef,ownerRef:wait.ownerRef,authorityRef:wait.authorityRef,reason:'Deadline',source,createdAt:wait.dueAt,digest:wait.digest};
  assert.equal(validateContract('DurableWakeupRecord',wake).success,true);
  assert.equal(validateContract('DurableWakeupRecord',{...wake,reason:'Condition'}).success,false);
  assert.equal(validateContract('DurableWakeupRecord',{...wake,source:{...source,satisfied:true}}).success,false);
  assert.notEqual(await digestContract('DurableWakeupRecord',wake),await digestContract('DurableWakeupRecord',{...wake,authorityRef:{...wake.authorityRef,version:2}}));
  assert.notEqual(await digestContract('DurableWakeupRecord',wake),await digestContract('DurableWakeupRecord',{...wake,source:{...source,eventOrdinal:1}}));
});
test('Wait Port receipts bind method, source event and exact returned reference',()=>{
  const receipt={receiptRef:ref('abh.wait-port-receipt'),resourceOrganizationId:wait.resourceOrganizationId,waitRef:wait.waitRef,method:'scheduleWakeup',inputDigest:wait.digest,result:{waitRef:wait.waitRef},recordedAt:wait.registeredAt,digest:wait.digest};
  assert.equal(validateContract('WaitPortReceiptRecord',receipt).success,true);
  assert.equal(validateContract('WaitPortReceiptRecord',{...receipt,method:'signal'}).success,false);
  const signal={...receipt,method:'signal',triggerEventRef:ref('abh.event'),result:{waitRef:wait.waitRef,wakeupRef:receipt.receiptRef}};
  assert.equal(validateContract('WaitPortReceiptRecord',signal).success,true);
  assert.equal(validateContract('WaitPortReceiptRecord',{...signal,result:{...signal.result,wakeupRef:ref('abh.durable-wakeup')}}).success,false);
  assert.equal(validateContract('WaitPortReceiptRecord',{...signal,result:{...signal.result,waitRef:{...wait.waitRef,version:2}}}).success,false);
});
test('Operation waiting distinguishes cancellation and deadline notification from operation finality',()=>{
  const record={bindingRef:ref('abh.operation-wait'),resourceOrganizationId:wait.resourceOrganizationId,actionRef:ref('abh.action'),operationRef:ref('abh.operation'),waitRef:wait.waitRef,authorityRef:ref('abh.grant'),payloadDigest:wait.digest,outcome:'Waiting',recordedAt:wait.registeredAt,digest:wait.digest};
  assert.equal(validateContract('OperationWaitRecord',record).success,true);
  assert.equal(validateContract('OperationWaitRecord',{...record,outcome:'SourceClosed'}).success,false);
  assert.equal(validateContract('OperationWaitRecord',{...record,outcome:'Deadline',wakeupRef:ref('abh.durable-wakeup')}).success,true);
  assert.equal(validateContract('OperationWaitRecord',{...record,outcome:'Cancelled',cancelledWaitRef:{...wait.waitRef,version:2}}).success,true);
  assert.equal(validateContract('OperationWaitRecord',{...record,outcome:'Cancelled',wakeupRef:ref('abh.durable-wakeup')}).success,false);
});
