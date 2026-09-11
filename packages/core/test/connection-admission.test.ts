import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ConnectionAdmission} from '../src/data/connection-admission.ts';

const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});

test('connection admission bounds its queue and close rejects pending and future entrants',async()=>{
  const admission=new ConnectionAdmission(1),release=await admission.acquire(options());
  const waiting=Array.from({length:1000},()=>assert.rejects(admission.acquire(options()),{code:'PRECONDITION_FAILED'}));
  await assert.rejects(admission.acquire(options()),{code:'LIMIT_EXCEEDED'});
  admission.close();await Promise.all(waiting);
  release();release();
  await assert.rejects(admission.acquire(options()),{code:'PRECONDITION_FAILED'});
});

test('cancelled waiter frees capacity for the next live waiter without consuming a connection',async()=>{
  const admission=new ConnectionAdmission(1),release=await admission.acquire(options()),stop=new AbortController();
  const cancelled=assert.rejects(admission.acquire({...options(),signal:stop.signal}),{code:'DEPENDENCY_TIMEOUT'});
  let entered=false;
  const next=admission.acquire(options()).then(release=>{entered=true;return release;});
  stop.abort();await cancelled;assert.equal(entered,false);
  release();(await next)();assert.equal(entered,true);
  (await admission.acquire(options()))();admission.close();
});
