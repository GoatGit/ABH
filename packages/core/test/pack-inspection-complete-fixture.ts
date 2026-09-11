import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,RequestPackInspectionCommand,StartPackInspectionCommand,CompletePackInspectionCommand} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import {startPackInspection} from '../src/extensions/start-pack-inspection.ts';
import {completePackInspection} from '../src/extensions/complete-pack-inspection.ts';
import {claimPackInspectionLease,releasePackInspectionLease,type PackInspectionLeaseBinding} from '../src/extensions/inspection-leases.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import type {InstalledMigrationState} from '../src/extensions/verify-installed-migration-state.ts';
const options=()=>({deadline:Date.now()+30000,signal:new AbortController().signal});
export async function checkPackInspectionCompletion(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,
 inspect:(binding:PackInspectionLeaseBinding,mismatch:boolean)=>Promise<{state:InstalledMigrationState;observationRef:EntityRef}>,old:{state:InstalledMigrationState;observationRef:EntityRef}){
 const org=c.tenant.resourceOrganizationId,grants=[grant],checks={fenceRefs:async()=>[],current:async()=>{},read:async()=>{}};
 const read=(ref:EntityRef)=>f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));
 for(const mismatch of [false,true]){
  const request:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...installation.packRef,type:'abh.installed-pack',version:1},packageDigest:installation.manifest.integrity.packageDigest,environmentDigest:'sha256:'+'a'.repeat(64),deploymentVersion:installation.deploymentVersion,expiresAt:new Date(Date.now()+60000).toISOString(),maxAttempts:3,maxDurationMs:30000}};
  const job=await requestPackInspection(f.database,c,options(),request,grants,checks);
  const lease=await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID());let released=false;
  const token={leaseRef:{...lease.leaseRef,type:'abh.work-lease' as const},workerId:lease.workerId,fencingToken:lease.fencingToken},binding={installation,grants,token};
  try{
   const start:StartPackInspectionCommand={type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:1,payload:{lease:token}};
   const running=await startPackInspection(f.database,c,options(),start,grants,binding,checks);
   const make=(ref:EntityRef):CompletePackInspectionCommand=>({type:'abh.pack-inspection-jobs.complete',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:running.version,payload:{lease:token,observationRef:{...ref,type:'abh.artifact'}}});
   if(!mismatch)await assert.rejects(completePackInspection(f.database,c,options(),make(old.observationRef),grants,binding,old.state,checks),{code:'PRECONDITION_FAILED'});
   const result=await inspect(binding,mismatch),command=make(mismatch?result.observationRef:old.observationRef);assert.equal(result.state.matched,!mismatch);
   const count=async()=>{const [row]=await f.admin`SELECT
    (SELECT count(*)::int FROM data.command_receipts WHERE resource_organization_id=${org} AND command_type='abh.pack-inspection-jobs.complete') AS receipts,
    (SELECT count(*)::int FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.pack-inspection-jobs.complete') AS audits,
    (SELECT count(*)::int FROM data.outbox WHERE resource_organization_id=${org} AND record->>'type'='abh.pack-inspection-job.succeed') AS events`;return row;};
   const before=await read(running),baseline=await count();let calls=0;
   await assert.rejects(completePackInspection(f.database,c,options(),command,grants,binding,result.state,{...checks,current:async()=>{if(++calls===2)throw new Error('final completion denied');}}),/final completion denied/);
   assert.equal(calls,2);assert.deepEqual(await read(running),before);assert.deepEqual(await count(),baseline);
   await assert.rejects(completePackInspection(f.database,c,options(),command,grants,binding,{...result.state},checks),{code:'PRECONDITION_FAILED'});
   const finished=await completePackInspection(f.database,c,options(),command,grants,binding,result.state,checks),record=await read(finished);
   assert.equal(record.status,'Succeeded');assert.equal(record.observation?.matched,!mismatch);assert.deepEqual(record.observation?.artifactRef,command.payload.observationRef);assert.equal(record.lease,undefined);assert.equal(record.budget.attempts,1);assert.ok(record.budget.elapsedMs>0);
   const once=await count();for(const key of ['receipts','audits','events'])assert.equal(once![key],baseline![key]+1);
   assert.deepEqual(await completePackInspection(f.database,c,options(),{...command,commandId:randomUUID()},grants,binding,result.state,checks),finished);assert.deepEqual(await read(finished),record);assert.deepEqual(await count(),once);
   await assert.rejects(completePackInspection(f.database,c,options(),command,[],binding,result.state,checks),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(completePackInspection(f.database,c,options(),command,grants,binding,result.state,{...checks,read:async()=>{throw new Error('observation denied');}}),/observation denied/);
   await assert.rejects(completePackInspection(f.database,c,options(),command,grants,binding,result.state,{...checks,read:async(_tx,artifact)=>{if(artifact.artifactRef.id===result.state.structure.reportRef.id)throw new Error('expectation source denied');}}),/expectation source denied/);
   await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);released=true;
   await assert.rejects(completePackInspection(f.database,c,options(),command,grants,binding,result.state,checks),{code:'PRECONDITION_FAILED'});
  }finally{if(!released)await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);}
 }
}
