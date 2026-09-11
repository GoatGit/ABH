import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,ExpirePackInspectionCommand,RequestPackInspectionCommand} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {expirePackInspection} from '../src/extensions/expire-pack-inspection.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionExpiry(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,running:EntityRef,grant:EntityRef){
 const org=c.tenant.resourceOrganizationId,owner=new PackInspectionJobOwner();
 const read=(ref:EntityRef)=>f.database.transaction(c,options(),tx=>owner.read(tx,ref,async()=>{}));
 const before=await read(running);
 const command:ExpirePackInspectionCommand={type:'abh.pack-inspection-jobs.expire',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:running.id},expectedVersion:running.version,payload:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:before.packRef}};
 const checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 const expire=(input=command)=>expirePackInspection(f.database,c,options(),input,[grant],checks);
 const count=async()=>{
  const [row]=await f.admin`SELECT
   (SELECT count(*)::int FROM data.artifacts WHERE resource_organization_id=${org} AND record#>>'{ownerRef,id}'=${running.id}) AS artifacts,
   (SELECT count(*)::int FROM data.command_receipts WHERE resource_organization_id=${org} AND command_type='abh.pack-inspection-jobs.expire') AS receipts,
   (SELECT count(*)::int FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.pack-inspection-jobs.expire') AS audits,
   (SELECT count(*)::int FROM data.outbox WHERE resource_organization_id=${org} AND record->>'causationId'=${command.commandId}) AS events`;
  return row;
 };
 await assert.rejects(expire(),{code:'PRECONDITION_FAILED'});const baseline=await count();assert.equal(baseline!.artifacts,0);
 // DB time advances beyond the actual resumed Job's three-second budget. The
 // former worker lease has already been released by the start fixture.
 await f.admin`SELECT pg_sleep(3.1)`;
 let calls=0;
 await assert.rejects(expirePackInspection(f.database,c,options(),command,[grant],{...checks,current:async()=>{if(++calls===2)throw new Error('cleanup final denied');}}),/cleanup final denied/);
 assert.equal(calls,2);assert.deepEqual(await count(),baseline);assert.deepEqual(await read(running),before);
 const failed=await expire(),record=await read(failed);assert.equal(record.status,'Failed');assert.equal(record.diagnostic?.code,'BudgetExhausted');assert.equal(record.lease,undefined);
 assert.equal(record.budget.attempts,before.budget.attempts);assert.ok(record.budget.elapsedMs>=3000);assert.equal(failed.version,running.version+1);
 const once=await count();assert.equal(once!.artifacts,1);assert.equal(once!.receipts,baseline!.receipts+1);assert.equal(once!.audits,baseline!.audits+3);assert.equal(once!.events,3);
 assert.deepEqual(await expire({...command,commandId:randomUUID()}),failed);assert.deepEqual(await count(),once);
 await assert.rejects(expirePackInspection(f.database,c,options(),command,[],checks),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(expirePackInspection(f.database,c,options(),command,[grant],{...checks,read:async()=>{throw new Error('evidence read denied');}}),/evidence read denied/);
 const evidence=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,record.diagnostic!.evidenceRefs[0]!,async()=>{}));
 const parsed=JSON.parse(new TextDecoder().decode(evidence.bytes));assert.equal(parsed[0],'abh-pack-inspection-timeout-v1');assert.deepEqual(parsed[1].job,before);assert.equal(parsed[1].elapsedMs,record.budget.elapsedMs);
 await assert.rejects(expire({...command,commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:failed.version}),{code:'PRECONDITION_FAILED'});
 assert.deepEqual(await count(),once);
 const request:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:before.packRef,packageDigest:before.packageDigest,environmentDigest:before.environmentDigest,deploymentVersion:before.deploymentVersion,expiresAt:new Date(Date.now()+1000).toISOString(),maxAttempts:3,maxDurationMs:3000}};
 const pending=await requestPackInspection(f.database,c,options(),request,[grant],{fenceRefs:async()=>[],current:async()=>{}});
 const expirePending={...command,commandId:randomUUID(),idempotencyKey:randomUUID(),target:{...command.target,id:pending.id},expectedVersion:1};
 await assert.rejects(expire(expirePending),{code:'PRECONDITION_FAILED'});
 await f.admin`SELECT pg_sleep(1.1)`;
 const expired=await read(await expire(expirePending));assert.equal(expired.status,'Failed');assert.equal(expired.diagnostic?.code,'Expired');assert.equal(expired.budget.elapsedMs,0);assert.equal(expired.budget.attempts,0);
}
