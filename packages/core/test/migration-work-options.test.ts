import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {TenantTransaction} from '../src/data/uow.ts';
import {migrationWorkOptions} from '../src/extensions/migration-work-options.ts';
const tx=(signal:AbortSignal)=>({signal,assertActive(){}} as TenantTransaction);
test('migration budgets keep both cancellation sources and the original shorter deadline',()=>{
 for(const source of ['child','parent']){
  const child=new AbortController(),parent=new AbortController(),options={deadline:Date.now()+1000,signal:child.signal,readOnly:true};
  const scoped=migrationWorkOptions(tx(parent.signal),options);assert.equal(scoped.deadline,options.deadline);assert.equal(scoped.readOnly,true);
  options.deadline+=10000;assert.notEqual(scoped.deadline,options.deadline);
  (source==='child'?child:parent).abort();assert.equal(scoped.signal.aborted,true);
  assert.equal((source==='child'?parent:child).signal.aborted,false);
 }
});
test('migration budgets reject pre-cancellation and invalid deadlines before work',()=>{
 const live=new AbortController(),stopped=new AbortController();stopped.abort();
 for(const [parent,child] of [[stopped.signal,live.signal],[live.signal,stopped.signal]])assert.throws(()=>migrationWorkOptions(tx(parent!),{deadline:Date.now()+1000,signal:child!}),{code:'DEPENDENCY_TIMEOUT'});
 for(const deadline of [0,Date.now()-1,NaN,Infinity,Date.now()+0.5])assert.throws(()=>migrationWorkOptions(tx(live.signal),{deadline,signal:live.signal}),{code:'DEPENDENCY_TIMEOUT'});
});
