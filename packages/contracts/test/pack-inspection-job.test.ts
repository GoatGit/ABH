import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateContract} from '../src/schema.ts';
import {describeTransition, stateRegistry} from '../src/states.ts';
const id='11111111-1111-4111-8111-111111111111';
const ref=(type:string)=>({type,id,version:1});
const digest='sha256:'+'a'.repeat(64);
const pending={jobRef:ref('abh.pack-inspection-job'),resourceOrganizationId:id,packRef:ref('abh.installed-pack'),packageDigest:digest,environmentDigest:digest,deploymentVersion:1,kind:'StructureAndDataInspection',status:'Pending',requestedBy:ref('abh.principal'),commandId:id,idempotencyKey:'inspect-1',requestedAt:'2026-09-09T00:00:00.123456Z',updatedAt:'2026-09-09T00:00:00.123456Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:0,maxDurationMs:30000,elapsedMs:0}};
const running={...pending,status:'Running',budget:{...pending.budget,attempts:1},lease:{leaseRef:ref('abh.work-lease'),workerId:id,fencingToken:1}};
const diagnostic=(code:string)=>({code,evidenceRefs:[ref('abh.artifact')]});
const succeeded={...pending,status:'Succeeded',budget:{...pending.budget,attempts:1,elapsedMs:500},observation:{artifactRef:ref('abh.artifact'),matched:false}};
const valid=(v:unknown)=>validateContract('PackInspectionJobRecord',v).success;
test('inspection Job distinguishes technical completion from observed business mismatch',()=>{
 for(const v of [pending,running,succeeded,{...succeeded,observation:{...succeeded.observation,matched:true}},{...pending,status:'Waiting',budget:running.budget,diagnostic:diagnostic('Missing')},{...pending,status:'Failed',diagnostic:diagnostic('InspectionFailed')},{...pending,status:'Cancelled',diagnostic:diagnostic('Cancelled')}])assert.equal(valid(v),true,JSON.stringify(v));
});
test('inspection Job rejects missing state evidence and stale lease or observation fields',()=>{
 for(const v of [{...running,lease:undefined},{...pending,lease:running.lease},{...succeeded,observation:undefined},{...running,observation:succeeded.observation},{...pending,status:'Waiting',budget:running.budget},{...pending,status:'Failed'},{...pending,status:'Cancelled',diagnostic:diagnostic('InspectionFailed')},{...pending,status:'Waiting',budget:running.budget,diagnostic:diagnostic('Cancelled')},{...pending,diagnostic:diagnostic('Missing')},{...succeeded,packRef:{...pending.packRef,version:2}},{...pending,extra:true}])assert.equal(valid(v),false,JSON.stringify(v));
});
test('inspection Job preserves cumulative exhaustion and microsecond expiry',()=>{
 const exhausted={...pending,status:'Failed',budget:{...pending.budget,attempts:4,elapsedMs:30001},diagnostic:diagnostic('BudgetExhausted')};
 assert.equal(valid(exhausted),true);
 for(const v of [{...succeeded,updatedAt:pending.expiresAt},{...running,budget:{...running.budget,elapsedMs:30000}},{...running,budget:exhausted.budget},{...pending,budget:running.budget},{...succeeded,budget:pending.budget},{...pending,status:'Waiting',budget:{...running.budget,attempts:3},diagnostic:diagnostic('LeaseBusy')},{...exhausted,budget:running.budget},{...pending,updatedAt:'2026-09-09T00:00:00.123455Z'},{...running,updatedAt:pending.expiresAt},{...pending,status:'Failed',diagnostic:diagnostic('Expired')}])assert.equal(valid(v),false,JSON.stringify(v));
 assert.equal(valid({...pending,status:'Failed',updatedAt:pending.expiresAt,diagnostic:diagnostic('Expired')}),true);
});
test('inspection Job follows normative lifecycle with no terminal restart',()=>{
 for(const [from,to] of [['Pending','Running'],['Pending','Failed'],['Pending','Cancelled'],['Running','Waiting'],['Running','Succeeded'],['Waiting','Running'],['Waiting','Failed'],['Waiting','Cancelled']])assert.ok(describeTransition('PackInspectionJob',from!,to!));
 for(const from of ['Succeeded','Failed','Cancelled'])for(const to of stateRegistry.machines.PackInspectionJob.states)assert.equal(describeTransition('PackInspectionJob',from,to),undefined);
 assert.equal(describeTransition('PackInspectionJob','Waiting','Succeeded'),undefined);
 for(const transition of stateRegistry.machines.PackInspectionJob.transitions)for(const guard of transition.guardIds)assert.equal(stateRegistry.guards[guard].implementation,'OwnerRequired');
});
