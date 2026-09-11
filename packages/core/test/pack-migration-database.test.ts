import {verifyRegisteredMigrationData,type MigrationDataBinding} from '../src/extensions/verify-registered-migration-data.ts';
import type {MigrationDataCheck} from '../src/extensions/verify-migration-data.ts';
import {verifyRegisteredMigrationStructure,type MigrationStructureBinding} from '../src/extensions/verify-registered-migration-structure.ts';
import type {MigrationStructureExpectation} from '../src/extensions/verify-migration-structure.ts';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {test} from 'node:test';
import postgres from 'postgres';
import type {PackManifest,PackMigrationStep} from '@abh/contracts';
import {digestPackManifest} from '@abh/contracts/digest';
import {verifyPackMigrationDatabase,verifyRegisteredPackMigrationDatabase} from '../src/extensions/pack-migration-database.ts';
import {registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {packManifest} from './pack-fixture.ts';

test('migration preflight checks real dedicated PostgreSQL privileges', {timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const password=randomBytes(24).toString('hex');
 await f.admin.unsafe(`CREATE ROLE hello_migrator LOGIN NOINHERIT PASSWORD '${password}'`);
 await f.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
 const url=new URL(f.runtimeUrl);url.username='hello_migrator';url.password=password;
 const pool=postgres(url.toString(),{max:1,onnotice:()=>{}});t.after(()=>pool.end());
 const connection=await pool.reserve();t.after(()=>connection.release());
 const pack=await packManifest() as PackManifest;
 const ref={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1};
 pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
 pack.migrations=[{...pack.artifacts[0]!,ref:'migration.sql'}];
 const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
 const owners=[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}];
 const step:PackMigrationStep={ref:'migration.sql',digest:pack.migrations[0]!.digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
 const verify=()=>verifyPackMigrationDatabase(connection,pack,owners,[step]);
 await verify();
 await t.test('composed preflight requires persisted ownership and fresh admission',async()=>{
  const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
  const check=(admit:()=>Promise<void>=async()=>{})=>f.database.transaction(c,options(),tx=>verifyRegisteredPackMigrationDatabase(tx,connection,pack,[step],admit));
  await assert.rejects(check(),{code:'FORBIDDEN'});
  await registerPackSchemaOwnership(f.admin,owners,ref);
  await check();
  let calls=0;
  const denied=new Error('current deployment admission denied');
  await assert.rejects(check(async()=>{if(++calls===2)throw denied;}),error=>error===denied);
  calls=0;
  try{
   await assert.rejects(check(async()=>{if(++calls===2)await f.admin`ALTER ROLE hello_migrator BYPASSRLS`;}),{code:'FORBIDDEN'});
  }finally{await f.admin`ALTER ROLE hello_migrator NOBYPASSRLS`;}
  calls=0;
  try{
   await assert.rejects(check(async()=>{if(++calls===2)await f.admin`DELETE FROM extension.schema_ownership`;}),{code:'VERSION_CONFLICT'});
  }finally{await registerPackSchemaOwnership(f.admin,owners,ref);}
  await check();
  const [locks]=await connection`SELECT count(*)::integer AS count FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'`;
  assert.equal(locks!.count,0);
 });
 await t.test('registered structure inspection binds governed expectation and complete schema scope',async()=>{
  const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
  const expected:MigrationStructureExpectation={inventory:[{schema:'hello_domain',relations:[]}],tables:[],sequences:[],views:[],acl:[]};
  const inspect=async(input=expected,admit:(binding:Readonly<MigrationStructureBinding>)=>Promise<void>=async()=>{})=>{
   await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
   try{return await f.database.transaction(c,options(),tx=>verifyRegisteredMigrationStructure(tx,connection,options(),pack,[step],input,admit));}
   finally{await connection`ROLLBACK`;}
  };
  const seen:MigrationStructureBinding[]=[];
  const result=await inspect(expected,async binding=>{assert.equal(Object.isFrozen(binding),true);seen.push({...binding});});
  assert.equal(result.matched,true);assert.equal(result.binding.packageDigest,pack.integrity.packageDigest);assert.equal(result.binding.expectedDigest,result.expectedDigest);
  assert.equal(result.binding.organizationId,c.tenant.resourceOrganizationId);assert.ok(seen.length>=2);assert.ok(seen.every(binding=>JSON.stringify(binding)===JSON.stringify(result.binding)));
  await assert.rejects(inspect({...expected,inventory:[]}),{code:'PRECONDITION_FAILED'});
  await assert.rejects(inspect({...expected,inventory:[...expected.inventory,{schema:'another_domain',relations:[]}]}),{code:'PRECONDITION_FAILED'});
  let calls=0;const denied=new Error('governed expectation withdrawn');
  await assert.rejects(inspect(expected,async()=>{if(++calls===4)throw denied;}),error=>error===denied);
  // Changing the caller object during admission cannot replace the inspected bytes.
  const mutable=structuredClone(expected);
  const fixed=await inspect(mutable,async()=>{mutable.inventory[0]!.relations=[{name:'injected',kind:'S'}];});
  assert.equal(fixed.matched,true);assert.equal(fixed.expectedDigest,result.expectedDigest);
  await connection`CREATE SEQUENCE hello_domain.unexpected_seq`;
  try{assert.equal((await inspect()).matched,false);}finally{await connection`DROP SEQUENCE hello_domain.unexpected_seq`;}
  await assert.rejects(f.database.transaction(c,options(),tx=>verifyRegisteredMigrationStructure(tx,connection,options(),pack,[step],expected,async()=>{})),{code:'FORBIDDEN'});
 });
 await t.test('registered data inspection binds current authority, scope and real rows',async()=>{
  const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
  await connection`CREATE TABLE hello_domain.checked_data (id integer,label text)`;
  await connection`INSERT INTO hello_domain.checked_data VALUES (1,'one'),(2,'two')`;
  const expected:MigrationDataCheck[]=[{schema:'hello_domain',table:'checked_data',rowCount:'2',nonNull:['id','label'],uniqueKeys:[['id']]}];
  const inspect=async(input=expected,admit:(binding:Readonly<MigrationDataBinding>)=>Promise<void>=async()=>{})=>{
   await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
   try{return await f.database.transaction(c,options(),tx=>verifyRegisteredMigrationData(tx,connection,options(),pack,[step],input,admit));}finally{await connection`ROLLBACK`;}
  };
  const seen:MigrationDataBinding[]=[];const result=await inspect(expected,async binding=>{assert.equal(Object.isFrozen(binding),true);seen.push({...binding});});
  assert.equal(result.matched,true);assert.equal(result.binding.kind,'DataInvariants');assert.equal(result.binding.packageDigest,pack.integrity.packageDigest);assert.equal(result.binding.expectedDigest,result.expectedDigest);assert.ok(seen.length>=4);assert.ok(seen.every(binding=>JSON.stringify(binding)===JSON.stringify(result.binding)));
  const mutable=structuredClone(expected);assert.equal((await inspect(mutable,async()=>{mutable[0]!.rowCount='0';})).matched,true);
  let calls=0;await assert.rejects(inspect(expected,async()=>{if(++calls===4)throw new Error('data authority withdrawn');}),/data authority withdrawn/);
  await assert.rejects(inspect([{...expected[0]!,schema:'identity'}]),{code:'PRECONDITION_FAILED'});
  await connection`UPDATE hello_domain.checked_data SET id=1,label=NULL WHERE id=2`;
  const drift=await inspect();assert.equal(drift.matched,false);assert.equal(drift.results[0]!.duplicates[0]!.groups,'1');assert.equal(drift.results[0]!.nulls[1]!.count,'1');
  await connection`DROP TABLE hello_domain.checked_data`;
 });
 await t.test('independent server with the same database and role names fails live binding',async()=>{
  const otherFixture=await createDatabaseFixture();
  try{
   await otherFixture.admin.unsafe(`CREATE ROLE hello_migrator LOGIN NOINHERIT PASSWORD '${password}'`);
   await otherFixture.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
   const otherUrl=new URL(otherFixture.runtimeUrl);otherUrl.username='hello_migrator';otherUrl.password=password;
   const otherPool=postgres(otherUrl.toString(),{max:1,onnotice:()=>{}});
   const other=await otherPool.reserve();
   try{
    // The independent target passes static ownership and real privilege checks.
    await verifyPackMigrationDatabase(other,pack,owners,[step]);
    const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
    await assert.rejects(f.database.transaction(c,options(),tx=>verifyRegisteredPackMigrationDatabase(tx,other,pack,[step],async()=>{})),{code:'PRECONDITION_FAILED'});
    await other`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    try{await assert.rejects(f.database.transaction(c,options(),tx=>verifyRegisteredMigrationStructure(tx,other,options(),pack,[step],{inventory:[{schema:'hello_domain',relations:[]}],tables:[],sequences:[],views:[],acl:[]},async()=>{})),{code:'PRECONDITION_FAILED'});}
    finally{await other`ROLLBACK`;}
    await other`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    try{await assert.rejects(f.database.transaction(c,options(),tx=>verifyRegisteredMigrationData(tx,other,options(),pack,[step],[{schema:'hello_domain',table:'data',rowCount:'0',nonNull:[],uniqueKeys:[]}],async()=>{})),{code:'PRECONDITION_FAILED'});}
    finally{await other`ROLLBACK`;}

    const [locks]=await other`SELECT count(*)::integer AS count FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'`;
    assert.equal(locks!.count,0);
   }finally{other.release();await otherPool.end();}
  }finally{await otherFixture.close();}
 });
 await t.test('same server but different database cannot borrow persistent ownership',async()=>{
  await f.admin`CREATE DATABASE other_pack_database`;
  const otherUrl=new URL(url);otherUrl.pathname='/other_pack_database';
  const otherPool=postgres(otherUrl.toString(),{max:1,onnotice:()=>{}});
  const other=await otherPool.reserve();
  try{
   const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
   await assert.rejects(f.database.transaction(c,options(),tx=>verifyRegisteredPackMigrationDatabase(tx,other,pack,[step],async()=>{})),{code:'PRECONDITION_FAILED'});
   const [row]=await other`SELECT count(*)::integer AS count FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'`;
   assert.equal(row!.count,0);
  }finally{other.release();await otherPool.end();await f.admin`DROP DATABASE other_pack_database`;}
 });
 await t.test('own schema works while actual Core writes and role escalation fail',async()=>{
  await connection`CREATE TABLE hello_domain.example (id integer,body text)`;
  await verify();
  const [toast]=await connection`SELECT reltoastrelid FROM pg_class WHERE oid='hello_domain.example'::regclass`;assert.notEqual(toast!.reltoastrelid,0);
  for(const command of ['CREATE TABLE identity.bypass (id integer)','SET ROLE abh_core_owner','CREATE SCHEMA bypass','CREATE TEMP TABLE bypass (id integer)','ALTER ROLE hello_migrator SUPERUSER'])await assert.rejects(connection.unsafe(command),{code:'42501'});
 });
 await t.test('foreign TOAST ownership cannot borrow the own-table storage exception',async()=>{
  await f.admin`CREATE TABLE public.foreign_payload (body text)`;
  const [row]=await f.admin`SELECT t.oid,t.relowner FROM pg_class c JOIN pg_class t ON t.oid=c.reltoastrelid WHERE c.oid='public.foreign_payload'::regclass`;
  await f.admin`UPDATE pg_class SET relowner=(SELECT oid FROM pg_roles WHERE rolname='hello_migrator') WHERE oid=${row!.oid}`;
  try{await assert.rejects(verify(),{code:'FORBIDDEN'});}finally{await f.admin`UPDATE pg_class SET relowner=${row!.relowner} WHERE oid=${row!.oid}`;await f.admin`DROP TABLE public.foreign_payload`;}
  await verify();
 });
 const changes=[
  ['ALTER ROLE hello_migrator BYPASSRLS','ALTER ROLE hello_migrator NOBYPASSRLS'],
  ['ALTER ROLE hello_migrator INHERIT','ALTER ROLE hello_migrator NOINHERIT'],
  ['GRANT abh_core_owner TO hello_migrator','REVOKE abh_core_owner FROM hello_migrator'],
  ['GRANT CREATE ON DATABASE abh_test TO hello_migrator','REVOKE CREATE ON DATABASE abh_test FROM hello_migrator'],
  ['GRANT TEMP ON DATABASE abh_test TO PUBLIC','REVOKE TEMP ON DATABASE abh_test FROM PUBLIC'],
  ['GRANT CREATE ON SCHEMA public TO PUBLIC','REVOKE CREATE ON SCHEMA public FROM PUBLIC'],
  ['GRANT UPDATE(name) ON identity.organizations TO hello_migrator','REVOKE UPDATE(name) ON identity.organizations FROM hello_migrator'],
  ['GRANT UPDATE(rolname) ON pg_catalog.pg_authid TO hello_migrator','REVOKE UPDATE(rolname) ON pg_catalog.pg_authid FROM hello_migrator'],
  ['GRANT SELECT ON identity.organizations TO PUBLIC','REVOKE SELECT ON identity.organizations FROM PUBLIC'],
  ['ALTER SCHEMA hello_domain OWNER TO abh_core_owner','ALTER SCHEMA hello_domain OWNER TO hello_migrator'],
  ['GRANT SET ON PARAMETER session_replication_role TO hello_migrator','REVOKE SET ON PARAMETER session_replication_role FROM hello_migrator'],
  ['GRANT SET ON PARAMETER session_replication_role TO PUBLIC','REVOKE SET ON PARAMETER session_replication_role FROM PUBLIC'],
  ['GRANT ALTER SYSTEM ON PARAMETER work_mem TO hello_migrator','REVOKE ALTER SYSTEM ON PARAMETER work_mem FROM hello_migrator'],
 ];
 for(const [grant,revoke] of changes)await t.test(grant!,async()=>{
  await f.admin.unsafe(grant!);
  try{await assert.rejects(verify(),{code:'FORBIDDEN'});}finally{await f.admin.unsafe(revoke!);}
  await verify();
 });
 await t.test('revoking parameter privilege does not hide an already changed session',async()=>{
  await assert.rejects(connection`SET session_replication_role='replica'`,{code:'42501'});
  await f.admin`GRANT SET ON PARAMETER session_replication_role TO hello_migrator`;
  try{
   await connection`SET session_replication_role='replica'`;
   await f.admin`REVOKE SET ON PARAMETER session_replication_role FROM hello_migrator`;
   await assert.rejects(verify(),{code:'FORBIDDEN'});
  }finally{
   await f.admin`GRANT SET ON PARAMETER session_replication_role TO hello_migrator`;
   await connection`SET session_replication_role='origin'`;
   await f.admin`REVOKE SET ON PARAMETER session_replication_role FROM hello_migrator`;
  }
  await verify();
 });
 await t.test('foreign sequences and SECURITY DEFINER routines reject',async()=>{
  await f.admin`CREATE SEQUENCE public.foreign_counter`;
  await f.admin`GRANT USAGE ON SEQUENCE public.foreign_counter TO hello_migrator`;
  await assert.rejects(verify(),{code:'FORBIDDEN'});
  await f.admin`REVOKE USAGE ON SEQUENCE public.foreign_counter FROM hello_migrator`;
  await verify();
  await f.admin`CREATE FUNCTION public.migration_escape() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`;
  await assert.rejects(verify(),{code:'FORBIDDEN'});
  await f.admin`DROP FUNCTION public.migration_escape()`;
  await verify();
 });
 await t.test('SET ROLE from an elevated session cannot impersonate dedicated login',async()=>{
  const elevated=await f.admin.reserve();
  try{await elevated`SET ROLE hello_migrator`;await assert.rejects(verifyPackMigrationDatabase(elevated,pack,owners,[step]),{code:'FORBIDDEN'});}
  finally{await elevated`RESET ROLE`;elevated.release();}
 });
});
