import {recoverMigrationObservation} from '../src/extensions/recover-migration-observation.ts';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import postgres from 'postgres';
import {createServer,createConnection,type Socket} from 'node:net';
import type {PackManifest,PackMigrationStep} from '@abh/contracts';
import {digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {claimPackMigrationAttempt,readPackMigrationJournal} from '../src/extensions/migration-journal.ts';
import {persistMigrationExecutionResult} from '../src/extensions/persist-migration-result.ts';
import {executeNewMigrationClaim} from '../src/extensions/execute-migration-step.ts';
import {registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {packManifest} from './pack-fixture.ts';

test('transactional migration primitive uses dedicated role and irreversible new claims',{timeout:120000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const password=randomBytes(24).toString('hex'),ref={type:'abh.artifact',id:randomUUID(),version:1};
 await f.admin.unsafe(`CREATE ROLE hello_migrator LOGIN NOINHERIT PASSWORD '${password}'`);
 await f.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
 await registerPackSchemaOwnership(f.admin,[{packId:'org.hello.pack',schemaName:'hello_domain',databaseRole:'hello_migrator'}],ref);
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
 let version=0;
 const setup=async(text:string,transactional=true)=>{
  const pack=await packManifest() as PackManifest;
  pack.metadata.id='org.hello.pack';pack.metadata.version=`1.0.${++version}`;pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
  pack.migrations=[{ref:'migration.sql',digest:await digestBytes(new TextEncoder().encode(text)),mediaType:'application/sql',sizeBytes:Buffer.byteLength(text)}];
  const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
  const step:PackMigrationStep={ref:'migration.sql',digest:pack.migrations[0]!.digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
  const input={organizationId:c.tenant.resourceOrganizationId,step,environmentDigest:pack.integrity.packageDigest,deploymentVersion:1,impactRef:ref,evidenceRefs:[ref]};
  const [claim]=await claimPackMigrationAttempt(f.admin,pack,[input]);
  return {pack,step,claim:claim!,input,text};
 };
 const run=async(work:Awaited<ReturnType<typeof setup>>,extra:{text?:string;timeout?:number;cutCommit?:boolean;initialize?:(sql:postgres.ReservedSql)=>Promise<void>;before?:(sql:postgres.ReservedSql)=>Promise<void>;prepare?:()=>Promise<void>}={})=>{
  const url=new URL(f.runtimeUrl);url.username='hello_migrator';url.password=password;
  const sockets=new Set<Socket>();let cut=false;
  const proxy=extra.cutCommit?createServer(client=>{
   const upstream=createConnection({host:url.hostname,port:Number(url.port)});sockets.add(client);sockets.add(upstream);
   client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
   client.on('close',()=>{sockets.delete(client);upstream.destroy();});upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});
   client.pipe(upstream);let buffered=Buffer.alloc(0);
   upstream.on('data',chunk=>{
    buffered=Buffer.concat([buffered,chunk]);
    while(buffered.length>=5){
     const length=buffered.readInt32BE(1)+1;if(buffered.length<length)return;
     const frame=buffered.subarray(0,length);buffered=buffered.subarray(length);
     if(frame[0]===67&&frame.subarray(5).toString()==='COMMIT\0'){cut=true;client.destroy();upstream.destroy();return;}
     client.write(frame);
    }
   });
  }):undefined;
  let targetUrl=url.toString();
  if(proxy){await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));const address=proxy.address();assert.ok(address&&typeof address==='object');const tunneled=new URL(url);tunneled.hostname='127.0.0.1';tunneled.port=String(address.port);targetUrl=tunneled.toString();}
  const pool=postgres(targetUrl,{max:1,onnotice:()=>{}}),connection=await pool.reserve();
  try{await extra.initialize?.(connection);return await f.database.transaction(c,options(),tx=>executeNewMigrationClaim(tx,{connection,dispose:()=>pool.end({timeout:0})},{deadline:Date.now()+(extra.timeout??5000),signal:new AbortController().signal},work.claim,{
   // Explicit Fixture admission. Real dedicated role/catalog/content digest checks
   // and SQL execution run here; signed installed authority remains host assembly.
   prepare:async()=>{await extra.prepare?.();return {manifest:work.pack,steps:[work.step],sql:extra.text??work.text};},beforeCommit:async()=>{await extra.before?.(connection);},
  }));}finally{await pool.end({timeout:0});for(const socket of sockets)socket.destroy();if(proxy){await new Promise<void>(resolve=>proxy.close(()=>resolve()));assert.equal(cut,true,'proxy must drop a real server COMMIT acknowledgement');}}
 };
 await t.test('create/write commits once after actual in-transaction result check',async()=>{
  const work=await setup('CREATE TABLE hello_domain.committed (id integer); INSERT INTO hello_domain.committed VALUES (7);');
  const result=await run(work,{before:async sql=>{assert.equal((await sql`SELECT id FROM hello_domain.committed`)[0]!.id,7);}});
  assert.deepEqual(result,{kind:'CommitAcknowledged',sqlStarted:true,connectionClosed:true});
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM hello_domain.committed`)[0]!.n,1);
  assert.equal((await run(work)).sqlStarted,false);
  const [replay]=await claimPackMigrationAttempt(f.admin,work.pack,[work.input]);
  assert.equal((await run({...work,claim:replay!})).sqlStarted,false);
  assert.deepEqual((await readPackMigrationJournal(f.admin,work.claim.record.attemptRef)).observations,[]);
 });
 await t.test('a caller-owned open transaction cannot be committed by the migration runner',async()=>{
  const work=await setup('CREATE TABLE hello_domain.nested_migration (id integer)');let admitted=false;
  const result=await run(work,{initialize:async sql=>{await sql`BEGIN`;await sql`CREATE TABLE hello_domain.prior_work (id integer)`;},prepare:async()=>{admitted=true;}});
  assert.deepEqual(result,{kind:'OutcomeUnknown',sqlStarted:false,connectionClosed:true});assert.equal(admitted,false);
  for(const name of ['hello_domain.prior_work','hello_domain.nested_migration'])assert.equal((await f.admin`SELECT to_regclass(${name}) AS name`)[0]!.name,null);
 });
 await t.test('read-only and failed caller transactions reject before preparation',async()=>{
  for(const failed of [false,true]){
   const work=await setup('SELECT 1;');let admitted=false;
   const result=await run(work,{initialize:async sql=>{
    await sql.unsafe(failed?'BEGIN':'BEGIN READ ONLY');
    if(failed)await assert.rejects(sql`SELECT 1/0`);else await sql`SELECT 1`;
   },prepare:async()=>{admitted=true;}});
   assert.deepEqual(result,{kind:'OutcomeUnknown',sqlStarted:false,connectionClosed:true});assert.equal(admitted,false);
  }
 });
 await t.test('idle session settings are cleared before admitted migration work',async()=>{
  const work=await setup('CREATE TABLE hello_domain.reset_session (id integer)');
  const result=await run(work,{initialize:async sql=>{await sql`SET default_transaction_read_only=on`;},before:async sql=>{
   assert.equal((await sql`SHOW default_transaction_read_only`)[0]!.default_transaction_read_only,'off');
  }});
  assert.equal(result.kind,'CommitAcknowledged');
 });
 await t.test('copied and modified claim objects cannot dispatch',async()=>{
  const work=await setup('CREATE TABLE hello_domain.forged (id integer)');
  assert.equal((await run({...work,claim:structuredClone(work.claim)})).sqlStarted,false);
  work.claim.record.environmentDigest='sha256:'+'b'.repeat(64);
  assert.equal((await run(work)).sqlStarted,false);
  assert.equal((await f.admin`SELECT to_regclass('hello_domain.forged') AS name`)[0]!.name,null);
 });
 await t.test('wrong bytes and unsupported nontransactional step never execute',async()=>{
  const work=await setup('CREATE TABLE hello_domain.wrong (id integer)');
  assert.equal((await run(work,{text:'SELECT 1;'})).sqlStarted,false);
  assert.equal((await run(await setup('CREATE TABLE hello_domain.nontransactional (id integer)',false))).sqlStarted,false);
 });
 await t.test('invalid input snapshots still close the owned connection without dispatch',async()=>{
  const work=await setup('CREATE TABLE hello_domain.invalid_snapshot (id integer)');
  Object.assign(work.pack,{invalid:1n});
  assert.deepEqual(await run(work),{kind:'OutcomeUnknown',sqlStarted:false,connectionClosed:true});
  const cyclic=await setup('SELECT 1;');Object.assign(cyclic.step,{cycle:cyclic.step});
  assert.deepEqual(await run(cyclic),{kind:'OutcomeUnknown',sqlStarted:false,connectionClosed:true});
 });
 await t.test('database privilege error rolls back preceding DDL while leaving outcome unknown',async()=>{
  const work=await setup('CREATE TABLE hello_domain.failed (id integer); CREATE TABLE identity.forbidden (id integer);');
  assert.deepEqual(await run(work),{kind:'OutcomeUnknown',sqlStarted:true,connectionClosed:true});
  assert.equal((await f.admin`SELECT to_regclass('hello_domain.failed') AS name`)[0]!.name,null);
 });
 await t.test('failed current result admission rolls back before commit',async()=>{
  const work=await setup('CREATE TABLE hello_domain.rejected (id integer)');
  assert.equal((await run(work,{before:async()=>{throw new Error('fixture rejects actual result');}})).kind,'OutcomeUnknown');
  assert.equal((await f.admin`SELECT to_regclass('hello_domain.rejected') AS name`)[0]!.name,null);
 });
 await t.test('embedded COMMIT is detected as unknown, never falsely reported rolled back',async()=>{
  const work=await setup('CREATE TABLE hello_domain.early_commit (id integer); COMMIT;');
  assert.equal((await run(work)).kind,'OutcomeUnknown');
  assert.notEqual((await f.admin`SELECT to_regclass('hello_domain.early_commit') AS name`)[0]!.name,null);
  assert.equal((await run(work)).sqlStarted,false);
 });
 await t.test('lost real COMMIT acknowledgement preserves committed data but never permits a replay',async()=>{
  const work=await setup('CREATE TABLE hello_domain.lost_ack (id integer); INSERT INTO hello_domain.lost_ack VALUES (19);');
  const outcome=await run(work,{cutCommit:true});
  assert.deepEqual(outcome,{kind:'OutcomeUnknown',sqlStarted:true,connectionClosed:true});
  assert.equal((await f.admin`SELECT id FROM hello_domain.lost_ack`)[0]!.id,19);
  assert.deepEqual((await readPackMigrationJournal(f.admin,work.claim.record.attemptRef)).observations,[]);
  const retention={dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref};
  const persist=()=>persistMigrationExecutionResult(f.database,f.admin,c,options(),outcome,retention,async()=>{},async()=>{});
  outcome.kind='CommitAcknowledged';await assert.rejects(persist(),{code:'PRECONDITION_FAILED'});outcome.kind='OutcomeUnknown';
  await assert.rejects(persistMigrationExecutionResult(f.database,f.admin,c,options(),outcome,retention,async()=>{throw new Error('capture admission denied');},async()=>{}),/capture admission denied/);
  assert.deepEqual((await readPackMigrationJournal(f.admin,work.claim.record.attemptRef)).observations,[]);
  let withdrawn=false;
  await assert.rejects(persistMigrationExecutionResult(f.database,f.admin,c,options(),outcome,retention,async()=>{if(withdrawn)throw new Error('capture authority withdrawn after read');},async()=>{withdrawn=true;}),/capture authority withdrawn after read/);
  assert.deepEqual((await readPackMigrationJournal(f.admin,work.claim.record.attemptRef)).observations,[]);
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM data.artifacts WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND record->'ownerRef'->>'id'=${work.claim.record.attemptRef.id}`)[0]!.n,0);
  const stored=await persist();assert.equal(stored.observation.kind,'OutcomeUnknown');assert.deepEqual(await persist(),stored);
  withdrawn=false;await assert.rejects(persistMigrationExecutionResult(f.database,f.admin,c,options(),outcome,retention,async()=>{if(withdrawn)throw new Error('replay authority withdrawn');},async()=>{withdrawn=true;}),/replay authority withdrawn/);
  const recover=(admission:Parameters<typeof recoverMigrationObservation>[6])=>recoverMigrationObservation(f.database,f.admin,c,options(),work.claim.record.attemptRef,stored.artifactRef,admission);
  let recoveryAdmissions=0;await assert.rejects(recover({authorize:async()=>{if(++recoveryAdmissions===2)throw new Error('recovery authority withdrawn after lock');},source:async()=>{}}),/recovery authority withdrawn after lock/);
  recoveryAdmissions=0;await assert.rejects(recover({authorize:async()=>{if(++recoveryAdmissions===3)throw new Error('recovery authority withdrawn before maintenance commit');},source:async()=>{}}),/recovery authority withdrawn before maintenance commit/);
  let sourceAdmissions=0;await assert.rejects(recover({authorize:async()=>{},source:async()=>{if(++sourceAdmissions===2)throw new Error('recovery source withdrawn after lock');}}),/recovery source withdrawn after lock/);
  assert.deepEqual(await recover({authorize:async()=>{},source:async()=>{}}),stored);
  assert.equal((await readPackMigrationJournal(f.admin,work.claim.record.attemptRef)).observations.length,1);
  assert.equal((await run(work)).sqlStarted,false);
 });
 await t.test('late actual role elevation prevents COMMIT',async()=>{
  const work=await setup('CREATE TABLE hello_domain.role_changed (id integer)');
  try{assert.equal((await run(work,{before:async()=>{await f.admin`ALTER ROLE hello_migrator BYPASSRLS`;}})).kind,'OutcomeUnknown');}
  finally{await f.admin`ALTER ROLE hello_migrator NOBYPASSRLS`;}
  assert.equal((await f.admin`SELECT to_regclass('hello_domain.role_changed') AS name`)[0]!.name,null);
 });
 await t.test('deadline closes a running connection and prevents a delayed preparation from dispatching',async()=>{
  const work=await setup('CREATE TABLE hello_domain.timed_out (id integer); SELECT pg_sleep(10);');
  const result=await run(work,{timeout:500});assert.deepEqual(result,{kind:'OutcomeUnknown',sqlStarted:true,connectionClosed:true});
  assert.equal((await f.admin`SELECT to_regclass('hello_domain.timed_out') AS name`)[0]!.name,null);
  const delayed=await setup('CREATE TABLE hello_domain.delayed (id integer)');
  let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
  const stopped=await run(delayed,{timeout:50,prepare:()=>blocked});release();
  assert.equal(stopped.sqlStarted,false);assert.equal(stopped.connectionClosed,true);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal((await f.admin`SELECT to_regclass('hello_domain.delayed') AS name`)[0]!.name,null);
 });
});
