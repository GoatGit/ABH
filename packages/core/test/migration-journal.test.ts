import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import postgres from 'postgres';
import type {PackManifest,PackMigrationStep} from '@abh/contracts';
import {digestPackManifest} from '@abh/contracts/digest';
import {claimPackMigrationAttempt,recordPackMigrationObservation,readPackMigrationJournal} from '../src/extensions/migration-journal.ts';
import {registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
import {createDatabaseFixture} from './database-fixture.ts';
import {packManifest} from './pack-fixture.ts';

test('physical migration journal persists global claims and never turns replay into dispatch',{timeout:120000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const ref={type:'abh.artifact',id:randomUUID(),version:1};
 await f.admin`CREATE ROLE hello_migrator LOGIN NOINHERIT`;
 await f.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
 await registerPackSchemaOwnership(f.admin,[{packId:'org.hello.pack',schemaName:'hello_domain',databaseRole:'hello_migrator'}],ref);
 const pack=await packManifest() as PackManifest;
 pack.metadata.id='org.hello.pack';pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
 pack.migrations=[{...pack.artifacts[0]!,ref:'migration.sql'}];
 const refresh=async(p:PackManifest)=>{const {signaturePayload:_,...digests}=await digestPackManifest(p);Object.assign(p.integrity,digests);};await refresh(pack);
 const step:PackMigrationStep={ref:'migration.sql',digest:pack.migrations[0]!.digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
 const input={organizationId:randomUUID(),step,environmentDigest:pack.integrity.packageDigest,deploymentVersion:1,impactRef:ref,evidenceRefs:[ref]};
 const claim=()=>claimPackMigrationAttempt(f.admin,pack,[input]);
 let first:Awaited<ReturnType<typeof claim>>[number];
 await t.test('two independent sessions claim once; reconnect replay stays non-dispatchable',async()=>{
  const connect=()=>postgres({host:f.admin.options.host[0],port:f.admin.options.port[0],user:f.admin.options.user,database:f.admin.options.database,pass:f.admin.options.pass??undefined,max:1,onnotice:()=>{}});
  const other=connect();
  try{
   const results=await Promise.all([claim(),claimPackMigrationAttempt(other,pack,[input])]);
   assert.deepEqual(results.map(r=>r[0]!.created).sort(),[false,true]);
   assert.deepEqual(results[0]![0]!.record,results[1]![0]!.record);first=results[0]![0]!;
  }finally{await other.end();}
  const reconnected=connect();
  try{assert.equal((await claimPackMigrationAttempt(reconnected,pack,[input]))[0]!.created,false);}finally{await reconnected.end();}
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM extension.migration_attempts`)[0]!.n,1);
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM extension.migration_observations`)[0]!.n,0);
  assert.deepEqual(await readPackMigrationJournal(f.admin,first!.record.attemptRef),{attempt:first!.record,observations:[]});
  await f.database.verify();
 });
 await t.test('organization/environment changes cannot repeat physical SQL; version digest is permanent',async()=>{
  for(const patch of [{organizationId:randomUUID()},{environmentDigest:'sha256:'+'b'.repeat(64)},{deploymentVersion:2}])await assert.rejects(claimPackMigrationAttempt(f.admin,pack,[{...input,...patch}]),{code:'VERSION_CONFLICT'});
  const changed=structuredClone(pack);changed.migrations[0]!.ref='other.sql';await refresh(changed);
  await assert.rejects(claimPackMigrationAttempt(f.admin,changed,[{...input,step:{...step,ref:'other.sql'}}]),{code:'VERSION_CONFLICT'});
 });
 await t.test('Unknown and commit acknowledgement append separately and never replace claim or enable retry',async()=>{
  const unknown={attemptRef:first!.record.attemptRef,kind:'OutcomeUnknown' as const,evidenceRef:ref};
  const saved=await recordPackMigrationObservation(f.admin,unknown);
  assert.deepEqual(await recordPackMigrationObservation(f.admin,unknown),saved);
  await assert.rejects(recordPackMigrationObservation(f.admin,{...unknown,evidenceRef:{...ref,version:2}}),{code:'VERSION_CONFLICT'});
  await recordPackMigrationObservation(f.admin,{...unknown,kind:'CommitAcknowledged'});
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM extension.migration_observations`)[0]!.n,2);
  assert.deepEqual((await claim())[0],{created:false,record:first!.record});
  await assert.rejects(recordPackMigrationObservation(f.admin,{...unknown,attemptRef:{...unknown.attemptRef,id:randomUUID()}}),{code:'RESOURCE_NOT_FOUND'});
 });
 await t.test('recovery reads the original claim and all observations without deriving completion',async()=>{
  const read=()=>readPackMigrationJournal(f.admin,first!.record.attemptRef);
  const snapshot=await read();assert.deepEqual(snapshot.attempt,first!.record);
  assert.deepEqual(snapshot.observations.map(r=>r.kind),['CommitAcknowledged','OutcomeUnknown']);
  snapshot.attempt.step.schemas[0]='mutated';snapshot.observations[0]!.evidenceRef.version=99;
  assert.deepEqual((await read()).attempt,first!.record);assert.equal((await read()).observations[0]!.evidenceRef.version,1);
  await assert.rejects(readPackMigrationJournal(f.raw,first!.record.attemptRef),{code:'FORBIDDEN'});
  await assert.rejects(readPackMigrationJournal(f.admin,{...first!.record.attemptRef,version:2}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(readPackMigrationJournal(f.admin,{...first!.record.attemptRef,id:randomUUID()}),{code:'RESOURCE_NOT_FOUND'});
 });
 await t.test('recovery uses one snapshot while another maintenance session commits a new observation value',async()=>{
  const application='migration-recovery-'+randomUUID();
  const reader=postgres({host:f.admin.options.host[0],port:f.admin.options.port[0],user:f.admin.options.user,database:f.admin.options.database,pass:f.admin.options.pass??undefined,max:1,onnotice:()=>{},connection:{application_name:application}});
  const before=await readPackMigrationJournal(f.admin,first!.record.attemptRef),observation=before.observations[0]!;
  let pending:ReturnType<typeof readPackMigrationJournal>|undefined;
  try{
   await f.admin.begin(async sql=>{
    await sql`LOCK TABLE extension.migration_attempts IN ACCESS EXCLUSIVE MODE`;
    pending=readPackMigrationJournal(reader,first!.record.attemptRef);void pending.catch(()=>{});
    const deadline=Date.now()+3000;let blocked=false;
    while(Date.now()<deadline){
     await sql`SELECT pg_stat_clear_snapshot()`;
     const [row]=await sql`SELECT count(*)::integer AS n FROM pg_stat_activity WHERE application_name=${application} AND wait_event_type='Lock'`;
     if(row!.n===1){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true,'reader must have acquired its snapshot before the concurrent update');
    await sql`UPDATE extension.migration_observations SET record=jsonb_set(record,'{evidenceRef,version}','3') WHERE id=${observation.observationRef.id}`;
   });
   assert.deepEqual(await pending,before);
   assert.equal((await readPackMigrationJournal(reader,first!.record.attemptRef)).observations[0]!.evidenceRef.version,3);
  }finally{
   await pending?.catch(()=>{});
   await f.admin`UPDATE extension.migration_observations SET record=${JSON.stringify(observation)}::text::jsonb WHERE id=${observation.observationRef.id}`;
   await reader.end();
  }
 });
 await t.test('recovery rejects tampered execution digest and substituted observation bindings',async()=>{
  const attempt=first!.record,read=()=>readPackMigrationJournal(f.admin,attempt.attemptRef);
  await f.admin`UPDATE extension.migration_attempts SET record=jsonb_set(record,'{step,transactional}','false') WHERE id=${attempt.attemptRef.id}`;
  try{await assert.rejects(read(),{code:'PRECONDITION_FAILED'});}finally{await f.admin`UPDATE extension.migration_attempts SET record=${JSON.stringify(attempt)}::text::jsonb WHERE id=${attempt.attemptRef.id}`;}
  const observation=(await read()).observations[0]!;
  for(const patch of [{attemptRef:{...attempt.attemptRef,id:randomUUID()}},{kind:'OutcomeUnknown'},{observationRef:{...observation.observationRef,id:randomUUID()}}]){
   await f.admin`UPDATE extension.migration_observations SET record=${JSON.stringify({...observation,...patch})}::text::jsonb WHERE id=${observation.observationRef.id}`;
   try{await assert.rejects(read(),{code:'PRECONDITION_FAILED'});}finally{await f.admin`UPDATE extension.migration_observations SET record=${JSON.stringify(observation)}::text::jsonb WHERE id=${observation.observationRef.id}`;}
  }
 });
 await t.test('database keys protect replay identity and observations even outside the helper',async()=>{
  const attempt=first!.record;
  await assert.rejects(f.admin`INSERT INTO extension.migration_packages(pack_id,pack_version,package_digest) VALUES (${attempt.packId},${attempt.packVersion},${'sha256:'+'c'.repeat(64)})`,{code:'23505'});
  await assert.rejects(f.admin`INSERT INTO extension.migration_attempts(id,pack_id,pack_version,migration_ref,package_digest,record) VALUES (${randomUUID()},${attempt.packId},${attempt.packVersion},'other.sql',${'sha256:'+'c'.repeat(64)},'{}')`,{code:'23503'});
  await assert.rejects(f.admin`INSERT INTO extension.migration_observations(id,attempt_id,kind,record) VALUES (${randomUUID()},${randomUUID()},'OutcomeUnknown','{}')`,{code:'23503'});
  await assert.rejects(f.admin`INSERT INTO extension.migration_observations(id,attempt_id,kind,record) VALUES (${randomUUID()},${attempt.attemptRef.id},'Verified','{}')`,{code:'23514'});
 });
 await t.test('a later database write failure rolls back the entire plan and package reservation',async()=>{
  const next=structuredClone(pack);next.metadata.version='2.0.0';next.migrations.push({...next.migrations[0]!,ref:'second.sql'});await refresh(next);
  await f.admin`CREATE FUNCTION extension.reject_second_claim() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.migration_ref='second.sql' THEN RAISE EXCEPTION 'injected journal write failure'; END IF; RETURN NEW; END$$`;
  await f.admin`CREATE TRIGGER reject_second_claim BEFORE INSERT ON extension.migration_attempts FOR EACH ROW EXECUTE FUNCTION extension.reject_second_claim()`;
  try{await assert.rejects(claimPackMigrationAttempt(f.admin,next,[input,{...input,step:{...step,ref:'second.sql'}}]),{code:'P0001'});}
  finally{await f.admin`DROP TRIGGER reject_second_claim ON extension.migration_attempts`;await f.admin`DROP FUNCTION extension.reject_second_claim()`;}
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM extension.migration_attempts WHERE pack_version='2.0.0'`)[0]!.n,0);
  assert.equal((await f.admin`SELECT count(*)::integer AS n FROM extension.migration_packages WHERE pack_version='2.0.0'`)[0]!.n,0);
 });
 await t.test('final admission failure rolls back an inserted observation and also denies replay',async()=>{
  const next=structuredClone(pack);next.metadata.version='3.0.0';await refresh(next);
  const [fresh]=await claimPackMigrationAttempt(f.admin,next,[input]);
  const observation={attemptRef:fresh!.record.attemptRef,kind:'OutcomeUnknown' as const,evidenceRef:ref};
  let calls=0;
  await assert.rejects(recordPackMigrationObservation(f.admin,observation,async()=>{if(++calls===2)throw new Error('late recovery admission denied');}),/late recovery admission denied/);
  assert.equal((await readPackMigrationJournal(f.admin,fresh!.record.attemptRef)).observations.length,0);
  await recordPackMigrationObservation(f.admin,observation);calls=0;
  await assert.rejects(recordPackMigrationObservation(f.admin,observation,async()=>{if(++calls===2)throw new Error('late replay admission denied');}),/late replay admission denied/);
  assert.equal((await readPackMigrationJournal(f.admin,fresh!.record.attemptRef)).observations.length,1);
 });
 await t.test('runtime/queue cannot read global organization evidence or mutate the journal',async()=>{
  await assert.rejects(claimPackMigrationAttempt(f.raw,pack,[input]),{code:'FORBIDDEN'});
  for(const sql of [f.raw,f.queue])for(const table of ['migration_packages','migration_attempts','migration_observations']){
   for(const query of [`SELECT * FROM extension.${table}`,`DELETE FROM extension.${table}`,`UPDATE extension.${table} SET ${table==='migration_packages'?'pack_id=pack_id':'id=id'}`])await assert.rejects(sql.unsafe(query),{code:'42501'});
  }
 });
 await t.test('readiness rejects accidental global evidence exposure and missing replay constraint',async()=>{
  await f.admin`GRANT SELECT(record) ON extension.migration_attempts TO abh_runtime`;
  try{await assert.rejects(f.database.verify());}finally{await f.admin`REVOKE SELECT(record) ON extension.migration_attempts FROM abh_runtime`;}
  await f.admin`ALTER TABLE extension.migration_attempts DROP CONSTRAINT migration_attempts_pack_id_pack_version_migration_ref_key`;
  try{await assert.rejects(f.database.verify());}finally{await f.admin`ALTER TABLE extension.migration_attempts ADD UNIQUE(pack_id,pack_version,migration_ref)`;}
  await f.database.verify();
 });
});
