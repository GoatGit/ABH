import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,StartPackInspectionCommand,RequestPackInspectionCommand} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import {startPackInspection} from '../src/extensions/start-pack-inspection.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {claimPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionStart(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef){
 const org=c.tenant.resourceOrganizationId,grants=[grant],workerId=randomUUID();
 const create=()=>{
  const command:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...installation.packRef,type:'abh.installed-pack',version:1},packageDigest:installation.manifest.integrity.packageDigest,environmentDigest:'sha256:'+'a'.repeat(64),deploymentVersion:installation.deploymentVersion,expiresAt:new Date(Date.now()+60000).toISOString(),maxAttempts:3,maxDurationMs:3000}};
  return requestPackInspection(f.database,c,options(),command,grants,{fenceRefs:async()=>[],current:async()=>{}});
 };
 const first=await create(),second=await create();
 const lease=await claimPackInspectionLease(f.database,c,options(),installation,grants,workerId);
 const token={leaseRef:lease.leaseRef,workerId:lease.workerId,fencingToken:lease.fencingToken},binding={installation,grants,token};
 const command:StartPackInspectionCommand={type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:first.id},expectedVersion:1,payload:{lease:{...token,leaseRef:{...token.leaseRef,type:'abh.work-lease'}}}};
 const checks={fenceRefs:async()=>[],current:async()=>{}};
 const start=(input=command)=>startPackInspection(f.database,c,options(),input,grants,binding,checks);
 const read=(ref:EntityRef)=>f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));
 const count=async()=>{
  const [row]=await f.admin`SELECT
   (SELECT count(*)::int FROM data.command_receipts WHERE resource_organization_id=${org} AND command_type='abh.pack-inspection-jobs.start') AS receipts,
   (SELECT count(*)::int FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.pack-inspection-jobs.start') AS audits,
   (SELECT count(*)::int FROM data.outbox WHERE resource_organization_id=${org} AND record->>'type'='abh.pack-inspection-job.start') AS events`;
  return row;
 };
 let released=false;
 try{
  const before=await count();let calls=0;
  await assert.rejects(startPackInspection(f.database,c,options(),command,grants,binding,{fenceRefs:async()=>[],current:async()=>{if(++calls===2)throw new Error('final start denied');}}),/final start denied/);
  assert.equal(calls,2);assert.deepEqual(await count(),before);assert.equal((await read(first)).budget.attempts,0);
  const running=await start();assert.equal(running.version,2);const record=await read(running);assert.equal(record.status,'Running');assert.equal(record.budget.attempts,1);assert.equal(record.budget.elapsedMs,0);
  const once=await count();for(const key of ['receipts','audits','events'])assert.equal(once![key],before![key]+1);
  assert.deepEqual(await start({...command,commandId:randomUUID()}),running);assert.deepEqual(await count(),once);assert.deepEqual(await read(running),record);
  await assert.rejects(start({...command,commandId:randomUUID(),idempotencyKey:randomUUID()}),{code:'VERSION_CONFLICT'});
  await assert.rejects(startPackInspection(f.database,c,options(),command,[],binding,checks),{code:'AUTHORITY_REQUIRED'});
  const human=deriveVerifiedContext({...c.request,actor:{type:'Human',id:c.tenant.actor.id}});
  await assert.rejects(startPackInspection(f.database,human,options(),command,grants,binding,checks),{code:'FORBIDDEN'});
  await assert.rejects(start({...command,payload:{lease:{...command.payload.lease,fencingToken:token.fencingToken+1}}}),{code:'INVALID_ARGUMENT'});
  const other={...command,commandId:randomUUID(),idempotencyKey:randomUUID(),target:{...command.target,id:second.id}};
  await assert.rejects(start(other),{code:'PRECONDITION_FAILED'});
  const secondRecord=await read(second),duplicate={...secondRecord,status:'Running',lease:command.payload.lease,budget:{...secondRecord.budget,attempts:1}};
  await assert.rejects(f.admin`UPDATE extension.inspection_jobs SET status='Running',record=${JSON.stringify(duplicate)}::text::jsonb WHERE resource_organization_id=${org} AND id=${second.id}`,{code:'23505'});
  // Direct Waiting fixture exercises the implemented resume edge only; this is
  // not a Waiting transition Owner or authentic diagnostic producer.
  const waiting={...record,jobRef:{...record.jobRef,version:3},status:'Waiting',budget:{...record.budget,elapsedMs:500},diagnostic:{code:'Missing',evidenceRefs:[{type:'abh.artifact',id:randomUUID(),version:1}]}};
  delete waiting.lease;
  await f.admin`UPDATE extension.inspection_jobs SET version=3,status='Waiting',record=${JSON.stringify(waiting)}::text::jsonb WHERE resource_organization_id=${org} AND id=${first.id}`;
  await assert.rejects(start(),{code:'VERSION_CONFLICT'});
  const resume={...command,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:3};
  const resumed=await start(resume),progress=await read(resumed);assert.equal(resumed.version,4);assert.equal(progress.budget.attempts,2);assert.equal(progress.budget.elapsedMs,500);assert.equal(progress.diagnostic,undefined);
  await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);released=true;
  await assert.rejects(start(resume),{code:'PRECONDITION_FAILED'});
  return resumed;
 }finally{
  if(!released)await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);
 }
}
