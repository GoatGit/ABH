import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const id='11111111-1111-4111-8111-111111111111';
const job={jobRef:{type:'abh.pack-inspection-job',id,version:2},resourceOrganizationId:id,packRef:{type:'abh.installed-pack',id,version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Running',requestedBy:{type:'abh.principal',id,version:1},commandId:id,idempotencyKey:'wait-test',requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00.123456Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:1,maxDurationMs:1000,elapsedMs:10},lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}};
const block={resourceOrganizationId:id,packRef:job.packRef,packageDigest:job.packageDigest,environmentDigest:job.environmentDigest,deploymentVersion:1,principalRef:job.requestedBy,observedAt:'2026-09-09T00:00:00.123457Z',reason:'Missing'};
const evidence={job,block,assessedAt:'2026-09-09T00:00:00.123458Z',elapsedMs:11};
const valid=(value:unknown)=>validateContract('PackInspectionWaitingEvidence',value).success;
test('Waiting evidence binds blocker to live attempt and conservatively settles microseconds',()=>{
 assert.equal(valid(evidence),true);
 for(const value of [{...evidence,elapsedMs:10},{...evidence,block:{...block,observedAt:job.requestedAt}},{...evidence,block:{...block,environmentDigest:job.packageDigest}},{...evidence,block:{...block,deploymentVersion:2}},{...evidence,block:{...block,packRef:{...block.packRef,id:'21111111-1111-4111-8111-111111111111'}}},{...evidence,assessedAt:job.updatedAt},{...evidence,assessedAt:'2026-09-09T23:59:60Z'},{...evidence,job:{...job,budget:{...job.budget,attempts:3}}},{...evidence,elapsedMs:1000}])assert.equal(valid(value),false);
});
test('Waiting command accepts only formal lease and retention, never caller-selected reason or progress',()=>{
 const command={type:'abh.pack-inspection-jobs.wait',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'wait-1',target:{type:'abh.pack-inspection-job',id},expectedVersion:2,payload:{lease:job.lease,dataClass:'abh.data.internal',region:'local',retentionPolicyRef:job.packRef}};
 assert.equal(validateContract('WaitPackInspectionCommand',command).success,true);
 for(const payload of [{...command.payload,reason:'Missing'},{...command.payload,elapsedMs:0},{...command.payload,block},{...command.payload,lease:undefined}])assert.equal(validateContract('WaitPackInspectionCommand',{...command,payload}).success,false);
 assert.equal(validateContract('PackInspectionBlockEvidence',{...block,reason:'LeaseBusy'}).success,false);
});
test('retry-exhausted evidence requires the final actual blocked Running attempt',()=>{
 const finalJob={...job,budget:{...job.budget,attempts:3}};
 const final={...evidence,job:finalJob,cause:'AttemptsExhausted'};
 const exhausted=(value:unknown)=>validateContract('PackInspectionRetryExhaustedEvidence',value).success;
 assert.equal(exhausted(final),true);assert.equal(valid({...final,cause:undefined}),false);
 for(const value of [{...final,job},{...final,cause:'DurationExhausted'},{...final,elapsedMs:10},{...final,block:{...block,observedAt:job.requestedAt}},{...final,block:{...block,environmentDigest:job.packageDigest}},{...final,block:{...block,reason:'LeaseBusy'}}])assert.equal(exhausted(value),false);
 // Last-attempt diagnostics retain simultaneous duration overrun as evidence.
 assert.equal(exhausted({...final,assessedAt:'2026-09-09T00:00:01.123456Z',elapsedMs:1010}),true);
});
