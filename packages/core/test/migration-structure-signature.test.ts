import {verifyStoredMigrationData,type StoredDataInspectionAdmission} from '../src/extensions/verify-stored-migration-data.ts';
import {readSignedDataExpectation} from '../src/extensions/read-signed-data.ts';
import {dataSignaturePayload,verifyDataSignature,matchDataSignature,type MigrationDataReport} from '../src/extensions/verify-data-signature.ts';
import {verifySignedMigrationData} from '../src/extensions/verify-signed-migration-data.ts';
import type {MigrationDataCheck} from '../src/extensions/verify-migration-data.ts';
import {readRevalidatedStructureResult} from '../src/extensions/read-structure-result.ts';
import {persistMigrationStructureResult} from '../src/extensions/persist-structure-result.ts';
import {verifyStoredMigrationStructure,type StoredStructureInspectionAdmission} from '../src/extensions/verify-stored-migration-structure.ts';
import {readSignedStructureExpectation} from '../src/extensions/read-signed-structure.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import type {EntityRef} from '@abh/contracts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import postgres from 'postgres';
import type {PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson,digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {verifyStructureSignature,matchStructureSignature,structureSignaturePayload,type MigrationStructureReport} from '../src/extensions/verify-structure-signature.ts';
import {verifySignedMigrationStructure} from '../src/extensions/verify-signed-migration-structure.ts';
import type {MigrationStructureExpectation} from '../src/extensions/verify-migration-structure.ts';
import {registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {packManifest} from './pack-fixture.ts';
const exec=promisify(execFile);
test('signed structure expectation binds live registered inspection and current deployment',{skip:!process.env.ABH_TEST_COSIGN,timeout:120000},async t=>{
 const executable=process.env.ABH_TEST_COSIGN!,root=await mkdtemp(join(tmpdir(),'abh-structure-sign-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const run=(args:string[])=>exec(executable,args,{cwd:root,env:{...process.env,COSIGN_PASSWORD:''},timeout:10000,maxBuffer:1048576});
 await run(['generate-key-pair','--output-key-prefix',join(root,'reviewer')]);await run(['generate-key-pair','--output-key-prefix',join(root,'other')]);
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const password=randomBytes(24).toString('hex');await f.admin.unsafe(`CREATE ROLE hello_migrator LOGIN NOINHERIT PASSWORD '${password}'`);await f.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
 const url=new URL(f.runtimeUrl);url.username='hello_migrator';url.password=password;
 const pool=postgres(url.toString(),{max:1,onnotice:()=>{}});t.after(()=>pool.end());const connection=await pool.reserve();t.after(()=>connection.release());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'}),ref={type:'abh.artifact',id:randomUUID(),version:1};
 const pack=await packManifest() as PackManifest;pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};pack.migrations=[{...pack.artifacts[0]!,ref:'migration.sql'}];
 const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
 const step:PackMigrationStep={ref:'migration.sql',digest:pack.migrations[0]!.digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
 await registerPackSchemaOwnership(f.admin,[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}],ref);
 const expected:MigrationStructureExpectation={inventory:[{schema:'hello_domain',relations:[]}],tables:[],sequences:[],views:[],acl:[]},digest=async(value:unknown)=>digestBytes(new TextEncoder().encode(canonicalJson(value)));
 await connection`CREATE VIEW hello_domain.signed_view WITH (security_invoker=true) AS SELECT 1 AS id`;
 expected.inventory[0]!.relations=[{name:'signed_view',kind:'v'}];
 expected.views=[{schema:'hello_domain',name:'signed_view',expected:{schema:'hello_domain',name:'signed_view',owner:'hello_migrator',kind:'v',definition:' SELECT 1 AS id;',options:['security_invoker=true'],populated:true,rules:[],indexes:[],triggers:[],columns:[{name:'id',typeSchema:'pg_catalog',typeName:'int4',typeModifier:-1}]}}];
 expected.acl=[{schema:'hello_domain',name:'signed_view',kind:'v',grants:['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].map(privilege=>({column:null,grantor:'hello_migrator',grantee:'hello_migrator',privilege,grantable:false}))}];
 const report:MigrationStructureReport={binding:{organizationId:c.tenant.resourceOrganizationId,packId:pack.metadata.id,packVersion:pack.metadata.version,packageDigest:pack.integrity.packageDigest,planDigest:await digest([step]),expectedDigest:await digest(expected)},environmentDigest:await digest('environment'),deploymentVersion:1,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
 const signer={executable,mode:'OfflinePublicKey' as const,publicKeyPem:await readFile(join(root,'reviewer.pub'),'utf8'),organizationId:report.binding.organizationId,packId:report.binding.packId,maxLifetimeMs:120000};
 await writeFile(join(root,'payload'),structureSignaturePayload(report));await run(['sign-blob','--key',join(root,'reviewer.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'bundle.json'),join(root,'payload')]);const bundle=await readFile(join(root,'bundle.json'));
 await t.test('data signature has a separate domain and verifies actual invariant drift',async()=>{
  const expectedData:MigrationDataCheck[]=[{schema:'hello_domain',table:'signed_data',rowCount:'2',nonNull:['id'],uniqueKeys:[['id']]}];
  const dataReport:MigrationDataReport={...report,binding:{...report.binding,kind:'DataInvariants',expectedDigest:await digest(expectedData)}};
  await writeFile(join(root,'data-payload'),dataSignaturePayload(dataReport));
  await run(['sign-blob','--key',join(root,'reviewer.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'data-bundle.json'),join(root,'data-payload')]);
  const dataBundle=await readFile(join(root,'data-bundle.json'));
  const proof=await verifyDataSignature(dataReport,dataBundle,signer,options());assert.deepEqual(proof.report(),dataReport);
  assert.throws(()=>matchDataSignature({...proof},dataReport,dataReport.binding),{code:'FORBIDDEN'});
  await assert.rejects(verifyDataSignature(dataReport,bundle,signer,options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyDataSignature({...dataReport,binding:{...dataReport.binding,expectedDigest:await digest([])}},dataBundle,signer,options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyDataSignature(dataReport,dataBundle,{...signer,organizationId:randomUUID()},options()),{code:'FORBIDDEN'});
  await assert.rejects(verifyDataSignature(dataReport,dataBundle,{...signer,publicKeyPem:await readFile(join(root,'other.pub'),'utf8')},options()),{code:'PRECONDITION_FAILED'});
  const mutable=structuredClone(dataReport),bytes=Buffer.from(dataBundle),pending=verifyDataSignature(mutable,bytes,signer,options());mutable.deploymentVersion=9;bytes.fill(0);assert.deepEqual((await pending).report(),dataReport);
  const ownerRef={type:'abh.organization',id:dataReport.binding.organizationId,version:1};
  const storeData=async(content:string,sourceRefs:EntityRef[]=[],owner=ownerRef)=>{
   const payload={ownerRef:owner,mediaType:'application/json',content,purposeNames:['abh.pack.manage'],dataClass:'abh.data.internal',sourceRefs,region:'local',retentionPolicyRef:ref};
   const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
   return (await f.database.transaction(c,options(),tx=>executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,command,payload,async()=>{})).artifactRef))).receipt.resultRef;
  };
  const dataRef=await storeData(dataSignaturePayload(dataReport)),signatureRef=await storeData(dataBundle.toString('utf8'),[dataRef]);
  const admission={signer:async()=>signer,source:async()=>{}};
  const read=(r:EntityRef=dataRef,b:EntityRef=signatureRef,checks=admission)=>f.database.transaction(c,options(),tx=>readSignedDataExpectation(tx,options(),dataReport.binding,ownerRef,r,b,checks));
  assert.deepEqual((await read()).report,dataReport);
  await assert.rejects(read(dataRef,await storeData(dataBundle.toString('utf8'))),{code:'PRECONDITION_FAILED'});
  await assert.rejects(read(dataRef,await storeData(dataBundle.toString('utf8'),[dataRef],{...ownerRef,version:2})),{code:'PRECONDITION_FAILED'});
  await assert.rejects(read(await storeData(' '+dataSignaturePayload(dataReport)),signatureRef),{code:'PRECONDITION_FAILED'});
  const substituted=await storeData(structureSignaturePayload(report));await assert.rejects(read(substituted,signatureRef),{code:'PRECONDITION_FAILED'});
  const modified=await storeData(dataSignaturePayload({...dataReport,deploymentVersion:2}));await assert.rejects(read(modified,await storeData(dataBundle.toString('utf8'),[modified])),{code:'PRECONDITION_FAILED'});
  let sourceCalls=0;await assert.rejects(read(dataRef,signatureRef,{...admission,source:async()=>{if(++sourceCalls===3)throw new Error('stored data source withdrawn');}}),/stored data source withdrawn/);
  let signerCalls=0;await assert.rejects(read(dataRef,signatureRef,{...admission,signer:async()=>++signerCalls===1?signer:{...signer,maxLifetimeMs:240000}}),{code:'VERSION_CONFLICT'});
  await assert.rejects(read(dataRef,dataRef),{code:'INVALID_ARGUMENT'});
  await connection`CREATE TABLE hello_domain.signed_data (id integer)`;
  await connection`INSERT INTO hello_domain.signed_data VALUES (1),(2)`;
  const config={signer,environmentDigest:dataReport.environmentDigest,deploymentVersion:1};
  const inspect=async(admission={current:async()=>config,authorize:async()=>{}})=>{
   await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
   try{return await f.database.transaction(c,options(),tx=>verifySignedMigrationData(tx,connection,options(),pack,[step],expectedData,dataReport,dataBundle,admission));}finally{await connection`ROLLBACK`;}
  };
  const inspectStored=async(checks:StoredDataInspectionAdmission={...admission,current:async()=>({environmentDigest:dataReport.environmentDigest,deploymentVersion:1})},input=expectedData)=>{
   await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
   try{return await f.database.transaction(c,options(),tx=>verifyStoredMigrationData(tx,connection,options(),pack,[step],input,ownerRef,dataRef,signatureRef,checks));}finally{await connection`ROLLBACK`;}
  };
  const actual=await inspectStored();assert.equal(actual.matched,true);assert.deepEqual(actual.reportRef,dataRef);assert.deepEqual(actual.signature.report,dataReport);
  await assert.rejects(inspectStored(undefined,[{...expectedData[0]!,rowCount:'0'}]),{code:'PRECONDITION_FAILED'});
  let admissions=0;
  await assert.rejects(inspectStored({...admission,current:async()=>({environmentDigest:dataReport.environmentDigest,deploymentVersion:++admissions>=4?2:1})}),{code:'PRECONDITION_FAILED'});
  admissions=0;await assert.rejects(inspectStored({...admission,current:async()=>{admissions++;return {environmentDigest:dataReport.environmentDigest,deploymentVersion:1};},source:async()=>{if(admissions>=4)throw new Error('data bundle revoked after scan');}}),/data bundle revoked after scan/);
  admissions=0;await assert.rejects(inspectStored({...admission,current:async()=>{admissions++;return {environmentDigest:dataReport.environmentDigest,deploymentVersion:1};},signer:async()=>admissions>=4?{...signer,maxLifetimeMs:240000}:signer}),{code:'VERSION_CONFLICT'});
  assert.equal((await inspect()).matched,true);
  await connection`UPDATE hello_domain.signed_data SET id=1 WHERE id=2`;const drift=await inspect();assert.equal(drift.matched,false);assert.equal(drift.results[0]!.duplicates[0]!.groups,'1');assert.equal((await inspectStored()).matched,false);
  let calls=0;await assert.rejects(inspect({current:async()=>++calls===1?config:{...config,deploymentVersion:2},authorize:async()=>{}}),{code:'VERSION_CONFLICT'});
  calls=0;await assert.rejects(inspect({current:async()=>config,authorize:async()=>{if(++calls===4)throw new Error('data source withdrawn');}}),/data source withdrawn/);
  await connection`DROP TABLE hello_domain.signed_data`;
 });
 await t.test('real signature rejects tampering and copied proofs',async()=>{
  const candidate=await verifyStructureSignature(report,bundle,signer,options());assert.deepEqual(candidate.report(),report);
  assert.throws(()=>matchStructureSignature({...candidate},report,report.binding),{code:'FORBIDDEN'});
  for(const field of ['packageDigest','planDigest','expectedDigest'] as const)await assert.rejects(verifyStructureSignature({...report,binding:{...report.binding,[field]:await digest('wrong')}},bundle,signer,options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyStructureSignature({...report,deploymentVersion:2},bundle,signer,options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyStructureSignature(report,bundle,{...signer,organizationId:randomUUID()},options()),{code:'FORBIDDEN'});
  await assert.rejects(verifyStructureSignature(report,bundle,{...signer,publicKeyPem:await readFile(join(root,'other.pub'),'utf8')},options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyStructureSignature(report,bundle,{...signer,maxLifetimeMs:100},options()),{code:'PRECONDITION_FAILED'});
  const mutable=structuredClone(report),bytes=Buffer.from(bundle),pending=verifyStructureSignature(mutable,bytes,signer,options());mutable.deploymentVersion=9;bytes.fill(0);assert.deepEqual((await pending).report(),report);
  const proof=matchStructureSignature(candidate,report,report.binding);proof.bundle.fill(0);proof.report.deploymentVersion=3;assert.deepEqual(matchStructureSignature(candidate,report,report.binding).report,report);
 });
 await t.test('persisted signed report requires actual bytes, source binding and current key',async()=>{
  const ownerRef={type:'abh.organization',id:report.binding.organizationId,version:1};
  const store=async(content:string,sourceRefs:EntityRef[]=[],owner=ownerRef)=>{
   const payload={ownerRef:owner,mediaType:'application/json',content,purposeNames:['abh.pack.manage'],dataClass:'abh.data.internal',sourceRefs,region:'local',retentionPolicyRef:ref};
   const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};let result:EntityRef|undefined;
   await f.database.transaction(c,options(),tx=>executeCommand(tx,command,async()=>{},async()=>{result=(await new InlineArtifactOwner().store(tx,command,payload,async()=>{})).artifactRef;return result;}));return result!;
  };
  const reportRef=await store(structureSignaturePayload(report)),bundleRef=await store(bundle.toString('utf8'),[reportRef]);
  let revoked=false,calls=0,rotate=false;
  const admission={source:async()=>{if(revoked)throw new Error('source revoked');},signer:async()=>{calls++;return rotate&&calls>1?{...signer,maxLifetimeMs:240000}:signer;}};
  const read=(r=reportRef,b=bundleRef)=>f.database.transaction(c,options(),tx=>readSignedStructureExpectation(tx,options(),report.binding,ownerRef,r,b,admission));
  assert.deepEqual((await read()).report,report);
  revoked=true;await assert.rejects(read(),/source revoked/);revoked=false;
  calls=0;rotate=true;await assert.rejects(read(),{code:'VERSION_CONFLICT'});rotate=false;
  const unrelated=await store(bundle.toString('utf8'));await assert.rejects(read(reportRef,unrelated),{code:'PRECONDITION_FAILED'});
  const malformed=await store(' '+structureSignaturePayload(report));await assert.rejects(read(malformed,bundleRef),{code:'PRECONDITION_FAILED'});
  const wrongOwner=await store(bundle.toString('utf8'),[reportRef],{...ownerRef,version:2});await assert.rejects(read(reportRef,wrongOwner),{code:'PRECONDITION_FAILED'});
  const changed=await store(structureSignaturePayload({...report,deploymentVersion:2}));const changedBundle=await store(bundle.toString('utf8'),[changed]);await assert.rejects(read(changed,changedBundle),{code:'PRECONDITION_FAILED'});
  await assert.rejects(read(reportRef,reportRef),{code:'INVALID_ARGUMENT'});
  const inspectStored=async(checks:StoredStructureInspectionAdmission={...admission,current:async()=>({environmentDigest:report.environmentDigest,deploymentVersion:1})},input=expected)=>{
   await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
   try{return await f.database.transaction(c,options(),tx=>verifyStoredMigrationStructure(tx,connection,options(),pack,[step],input,ownerRef,reportRef,bundleRef,checks));}finally{await connection`ROLLBACK`;}
  };
  const inspected=await inspectStored();assert.equal(inspected.matched,true);assert.deepEqual(inspected.reportRef,reportRef);assert.deepEqual(inspected.signature.report,report);
  const retention={dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref};
  const persist=(value=inspected,authorize:()=>Promise<void>=async()=>{})=>persistMigrationStructureResult(f.database,c,options(),value,retention,authorize,async()=>{});
  await assert.rejects(persist({...inspected}),{code:'PRECONDITION_FAILED'});
  const changedResult=inspected.matched;inspected.matched=!changedResult;await assert.rejects(persist(),{code:'PRECONDITION_FAILED'});inspected.matched=changedResult;
  let finalCalls=0;await assert.rejects(persist(inspected,async()=>{if(++finalCalls===2)throw new Error('capture withdrawn');}),/capture withdrawn/);
  const evidence=await persist();assert.deepEqual(await persist(),evidence);
  await assert.rejects(persist(inspected,async()=>{throw new Error('replay capture denied');}),/replay capture denied/);
  await f.database.transaction(c,options(),async tx=>{
   const stored=await new InlineArtifactOwner().read(tx,evidence,async()=>{});
   const envelope=JSON.parse(new TextDecoder().decode(stored.bytes));assert.equal(envelope[0],'abh-pack-migration-structure-observation-v1');assert.equal(envelope[1].result.matched,true);assert.deepEqual(envelope[1].result.binding,report.binding);assert.equal(envelope[1].result.signature.bundle,undefined);assert.deepEqual(stored.record.sourceRefs,[reportRef,bundleRef]);
  });
  const recover=async(saved:EntityRef=evidence,authorize:()=>Promise<void>=async()=>{},old=false)=>{
   await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
   try{return await f.database.transaction(c,options(),tx=>readRevalidatedStructureResult(tx,options(),saved,reportRef,bundleRef,()=>old?Promise.resolve(inspected):verifyStoredMigrationStructure(tx,connection,options(),pack,[step],expected,ownerRef,reportRef,bundleRef,{...admission,current:async()=>({environmentDigest:report.environmentDigest,deploymentVersion:1})}),authorize));}finally{await connection`ROLLBACK`;}
  };
  assert.equal((await recover()).current.matched,true);
  await connection`GRANT SELECT ON hello_domain.signed_view TO PUBLIC`;
  try{const drift=await inspectStored();assert.equal(drift.matched,false);assert.equal(drift.acl!.matched,false);await assert.rejects(recover(),{code:'PRECONDITION_FAILED'});const driftRef=await persist(drift);assert.equal((await recover(driftRef)).current.matched,false);}finally{await connection`REVOKE SELECT ON hello_domain.signed_view FROM PUBLIC`;}

  await connection`CREATE OR REPLACE VIEW hello_domain.signed_view WITH (security_invoker=true) AS SELECT 2 AS id`;
  try{
   const drift=await inspectStored();assert.equal(drift.matched,false);assert.deepEqual(drift.views!.results[0]!.differences,['definition']);
   await assert.rejects(recover(),{code:'PRECONDITION_FAILED'});const driftRef=await persist(drift);assert.equal((await recover(driftRef)).current.matched,false);
  }finally{await connection`CREATE OR REPLACE VIEW hello_domain.signed_view WITH (security_invoker=true) AS SELECT 1 AS id`;}

  await assert.rejects(recover(evidence,async()=>{},true),{code:'PRECONDITION_FAILED'});
  let recoveryCalls=0;await assert.rejects(recover(evidence,async()=>{if(++recoveryCalls===2)throw new Error('observation source withdrawn');}),/observation source withdrawn/);
  const persisted=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,evidence,async()=>{}));
  const tampered=JSON.parse(new TextDecoder().decode(persisted.bytes));tampered[1].result.matched=false;
  await assert.rejects(recover(await store(canonicalJson(tampered),[reportRef,bundleRef])),{code:'PRECONDITION_FAILED'});
  await assert.rejects(inspectStored(undefined,{...expected,sequences:[{schema:'hello_domain',name:'absent',expected:null}]}),{code:'PRECONDITION_FAILED'});
  await connection`CREATE SEQUENCE hello_domain.stored_extra`;try{const mismatch=await inspectStored();assert.equal(mismatch.matched,false);const mismatchRef=await persist(mismatch);assert.notDeepEqual(mismatchRef,evidence);await assert.rejects(recover(),{code:'PRECONDITION_FAILED'});assert.equal((await recover(mismatchRef)).current.matched,false);}finally{await connection`DROP SEQUENCE hello_domain.stored_extra`;}
  let passes=0;
  const checks={...admission,current:async()=>{passes++;return {environmentDigest:report.environmentDigest,deploymentVersion:passes>=4?2:1};}};
  await assert.rejects(inspectStored(checks),{code:'PRECONDITION_FAILED'});
  passes=0;await assert.rejects(inspectStored({...checks,current:async()=>{passes++;return {environmentDigest:report.environmentDigest,deploymentVersion:1};},source:async()=>{if(passes>=4)throw new Error('source withdrawn after target inspection');}}),/source withdrawn after target inspection/);
  passes=0;await assert.rejects(inspectStored({...checks,current:async()=>{passes++;return {environmentDigest:report.environmentDigest,deploymentVersion:1};},signer:async()=>passes>=4?{...signer,maxLifetimeMs:240000}:signer}),{code:'VERSION_CONFLICT'});
  let sources=0;await assert.rejects(f.database.transaction(c,options(),tx=>readSignedStructureExpectation(tx,options(),report.binding,ownerRef,reportRef,bundleRef,{...admission,source:async()=>{if(++sources===3)throw new Error('late report withdrawal');}})),/late report withdrawal/);
 });
 const config={signer,environmentDigest:report.environmentDigest,deploymentVersion:1};
 const inspect=async(input=expected,admission={current:async()=>config,authorize:async()=>{}})=>{
  await connection`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  try{return await f.database.transaction(c,options(),tx=>verifySignedMigrationStructure(tx,connection,options(),pack,[step],input,report,bundle,admission));}finally{await connection`ROLLBACK`;}
 };
 await t.test('signed expected structure checks real target and cannot be replaced',async()=>{
  const result=await inspect();assert.equal(result.matched,true);assert.deepEqual(result.signature.report,report);
  await assert.rejects(inspect({...expected,sequences:[{schema:'hello_domain',name:'missing',expected:null}]}),{code:'FORBIDDEN'});
  await connection`CREATE SEQUENCE hello_domain.extra`;try{assert.equal((await inspect()).matched,false);}finally{await connection`DROP SEQUENCE hello_domain.extra`;}
 });
 await t.test('current environment, signer rotation and final admission are enforced',async()=>{
  await assert.rejects(inspect(expected,{current:async()=>({...config,deploymentVersion:2}),authorize:async()=>{}}),{code:'PRECONDITION_FAILED'});
  let calls=0;await assert.rejects(inspect(expected,{current:async()=>++calls===1?config:{...config,signer:{...signer,maxLifetimeMs:240000}},authorize:async()=>{}}),{code:'VERSION_CONFLICT'});
  calls=0;const denied=new Error('expectation source withdrawn');await assert.rejects(inspect(expected,{current:async()=>config,authorize:async()=>{if(++calls===4)throw denied;}}),error=>error===denied);
 });
});
