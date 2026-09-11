import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,RequestPackInspectionCommand} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {requestPackInspection} from '../src/extensions/request-pack-inspection.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionRequest(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef){
 const org=c.tenant.resourceOrganizationId;
 const command:RequestPackInspectionCommand={type:'abh.packs.request-inspection',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...installation.packRef,type:'abh.installed-pack',version:1},packageDigest:installation.manifest.integrity.packageDigest,environmentDigest:'sha256:'+'a'.repeat(64),deploymentVersion:installation.deploymentVersion,expiresAt:new Date(Date.now()+60000).toISOString(),maxAttempts:3,maxDurationMs:30000}};
 let admissionCount=0;
 const checks={fenceRefs:async()=>[],current:async(_tx:unknown,pack:InstalledPackRecord)=>{admissionCount++;assert.deepEqual(pack,installation);pack.deploymentVersion=999;}};
 const request=(input=command,grants=[grant])=>requestPackInspection(f.database,c,options(),input,grants,checks);
 const count=async()=>{
  const [row]=await f.admin`SELECT
   (SELECT count(*)::int FROM extension.inspection_jobs WHERE resource_organization_id=${org}) AS jobs,
   (SELECT count(*)::int FROM data.command_receipts WHERE resource_organization_id=${org} AND command_type='abh.packs.request-inspection') AS receipts,
   (SELECT count(*)::int FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.packs.request-inspection') AS audits,
   (SELECT count(*)::int FROM data.outbox WHERE resource_organization_id=${org} AND aggregate_type='abh.pack-inspection-job') AS events`;
  return row;
 };
 const before=await count(),ref=await request();assert.equal(admissionCount,2);
 const record=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,ref,async()=>{}));
 assert.equal(record.status,'Pending');assert.equal(record.budget.attempts,0);assert.equal(record.budget.elapsedMs,0);assert.equal(record.requestedBy.id,c.tenant.actor.id);
 assert.equal(record.packageDigest,installation.manifest.integrity.packageDigest);
 const once=await count();for(const key of ['jobs','receipts','audits','events'])assert.equal(once![key],before![key]+1);
 assert.deepEqual(await request({...command,commandId:randomUUID()}),ref);assert.deepEqual(await count(),once);
 await assert.rejects(request(command,[]),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(request({...command,payload:{...command.payload,maxAttempts:4}}),{code:'IDEMPOTENCY_CONFLICT'});
 await assert.rejects(request({...command,payload:{...command.payload,deploymentVersion:installation.deploymentVersion+1}}),{code:'VERSION_CONFLICT'});
 await assert.rejects(request({...command,payload:{...command.payload,expiresAt:new Date(Date.now()-1000).toISOString()}}),{code:'PRECONDITION_FAILED'});
 const fresh={...command,commandId:randomUUID(),idempotencyKey:randomUUID()};let calls=0;
 await assert.rejects(requestPackInspection(f.database,c,options(),fresh,[grant],{fenceRefs:async()=>[],current:async()=>{if(++calls===2)throw new Error('final admission rejected');}}),/final admission rejected/);
 assert.equal(calls,2);assert.deepEqual(await count(),once);
 // Simulate already advanced storage to verify creation replay, not a cancellation
 // Owner or real cancellation evidence. Replay must not reset this progress.
 const advanced={...record,jobRef:{...record.jobRef,version:2},status:'Cancelled',updatedAt:new Date().toISOString(),diagnostic:{code:'Cancelled',evidenceRefs:[{type:'abh.artifact',id:randomUUID(),version:1}]}};
 await f.admin`UPDATE extension.inspection_jobs SET version=2,status='Cancelled',record=${JSON.stringify(advanced)}::text::jsonb WHERE resource_organization_id=${org} AND id=${ref.id}`;
 assert.deepEqual(await request(),ref);assert.deepEqual(await count(),once);
 const observed=await f.database.transaction(c,options(),tx=>new PackInspectionJobOwner().read(tx,{...ref,version:2},async()=>{}));assert.equal(observed.status,'Cancelled');
}
