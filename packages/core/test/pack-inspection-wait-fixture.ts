import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,RequestPackInspectionCommand,StartPackInspectionCommand,WaitPackInspectionCommand} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import {startPackInspection} from '../src/extensions/start-pack-inspection.ts';
import {waitPackInspection} from '../src/extensions/wait-pack-inspection.ts';
import {claimPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {matchPackInspectionBlock} from '../src/extensions/prepare-pack-inspection.ts';
import type {PackInspectionBlock} from '../src/extensions/inspection-worker.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionWaiting(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,prepare:()=>Promise<PackInspectionBlock>){
 const org=c.tenant.resourceOrganizationId,grants=[grant],checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 const old=await prepare();assert.equal(old.status,'Missing');assert.throws(()=>matchPackInspectionBlock({...old}),{code:'PRECONDITION_FAILED'});
 const request:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...installation.packRef,type:'abh.installed-pack',version:1},packageDigest:installation.manifest.integrity.packageDigest,environmentDigest:'sha256:'+'0'.repeat(64),deploymentVersion:installation.deploymentVersion,expiresAt:new Date(Date.now()+60000).toISOString(),maxAttempts:3,maxDurationMs:30000}};
 const job=await requestPackInspection(f.database,c,options(),request,grants,checks);
 const lease=await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID());let released=false;
 const token={leaseRef:{...lease.leaseRef,type:'abh.work-lease' as const},workerId:lease.workerId,fencingToken:lease.fencingToken},binding={installation,grants,token};
 const read=(ref:EntityRef)=>f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));
 try{
  const start:StartPackInspectionCommand={type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:1,payload:{lease:token}};
  const running=await startPackInspection(f.database,c,options(),start,grants,binding,checks);
  const command:WaitPackInspectionCommand={type:'abh.pack-inspection-jobs.wait',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:start.target,expectedVersion:running.version,payload:{lease:token,dataClass:'abh.data.internal',region:'local',retentionPolicyRef:installation.packRef}};
  await assert.rejects(waitPackInspection(f.database,c,options(),command,grants,binding,old,checks),{code:'INVALID_ARGUMENT'});
  const block=await prepare(),proof=matchPackInspectionBlock(block);assert.equal(proof.reason,'Missing');assert.equal(proof.principalRef.id,c.tenant.actor.id);
  const wait=(input=command)=>waitPackInspection(f.database,c,options(),input,grants,binding,block,checks);
  const count=async()=>{const [row]=await f.admin`SELECT
   (SELECT count(*)::int FROM data.command_receipts WHERE resource_organization_id=${org} AND command_type='abh.pack-inspection-jobs.wait') AS receipts,
   (SELECT count(*)::int FROM data.artifacts WHERE resource_organization_id=${org} AND record#>>'{ownerRef,id}'=${job.id}) AS artifacts,
   (SELECT count(*)::int FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.pack-inspection-jobs.wait') AS audits`;return row;};
  const baseline=await count(),before=await read(running);let calls=0;
  await assert.rejects(waitPackInspection(f.database,c,options(),command,grants,binding,block,{...checks,current:async()=>{if(++calls===2)throw new Error('final wait denied');}}),/final wait denied/);
  assert.equal(calls,2);assert.deepEqual(await read(running),before);assert.deepEqual(await count(),baseline);
  await assert.rejects(waitPackInspection(f.database,c,options(),command,grants,binding,{...block},checks),{code:'PRECONDITION_FAILED'});
  const waiting=await wait(),record=await read(waiting);assert.equal(record.status,'Waiting');assert.equal(record.diagnostic?.code,'Missing');assert.equal(record.lease,undefined);assert.equal(record.budget.attempts,1);assert.ok(record.budget.elapsedMs>0);
  const once=await count();assert.equal(once!.artifacts,baseline!.artifacts+1);assert.equal(once!.receipts,baseline!.receipts+1);assert.equal(once!.audits,baseline!.audits+3);
  assert.deepEqual(await wait({...command,commandId:randomUUID()}),waiting);assert.deepEqual(await count(),once);assert.deepEqual(await read(waiting),record);
  await assert.rejects(waitPackInspection(f.database,c,options(),command,[],binding,block,checks),{code:'AUTHORITY_REQUIRED'});
  const resumed=await startPackInspection(f.database,c,options(),{...start,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:waiting.version},grants,binding,checks);
  assert.equal((await read(resumed)).budget.elapsedMs,record.budget.elapsedMs);assert.equal((await read(resumed)).budget.attempts,2);
  await assert.rejects(wait(),{code:'VERSION_CONFLICT'});
  const second=await prepare(),nextCommand={...command,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:resumed.version};
  const waitingAgain=await waitPackInspection(f.database,c,options(),nextCommand,grants,binding,second,checks);
  await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);released=true;
  await assert.rejects(waitPackInspection(f.database,c,options(),nextCommand,grants,binding,second,checks),{code:'PRECONDITION_FAILED'});
  // A final actual blocked attempt must terminate now, not wait for expiry.
  const lastJob=await requestPackInspection(f.database,c,options(),{...request,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{...request.payload,maxAttempts:1,expiresAt:new Date(Date.now()+60000).toISOString()}},grants,checks);
  const finalLease=await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID());
  const finalToken={leaseRef:{...finalLease.leaseRef,type:'abh.work-lease' as const},workerId:finalLease.workerId,fencingToken:finalLease.fencingToken},finalBinding={installation,grants,token:finalToken};
  try{
   const lastStart={...start,commandId:randomUUID(),idempotencyKey:randomUUID(),target:{...start.target,id:lastJob.id},payload:{lease:finalToken}};
   const lastRunning=await startPackInspection(f.database,c,options(),lastStart,grants,finalBinding,checks),lastBlock=await prepare();
   const finish={...command,commandId:randomUUID(),idempotencyKey:randomUUID(),target:lastStart.target,expectedVersion:lastRunning.version,payload:{...command.payload,lease:finalToken}};
   const runningRecord=await read(lastRunning);let finalChecks=0;
   await assert.rejects(waitPackInspection(f.database,c,options(),finish,grants,finalBinding,lastBlock,{...checks,current:async()=>{if(++finalChecks===2)throw new Error('exhaustion final denied');}}),/exhaustion final denied/);
   assert.equal(finalChecks,2);assert.deepEqual(await read(lastRunning),runningRecord);
   const [rolledBack]=await f.admin`SELECT count(*)::int AS count FROM data.artifacts WHERE resource_organization_id=${org} AND record#>>'{ownerRef,id}'=${lastJob.id}`;assert.equal(rolledBack!.count,0);
   const failed=await waitPackInspection(f.database,c,options(),finish,grants,finalBinding,lastBlock,checks),finished=await read(failed);
   assert.equal(finished.status,'Failed');assert.equal(finished.diagnostic?.code,'BudgetExhausted');assert.equal(finished.budget.attempts,1);assert.equal(finished.budget.maxAttempts,1);assert.ok(finished.budget.elapsedMs>0);assert.equal(finished.lease,undefined);
   assert.ok(Date.parse(finished.expiresAt)>Date.now());
   const diagnostic=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,finished.diagnostic!.evidenceRefs[0]!,async()=>{}));
   const proof=JSON.parse(new TextDecoder().decode(diagnostic.bytes));assert.equal(proof[0],'abh-pack-inspection-retry-exhausted-v1');assert.equal(proof[1].cause,'AttemptsExhausted');assert.equal(proof[1].block.reason,'Missing');assert.deepEqual(proof[1].job,runningRecord);
   assert.deepEqual(await waitPackInspection(f.database,c,options(),{...finish,commandId:randomUUID()},grants,finalBinding,lastBlock,checks),failed);assert.deepEqual(await read(failed),finished);
   const [unique]=await f.admin`SELECT count(*)::int AS count FROM data.artifacts WHERE resource_organization_id=${org} AND record#>>'{ownerRef,id}'=${lastJob.id}`;assert.equal(unique!.count,1);
   const [events]=await f.admin`SELECT count(*)::int AS count FROM data.outbox WHERE resource_organization_id=${org} AND aggregate_id=${lastJob.id} AND record->>'type'='abh.pack-inspection-job.fail'`;assert.equal(events!.count,1);
   await assert.rejects(startPackInspection(f.database,c,options(),{...lastStart,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:failed.version},grants,finalBinding,checks),{code:'PRECONDITION_FAILED'});
  }finally{await releasePackInspectionLease(f.database,c,options(),installation,grants,finalLease);}
  return waitingAgain;
 }finally{if(!released)await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);}
}
