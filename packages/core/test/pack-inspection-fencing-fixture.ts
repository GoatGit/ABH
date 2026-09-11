import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,StoreInlineArtifactPayload} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import type {InstalledMigrationState} from '../src/extensions/verify-installed-migration-state.ts';
import {claimPackInspectionLease,releasePackInspectionLease,type PackInspectionLeaseBinding} from '../src/extensions/inspection-leases.ts';
import {persistMigrationState} from '../src/extensions/persist-migration-state.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionFencing(f:Awaited<ReturnType<typeof createDatabaseFixture>>,context:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,
 produce:()=>Promise<InstalledMigrationState>,retention:Pick<StoreInlineArtifactPayload,'dataClass'|'region'|'retentionPolicyRef'>){
 const state=await produce(),grants=[grant],worker=randomUUID(),org=context.tenant.resourceOrganizationId;
 const count=async()=>Number((await f.admin`SELECT count(*) AS n FROM data.artifacts WHERE resource_organization_id=${org}`)[0]!.n);
 const before=await count();
 const expired=await claimPackInspectionLease(f.database,context,options(),installation,grants,worker,1);
 const old:PackInspectionLeaseBinding={installation,grants,token:expired};let read=false;
 await assert.rejects(persistMigrationState(f.database,context,options(),state,retention,async()=>{},async()=>{read=true;await f.admin`SELECT pg_sleep(1.2)`;},old),{code:'PRECONDITION_FAILED'});
 assert.equal(read,true);assert.equal(await count(),before);
 const current=await claimPackInspectionLease(f.database,context,options(),installation,grants,randomUUID());
 const lease:PackInspectionLeaseBinding={installation,grants,token:current};assert.ok(current.fencingToken>expired.fencingToken);
 const stored=await persistMigrationState(f.database,context,options(),state,retention,async()=>{},async()=>{},lease);
 assert.equal(await count(),before+1);
 try{
  // Even replay of the existing Artifact must be fenced; it cannot bypass an old token.
  await assert.rejects(persistMigrationState(f.database,context,options(),state,retention,async()=>{},async()=>{},old),{code:'PRECONDITION_FAILED'});
  assert.deepEqual(await persistMigrationState(f.database,context,options(),state,retention,async()=>{},async()=>{},lease),stored);
  await assert.rejects(persistMigrationState(f.database,context,options(),state,retention,async()=>{},async()=>{},{...lease,installation:{...installation,packRef:{...installation.packRef,id:randomUUID()}}}),{code:'PRECONDITION_FAILED'});
 }finally{
  await releasePackInspectionLease(f.database,context,options(),installation,grants,current);
  await f.database.transaction(context,options(),async tx=>{
   const command={type:'abh.artifacts.tombstone',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(stored)};
   await executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().tombstone(tx,command,stored,stored,async()=>{})).artifactRef);
  });
 }
}
