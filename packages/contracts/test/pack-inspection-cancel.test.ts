import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {digestCommandIntent} from '../src/digest.ts';
import type {CancelPackInspectionCommand} from '../generated/types.ts';
const id='11111111-1111-4111-8111-111111111111';
const job={jobRef:{type:'abh.pack-inspection-job',id,version:2},resourceOrganizationId:id,packRef:{type:'abh.installed-pack',id,version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Running',requestedBy:{type:'abh.principal',id,version:1},commandId:id,idempotencyKey:'cancel-test',requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00.123456Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:1,maxDurationMs:1000,elapsedMs:10},lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}};
const evidence={job,assessedAt:'2026-09-09T00:00:00.123457Z',elapsedMs:11,disposition:'Cancelled',reason:'OperatorRequested',basisRef:{type:'abh.artifact',id,version:2},actorRef:job.requestedBy,commandId:id};
const valid=(value:unknown)=>validateContract('PackInspectionCancellationEvidence',value).success;
test('cancellation evidence retains exact usage and cannot hide exhausted work',()=>{
 assert.equal(valid(evidence),true);
 assert.equal(valid({...evidence,assessedAt:'2026-09-09T00:00:01.123457Z',elapsedMs:1011,disposition:'BudgetExhausted'}),true);
 for(const value of [{...evidence,elapsedMs:10},{...evidence,disposition:'BudgetExhausted'},{...evidence,assessedAt:'2026-09-09T00:00:01.123457Z',elapsedMs:1011},{...evidence,assessedAt:'2026-09-09T00:00:00.123455Z'},{...evidence,assessedAt:'2026-09-09T23:59:60Z'},{...evidence,basisRef:undefined},{...evidence,reason:'arbitrary'}])assert.equal(valid(value),false);
});
test('Pending cancellation can occur after expiry without charging idle time',()=>{
 const pending={...job,status:'Pending',lease:undefined,budget:{...job.budget,attempts:0,elapsedMs:0}};
 assert.equal(valid({...evidence,job:pending,assessedAt:job.expiresAt,elapsedMs:0}),true);
 assert.equal(valid({...evidence,job:pending,assessedAt:job.expiresAt,elapsedMs:60000}),false);
});
test('cancellation intent binds basis and bounded reason and does not accept caller-set usage',async()=>{
 const command:CancelPackInspectionCommand={type:'abh.pack-inspection-jobs.cancel',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'cancel-1',target:{type:'abh.pack-inspection-job',id},expectedVersion:2,payload:{reason:'OperatorRequested',basisRef:{type:'abh.artifact',id,version:2},dataClass:'abh.data.internal',region:'local',retentionPolicyRef:{type:'abh.installed-pack',id,version:1}}};
 assert.equal(validateContract('CancelPackInspectionCommand',command).success,true);
 for(const payload of [{...command.payload,elapsedMs:0},{...command.payload,disposition:'Cancelled'},{...command.payload,basisRef:undefined}])assert.equal(validateContract('CancelPackInspectionCommand',{...command,payload}).success,false);
 const original=await digestCommandIntent(command);
 assert.notEqual(await digestCommandIntent({...command,payload:{...command.payload,reason:'Superseded'}}),original);
 assert.notEqual(await digestCommandIntent({...command,payload:{...command.payload,basisRef:{...command.payload.basisRef,version:3}}}),original);
});
