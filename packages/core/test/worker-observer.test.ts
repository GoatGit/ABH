import {joinRuntimeLoops} from '../src/durable/runtime-host.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Database, TransactionOptions } from '../src/data/uow.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import { context } from './database-fixture.ts';
import { runResponsibilityExpiryWorker } from '../src/human/expiry-worker.ts';
import { runResponsibilityRoutingWorker } from '../src/human/routing-worker.ts';
import { runExceptionWorker } from '../src/human/exception-worker.ts';
import { runRecoveryWorker } from '../src/execution/recovery-worker.ts';
import { runTerminalReconciliationWorker } from '../src/execution/terminal-reconciliation-worker.ts';
import { runConsumptionWorker } from '../src/durable/consumption-worker.ts';
import { runOutboxPublisher } from '../src/durable/publisher.ts';

// Lifecycle fixtures return an already-completed empty scan, never simulate Owner authorization.
const workers = [
  ['expiry', 'abh.runtime.deliver', runResponsibilityExpiryWorker],
  ['routing', 'abh.action.prepare', runResponsibilityRoutingWorker],
  ['exception', 'abh.operation.reconcile', runExceptionWorker],
  ['recovery', 'abh.operation.reconcile', runRecoveryWorker],
  ['terminal', 'abh.operation.reconcile', runTerminalReconciliationWorker],
  ['consumption', 'abh.runtime.deliver', runConsumptionWorker],
  ['publisher', 'abh.runtime.deliver', runOutboxPublisher],
] as const;

for (const [name, purposeOfUse, run] of workers) test(`${name} observer cannot retain worker during shutdown`, {timeout:2000}, async()=>{
  const stop=new AbortController();let entered!:()=>void,callbackSignal:AbortSignal|undefined,scans=0;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const c=deriveVerifiedContext({...context().request,actor:{type:'Service',id:randomUUID()},purposeOfUse});
  const database={transaction:async()=>{scans++;return [];}} as unknown as Database;
  const input={context:async()=>c,signal:stop.signal,grantRefs:[],workerId:randomUUID(),router:{eventTypes:[]},
    onPage:async(_result:unknown,options:TransactionOptions)=>{
      assert.ok(options.deadline>Date.now());assert.ok(options.deadline<=Date.now()+10000);
      callbackSignal=options.signal;entered();return new Promise<void>(()=>{});
    }};
  const running=run(database,input as never);
  await started;stop.abort();await running;
  assert.equal(callbackSignal?.aborted,true);assert.equal(scans,1);
});

for (const [name, purposeOfUse, run] of workers) test(`${name} observer failure remains a host-visible failure`,async()=>{
  let scans=0;const failure=new Error('fixture observer failure');
  const c=deriveVerifiedContext({...context().request,actor:{type:'Service',id:randomUUID()},purposeOfUse});
  const database={transaction:async()=>{scans++;return [];}} as unknown as Database;
  const input={context:async()=>c,signal:new AbortController().signal,grantRefs:[],workerId:randomUUID(),router:{eventTypes:[]},onPage:async()=>{throw failure;}};
  await assert.rejects(run(database,input as never),error=>error===failure);
  assert.equal(scans,1);
});


test('a failing sibling can drain a worker held in its observer', {timeout:2000}, async()=>{
  const failure=new Error('fixture sibling failure');let entered!:()=>void,observerSignal:AbortSignal|undefined;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const c=deriveVerifiedContext({...context().request,actor:{type:'Service',id:randomUUID()},purposeOfUse:'abh.runtime.deliver'});
  const database={transaction:async()=>[]} as unknown as Database;
  await assert.rejects(joinRuntimeLoops(new AbortController().signal,[
    signal=>runResponsibilityExpiryWorker(database,{signal,context:async()=>c,grantRefs:[],onPage:async(_result,options)=>{observerSignal=options.signal;entered();return new Promise<void>(()=>{});}}),
    async()=>{await started;throw failure;},
  ]),error=>error===failure);
  assert.equal(observerSignal?.aborted,true);
});
