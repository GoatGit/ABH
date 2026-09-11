import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MigrationInspectionCleanupError,requireMigrationInspectionDisposal} from '../src/extensions/inspect-migration-target.ts';
test('target cleanup preserves original failures, including non-Error thrown values',async()=>{
 for(const original of [new Error('inspection failed'),undefined,null,'failure']){
  let calls=0;
  await assert.rejects(requireMigrationInspectionDisposal(async()=>{calls++;throw new Error('private disposal detail');},{error:original}),error=>{
   assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],original);assert.ok(error.errors[1] instanceof MigrationInspectionCleanupError);assert.equal(error.errors[1].code,'DEPENDENCY_TIMEOUT');assert.ok(!String(error).includes('private disposal detail'));return true;
  });assert.equal(calls,1);
  try{await requireMigrationInspectionDisposal(async()=>{},{error:original});assert.fail('must preserve failure');}catch(error){assert.equal(error,original);}
 }
});
test('unacknowledged target cleanup remains bounded and late acknowledgement cannot report success',async()=>{
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 const started=Date.now();await assert.rejects(requireMigrationInspectionDisposal(()=>pending),error=>error instanceof MigrationInspectionCleanupError);assert.ok(Date.now()-started<3000);release();
 await requireMigrationInspectionDisposal(async()=>{});
});
