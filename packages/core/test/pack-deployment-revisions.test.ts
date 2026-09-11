import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {Database} from '../src/data/uow.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {PackDeploymentRevisionOwner} from '../src/extensions/deployment-revisions.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';

test('deployment revision migration preserves old Stage history and runtime CAS remains append-only',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const a=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'}),b=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'}),owner=new PackDeploymentRevisionOwner();
 const inserted=new Map<string,ReturnType<typeof target>>();
 function target(){return {type:'abh.installed-pack',id:randomUUID(),version:1};}
 // Minimal pre-migration SQL rows exercise only the old database identity constraints.
 // Real Stage/Manifest integration is separately covered by pack-conformance.test.ts.
 async function seed(c:typeof a,version:number){
  const ref=target(),org=c.tenant.resourceOrganizationId,digest='sha256:'+'a'.repeat(64),packId=`org.fixture.pack${version}`;
  const record={packRef:ref,status:'Staged',deploymentVersion:version,manifest:{metadata:{id:packId,version:'1.0.0'},integrity:{packageDigest:digest}}};
  await f.admin`INSERT INTO extension.installed_packs(resource_organization_id,id,created_by,updated_by,purpose_names,record,pack_id,pack_version,package_digest,deployment_version)
   VALUES (${org},${ref.id},${c.tenant.actor.id},${c.tenant.actor.id},ARRAY['abh.pack.manage'],${JSON.stringify(record)}::text::jsonb,${packId},'1.0.0',${digest},${version})`;
  inserted.set(`${org}/${version}`,ref);return ref;
 }
 await seed(a,1);await seed(a,2);await seed(b,1);
 await f.admin`DROP TABLE extension.deployment_revisions`;
 const migration=createRequire(import.meta.url)('../migrations/1788880000000_pack_deployment_revisions.cjs');let sql='';migration.up({sql:(value:string)=>{sql=value;}});await f.admin.unsafe(sql);
 await f.database.verify();
 assert.equal(await f.database.transaction(a,options(),tx=>owner.current(tx)),2);
 assert.equal(await f.database.transaction(b,options(),tx=>owner.current(tx)),1);
 const records=await f.database.transaction(a,options(),tx=>tx.owner('PackLoader')`SELECT record FROM extension.deployment_revisions ORDER BY deployment_version`);
 assert.deepEqual(records.map(r=>r.record.targetRef),[inserted.get(`${a.tenant.resourceOrganizationId}/1`),inserted.get(`${a.tenant.resourceOrganizationId}/2`)]);
 assert.equal((await f.raw`SELECT id FROM extension.deployment_revisions`).length,0);
 await assert.rejects(f.database.transaction(a,options(),tx=>tx.owner('PackLoader')`UPDATE extension.deployment_revisions SET record=record`),{code:'42501'});
 await assert.rejects(f.database.transaction(a,options(),tx=>tx.owner('PackLoader')`DELETE FROM extension.deployment_revisions`),{code:'42501'});
 await assert.rejects(f.database.transaction(a,options(),tx=>owner.advance(tx,1,target())),{code:'VERSION_CONFLICT'});
 await assert.rejects(f.database.transaction(a,options(),tx=>owner.advance(tx,2,target())),{code:'PRECONDITION_FAILED'});
 const next=await seed(a,3);
 await assert.rejects(f.database.transaction(a,options(),async tx=>{await owner.advance(tx,2,next);throw new Error('rollback deployment');}),/rollback deployment/);
 assert.equal(await f.database.transaction(a,options(),tx=>owner.current(tx)),2);
 const pool=await Database.connect(f.runtimeUrl,{max:2});t.after(()=>pool.close());
 const results=await Promise.allSettled([1,2].map(()=>pool.transaction(a,options(),tx=>owner.advance(tx,2,next))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'VERSION_CONFLICT');
 assert.equal(await f.database.transaction(a,options(),tx=>owner.current(tx)),3);
 assert.equal(await f.database.transaction(b,options(),tx=>owner.current(tx)),1);
});
