import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createDatabaseFixture} from './database-fixture.ts';
import {Database} from '../src/data/uow.ts';
import {DatabaseReadinessError} from '../src/data/readiness.ts';
import {registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
test('startup accepts registered isolated Pack storage and rejects role, schema, table, column and sequence exposure',{timeout:60000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 await f.admin`CREATE ROLE hello_target LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`;
 await f.admin`CREATE SCHEMA hello_target AUTHORIZATION hello_target`;
 await f.admin`CREATE TABLE hello_target.items(id integer)`;
 await f.admin`ALTER TABLE hello_target.items OWNER TO hello_target`;
 await f.admin`CREATE SEQUENCE hello_target.ids`;
 await f.admin`ALTER SEQUENCE hello_target.ids OWNER TO hello_target`;
 await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('unregistered-table:hello_target.items'));
 await registerPackSchemaOwnership(f.admin,[{schemaName:'hello_target',databaseRole:'hello_target',packId:'hello.target'}],{type:'hello.review',id:randomUUID(),version:1});
 const fresh=await Database.connect(f.runtimeUrl);await fresh.close();
 const drift=async(change:()=>Promise<unknown>,restore:()=>Promise<unknown>,violation:string)=>{
  await change();try{await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes(violation));}finally{await restore();}
  await f.database.verify();
 };
 for(const role of ['abh_runtime','abh_queue','abh_control_verifier']){
  // Fixed test role names only; PostgreSQL GRANT identifiers cannot be parameters.
  await drift(()=>f.admin.unsafe(`GRANT USAGE ON SCHEMA hello_target TO ${role}`),()=>f.admin.unsafe(`REVOKE USAGE ON SCHEMA hello_target FROM ${role}`),'pack-schema-isolation:hello_target');
  await drift(()=>f.admin.unsafe(`GRANT SELECT ON hello_target.items TO ${role}`),()=>f.admin.unsafe(`REVOKE SELECT ON hello_target.items FROM ${role}`),'pack-table-isolation:hello_target.items');
  await drift(()=>f.admin.unsafe(`GRANT SELECT(id) ON hello_target.items TO ${role}`),()=>f.admin.unsafe(`REVOKE SELECT(id) ON hello_target.items FROM ${role}`),'pack-table-isolation:hello_target.items');
  await drift(()=>f.admin.unsafe(`GRANT USAGE ON SEQUENCE hello_target.ids TO ${role}`),()=>f.admin.unsafe(`REVOKE USAGE ON SEQUENCE hello_target.ids FROM ${role}`),'pack-sequence-isolation:hello_target.ids');
 }
 await drift(()=>f.admin`ALTER ROLE hello_target BYPASSRLS`,()=>f.admin`ALTER ROLE hello_target NOBYPASSRLS`,'pack-schema-isolation:hello_target');
 await drift(()=>f.admin`GRANT abh_core_owner TO hello_target`,()=>f.admin`REVOKE abh_core_owner FROM hello_target`,'pack-schema-isolation:hello_target');
 await drift(()=>f.admin`ALTER TABLE hello_target.items OWNER TO abh_core_owner`,()=>f.admin`ALTER TABLE hello_target.items OWNER TO hello_target`,'pack-table-isolation:hello_target.items');
 await drift(()=>f.admin`UPDATE extension.schema_ownership SET review_ref='{}'::jsonb WHERE schema_name='hello_target'`,()=>f.admin`UPDATE extension.schema_ownership SET review_ref=${JSON.stringify({type:'hello.review',id:randomUUID(),version:1})}::text::jsonb WHERE schema_name='hello_target'`,'pack-schema-isolation:hello_target');
});
