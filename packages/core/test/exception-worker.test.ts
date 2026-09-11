import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {Database} from '../src/data/uow.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {runExceptionWorker} from '../src/human/exception-worker.ts';
import {context} from './database-fixture.ts';

test('shutdown cancels a noncooperating Exception route without starting case creation',{timeout:2000},async()=>{
  const stop=new AbortController(),report={type:'abh.reconciliation',id:randomUUID(),version:1};let calls=0,entered!:()=>void,routeSignal:AbortSignal|undefined;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const database={transaction:async()=>{calls++;if(calls>1)throw new Error('unexpected case creation');return [report];}} as unknown as Database;
  const base=context(),service=deriveVerifiedContext({...base.request,actor:{type:'Service',id:randomUUID()},purposeOfUse:'abh.operation.reconcile'});
  const running=runExceptionWorker(database,{context:async()=>service,signal:stop.signal,grantRefs:[],
    installation:{fenceRefs:async()=>[],eligibility:{lock:async()=>{},candidate:async()=>false,submit:async()=>[],revalidate:async()=>{},conditions:async()=>[]}},
    route:async(ref,options)=>{assert.deepEqual(ref,report);routeSignal=options.signal;assert.ok(options.deadline>Date.now());entered();return new Promise(()=>{});}});
  await started;stop.abort();await running;assert.equal(routeSignal?.aborted,true);assert.equal(calls,1);
});
