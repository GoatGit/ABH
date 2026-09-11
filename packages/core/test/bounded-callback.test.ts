import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedCallback } from '../src/internal/bounded-callback.ts';

test('bounded callback propagates deadline, result and failure without swallowing errors',async()=>{
  const options={deadline:Date.now()+1000,signal:new AbortController().signal};
  assert.equal(await boundedCallback(async received=>{assert.equal(received.deadline,options.deadline);assert.equal(received.signal.aborted,false);return 42;},options),42);
  const failure=new Error('fixture failure');
  await assert.rejects(boundedCallback(async()=>{throw failure;},options),error=>error===failure);
});

test('invalid or cancelled callback admission never invokes installed work',async()=>{
  let calls=0;
  for(const options of [{deadline:NaN,signal:new AbortController().signal},{deadline:Infinity,signal:new AbortController().signal},{deadline:Date.now()-1,signal:new AbortController().signal},{deadline:Date.now()+1000,signal:AbortSignal.abort()}]){
    await assert.rejects(boundedCallback(async()=>{calls++;},options),{code:'DEPENDENCY_TIMEOUT'});
  }
  assert.equal(calls,0);
});

test('timeout cancels a noncooperating callback and a late rejection stays handled',async()=>{
  let signal!:AbortSignal,reject!:(error:Error)=>void;
  await assert.rejects(boundedCallback(async options=>{signal=options.signal;return new Promise((_,failed)=>{reject=failed;});},{deadline:Date.now()+25,signal:new AbortController().signal}),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(signal.aborted,true);reject(new Error('late failure'));
  await new Promise(resolve=>setImmediate(resolve));
});

test('shutdown releases a stuck callback and discards its eventual completion',async()=>{
  const stop=new AbortController();let entered!:()=>void,resolve!:(value:number)=>void,signal!:AbortSignal;
  const started=new Promise<void>(done=>{entered=done;});
  const pending=boundedCallback(async options=>{signal=options.signal;entered();return new Promise<number>(done=>{resolve=done;});},{deadline:Date.now()+1000,signal:stop.signal});
  const rejected=assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});
  await started;stop.abort();await rejected;assert.equal(signal.aborted,true);
  resolve(42);await new Promise(done=>setImmediate(done));
});
