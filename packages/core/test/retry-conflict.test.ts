import assert from 'node:assert/strict';
import {test} from 'node:test';
import postgres from 'postgres';
import {retryDatabaseConflict} from '../src/data/retry-conflict.ts';
import {CoreError} from '../src/internal/errors.ts';
const options=()=>({deadline:Date.now()+15000,signal:new AbortController().signal});
const conflict=(code='55P03')=>Object.assign(new postgres.PostgresError('conflict'),{code});
test('database conflict retries are bounded and retain the same deadline',async()=>{
 const limits=options();let attempts=0;
 const failure=conflict();
 await assert.rejects(retryDatabaseConflict(limits,async current=>{
  assert.equal(current.deadline,limits.deadline);attempts++;throw failure;
 }),error=>error===failure);
 assert.equal(attempts,4);
});
test('only recognized PostgreSQL conflicts retry; authority and ambiguous failures propagate',async()=>{
 for(const failure of [new CoreError('FORBIDDEN'),Object.assign(new Error('lookalike'),{code:'55P03'}),conflict('08006'),conflict('57014')]){
  let attempts=0;await assert.rejects(retryDatabaseConflict(options(),async()=>{attempts++;throw failure;}),error=>error===failure);assert.equal(attempts,1);
 }
 for(const code of ['55P03','40P01','40001']){
  let attempts=0;assert.equal(await retryDatabaseConflict(options(),async()=>{if(++attempts===1)throw conflict(code);return 'committed';}),'committed');assert.equal(attempts,2);
 }
});
test('cancel and insufficient deadline prevent subsequent conflict attempts',async()=>{
 const stop=new AbortController();let attempts=0;
 const pending=retryDatabaseConflict({...options(),signal:stop.signal},async()=>{attempts++;setTimeout(()=>stop.abort(),10);throw conflict();});
 await assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});assert.equal(attempts,1);
 attempts=0;const failure=conflict();await assert.rejects(retryDatabaseConflict({...options(),deadline:Date.now()+100},async()=>{attempts++;throw failure;}),error=>error===failure);assert.equal(attempts,1);
 await assert.rejects(retryDatabaseConflict({...options(),deadline:Date.now()-1},async()=>{throw new Error('must not run');}),{code:'DEPENDENCY_TIMEOUT'});
});
