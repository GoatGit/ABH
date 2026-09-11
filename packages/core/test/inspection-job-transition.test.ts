import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PackInspectionJobRecord} from '@abh/contracts';
import {validatePackInspectionJobTransition} from '../src/extensions/inspection-job-transition.ts';
const id='11111111-1111-4111-8111-111111111111',digest='sha256:'+'a'.repeat(64);
const pending:PackInspectionJobRecord={jobRef:{type:'abh.pack-inspection-job',id,version:1},resourceOrganizationId:id,packRef:{type:'abh.installed-pack',id,version:1},packageDigest:digest,environmentDigest:digest,deploymentVersion:1,kind:'StructureAndDataInspection',status:'Pending',requestedBy:{type:'abh.principal',id,version:1},commandId:id,idempotencyKey:'inspect-1',requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:0,maxDurationMs:30000,elapsedMs:0}};
const running:PackInspectionJobRecord={...pending,jobRef:{...pending.jobRef,version:2},status:'Running',budget:{...pending.budget,attempts:1},lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}};
const waiting:PackInspectionJobRecord={...pending,jobRef:{...pending.jobRef,version:3},status:'Waiting',budget:{...running.budget,elapsedMs:200},diagnostic:{code:'Missing',evidenceRefs:[{type:'abh.artifact',id,version:1}]}};
test('inspection progress retries retain cumulative attempts and duration',()=>{
 assert.deepEqual(validatePackInspectionJobTransition(pending,running),running);
 assert.deepEqual(validatePackInspectionJobTransition(running,waiting),waiting);
 const resumed:PackInspectionJobRecord={...running,jobRef:{...pending.jobRef,version:4},budget:{...waiting.budget,attempts:2}};
 assert.deepEqual(validatePackInspectionJobTransition(waiting,resumed),resumed);
 for(const after of [{...resumed,budget:{...resumed.budget,attempts:1}},{...resumed,budget:{...resumed.budget,elapsedMs:0}},{...resumed,budget:{...resumed.budget,maxAttempts:4}},{...resumed,budget:{...resumed.budget,maxDurationMs:60000}}])assert.throws(()=>validatePackInspectionJobTransition(waiting,after));
});
test('inspection progress rejects rebinding, stale CAS versions and terminal restart',()=>{
 for(const after of [{...running,jobRef:pending.jobRef},{...running,environmentDigest:('sha256:'+'b'.repeat(64)) as typeof digest},{...running,deploymentVersion:2},{...running,expiresAt:'2026-09-09T00:02:00Z'},{...running,idempotencyKey:'replacement'}])assert.throws(()=>validatePackInspectionJobTransition(pending,after));
 const done:PackInspectionJobRecord={...pending,budget:waiting.budget,jobRef:{...pending.jobRef,version:3},status:'Succeeded',observation:{artifactRef:{type:'abh.artifact',id,version:1},matched:false}};
 assert.equal(validatePackInspectionJobTransition(running,done).observation?.matched,false);
 assert.throws(()=>validatePackInspectionJobTransition(done,{...running,jobRef:{...pending.jobRef,version:4},budget:{...done.budget,attempts:2}}));
});
test('final allowed attempt can still succeed, while a proven blocked final attempt fails without budget reset',()=>{
 const before={...running,budget:{...running.budget,maxAttempts:1}};
 const finished={...pending,jobRef:{...pending.jobRef,version:3},status:'Succeeded' as const,budget:{...before.budget,elapsedMs:500},observation:{artifactRef:{type:'abh.artifact' as const,id,version:2},matched:false}};
 assert.equal(validatePackInspectionJobTransition(before,finished).status,'Succeeded');
 const failed={...pending,jobRef:{...pending.jobRef,version:3},status:'Failed' as const,budget:{...before.budget,elapsedMs:500},diagnostic:{code:'BudgetExhausted' as const,evidenceRefs:[{type:'abh.artifact' as const,id,version:2}]}};
 assert.equal(validatePackInspectionJobTransition(before,failed).budget.attempts,1);
 assert.throws(()=>validatePackInspectionJobTransition(before,{...failed,status:'Waiting',diagnostic:{code:'Missing',evidenceRefs:failed.diagnostic.evidenceRefs}}));
});
