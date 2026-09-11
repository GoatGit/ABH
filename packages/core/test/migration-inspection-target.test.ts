import {connectMigrationTarget} from '../src/extensions/connect-migration-target.ts';
import {createServer,type Socket} from 'node:net';
import {randomUUID} from 'node:crypto';
import {runInstalledMigrationInspection,type InstalledMigrationInspectionRun} from '../src/extensions/run-installed-migration-inspection.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import postgres from 'postgres';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {inspectMigrationTarget,MigrationInspectionCleanupError} from '../src/extensions/inspect-migration-target.ts';
test('dedicated inspection target owns snapshot and destroys connections',{timeout:120000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const create=async()=>{const target=await connectMigrationTarget(f.runtimeUrl,options());let closed=0;return {connection:target.connection,dispose:async()=>{closed++;await target.dispose();},get closed(){return closed;}};};
 await t.test('connection acquisition cancels a stalled server and closes its socket',async()=>{
  const sockets=new Set<Socket>();let accepted!:()=>void;const ready=new Promise<void>(resolve=>{accepted=resolve;});
  const server=createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.resume();accepted();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
  try{
   const stop=new AbortController();const pending=connectMigrationTarget(`postgres://private:secret@127.0.0.1:${address.port}/test`,{...options(),signal:stop.signal});
   await ready;const socket=[...sockets][0]!;const closed=new Promise<void>(resolve=>socket.once('close',()=>resolve()));stop.abort();
   await assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});await closed;assert.equal(sockets.size,0);
   const deadlineAttempt=connectMigrationTarget(`postgres://private:secret@127.0.0.1:${address.port}/test`,{...options(),deadline:Date.now()+100});
   await assert.rejects(deadlineAttempt,{code:'DEPENDENCY_TIMEOUT'});
   await new Promise(resolve=>setTimeout(resolve,20));assert.equal(sockets.size,0);
  }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 await t.test('dedicated target disposal is idempotent and invalid credentials are not surfaced',async()=>{
  const target=await connectMigrationTarget(f.runtimeUrl,options());assert.equal(target.dispose(),target.dispose());await target.dispose();
  const bad=new URL(f.runtimeUrl);bad.password='private-invalid-password';await assert.rejects(connectMigrationTarget(bad.toString(),options()),error=>{assert.equal((error as {code:string}).code,'DEPENDENCY_UNAVAILABLE');assert.equal(String(error).includes(bad.password),false);return true;});
  await assert.rejects(connectMigrationTarget('invalid secret endpoint',options()),{code:'INVALID_ARGUMENT'});
  for(const url of ['postgres://localhost/test','postgres://role@localhost/','postgres://role@localhost'])await assert.rejects(connectMigrationTarget(url,options()),{code:'INVALID_ARGUMENT'});
  const substituted=new URL(f.runtimeUrl);substituted.searchParams.set('database','postgres');await assert.rejects(connectMigrationTarget(substituted.toString(),options()),{code:'PRECONDITION_FAILED'});
  const encoded=new URL(f.runtimeUrl);encoded.username=encoded.username.replace('a','%61');const explicit=await connectMigrationTarget(encoded.toString(),options());
  try{const [identity]=await explicit.connection`SELECT session_user AS session,current_user AS actor,current_database() AS database`;assert.equal(identity!.session,'abh_runtime');assert.equal(identity!.actor,'abh_runtime');assert.equal(identity!.database,'abh_test');}finally{await explicit.dispose();}
 });
 await t.test('installed workflow disposes target when management admission or input snapshot fails',async()=>{
  const run:InstalledMigrationInspectionRun={inspect:async()=>{assert.fail('inspection must not run');},retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:{type:'abh.artifact',id:randomUUID(),version:1}},admit:async()=>{},read:async()=>{}};
  const expired=await create();await assert.rejects(runInstalledMigrationInspection(f.database,context(),{...options(),deadline:Date.now()-1},expired,run),{code:'DEPENDENCY_TIMEOUT'});assert.equal(expired.closed,1);
  const malformed=await create();await assert.rejects(runInstalledMigrationInspection(f.database,context(),options(),malformed,{...run,get retention():never{throw new Error('invalid inspection retention');}}),/invalid inspection retention/);assert.equal(malformed.closed,1);
  const forged=await create();await assert.rejects(runInstalledMigrationInspection(f.database,context(),options(),forged,{...run,inspect:async()=>({matched:true} as Awaited<ReturnType<InstalledMigrationInspectionRun['inspect']>>)}),{code:'PRECONDITION_FAILED'});assert.equal(forged.closed,1);
 });
 await t.test('standalone inspection honors declared fences and disposes on admission rejection',async()=>{
  const cause=new Error('inspection governance rejected');let inspected=0,calls=0;
  class Admission {
   #cause=cause;
   async fenceRefs():Promise<never>{calls++;throw this.#cause;}
  }
  const admission=new Admission();
  const run:InstalledMigrationInspectionRun={fenceRefs:admission.fenceRefs.bind(admission),inspect:async()=>{inspected++;assert.fail('inspection must not run');},retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:{type:'abh.artifact',id:randomUUID(),version:1}},admit:async()=>{},read:async()=>{}};
  const target=await create();
  await assert.rejects(runInstalledMigrationInspection(f.database,context(),options(),target,run),error=>error===cause);
  assert.equal(target.closed,1);assert.equal(inspected,0);assert.equal(calls,1);
  const missing=await create();
  await assert.rejects(runInstalledMigrationInspection(f.database,context(),options(),missing,{...run,fenceRefs:async()=>[{type:'abh.grant',id:randomUUID(),version:1}]}),{code:'AUTHORITY_REQUIRED'});
  assert.equal(missing.closed,1);assert.equal(inspected,0);
  const double=await create();
  await assert.rejects(runInstalledMigrationInspection(f.database,context(),options(),{connection:double.connection,dispose:async()=>{await double.dispose();throw new Error('private cleanup failure');}},run),error=>{
   assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],cause);assert.ok(error.errors[1] instanceof MigrationInspectionCleanupError);return true;
  });assert.equal(double.closed,1);assert.equal(inspected,0);
 });
 await t.test('success returns only after disposal and rejects later queries',async()=>{
  const target=await create();let saved:postgres.ReservedSql|undefined;
  const result=await f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,options(),async sql=>{saved=sql;const [row]=await sql`SELECT current_setting('transaction_read_only') AS mode`;return row!.mode;}));
  assert.equal(result,'on');assert.equal(target.closed,1);assert.throws(()=>saved!`SELECT 1`,{code:'DEPENDENCY_TIMEOUT'});
 });
 await t.test('queries constructed before close cannot dispatch when consumed later',async()=>{
  const target=await create();let lazy:Array<PromiseLike<unknown>>=[];let cursor:AsyncIterable<unknown>|undefined;
  await f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,options(),async sql=>{
   assert.throws(()=>sql.file('unused.sql'),{code:'PRECONDITION_FAILED'});
   lazy=[sql`SELECT 1`,sql.unsafe('SELECT 2').simple(),sql`SELECT 3`.values()];cursor=sql`SELECT 4`.cursor(1);
  }));
  for(const query of lazy)await assert.rejects(Promise.resolve(query),{code:'DEPENDENCY_TIMEOUT'});
  await assert.rejects(async()=>{for await(const row of cursor!){assert.fail('late cursor dispatched');}},{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(target.closed,1);
 });
 await t.test('preexisting transaction is refused before callback and destroyed',async()=>{
  const target=await create();await target.connection`BEGIN`;let called=false;
  await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,options(),async()=>{called=true;})),{code:'25001'});
  assert.equal(called,false);assert.equal(target.closed,1);
 });
 await t.test('callback cannot replace snapshot or write persistent data',async()=>{
  const target=await create();
  await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,options(),async sql=>{await sql`ROLLBACK`;await sql`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;})),{code:'PRECONDITION_FAILED'});assert.equal(target.closed,1);
  const other=await create();await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,other,options(),async sql=>{await sql`CREATE TABLE public.inspection_write(id integer)`;})),{code:'25006'});assert.equal(other.closed,1);
 });
 await t.test('cancellation interrupts stalled host and prevents its later queries',async()=>{
  const target=await create(),controller=new AbortController();let entered!:()=>void,release!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});let late:unknown;
  const pending=f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,{...options(),signal:controller.signal},async sql=>{entered();await gate;try{await sql`SELECT 1`;}catch(error){late=error;}}));
  await ready;controller.abort();await assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});assert.equal(target.closed,1);release();await new Promise(resolve=>setImmediate(resolve));assert.equal((late as {code:string}).code,'DEPENDENCY_TIMEOUT');
 });
 await t.test('cancellation destroys an in-flight PostgreSQL query',async()=>{
  const target=await create(),controller=new AbortController();let entered!:()=>void;
  const ready=new Promise<void>(resolve=>{entered=resolve;});
  const pending=f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,{...options(),signal:controller.signal},async sql=>{entered();await sql`SELECT pg_sleep(30)`;}));
  await ready;await new Promise(resolve=>setTimeout(resolve,30));controller.abort();await assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});assert.equal(target.closed,1);
 });
 await t.test('deadline stops an unresponsive host callback',async()=>{
  const target=await create();const started=Date.now();
  await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,target,{...options(),deadline:Date.now()+150},async()=>new Promise<never>(()=>{}))),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(target.closed,1);assert.ok(Date.now()-started<3000);
 });
 await t.test('unacknowledged disposal is bounded and cannot publish success',async()=>{
  const target=await create();const started=Date.now();
  await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,{connection:target.connection,dispose:async()=>{await target.dispose();await new Promise<never>(()=>{});}},options(),async()=>true)),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(target.closed,1);assert.ok(Date.now()-started<3000);
 });
 await t.test('actual inspection and preflight faults survive a concurrent disposal failure',async()=>{
  const original=new Error('inspection source failure'),target=await create();
  const broken={connection:target.connection,dispose:async()=>{await target.dispose();throw new Error('private cleanup details');}};
  await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,broken,options(),async()=>{throw original;})),error=>{
   assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],original);assert.ok(error.errors[1] instanceof MigrationInspectionCleanupError);return true;
  });assert.equal(target.closed,1);
  const other=await create(),preflight={connection:other.connection,dispose:async()=>{await other.dispose();throw new Error('cleanup');}};
  const run:InstalledMigrationInspectionRun={inspect:async()=>{assert.fail('preflight must reject');},retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:{type:'abh.artifact',id:randomUUID(),version:1}},admit:async()=>{},read:async()=>{}};
  await assert.rejects(runInstalledMigrationInspection(f.database,context(),{...options(),deadline:Date.now()-1},preflight,run),error=>{
   assert.ok(error instanceof AggregateError);assert.equal(error.errors[0].code,'DEPENDENCY_TIMEOUT');assert.ok(error.errors[1] instanceof MigrationInspectionCleanupError);return true;
  });assert.equal(other.closed,1);
 });
 await t.test('failed disposal never returns a successful observation',async()=>{
  const target=await create();await assert.rejects(f.database.transaction(context(),options(),tx=>inspectMigrationTarget(tx,{connection:target.connection,dispose:async()=>{await target.dispose();throw new Error('close failed');}},options(),async()=>true)),{code:'DEPENDENCY_TIMEOUT'});assert.equal(target.closed,1);
 });
});
