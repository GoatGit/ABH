import {checkPackInspectionDiagnostic} from './pack-inspection-diagnostic-fixture.ts';
import {runPackInspectionJobWorker} from '../src/extensions/inspection-job-worker.ts';
import type {PackInspectionJobExecution} from '../src/extensions/run-pack-inspection-job.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,FailLostPackInspectionCommand,InstalledPackRecord,GrantRecord} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {failLostPackInspection} from '../src/extensions/fail-lost-pack-inspection.ts';
import {startPackInspection} from '../src/extensions/start-pack-inspection.ts';
import {claimPackInspectionLease,renewPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {WorkLeaseOwner} from '../src/durable/work-leases.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionLeaseLoss(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,create:()=>Promise<EntityRef>,config:(ref:EntityRef)=>PackInspectionJobExecution){
 const grants=[grant],checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 for(const mode of ['Expired','Replaced','Worker']){
  const takeover=mode==='Replaced';
  const job=await create();let lease=await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID());
  const running=await startPackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:job.version,payload:{lease:{leaseRef:{...lease.leaseRef,type:'abh.work-lease'},workerId:lease.workerId,fencingToken:lease.fencingToken}}},grants,{installation,grants,token:lease},checks);
  const command:FailLostPackInspectionCommand={type:'abh.pack-inspection-jobs.fail-lost-lease',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:running.version,payload:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:installation.packRef}};
  const fail=()=>failLostPackInspection(f.database,c,options(),command,grants,checks);
  lease=await renewPackInspectionLease(f.database,c,options(),installation,grants,lease);
  await checkPackInspectionDiagnostic(f,c,running,grants,'ObserveRunning');
  await assert.rejects(fail,{code:'PRECONDITION_FAILED'});
  await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);
  const replacement=takeover?await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID()):undefined;
  try{
   const diagnostic=await checkPackInspectionDiagnostic(f,c,running,grants,'SettleLostLease');assert.equal(diagnostic.leaseLoss,takeover?'Replaced':'Expired');
   let calls=0;
   await assert.rejects(failLostPackInspection(f.database,c,options(),command,grants,{...checks,current:async()=>{if(++calls===2)throw new Error('loss final denied');}}),/loss final denied/);
   assert.equal((await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,running,async()=>{}))).status,'Running');
   await assert.rejects(failLostPackInspection(f.database,c,options(),command,[],checks),{code:'AUTHORITY_REQUIRED'});
   let failed:EntityRef;
   if(mode==='Worker'){
    const stop=new AbortController();let settled=0;
    // An independently issued recovery Grant deliberately lacks Start authority.
    const [original]=await f.admin`SELECT record FROM control.grants WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${grant.id}`;
    const recovery:GrantRecord={...original!.record,grantRef:{type:'abh.grant',id:randomUUID(),version:1},actionTypes:['abh.packs.record-data-impact','abh.pack-inspection-jobs.fail-lost-lease']};
    await f.database.transaction(c,options(),async tx=>{
     await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${c.tenant.resourceOrganizationId},${recovery.grantRef.id},${c.tenant.actor.id},${JSON.stringify(recovery)}::text::jsonb,${recovery.validFrom},${recovery.validUntil},'Active')`;
     await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${c.tenant.resourceOrganizationId},${randomUUID()},'abh.grant',${recovery.grantRef.id},1)`;
    });
    await runPackInspectionJobWorker(f.database,{...config(job),grants:[],grantSets:{discovery:[recovery.grantRef],leaseLoss:[recovery.grantRef]},signal:stop.signal,expiry:checks,leaseLoss:checks,pageSize:100,intervalMs:1,
     discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,candidate)=>candidate.jobRef.id===job.id},
     prepare:async()=>{throw new Error('lost Running attempt must not restart');},onPage:async stats=>{settled+=stats.leaseLost;if(settled)stop.abort();},
    });assert.equal(settled,1);failed={...job,version:3};
   }else{failed=await fail();assert.deepEqual(await fail(),failed);}
   const record=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,failed,async()=>{}));
   assert.equal(record.status,'Failed');assert.equal(record.diagnostic!.code,'InspectionFailed');assert.equal(record.budget.attempts,1);assert.ok(record.budget.elapsedMs>0);assert.ok(Date.parse(record.expiresAt)>Date.now());
   const saved=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,record.diagnostic!.evidenceRefs[0]!,async()=>{}));
   const [envelope,evidence]=JSON.parse(new TextDecoder().decode(saved.bytes));assert.equal(envelope,'abh-pack-inspection-lease-loss-v1');assert.equal(evidence.cause,takeover?'Replaced':'Expired');assert.equal(evidence.job.jobRef.version,running.version);
   if(replacement)assert.deepEqual(await f.database.transaction(c,options(),tx=>new WorkLeaseOwner().requireCurrent(tx,replacement.leaseRef,replacement.workerId,replacement.fencingToken,installation.packRef)),replacement);
   const [count]=await f.admin`SELECT count(*)::int AS value FROM data.outbox WHERE aggregate_id=${job.id} AND record->>'type'='abh.pack-inspection-job.fail'`;assert.equal(count!.value,1);
   await assert.rejects(failLostPackInspection(f.database,c,options(),{...command,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:failed.version},grants,checks),{code:'PRECONDITION_FAILED'});
  }finally{if(replacement)await releasePackInspectionLease(f.database,c,options(),installation,grants,replacement);}
 }
}
