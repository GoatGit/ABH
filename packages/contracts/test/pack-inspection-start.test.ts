import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import type {StartPackInspectionCommand} from '../generated/types.ts';
const id='11111111-1111-4111-8111-111111111111';
const command:StartPackInspectionCommand={type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'start-1',target:{type:'abh.pack-inspection-job',id},expectedVersion:1,payload:{lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}}};
test('inspection start requires a versioned Job and bounded formal lease identity',()=>{
 assert.equal(validateContract('StartPackInspectionCommand',command).success,true);
 for(const value of [{...command,expectedVersion:undefined},{...command,payload:{lease:{...command.payload.lease,fencingToken:0}}},{...command,payload:{lease:{...command.payload.lease,workerId:'worker'}}},{...command,payload:{...command.payload,attempts:0}},{...command,payload:{...command.payload,status:'Succeeded'}},{...command,target:{...command.target,type:'abh.installed-pack'}}])assert.equal(validateContract('StartPackInspectionCommand',value).success,false);
});
test('inspection start intent binds CAS and lease epoch while command-id replay preserves intent',async()=>{
 const original=await digestCommandIntent(command);
 assert.equal(await digestCommandIntent({...command,commandId:'21111111-1111-4111-8111-111111111111'}),original);
 for(const value of [{...command,expectedVersion:2},{...command,payload:{lease:{...command.payload.lease,fencingToken:2}}},{...command,payload:{lease:{...command.payload.lease,leaseRef:{...command.payload.lease.leaseRef,version:2}}}}])assert.notEqual(await digestCommandIntent(value),original);
});
