import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {Database} from '../src/data/uow.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {requestVerifiedContext} from '../src/identity/context-source.ts';
import {runConsumptionWorker} from '../src/durable/consumption-worker.ts';
import {runRecoveryWorker} from '../src/execution/recovery-worker.ts';
import {runTerminalReconciliationWorker} from '../src/execution/terminal-reconciliation-worker.ts';
import {context,options} from './database-fixture.ts';

test('Context refresh propagates a bounded deadline and rejects forged results',async()=>{
  const expected=context(),request=options();
  assert.equal(await requestVerifiedContext(async current=>{
    assert.equal(current.deadline,request.deadline);assert.equal(current.signal.aborted,false);return expected;
  },request),expected);
  await assert.rejects(requestVerifiedContext(async()=>structuredClone(expected),options()),{code:'TENANT_CONTEXT_REQUIRED'});
  let calls=0;
  await assert.rejects(requestVerifiedContext(async()=>{calls++;return expected;},{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(calls,0);
});

test('noncooperating Context refresh times out and signals the installed ingress',async()=>{
  let signal:AbortSignal|undefined;
  await assert.rejects(requestVerifiedContext(async request=>{signal=request.signal;return new Promise(()=>{});},
    {...options(),deadline:Date.now()+30}),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(signal?.aborted,true);
});

test('cancelled Context refresh discards a late authenticated result',async()=>{
  const stop=new AbortController();let resolve!:(value:VerifiedContext)=>void;
  const pending=requestVerifiedContext(async()=>new Promise(done=>{resolve=done;}),{...options(),signal:stop.signal});
  const rejected=assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});
  await new Promise(done=>setImmediate(done));stop.abort();await rejected;
  resolve(context());await new Promise(done=>setImmediate(done));
});

test('recovery and consumption shutdown does not wait for a stuck identity source or access the database',{timeout:2000},async()=>{
  // A sentinel database makes any work after cancellation fail the test.
  let queries=0;
  const database={transaction:async()=>{queries++;throw new Error('unexpected database work');}} as unknown as Database;
  for(const recovery of ['consumption','recovery','terminal']){
    const stop=new AbortController();let entered!:()=>void,sourceSignal:AbortSignal|undefined;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const input={signal:stop.signal,grantRefs:[],context:async(request:ReturnType<typeof options>)=>{
      sourceSignal=request.signal;entered();return new Promise<VerifiedContext>(()=>{});
    }};
    const running=recovery==='recovery'?runRecoveryWorker(database,{...input,workerId:randomUUID()}):recovery==='terminal'?
      runTerminalReconciliationWorker(database,{...input,installation:{rule:()=>{throw new Error('unexpected rule');},fenceRefs:async()=>[],checks:{admit:async()=>{},artifact:async()=>{}}}}):runConsumptionWorker(database,input);
    await started;stop.abort();await running;assert.equal(sourceSignal?.aborted,true);
  }
  assert.equal(queries,0);
});
