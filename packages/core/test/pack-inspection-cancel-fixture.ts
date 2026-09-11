import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,EntityRef,InstalledPackRecord,RequestPackInspectionCommand,StartPackInspectionCommand,CancelPackInspectionCommand,PackInspectionJobRecord} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {TenantTransaction} from '../src/data/uow.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import {startPackInspection} from '../src/extensions/start-pack-inspection.ts';
import {cancelPackInspection} from '../src/extensions/cancel-pack-inspection.ts';
import {claimPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionCancellation(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,waiting?:EntityRef){
 const org=c.tenant.resourceOrganizationId,grants=[grant],read=(ref:EntityRef)=>f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));
 const basisContent=JSON.stringify({kind:'fixture-approved-inspection-cancellation',organizationId:org,packRef:installation.packRef,reason:'OperatorRequested'});
 const basis=await f.database.transaction(c,options(),async tx=>{
  const payload={ownerRef:installation.packRef,sourceRefs:[installation.packRef],purposeNames:['abh.pack.manage'],mediaType:'application/json',dataClass:'abh.data.internal',region:'local',retentionPolicyRef:installation.packRef,content:basisContent};
  const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
  return (await executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,command,payload,async()=>{})).artifactRef)).receipt.resultRef;
 });
 const checks={fenceRefs:async()=>[],references:async()=>{},read:async()=>{},current:async(_tx:TenantTransaction,job:PackInspectionJobRecord,actual:{record:ArtifactRecord;bytes:Uint8Array},reason:string)=>{
  assert.deepEqual(job.packRef,installation.packRef);assert.equal(reason,'OperatorRequested');assert.deepEqual(actual.record.artifactRef,basis);assert.equal(new TextDecoder().decode(actual.bytes),basisContent);
 }};
 const create=async(maxDurationMs=30000)=>{
  const command:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...installation.packRef,type:'abh.installed-pack',version:1},packageDigest:installation.manifest.integrity.packageDigest,environmentDigest:'sha256:'+'a'.repeat(64),deploymentVersion:installation.deploymentVersion,expiresAt:new Date(Date.now()+60000).toISOString(),maxAttempts:3,maxDurationMs}};
  return requestPackInspection(f.database,c,options(),command,grants,{fenceRefs:async()=>[],current:async()=>{}});
 };
 for(const scenario of c.tenant.actor.type==='Human'?['Pending']:['Waiting','Running','Overrun']){
  let ref=scenario==='Waiting'?waiting!:await create(scenario==='Overrun'?1000:30000);
  let lease:Awaited<ReturnType<typeof claimPackInspectionLease>>|undefined;
  let start:StartPackInspectionCommand|undefined;
  if(scenario==='Running'||scenario==='Overrun'){
   lease=await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID());
   start={type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:1,payload:{lease:{leaseRef:{...lease.leaseRef,type:'abh.work-lease'},workerId:lease.workerId,fencingToken:lease.fencingToken}}};
   ref=await startPackInspection(f.database,c,options(),start,grants,{installation,grants,token:start.payload.lease},{fenceRefs:async()=>[],current:async()=>{}});
  }
  try{
   if(scenario==='Overrun')await f.admin`SELECT pg_sleep(1.1)`;
   const before=await read(ref),command:CancelPackInspectionCommand={type:'abh.pack-inspection-jobs.cancel',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:ref.version,payload:{basisRef:{...basis,type:'abh.artifact'},reason:'OperatorRequested',dataClass:'abh.data.internal',region:'local',retentionPolicyRef:installation.packRef}};
   const cancel=(input=command)=>cancelPackInspection(f.database,c,options(),input,grants,checks);
   const count=async()=>{const [row]=await f.admin`SELECT
    (SELECT count(*)::int FROM data.command_receipts WHERE resource_organization_id=${org} AND command_type='abh.pack-inspection-jobs.cancel') AS receipts,
    (SELECT count(*)::int FROM data.artifacts WHERE resource_organization_id=${org} AND record#>>'{ownerRef,id}'=${ref.id}) AS artifacts,
    (SELECT count(*)::int FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.pack-inspection-jobs.cancel') AS audits`;return row;};
   const baseline=await count();let calls=0;
   await assert.rejects(cancelPackInspection(f.database,c,options(),command,grants,{...checks,current:async(...args)=>{await checks.current(...args);if(++calls===2)throw new Error('cancel final denied');}}),/cancel final denied/);
   assert.equal(calls,2);assert.deepEqual(await read(ref),before);assert.deepEqual(await count(),baseline);
   await assert.rejects(cancelPackInspection(f.database,c,options(),command,[],checks),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(cancelPackInspection(f.database,c,options(),command,grants,{...checks,read:async(_tx,artifact)=>{if(artifact.artifactRef.id===basis.id)throw new Error('basis denied');}}),/basis denied/);
   const cancelled=await cancel(),record=await read(cancelled);assert.equal(record.status,scenario==='Overrun'?'Failed':'Cancelled');assert.equal(record.diagnostic?.code,scenario==='Overrun'?'BudgetExhausted':'Cancelled');assert.equal(record.lease,undefined);assert.equal(record.budget.attempts,before.budget.attempts);
   if(scenario==='Pending'||scenario==='Waiting')assert.equal(record.budget.elapsedMs,before.budget.elapsedMs);else assert.ok(record.budget.elapsedMs>before.budget.elapsedMs);
   const once=await count();assert.equal(once!.artifacts,baseline!.artifacts+1);assert.equal(once!.receipts,baseline!.receipts+1);assert.equal(once!.audits,baseline!.audits+3);
   assert.deepEqual(await cancel({...command,commandId:randomUUID()}),cancelled);assert.deepEqual(await read(cancelled),record);assert.deepEqual(await count(),once);
   await assert.rejects(cancel({...command,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:cancelled.version}),{code:'PRECONDITION_FAILED'});
   if(start&&lease){
    await assert.rejects(startPackInspection(f.database,c,options(),start,grants,{installation,grants,token:start.payload.lease},{fenceRefs:async()=>[],current:async()=>{}}),{code:'VERSION_CONFLICT'});
    const [active]=await f.admin`SELECT fencing_token,lease_until>clock_timestamp() AS active FROM runtime.work_leases WHERE resource_organization_id=${org} AND id=${lease.leaseRef.id}`;
    assert.equal(Number(active!.fencing_token),lease.fencingToken);assert.equal(active!.active,true);
   }
  }finally{if(lease)await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);}
 }
}
