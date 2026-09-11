import assert from 'node:assert/strict';
import {test} from 'node:test';
import {contract} from '../src/data/journal.ts';
import {CoreError} from '../src/internal/errors.ts';
import {MigrationInspectionCleanupError} from '../src/extensions/inspect-migration-target.ts';
import {observePackInspectionAttempt,matchPackInspectionFailure,assessPackInspectionFailure} from '../src/extensions/inspection-failure.ts';
const id='11111111-1111-4111-8111-111111111111';
const pending=contract('PackInspectionJobRecord',{jobRef:{type:'abh.pack-inspection-job',id,version:1},resourceOrganizationId:id,packRef:{type:'abh.installed-pack',id,version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Pending',requestedBy:{type:'abh.principal',id,version:1},commandId:id,idempotencyKey:'inspection',requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:0,maxDurationMs:1000,elapsedMs:0}});
const running=contract('PackInspectionJobRecord',{...pending,status:'Running',jobRef:{...pending.jobRef,version:2},budget:{...pending.budget,attempts:1},lease:{leaseRef:{type:'abh.work-lease',id,version:1},workerId:id,fencingToken:1}});
test('only rejected actual attempts produce original capabilities; clones and changed jobs reject',async()=>{
 assert.deepEqual(await observePackInspectionAttempt(running,async()=>42),{ok:true,value:42});
 await assert.rejects(observePackInspectionAttempt(pending,async()=>42),{code:'PRECONDITION_FAILED'});
 const original=new Error('postgres://secret:password@private/database');
 const outcome=await observePackInspectionAttempt(running,async phase=>{phase('Inspection');throw original;});
 assert.equal(outcome.ok,false);if(outcome.ok)return;
 assert.equal(outcome.error,original);
 const evidence=assessPackInspectionFailure(outcome.failure,running,running.updatedAt);
 assert.equal(evidence.phase,'Inspection');assert.equal(evidence.classification,'UnexpectedFailure');
 assert.equal(evidence.cleanupUnacknowledged,false);assert.equal(evidence.disposition,'InspectionFailed');
 assert.ok(!JSON.stringify(evidence).includes('password'));
 assert.throws(()=>matchPackInspectionFailure(structuredClone(outcome.failure)),{code:'PRECONDITION_FAILED'});
 assert.throws(()=>assessPackInspectionFailure(outcome.failure,{...running,environmentDigest:'sha256:'+'c'.repeat(64)},running.updatedAt),{code:'VERSION_CONFLICT'});
 const copy=matchPackInspectionFailure(outcome.failure);copy.job.budget.elapsedMs=55;
 assert.equal(matchPackInspectionFailure(outcome.failure).job.budget.elapsedMs,0);
});
test('nested cleanup failures retain marker without raw exceptions and cyclic aggregates are bounded',async()=>{
 const error=new AggregateError([new CoreError('INVALID_ARGUMENT'),new MigrationInspectionCleanupError()],'secret');error.errors.push(error);
 const outcome=await observePackInspectionAttempt(running,async()=>{throw error;});assert.equal(outcome.ok,false);if(outcome.ok)return;
 const evidence=assessPackInspectionFailure(outcome.failure,running,running.updatedAt);
 assert.equal(evidence.cleanupUnacknowledged,true);assert.ok(!JSON.stringify(evidence).includes('secret'));
});
test('failure assessment preserves microsecond budget and expiry precedence',async()=>{
 const outcome=await observePackInspectionAttempt(running,async phase=>{phase('Completion');throw new CoreError('DEPENDENCY_TIMEOUT');});if(outcome.ok)throw new Error('expected rejection');
 const early=assessPackInspectionFailure(outcome.failure,running,'2026-09-09T00:00:00.000001Z');assert.equal(early.elapsedMs,1);assert.equal(early.classification,'DependencyTimeout');
 assert.equal(assessPackInspectionFailure(outcome.failure,running,'2026-09-09T00:00:01Z').disposition,'BudgetExhausted');
 assert.throws(()=>assessPackInspectionFailure(outcome.failure,running,'2026-09-08T23:59:59.999999Z'),{code:'PRECONDITION_FAILED'});
 const long={...running,budget:{...running.budget,maxDurationMs:100000}};
 const expired=await observePackInspectionAttempt(long,async()=>{throw undefined;});if(expired.ok)throw new Error('expected rejection');
 assert.equal(expired.error,undefined);assert.equal(assessPackInspectionFailure(expired.failure,long,pending.expiresAt).disposition,'Expired');
 const invalid={...early,elapsedMs:0};assert.throws(()=>contract('PackInspectionFailureEvidence',invalid),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>contract('PackInspectionFailureEvidence',{...early,message:'secret'}),{code:'INVALID_ARGUMENT'});
});

test('opaque exceptions and throwing accessors cannot replace the original failure',async()=>{
 const revoked=Proxy.revocable({},{});revoked.revoke();
 let accessed=0;
 const core=new CoreError('INVALID_ARGUMENT');Object.defineProperty(core,'code',{get(){accessed++;throw new Error('must not inspect getter');}});
 const aggregate=new AggregateError([],'private');
 Object.defineProperty(aggregate.errors,'0',{get(){accessed++;throw new Error('must not inspect child getter');},configurable:true});
 aggregate.errors[1]=new MigrationInspectionCleanupError();
 Object.defineProperty(aggregate.errors,Symbol.iterator,{get(){accessed++;throw new Error('must not iterate errors');}});
 for(const error of [revoked.proxy,core,aggregate]){
  const result=await observePackInspectionAttempt(running,async()=>{throw error;});assert.equal(result.ok,false);if(result.ok)return;
  assert.equal(result.error,error);
  const evidence=assessPackInspectionFailure(result.failure,running,running.updatedAt);
  assert.equal(evidence.classification,'UnexpectedFailure');assert.equal(evidence.cleanupUnacknowledged,error===aggregate);
 }
 assert.equal(accessed,0);
});
