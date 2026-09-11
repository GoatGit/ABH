import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {PackInspectionJobRecord} from '@abh/contracts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {PackInspectionJobOwner} from '../src/extensions/inspection-jobs.ts';
import {DatabaseReadinessError} from '../src/data/readiness.ts';
import {resolvePackInspectionDelivery} from '../src/extensions/resolve-pack-inspection-delivery.ts';
import {databaseManifest} from '../src/data/manifest.ts';

test('inspection Job storage enforces tenant identity, version, progress and readiness', {timeout:60000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const seed=context(),c=deriveVerifiedContext({...seed.request,purposeOfUse:'abh.pack.manage'}),org=c.tenant.resourceOrganizationId,id=randomUUID();
 const record:PackInspectionJobRecord={jobRef:{type:'abh.pack-inspection-job',id,version:1},resourceOrganizationId:org,packRef:{type:'abh.installed-pack',id:randomUUID(),version:1},packageDigest:'sha256:'+'a'.repeat(64),environmentDigest:'sha256:'+'b'.repeat(64),deploymentVersion:1,kind:'StructureAndDataInspection',status:'Pending',requestedBy:{type:'abh.principal',id:c.tenant.actor.id,version:1},commandId:randomUUID(),idempotencyKey:randomUUID(),requestedAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z',expiresAt:'2026-09-09T00:01:00Z',budget:{maxAttempts:3,attempts:0,maxDurationMs:30000,elapsedMs:0}};
 // Direct storage fixture, not a command, verified installation or produced observation.
 await f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`INSERT INTO extension.inspection_jobs
  (resource_organization_id,id,record,pack_id,package_digest,environment_digest,deployment_version,status,purpose_names)
  VALUES (${org},${id},${JSON.stringify(record)}::text::jsonb,${record.packRef.id},${record.packageDigest},${record.environmentDigest},1,'Pending',${['abh.pack.manage']})`);
 const owner=new PackInspectionJobOwner();let admitted=0;
 const read=()=>f.database.transaction(c,options(),tx=>owner.read(tx,record.jobRef,async supplied=>{admitted++;supplied.budget.maxAttempts=100;}));
 assert.deepEqual(await read(),record);assert.equal(admitted,1);
 await assert.rejects(f.database.transaction(c,options(),tx=>owner.read(tx,{...record.jobRef,version:2},async()=>{})),{code:'VERSION_CONFLICT'});
 await assert.rejects(f.database.transaction(c,options(),tx=>owner.read(tx,record.jobRef,async()=>{throw new Error('admission denied');})),/admission denied/);
 const foreignSeed=context(),foreign=deriveVerifiedContext({...foreignSeed.request,purposeOfUse:'abh.pack.manage'});
 await assert.rejects(f.database.transaction(foreign,options(),tx=>owner.read(tx,record.jobRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
 await assert.rejects(f.database.transaction(seed,options(),tx=>owner.read(tx,record.jobRef,async()=>{})),{code:'FORBIDDEN'});
 await assert.rejects(f.database.transaction(foreign,options(),tx=>tx.owner('PackLoader')`INSERT INTO extension.inspection_jobs
  (resource_organization_id,id,record,pack_id,package_digest,environment_digest,deployment_version,status,purpose_names)
  VALUES (${org},${randomUUID()},${JSON.stringify(record)}::text::jsonb,${record.packRef.id},${record.packageDigest},${record.environmentDigest},1,'Pending',${['abh.pack.manage']})`),{code:'42501'});
 for(const update of [
  ()=>f.admin`UPDATE extension.inspection_jobs SET record=record-'jobRef' WHERE id=${id}`,
  ()=>f.admin`UPDATE extension.inspection_jobs SET record=jsonb_set(record,'{resourceOrganizationId}',to_jsonb(${randomUUID()}::text)) WHERE id=${id}`,
  ()=>f.admin`UPDATE extension.inspection_jobs SET version=2 WHERE id=${id}`,
  ()=>f.admin`UPDATE extension.inspection_jobs SET status='Enabled' WHERE id=${id}`,
 ])await assert.rejects(update,{code:'23514'});
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`DELETE FROM extension.inspection_jobs WHERE id=${id}`),{code:'42501'});
 // DB identity checks complement, but do not replace, the complete contract validator.
 await f.admin`UPDATE extension.inspection_jobs SET record=jsonb_set(record,'{budget,attempts}','2'::jsonb) WHERE id=${id}`;
 await assert.rejects(read,{code:'INVALID_ARGUMENT'});
 await f.admin`UPDATE extension.inspection_jobs SET record=${JSON.stringify(record)}::text::jsonb WHERE id=${id}`;
 let scans=0;
 const scan=(limit:number,after?:string)=>f.database.transaction(c,options(),tx=>owner.scanPending(tx,limit,after,async()=>{scans++;}));
 const first=await scan(1);assert.deepEqual(first.refs,[record.jobRef]);assert.equal(first.next,undefined);assert.equal(scans,2);
 assert.deepEqual((await scan(1,id)).refs,[]);assert.equal(scans,4);
 await assert.rejects(scan(0),{code:'INVALID_ARGUMENT'});await assert.rejects(scan(101),{code:'INVALID_ARGUMENT'});await assert.rejects(scan(1,'bad-cursor'),{code:'INVALID_ARGUMENT'});
 await assert.rejects(f.database.transaction(c,options(),tx=>owner.scanPending(tx,1,id,async()=>{throw new Error('empty denied');})),/empty denied/);
 const secondId=randomUUID(),second={...record,jobRef:{...record.jobRef,id:secondId}};
 await f.admin`INSERT INTO extension.inspection_jobs(resource_organization_id,id,record,pack_id,package_digest,environment_digest,deployment_version,status,purpose_names,created_by,updated_by)
  SELECT resource_organization_id,${secondId},${JSON.stringify(second)}::text::jsonb,pack_id,package_digest,environment_digest,deployment_version,status,purpose_names,created_by,updated_by FROM extension.inspection_jobs WHERE id=${id}`;
 const ordered=[id,secondId].sort(),page=await scan(1);assert.equal(page.refs[0]!.id,ordered[0]);assert.equal(page.next,ordered[0]);
 const last=await scan(1,page.next);assert.equal(last.refs[0]!.id,ordered[1]);assert.equal(last.next,undefined);
 assert.deepEqual((await f.database.transaction(foreign,options(),tx=>owner.scanPending(tx,20,undefined,async()=>{}))).refs,[]);
 const cancelled={...second,status:'Cancelled',diagnostic:{code:'Cancelled',evidenceRefs:[{type:'abh.artifact',id:randomUUID(),version:1}]}};
 await f.admin`UPDATE extension.inspection_jobs SET status='Cancelled',record=${JSON.stringify(cancelled)}::text::jsonb WHERE id=${secondId}`;
 assert.deepEqual((await scan(20)).refs,[record.jobRef]);
 // Delivery resolution uses actual current versions and DB time, never queue status.
 const resolve=(ref=record.jobRef,admit:()=>Promise<void>=async()=>{})=>f.database.transaction(c,options(),tx=>resolvePackInspectionDelivery(tx,ref,admit));
 const past={...record,requestedAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z',expiresAt:'2020-01-02T00:00:00Z'};
 await f.admin`UPDATE extension.inspection_jobs SET record=${JSON.stringify(past)}::text::jsonb WHERE id=${id}`;
 assert.equal((await resolve()).disposition,'Expire');
 const live={...past,expiresAt:'2099-01-01T00:00:00Z'};
 await f.admin`UPDATE extension.inspection_jobs SET record=${JSON.stringify(live)}::text::jsonb WHERE id=${id}`;
 assert.equal((await resolve()).disposition,'Execute');
 const waiting={...live,jobRef:{...live.jobRef,version:3},status:'Waiting',budget:{...live.budget,attempts:1},diagnostic:{code:'Missing',evidenceRefs:[{type:'abh.artifact',id:randomUUID(),version:1}]}};
 await f.admin`UPDATE extension.inspection_jobs SET version=3,status='Waiting',record=${JSON.stringify(waiting)}::text::jsonb WHERE id=${id}`;
 const progressed=await resolve();assert.equal(progressed.disposition,'Progressed');assert.equal(progressed.job.jobRef.version,3);
 assert.equal((await resolve(waiting.jobRef)).disposition,'Execute');
 await assert.rejects(resolve({...record.jobRef,version:4}),{code:'VERSION_CONFLICT'});
 await assert.rejects(resolve(record.jobRef,async()=>{throw new Error('current denied');}),/current denied/);
 await assert.rejects(read,{code:'VERSION_CONFLICT'});
 const [databaseClock]=await f.admin`SELECT clock_timestamp() AS now`;
 const running={...waiting,status:'Running',updatedAt:databaseClock!.now.toISOString(),lease:{leaseRef:{type:'abh.work-lease',id:randomUUID(),version:1},workerId:randomUUID(),fencingToken:1}};
 delete (running as {diagnostic?:unknown}).diagnostic;
 await f.admin`UPDATE extension.inspection_jobs SET status='Running',record=${JSON.stringify(running)}::text::jsonb WHERE id=${id}`;
 assert.equal((await resolve()).disposition,'Running');
 await f.database.transaction(c,options(),tx=>owner.assertRunning(tx,waiting.jobRef));
 await assert.rejects(f.database.transaction(c,options(),tx=>owner.assertRunning(tx,record.jobRef)),{code:'VERSION_CONFLICT'});
 await assert.rejects(f.database.transaction(c,options(),tx=>owner.assertRunning(tx,second.jobRef)),{code:'PRECONDITION_FAILED'});
 await assert.rejects(f.database.transaction(foreign,options(),tx=>owner.assertRunning(tx,waiting.jobRef)),{code:'RESOURCE_NOT_FOUND'});
 await assert.rejects(f.database.transaction(seed,options(),tx=>owner.assertRunning(tx,waiting.jobRef)),{code:'FORBIDDEN'});
 const exhausted={...running,updatedAt:new Date(databaseClock!.now.getTime()-60000).toISOString()};
 await f.admin`UPDATE extension.inspection_jobs SET record=${JSON.stringify(exhausted)}::text::jsonb WHERE id=${id}`;
 assert.equal((await resolve()).disposition,'Expire');
 assert.equal((await resolve(second.jobRef)).disposition,'Terminal');
 await assert.rejects(resolve(second.jobRef,async()=>{throw new Error('terminal denied');}),/terminal denied/);
 await assert.rejects(f.database.transaction(foreign,options(),tx=>resolvePackInspectionDelivery(tx,record.jobRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
 await f.admin`UPDATE extension.inspection_jobs SET version=1,status='Pending',record=${JSON.stringify(record)}::text::jsonb WHERE id=${id}`;
 const index=databaseManifest.indexes.find(item=>item.name==='inspection_jobs_pending_idx')!;
 await f.admin`DROP INDEX extension.inspection_jobs_pending_idx`;
 await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('lookup-index:extension.inspection_jobs_pending_idx'));
 await f.admin.unsafe(index.definition);
 await f.admin`ALTER TABLE extension.inspection_jobs DROP CONSTRAINT pack_inspection_job_state_check`;
 await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('state-constraint:extension.inspection_jobs'));
 await f.admin`ALTER TABLE extension.inspection_jobs ADD CONSTRAINT pack_inspection_job_state_check CHECK(status IS NOT NULL AND status IN ('Pending','Running','Waiting','Succeeded','Failed','Cancelled'))`;
 await f.database.verify();assert.deepEqual(await read(),record);
});
