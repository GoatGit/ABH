import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
const ref=(type:string,version=1)=>({type,id:randomUUID(),version});
test('lease loss evidence distinguishes renewal from takeover and retains exact wall time',()=>{
 const pack=ref('abh.installed-pack'),token={leaseRef:ref('abh.work-lease'),workerId:randomUUID(),fencingToken:1},org=randomUUID();
 const job={jobRef:ref('abh.pack-inspection-job',2),resourceOrganizationId:org,packRef:pack,packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Running',requestedBy:ref('abh.principal'),commandId:randomUUID(),idempotencyKey:randomUUID(),requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:01Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:1,maxDurationMs:30000,elapsedMs:2},lease:token};
 const lease={...token,leaseRef:{...token.leaseRef,version:2},resourceOrganizationId:org,targetRef:pack,executionPrincipalRef:ref('abh.principal'),leaseUntil:'2026-09-09T00:00:05Z'};
 const e={job,observedLease:lease,assessedAt:lease.leaseUntil,elapsedMs:4002,cause:'Expired',disposition:'InspectionFailed'};
 assert.equal(validateContract('PackInspectionLeaseLossEvidence',e).success,true);
 for(const patch of [{cause:'Replaced'},{elapsedMs:4001},{disposition:'BudgetExhausted'},{observedLease:{...lease,leaseUntil:'2026-09-09T00:00:05.000001Z'}},{observedLease:{...lease,workerId:randomUUID()}},{observedLease:{...lease,leaseRef:ref('abh.work-lease',2)}},{observedLease:{...lease,targetRef:ref('abh.installed-pack')}},{observedLease:{...lease,resourceOrganizationId:randomUUID()}}])assert.equal(validateContract('PackInspectionLeaseLossEvidence',{...e,...patch}).success,false);
 const replaced={...e,cause:'Replaced',observedLease:{...lease,workerId:randomUUID(),fencingToken:2,leaseUntil:'2026-09-09T00:00:20Z'}};
 assert.equal(validateContract('PackInspectionLeaseLossEvidence',replaced).success,true);
 assert.equal(validateContract('PackInspectionLeaseLossEvidence',{...replaced,observedLease:{...replaced.observedLease,leaseRef:{...lease.leaseRef,version:1}}}).success,false);
 assert.equal(validateContract('PackInspectionLeaseLossEvidence',{...e,job:{...job,budget:{...job.budget,maxDurationMs:4002}},disposition:'BudgetExhausted'}).success,true);
});
