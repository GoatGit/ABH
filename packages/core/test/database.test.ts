import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { createDatabaseFixture, context, options } from './database-fixture.ts';
import { databaseManifest } from '../src/data/manifest.ts';
import { DatabaseReadinessError } from '../src/data/readiness.ts';
import { schemaIds } from '@abh/contracts/schema';
import { CoreError } from '../src/internal/errors.ts';
import type { TenantTransaction } from '../src/data/uow.ts';

const orgInsert = async (tx: TenantTransaction, id = tx.context.tenant.resourceOrganizationId) => {
  const sql = tx.owner('Identity');
  await sql`INSERT INTO identity.organizations (resource_organization_id,id,name,home_region,status)
    VALUES (${id},${id},'Test organization','local','Active')`;
};

test('PostgreSQL 16 restricted runtime and tenant UoW', { timeout: 120_000 }, async t => {
  const f = await createDatabaseFixture();
  t.after(()=>f.close());
  const a = context(), b = context();
  const orgA = a.tenant.resourceOrganizationId, orgB = b.tenant.resourceOrganizationId;
  await t.test('registered tenant tables have RLS and exact generated state CHECKs', async ()=> {
    await f.database.verify();
    for (const table of [...databaseManifest.tables,...databaseManifest.deploymentTables]) if (table.contract) assert.ok(Object.hasOwn(schemaIds,table.contract),`Missing schema for ${table.name}`);
    const migration = (await Promise.all((await readdir(new URL('../migrations/',import.meta.url))).map(name=>readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')))).join('\n');
    for (const state of new Set(databaseManifest.tables.map(t=>t.state).filter(Boolean))) {
      const name = state!.replace(/[A-Z]/g,(letter,i)=>(i?'_':'')+letter.toLowerCase());
      const fragment = (await readFile(new URL(`../../contracts/generated/sql/${name}.check.sql`, import.meta.url),'utf8')).split('\n')[1]!;
      assert.ok(migration.includes(fragment), `migration drift: ${state}`);
    }
  });
  await t.test('A → successful commit → B pool reuse never exposes another tenant', async ()=> {
    await f.database.transaction(a,options(),tx=>orgInsert(tx));
    await f.database.transaction(b,options(),async tx=> {
      const sql=tx.owner('Identity');
      assert.equal((await sql`SELECT * FROM identity.organizations`).length,0);
      await orgInsert(tx);
    });
    const rows = await f.database.transaction(a,{...options(),readOnly:true},tx=>tx.owner('Identity')`SELECT id FROM identity.organizations`);
    assert.deepEqual(rows.map(r=>r.id),[orgA]);
    assert.equal((await f.raw`SELECT * FROM identity.organizations`).length,0);
  });
  await t.test('missing GUC and cross-tenant insert/update are denied', async ()=> {
    await assert.rejects(f.raw`INSERT INTO identity.organizations (resource_organization_id,id,name,home_region,status,created_by,updated_by,purpose_names)
      VALUES (${randomUUID()},${randomUUID()},'hidden','local','Active',${randomUUID()},${randomUUID()},ARRAY['abh.action.prepare'])`, { code: '42501' });
    await assert.rejects(f.database.transaction(a,options(),tx=>orgInsert(tx,randomUUID())), { code:'42501' });
    await assert.rejects(f.database.transaction(a,options(),tx=>tx.owner('Identity')`UPDATE identity.organizations SET resource_organization_id=${orgB} WHERE id=${orgA}`), { code:'42501' });
  });
  await t.test('runtime cannot own schema, bypass RLS, switch to Owner, or truncate', async ()=> {
    for (const command of [
      'ALTER TABLE identity.organizations DISABLE ROW LEVEL SECURITY',
      'SET ROLE abh_core_owner', 'SET ROLE abh_queue', 'CREATE TABLE public.bypass (id integer)',
      'CREATE SCHEMA bypass', 'TRUNCATE identity.organizations', 'ALTER ROLE abh_runtime BYPASSRLS',
      'UPDATE data.audit_records SET record = record', 'DELETE FROM data.audit_records',
    ]) await assert.rejects(f.raw.unsafe(command), { code:'42501' });
    await assert.rejects(f.queue`SELECT * FROM identity.organizations`,{code:'42501'});
    await assert.rejects(f.queue`SELECT * FROM data.outbox`,{code:'42501'});
  });
  await t.test('rollback and readonly transaction restore clean pooled connection',async ()=> {
    await assert.rejects(f.database.transaction(a,options(),async tx=> {
      await tx.owner('Identity')`UPDATE identity.organizations SET name='rolled back'`;
      throw new Error('injected');
    }),/injected/);
    await assert.rejects(f.database.transaction(a,{...options(),readOnly:true},tx=>tx.owner('Identity')`UPDATE identity.organizations SET name='invalid'`),{code:'25006'});
    const rows=await f.database.transaction(b,options(),tx=>tx.owner('Identity')`SELECT name,id FROM identity.organizations`);
    assert.deepEqual(rows.map(r=>[r.id,r.name]),[[orgB,'Test organization']]);
  });
  await t.test('cancellation waits for rollback and revoked transaction handles cannot write',async ()=> {
    const abort=new AbortController(); let leaked: TenantTransaction | undefined;
    const transaction=f.database.transaction(a,{...options(),signal:abort.signal},async tx=> {
      leaked=tx;
      await tx.owner('Identity')`UPDATE identity.organizations SET name='cancelled'`;
      abort.abort();
      await tx.owner('Identity')`SELECT pg_sleep(3)`;
    });
    await assert.rejects(transaction,CoreError);
    await assert.rejects(leaked!.owner('Identity')`SELECT 1`,CoreError);
    const rows=await f.database.transaction(b,options(),tx=>tx.owner('Identity')`SELECT id FROM identity.organizations`);
    assert.deepEqual(rows.map(r=>r.id),[orgB]);
    assert.equal((await f.raw`SELECT * FROM identity.organizations`).length,0);
  });
  await t.test('deadline cancels an active SQL query and rolls back before reuse',async ()=> {
    await assert.rejects(f.database.transaction(a,{...options(),deadline:Date.now()+100},async tx=> {
      await tx.owner('Identity')`UPDATE identity.organizations SET name='timeout'`;
      await tx.owner('Identity')`SELECT pg_sleep(2)`;
    }));
    const rows=await f.database.transaction(a,options(),tx=>tx.owner('Identity')`SELECT name FROM identity.organizations`);
    assert.equal(rows[0]!.name,'Test organization');
  });
  await t.test('unissued contexts and noncanonical lock order are rejected',async ()=> {
    await assert.rejects(f.database.transaction(structuredClone(a),options(),async()=>{}),{code:'TENANT_CONTEXT_REQUIRED'});
    await assert.rejects(f.database.transaction(a,options(),async tx=> {
      await tx.lock(3,'b',async()=>{}); await tx.lock(3,'a',async()=>{});
    }),{code:'INTERNAL_ERROR'});
  });
  await t.test('queued tenant transactions expire or cancel before SQL and live waiters retain FIFO order',async()=>{
    let release!:()=>void,started!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),acquired=new Promise<void>(resolve=>{started=resolve;});
    const busy=f.database.transaction(a,options(),async()=>{started();await held;});
    const calls:string[]=[];
    await acquired;
    try{
      await assert.rejects(f.database.transaction(b,{...options(),deadline:Date.now()+40},async()=>{calls.push('expired');}),{code:'DEPENDENCY_TIMEOUT'});
      const abort=new AbortController();
      const cancelled=f.database.transaction(b,{...options(),signal:abort.signal},async()=>{calls.push('cancelled');});
      const rejected=assert.rejects(cancelled,{code:'DEPENDENCY_TIMEOUT'});abort.abort();await rejected;
      assert.equal(calls.length,0);
      const first=f.database.transaction(b,options(),async tx=>{calls.push('first');return tx.owner('Identity')`SELECT id FROM identity.organizations`;});
      const second=f.database.transaction(a,options(),async tx=>{calls.push('second');return tx.owner('Identity')`SELECT id FROM identity.organizations`;});
      release();await busy;
      assert.deepEqual((await first).map(row=>row.id),[orgB]);
      assert.deepEqual((await second).map(row=>row.id),[orgA]);
      assert.deepEqual(calls,['first','second']);
    }finally{release();await busy;}
  });
  await t.test('state CHECK regrouping cannot hide behind identical tokens',async()=>{
    const rows=await f.admin`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='execution.actions'::regclass AND conname='action_state_check'`;
    const original=rows[0]!.definition as string;
    const changed=original.replace("((lifecycle = 'Proposed'::text) AND (outcome = 'NotStarted'::text)) OR ((lifecycle = 'Validated'::text) AND (outcome = 'NotStarted'::text))",
      "((lifecycle = 'Proposed'::text) AND ((outcome = 'NotStarted'::text) OR (lifecycle = 'Validated'::text)) AND (outcome = 'NotStarted'::text))");
    assert.notEqual(original,changed);assert.equal(original.replace(/[\s()]/g,''),changed.replace(/[\s()]/g,''));
    try{
      await f.admin`ALTER TABLE execution.actions DROP CONSTRAINT action_state_check`;
      await f.admin.unsafe(`ALTER TABLE execution.actions ADD CONSTRAINT action_state_check ${changed}`);
      await assert.rejects(f.database.verify(),(error:unknown)=>error instanceof DatabaseReadinessError&&error.violations.includes('state-constraint:execution.actions'));
    }finally{
      await f.admin`ALTER TABLE execution.actions DROP CONSTRAINT action_state_check`;
      await f.admin.unsafe(`ALTER TABLE execution.actions ADD CONSTRAINT action_state_check ${original}`);
    }
    await f.database.verify();
  });
  await t.test('startup refuses drifted RLS policy, audit privileges, role inheritance and unregistered tables',async ()=> {
    const cases = [
      ['ALTER TABLE resource.ledgers NO FORCE ROW LEVEL SECURITY','ALTER TABLE resource.ledgers FORCE ROW LEVEL SECURITY'],
      ['GRANT UPDATE ON data.audit_records TO abh_runtime','REVOKE UPDATE ON data.audit_records FROM abh_runtime'],
      ["ALTER TABLE resource.ledgers DROP CONSTRAINT ledger_state_check","ALTER TABLE resource.ledgers ADD CONSTRAINT ledger_state_check CHECK (status IS NOT NULL AND status IN ('Open', 'Frozen', 'Closed'))"],
      ['CREATE POLICY unsafe ON resource.ledgers USING (true)','DROP POLICY unsafe ON resource.ledgers'],
      ['GRANT abh_core_owner TO abh_runtime','REVOKE abh_core_owner FROM abh_runtime'],
      ['GRANT EXECUTE ON FUNCTION control.verify_workspace_membership(uuid,uuid,bigint,uuid[]) TO PUBLIC','REVOKE EXECUTE ON FUNCTION control.verify_workspace_membership(uuid,uuid,bigint,uuid[]) FROM PUBLIC'],
      ['CREATE TABLE public.unregistered (id integer)','DROP TABLE public.unregistered'],
    ];
    for (const [change,restore] of cases) {
      try { await f.admin.unsafe(change!); await assert.rejects(f.database.verify(), DatabaseReadinessError); }
      finally { await f.admin.unsafe(restore!); }
    }
    await f.database.verify();
  });
});
