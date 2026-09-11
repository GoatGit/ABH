import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import type {CompletePackInspectionCommand} from '../generated/types.ts';
const id='11111111-1111-4111-8111-111111111111';
const command:CompletePackInspectionCommand={type:'abh.pack-inspection-jobs.complete',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'complete-1',target:{type:'abh.pack-inspection-job',id},expectedVersion:2,payload:{lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1},observationRef:{type:'abh.artifact',id,version:2}}};
test('completion requires exact observation and lease refs, never caller-supplied match or usage',()=>{
 assert.equal(validateContract('CompletePackInspectionCommand',command).success,true);
 for(const value of [{...command,payload:{...command.payload,matched:true}},{...command,payload:{...command.payload,elapsedMs:0}},{...command,payload:{lease:command.payload.lease}},{...command,payload:{observationRef:command.payload.observationRef}},{...command,expectedVersion:undefined},{...command,payload:{...command.payload,observationRef:{...command.payload.observationRef,type:'abh.installed-pack'}}}])assert.equal(validateContract('CompletePackInspectionCommand',value).success,false);
});
test('completion intent binds observation, expected progress version and fencing epoch',async()=>{
 const original=await digestCommandIntent(command);
 for(const value of [{...command,expectedVersion:3},{...command,payload:{...command.payload,observationRef:{...command.payload.observationRef,version:3}}},{...command,payload:{...command.payload,lease:{...command.payload.lease,fencingToken:2}}}])assert.notEqual(await digestCommandIntent(value),original);
});
