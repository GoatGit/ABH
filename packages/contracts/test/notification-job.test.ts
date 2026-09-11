import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {validateContract} from '../src/schema.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});
test('Operation wait notification is distinct from authority-bearing reconciliation',()=>{
  const job={jobType:'abh.operation.notify-wait',targetRef:ref('abh.operation'),commandRef:ref('abh.command'),dedupeKey:'wait-notification',
    notBefore:'2026-09-08T00:00:00Z',deadline:'2026-09-09T00:00:00Z',causeRef:ref('abh.event')};
  assert.equal(validateContract('JobEnvelope',job).success,true);
  assert.equal(validateContract('JobEnvelope',{...job,targetRef:ref('abh.action')}).success,false);
  assert.equal(validateContract('JobEnvelope',{...job,jobType:'abh.operation.reconcile'}).success,false);
  assert.equal(validateContract('JobEnvelope',{...job,jobType:'abh.operation.reconcile',authorityRef:ref('abh.execution-authority')}).success,true);
});
