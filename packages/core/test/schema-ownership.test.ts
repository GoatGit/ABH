import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {PackSchemaOwnershipOwner,readPackSchemaOwnership,registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
import {DatabaseReadinessError} from '../src/data/readiness.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';

const review={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1};
const owner={packId:'org.hello.pack',schemaName:'hello_domain',databaseRole:'hello_migrator'};
test('deployment Schema ownership is persistent, globally unique and maintenance-only',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 await f.admin`CREATE ROLE hello_migrator LOGIN NOINHERIT`;
 await f.admin`CREATE ROLE other_migrator LOGIN NOINHERIT`;
 await f.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
 await f.admin`CREATE SCHEMA hello_history AUTHORIZATION hello_migrator`;
 await f.admin`CREATE SCHEMA other_domain AUTHORIZATION other_migrator`;
 await t.test('actual schema and dedicated role are required before any durable writes',async()=>{
  for(const patch of [{schemaName:'missing_domain'},{databaseRole:'other_migrator'},{schemaName:'identity'}])await assert.rejects(registerPackSchemaOwnership(f.admin,[{...owner,...patch}],review));
  await f.admin`ALTER ROLE hello_migrator BYPASSRLS`;
  await assert.rejects(registerPackSchemaOwnership(f.admin,[owner],review),{code:'FORBIDDEN'});
  await f.admin`ALTER ROLE hello_migrator NOBYPASSRLS`;
  assert.equal((await readPackSchemaOwnership(f.raw)).length,0);
 });
 await t.test('registration is durable, records review and maintenance actor, and preserves evidence on replay',async()=>{
  await registerPackSchemaOwnership(f.admin,[owner],review);
  assert.deepEqual(await readPackSchemaOwnership(f.raw),[owner]);
  await registerPackSchemaOwnership(f.admin,[owner],{...review,version:2});
  const [row]=await f.raw`SELECT review_ref,maintenance_actor,migration_version FROM extension.schema_ownership`;
  assert.deepEqual(row!.review_ref,review);assert.equal(row!.maintenance_actor,'migration_runner');assert.equal(Number(row!.migration_version),0);
  await f.database.verify();
 });
 await t.test('runtime and queue cannot claim or change global schema ownership',async()=>{
  await assert.rejects(registerPackSchemaOwnership(f.raw,[owner],review),{code:'FORBIDDEN'});
  for(const sql of [f.raw,f.queue])for(const command of [
   "INSERT INTO extension.schema_roles(database_role,pack_id) VALUES ('rogue','org.rogue.pack')",
   "UPDATE extension.schema_ownership SET pack_id='org.other.pack'",
   'DELETE FROM extension.schema_ownership',
  ])await assert.rejects(sql.unsafe(command),{code:'42501'});
 });
 await t.test('global collisions reject all additions atomically; another schema for same Pack succeeds',async()=>{
  const extra={...owner,schemaName:'hello_history'};
  await assert.rejects(registerPackSchemaOwnership(f.admin,[extra,{...owner,packId:'org.other.pack'}],review),{code:'FORBIDDEN'});
  assert.deepEqual(await readPackSchemaOwnership(f.raw),[owner]);
  await assert.rejects(registerPackSchemaOwnership(f.admin,[{...extra,packId:'org.other.pack'}],review),{code:'FORBIDDEN'});
  await registerPackSchemaOwnership(f.admin,[extra],review);
  assert.equal((await readPackSchemaOwnership(f.raw)).length,2);
 });
 await t.test('database constraints reject cross-Pack role reuse and duplicate Schema even outside helper',async()=>{
  await assert.rejects(f.admin`INSERT INTO extension.schema_roles(database_role,pack_id) VALUES ('hello_migrator','org.other.pack')`,{code:'23505'});
  await assert.rejects(f.admin`INSERT INTO extension.schema_ownership(schema_name,pack_id,database_role,review_ref) VALUES ('other_domain','org.other.pack','hello_migrator',${JSON.stringify(review)}::text::jsonb)`,{code:'23503'});
  await assert.rejects(f.admin`INSERT INTO extension.schema_ownership(schema_name,pack_id,database_role,review_ref) VALUES ('hello_domain','org.hello.pack','hello_migrator',${JSON.stringify(review)}::text::jsonb)`,{code:'23505'});
 });
 await t.test('management Owner requires context and current admission',async()=>{
  const c=context();
  await assert.rejects(f.database.transaction(c,options(),tx=>new PackSchemaOwnershipOwner().read(tx,async()=>{})),{code:'FORBIDDEN'});
  const management=deriveVerifiedContext({...c.request,purposeOfUse:'abh.pack.manage'});
  const denied=new Error('current admission denied');
  await assert.rejects(f.database.transaction(management,options(),tx=>new PackSchemaOwnershipOwner().read(tx,async()=>{throw denied;})),error=>error===denied);
  const records=await f.database.transaction(management,options(),tx=>new PackSchemaOwnershipOwner().read(tx,async()=>{}));
  assert.equal(records.length,2);
 });
 await t.test('readiness catches maintenance registry table and column write grants',async()=>{
  for(const [grant,revoke] of [
   ['GRANT INSERT ON extension.schema_roles TO abh_runtime','REVOKE INSERT ON extension.schema_roles FROM abh_runtime'],
   ['GRANT UPDATE(pack_id) ON extension.schema_ownership TO abh_runtime','REVOKE UPDATE(pack_id) ON extension.schema_ownership FROM abh_runtime'],
   ['GRANT SELECT(pack_id) ON extension.schema_ownership TO abh_queue','REVOKE SELECT(pack_id) ON extension.schema_ownership FROM abh_queue'],
  ]){
   await f.admin.unsafe(grant!);try{await assert.rejects(f.database.verify(),DatabaseReadinessError);}finally{await f.admin.unsafe(revoke!);}
   await f.database.verify();
  }
 });
 await t.test('readiness rejects removed global ownership constraint',async()=>{
  await f.admin`ALTER TABLE extension.schema_ownership DROP CONSTRAINT schema_ownership_database_role_pack_id_fkey`;
  await assert.rejects(f.database.verify(),DatabaseReadinessError);
  await f.admin`ALTER TABLE extension.schema_ownership ADD CONSTRAINT schema_ownership_database_role_pack_id_fkey FOREIGN KEY(database_role,pack_id) REFERENCES extension.schema_roles(database_role,pack_id)`;
  await f.database.verify();
 });
});
