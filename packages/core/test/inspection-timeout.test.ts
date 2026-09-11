import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contract} from '../src/data/journal.ts';
import {assessPackInspectionTimeout} from '../src/extensions/inspection-timeout.ts';
const id='11111111-1111-4111-8111-111111111111';
const pending=contract('PackInspectionJobRecord',{jobRef:{type:'abh.pack-inspection-job',id,version:1},resourceOrganizationId:id,packRef:{type:'abh.installed-pack',id,version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Pending',requestedBy:{type:'abh.principal',id,version:1},commandId:id,idempotencyKey:'inspection',requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:0,maxDurationMs:1000,elapsedMs:0}});
test('timeout assessment uses exact expiry and does not charge idle Pending time',()=>{
 assert.throws(()=>assessPackInspectionTimeout(pending,'2026-09-09T23:59:60Z'),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>assessPackInspectionTimeout(pending,'2026-09-09T00:00:59.999999Z'),{code:'PRECONDITION_FAILED'});
 const result=assessPackInspectionTimeout(pending,pending.expiresAt);assert.equal(result.cause,'Expired');assert.equal(result.elapsedMs,0);assert.deepEqual(result.job,pending);
});
test('timeout assessment preserves prior usage and rounds only the Running interval up',()=>{
 const running=contract('PackInspectionJobRecord',{...pending,status:'Running',jobRef:{...pending.jobRef,version:2},updatedAt:'2026-09-09T00:00:00.123456Z',budget:{...pending.budget,attempts:1,elapsedMs:999},lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}});
 assert.throws(()=>assessPackInspectionTimeout(running,running.updatedAt),{code:'PRECONDITION_FAILED'});
 const result=assessPackInspectionTimeout(running,'2026-09-09T00:00:00.123457Z');assert.equal(result.cause,'BudgetExhausted');assert.equal(result.elapsedMs,1000);
 assert.throws(()=>assessPackInspectionTimeout(running,'2026-09-09T00:00:00.123455Z'),{code:'PRECONDITION_FAILED'});
});
