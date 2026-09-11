import {failLostPackInspection} from '../src/extensions/fail-lost-pack-inspection.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,FailPackInspectionCommand,InstalledPackRecord,GrantRecord} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {CoreError} from '../src/internal/errors.ts';
import {failPackInspection} from '../src/extensions/fail-pack-inspection.ts';
import {observePackInspectionAttempt} from '../src/extensions/inspection-failure.ts';
import {startPackInspection} from '../src/extensions/start-pack-inspection.ts';
import {claimPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {runPackInspectionJob,type PackInspectionJobExecution} from '../src/extensions/run-pack-inspection-job.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionFailure(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,create:()=>Promise<EntityRef>,config:(ref:EntityRef)=>PackInspectionJobExecution){
 const grants=[grant],checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 const job=await create(),lease=await claimPackInspectionLease(f.database,c,options(),installation,grants,randomUUID());
 const token={leaseRef:{...lease.leaseRef,type:'abh.work-lease' as const},workerId:lease.workerId,fencingToken:lease.fencingToken},binding={installation,grants,token};
 try{
  const ref=await startPackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:job.version,payload:{lease:token}},grants,binding,checks);
  const running=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));
  const outcome=await observePackInspectionAttempt(running,async()=>{throw new Error('postgres://private:secret@host/db');});if(outcome.ok)throw new Error('expected failure');
  const command:FailPackInspectionCommand={type:'abh.pack-inspection-jobs.fail',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:job.id},expectedVersion:ref.version,payload:{...config(job).diagnostic,lease:token}};
  const fail=()=>failPackInspection(f.database,c,options(),command,grants,binding,outcome.failure,checks);
  await assert.rejects(failPackInspection(f.database,c,options(),command,grants,binding,structuredClone(outcome.failure),checks),{code:'PRECONDITION_FAILED'});
  await assert.rejects(failPackInspection(f.database,c,options(),command,[],binding,outcome.failure,checks),{code:'AUTHORITY_REQUIRED'});
  const foreignToken={...token,workerId:randomUUID()};
  await assert.rejects(failPackInspection(f.database,c,options(),{...command,payload:{...command.payload,lease:foreignToken}},grants,{...binding,token:foreignToken},outcome.failure,checks),{code:'PRECONDITION_FAILED'});

  let calls=0;
  await assert.rejects(failPackInspection(f.database,c,options(),command,grants,binding,outcome.failure,{...checks,current:async()=>{if(++calls===2)throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
  const unchanged=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));assert.deepEqual(unchanged,running);
  const [rolledBack]=await f.admin`SELECT count(*)::int AS value FROM data.outbox WHERE aggregate_id=${job.id} AND record->>'type'='abh.pack-inspection-job.fail'`;assert.equal(rolledBack!.value,0);
  const failed=await fail();assert.deepEqual(await fail(),failed);
  const record=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,failed,async()=>{}));
  assert.equal(record.status,'Failed');assert.equal(record.diagnostic!.code,'InspectionFailed');assert.equal(record.budget.attempts,1);assert.ok(record.budget.elapsedMs>0);assert.equal(record.lease,undefined);
  const saved=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,record.diagnostic!.evidenceRefs[0]!,async()=>{}));
  const text=new TextDecoder().decode(saved.bytes),[envelope,evidence]=JSON.parse(text);assert.equal(envelope,'abh-pack-inspection-failure-v1');assert.equal(evidence.phase,'Preparation');assert.equal(evidence.cleanupUnacknowledged,false);assert.ok(!text.includes('secret'));
  const [count]=await f.admin`SELECT count(*)::int AS value FROM data.outbox WHERE aggregate_id=${job.id} AND record->>'type'='abh.pack-inspection-job.fail'`;assert.equal(count!.value,1);
  await assert.rejects(failPackInspection(f.database,c,options(),{...command,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:failed.version},grants,binding,outcome.failure,checks),{code:'PRECONDITION_FAILED'});
  await assert.rejects(failPackInspection(f.database,c,options(),command,[],binding,outcome.failure,checks),{code:'AUTHORITY_REQUIRED'});
 }finally{await releasePackInspectionLease(f.database,c,options(),installation,grants,lease);}
 const [grantBasis]=await f.admin`SELECT record FROM control.grants WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${grant.id}`;
 const separate:Record<string,EntityRef>={};
 for(const [key,action] of Object.entries({base:'abh.packs.record-data-impact',start:'abh.pack-inspection-jobs.start',completion:'abh.pack-inspection-jobs.complete',failure:'abh.pack-inspection-jobs.fail'})){
  const issued:GrantRecord={...grantBasis!.record,grantRef:{type:'abh.grant',id:randomUUID(),version:1},actionTypes:[action]};
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${c.tenant.resourceOrganizationId},${issued.grantRef.id},${c.tenant.actor.id},${JSON.stringify(issued)}::text::jsonb,${issued.validFrom},${issued.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${c.tenant.resourceOrganizationId},${randomUUID()},'abh.grant',${issued.grantRef.id},1)`;
  });separate[key]=issued.grantRef;
 }
 const isolatedAuthorities={start:[separate.start!],completion:[separate.completion!],failure:[separate.failure!]};
 const executionJob=await create(),input=config(executionJob);
 input.grants=[separate.base!];input.grantSets=structuredClone(isolatedAuthorities);
 input.failure=checks;input.prepare=async()=>{throw new CoreError('INVALID_ARGUMENT');};
 const settled=await runPackInspectionJob(f.database,input);assert.equal(settled.status,'Failed');assert.equal(settled.diagnostic!.code,'InspectionFailed');
 await assert.rejects(runPackInspectionJob(f.database,{...input,jobRef:settled.jobRef}),{code:'PRECONDITION_FAILED'});
 const completionJob=await create(),completionInput=config(completionJob);
 completionInput.grants=[separate.base!];completionInput.grantSets=structuredClone(isolatedAuthorities);
 completionInput.failure=checks;completionInput.completion={...checks,current:async()=>{throw new CoreError('FORBIDDEN');}};
 const completionFailed=await runPackInspectionJob(f.database,completionInput);assert.equal(completionFailed.status,'Failed');
 const completionArtifact=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,completionFailed.diagnostic!.evidenceRefs[0]!,async()=>{}));
 const [,completionEvidence]=JSON.parse(new TextDecoder().decode(completionArtifact.bytes));assert.equal(completionEvidence.phase,'Completion');assert.equal(completionEvidence.classification,'Rejected');


 const readDeniedJob=await create(),readDeniedInput=config(readDeniedJob),readDenied=new CoreError('FORBIDDEN');let failureAdmissions=0;
 readDeniedInput.grants=[separate.base!];readDeniedInput.grantSets=structuredClone(isolatedAuthorities);
 readDeniedInput.failure={...checks,current:async()=>{failureAdmissions++;}};
 readDeniedInput.read=async(_tx,job)=>{if(job.status==='Succeeded')throw readDenied;};
 await assert.rejects(runPackInspectionJob(f.database,readDeniedInput),error=>error===readDenied);
 assert.equal(failureAdmissions,0);
 const committed=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,readDeniedJob,async()=>{}));
 assert.equal(committed.status,'Succeeded');assert.equal(committed.jobRef.version,3);
 const [readDeniedEvents]=await f.admin`SELECT count(*)::int AS value FROM data.outbox WHERE aggregate_id=${readDeniedJob.id} AND record->>'type'='abh.pack-inspection-job.fail'`;assert.equal(readDeniedEvents!.value,0);

 // Start authority may be withdrawn after Running without removing independent
 // failure/read authority. Settlement and its result do not start another attempt.
 const revokedStartJob=await create(),revokedStartInput=config(revokedStartJob);
 revokedStartInput.grants=[separate.base!];revokedStartInput.grantSets=structuredClone(isolatedAuthorities);revokedStartInput.failure=checks;
 revokedStartInput.prepare=async()=>{
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Control')`UPDATE control.grants SET status='Revoked',record=jsonb_set(record,'{status}','"Revoked"'::jsonb) WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${separate.start!.id}`;
  });
  throw new CoreError('INVALID_ARGUMENT');
 };
 const revokedStartResult=await runPackInspectionJob(f.database,revokedStartInput);assert.equal(revokedStartResult.status,'Failed');assert.equal(revokedStartResult.diagnostic!.code,'InspectionFailed');

 // A valid execution Grant deliberately excludes only the new failure action.
 const [original]=await f.admin`SELECT record FROM control.grants WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND id=${grant.id}`;
 const executionGrant:GrantRecord={...original!.record,grantRef:{type:'abh.grant',id:randomUUID(),version:1},actionTypes:(original!.record as GrantRecord).actionTypes.filter(action=>action!=='abh.pack-inspection-jobs.fail')};
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${c.tenant.resourceOrganizationId},${executionGrant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(executionGrant)}::text::jsonb,${executionGrant.validFrom},${executionGrant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${c.tenant.resourceOrganizationId},${randomUUID()},'abh.grant',${executionGrant.grantRef.id},1)`;
 });
 for(const mode of ['MissingFailureGrant','ExplicitEmptyFailure','ParentCancelled','ReleasedLease'] as const){
  const deniedJob=await create(),denied=config(deniedJob),stop=new AbortController(),primary=new CoreError('INVALID_ARGUMENT');
  denied.failure=checks;denied.signal=stop.signal;
  if(mode==='MissingFailureGrant')denied.grants=[executionGrant.grantRef];
  if(mode==='ExplicitEmptyFailure')denied.grantSets={failure:[]};
  denied.prepare=async(_context,running)=>{
   if(mode==='ParentCancelled')stop.abort();
   if(mode==='ReleasedLease')await releasePackInspectionLease(f.database,c,options(),installation,grants,running.lease!);
   throw primary;
  };
  await assert.rejects(runPackInspectionJob(f.database,denied),error=>{
   assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,2);
   if(mode!=='ParentCancelled')assert.equal(error.errors[0],primary);
   assert.equal(error.errors[1].code,mode==='MissingFailureGrant'?'FORBIDDEN':mode==='ExplicitEmptyFailure'?'AUTHORITY_REQUIRED':mode==='ParentCancelled'?'DEPENDENCY_TIMEOUT':'PRECONDITION_FAILED');return true;
  });
  const remaining=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().readCurrent(tx,deniedJob,async()=>{}));
  assert.equal(remaining.status,'Running');assert.equal(remaining.budget.attempts,1);assert.equal(remaining.jobRef.version,2);
  const [events]=await f.admin`SELECT count(*)::int AS count FROM data.outbox WHERE aggregate_id=${deniedJob.id} AND record->>'type'='abh.pack-inspection-job.fail'`;assert.equal(events!.count,0);
  await failLostPackInspection(f.database,c,options(),{type:'abh.pack-inspection-jobs.fail-lost-lease',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:deniedJob.id},expectedVersion:remaining.jobRef.version,payload:denied.diagnostic},grants,checks);
 }
}
