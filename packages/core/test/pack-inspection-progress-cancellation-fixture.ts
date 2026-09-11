import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {runPackInspectionJob,type PackInspectionJobExecution} from '../src/extensions/run-pack-inspection-job.ts';
import {cancelPackInspection} from '../src/extensions/cancel-pack-inspection.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {connectMigrationTarget} from '../src/extensions/connect-migration-target.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionProgressCancellation(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,targetUrl:string,create:()=>Promise<EntityRef>,config:(ref:EntityRef)=>PackInspectionJobExecution){
 const basisContent=JSON.stringify({kind:'fixture-approved-cancellation',packRef:installation.packRef,reason:'OperatorRequested'});
 const basis=await f.database.transaction(c,options(),async tx=>{
  const payload={ownerRef:installation.packRef,sourceRefs:[installation.packRef],purposeNames:['abh.pack.manage'],mediaType:'application/json',dataClass:'abh.data.internal',region:'local',retentionPolicyRef:installation.packRef,content:basisContent};
  const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
  return (await executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,command,payload,async()=>{})).artifactRef)).receipt.resultRef;
 });
 for(const failureInstalled of [false,true])for(const lateTarget of [false,true]){
  const ref=await create(),execution=config(ref);execution.heartbeatMs=30;
  if(failureInstalled)execution.failure={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
  let entered!:()=>void,closed!:()=>void,signal:AbortSignal|undefined,disposed=0;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),closedTarget=new Promise<void>(resolve=>{closed=resolve;});
  execution.prepare=async(_context,_job,_pack,limits)=>{
   signal=limits.signal;
   if(!lateTarget){entered();return new Promise<never>(()=>{});}
   const target=await connectMigrationTarget(targetUrl,limits);entered();
   await new Promise<void>(resolve=>{if(limits.signal.aborted)resolve();else limits.signal.addEventListener('abort',()=>resolve(),{once:true});});
   return {status:'Ready',target:{connection:target.connection,dispose:async()=>{try{await target.dispose();disposed++;}finally{closed();}}},run:{inspect:async()=>{throw new Error('cancelled target must never inspect');},retention:execution.diagnostic,admit:async()=>{},read:async()=>{}}};
  };
  const pending=runPackInspectionJob(f.database,execution),rejected=assert.rejects(pending,error=>{
   if(!failureInstalled){assert.equal((error as {code?:string}).code,'VERSION_CONFLICT');return true;}
   assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,2);
   assert.equal(error.errors[0].code,'VERSION_CONFLICT');assert.equal(error.errors[1].code,'VERSION_CONFLICT');return true;
  });
  await ready;
  const started=Date.now();
  const cancelled=await cancelPackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.cancel',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:2,payload:{...execution.diagnostic,basisRef:{...basis,type:'abh.artifact'},reason:'OperatorRequested'}},execution.grants,{
   fenceRefs:async()=>[],references:async()=>{},read:async()=>{},current:async(_tx,job,actual,reason)=>{
    assert.deepEqual(job.packRef,installation.packRef);assert.equal(reason,'OperatorRequested');assert.deepEqual(actual.record.artifactRef,basis);assert.equal(new TextDecoder().decode(actual.bytes),basisContent);
   },
  });
  await rejected;if(lateTarget){await closedTarget;assert.equal(disposed,1);}
  assert.ok(Date.now()-started<5000);assert.equal(execution.signal.aborted,false);assert.equal(signal!.aborted,true);
  const record=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,cancelled,async()=>{}));
  assert.equal(record.status,'Cancelled');assert.equal(record.budget.attempts,1);assert.equal(record.jobRef.version,3);
  const [lease]=await f.admin`SELECT lease_until<=clock_timestamp() AS released FROM runtime.work_leases WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND target_id=${installation.packRef.id}`;
  assert.equal(lease!.released,true);
  const [events]=await f.admin`SELECT count(*)::int AS count FROM data.outbox WHERE aggregate_id=${ref.id} AND record->>'type' IN ('abh.pack-inspection-job.succeed','abh.pack-inspection-job.fail')`;
  assert.equal(events!.count,0);
 }
}
