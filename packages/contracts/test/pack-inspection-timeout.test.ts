import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const id='11111111-1111-4111-8111-111111111111';
const job={jobRef:{type:'abh.pack-inspection-job',id,version:2},resourceOrganizationId:id,packRef:{type:'abh.installed-pack',id,version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Running',requestedBy:{type:'abh.principal',id,version:1},commandId:id,idempotencyKey:'inspect-1',requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00.123456Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:1,maxDurationMs:1000,elapsedMs:999},lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}};
const evidence={job,assessedAt:'2026-09-09T00:00:00.123457Z',elapsedMs:1000,cause:'BudgetExhausted'};
const valid=(v:unknown)=>validateContract('PackInspectionTimeoutEvidence',v).success;
test('timeout evidence conservatively rounds Running microseconds and rejects forged time/budget',()=>{
 assert.equal(valid(evidence),true);
 for(const value of [{...evidence,assessedAt:'2026-09-09T23:59:60Z'},{...evidence,elapsedMs:999},{...evidence,cause:'Expired'},{...evidence,assessedAt:'2026-09-09T00:00:00.123455Z'},{...evidence,job:{...job,budget:{...job.budget,elapsedMs:0}}},{...evidence,job:{...job,status:'Succeeded',lease:undefined,observation:{artifactRef:{type:'abh.artifact',id,version:2},matched:true}}}])assert.equal(valid(value),false);
});
test('Pending deadline evidence does not charge idle time and must reach exact expiry',()=>{
 const pending={...job,status:'Pending',lease:undefined,budget:{...job.budget,attempts:0,elapsedMs:0}};
 const expired={job:pending,assessedAt:job.expiresAt,elapsedMs:0,cause:'Expired'};
 assert.equal(valid(expired),true);assert.equal(valid({...expired,elapsedMs:60000}),false);
 assert.equal(valid({...expired,assessedAt:'2026-09-09T00:00:59.999999Z'}),false);
});
test('expiry command cannot accept caller-selected time, cause or budget',()=>{
 const command={type:'abh.pack-inspection-jobs.expire',schemaVersion:'0.1.0',commandId:id,idempotencyKey:'expire-1',target:{type:'abh.pack-inspection-job',id},expectedVersion:2,payload:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:{type:'abh.organization',id,version:1}}};
 assert.equal(validateContract('ExpirePackInspectionCommand',command).success,true);
 for(const payload of [{...command.payload,assessedAt:job.expiresAt},{...command.payload,elapsedMs:1000},{...command.payload,cause:'Expired'}])assert.equal(validateContract('ExpirePackInspectionCommand',{...command,payload}).success,false);
});
