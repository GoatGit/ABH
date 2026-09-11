import {connectMigrationTarget} from '../src/extensions/connect-migration-target.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ArtifactRecord,PackManifest,PackMigrationStep,PackMigrationEvidence} from '@abh/contracts';
import {verifyMigrationSignature,migrationSignaturePayload,matchMigrationSignature} from '../src/extensions/verify-migration-signature.ts';
import {createDatabaseFixture,context} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {verifyStoredMigrationSignature} from '../src/extensions/migration-signature-artifact.ts';
import {packManifest} from './pack-fixture.ts';
import {canonicalJson,digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {digestMigrationExecution} from '../src/extensions/migration-evidence.ts';
import {readSignedMigrationPlan,type MigrationSignatureBinding} from '../src/extensions/signed-migration-plan.ts';
import {prepareMigrationContent} from '../src/extensions/prepare-migration-content.ts';
import {registerPackSchemaOwnership} from '../src/extensions/schema-ownership.ts';
import postgres from 'postgres';
import {prepareDatabaseMigration} from '../src/extensions/prepare-database-migration.ts';
import {checkInstalledMigration,installedMigrationSql} from './installed-migration-fixture.ts';
const exec=promisify(execFile),options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
test('independent Cosign migration signature binds full report and fixed organization/kind',{skip:!process.env.ABH_TEST_COSIGN},async()=>{
 const executable=process.env.ABH_TEST_COSIGN!,root=await mkdtemp(join(tmpdir(),'abh-migration-sign-'));
 const run=(args:string[])=>exec(executable,args,{cwd:root,env:{...process.env,COSIGN_PASSWORD:''},timeout:10000,maxBuffer:1048576});
 try{
  await run(['generate-key-pair','--output-key-prefix',join(root,'reviewer')]);
  await run(['generate-key-pair','--output-key-prefix',join(root,'other')]);
  const digest='sha256:'+'a'.repeat(64),ref={type:'abh.artifact',id:randomUUID(),version:1};
  const report:PackMigrationEvidence={organizationId:randomUUID(),kind:'Review',status:'Passed',packageDigest:digest,stepDigest:digest,environmentDigest:digest,deploymentVersion:1,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+180000).toISOString(),supportingRefs:[ref]};
  const signer={executable,mode:'OfflinePublicKey' as const,publicKeyPem:await readFile(join(root,'reviewer.pub'),'utf8'),organizationId:report.organizationId,kind:report.kind,maxLifetimeMs:240000};
  await writeFile(join(root,'payload'),migrationSignaturePayload(report));
  await run(['sign-blob','--key',join(root,'reviewer.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'bundle.json'),join(root,'payload')]);
  const bundle=await readFile(join(root,'bundle.json'));
  const candidate=await verifyMigrationSignature(report,bundle,signer,options());
  assert.deepEqual(candidate.report(),report);assert.deepEqual(matchMigrationSignature(candidate,report).report,report);
  assert.throws(()=>matchMigrationSignature({...candidate},report),{code:'FORBIDDEN'});
  for(const patch of [{deploymentVersion:2},{environmentDigest:'sha256:'+'b'.repeat(64)},{status:'Failed' as const},{supportingRefs:[{...ref,version:2}]}])await assert.rejects(verifyMigrationSignature({...report,...patch},bundle,signer,options()),{code:'PRECONDITION_FAILED'});
  for(const patch of [{organizationId:randomUUID()},{kind:'DryRun' as const}])await assert.rejects(verifyMigrationSignature(report,bundle,{...signer,...patch},options()),{code:'FORBIDDEN'});
  await assert.rejects(verifyMigrationSignature(report,bundle,{...signer,publicKeyPem:await readFile(join(root,'other.pub'),'utf8')},options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyMigrationSignature(report,bundle,{...signer,maxLifetimeMs:100},options()),{code:'PRECONDITION_FAILED'});
  const mutable=structuredClone(report),bytes=Buffer.from(bundle),pending=verifyMigrationSignature(mutable,bytes,signer,options());
  mutable.deploymentVersion=99;bytes.fill(0);assert.deepEqual((await pending).report(),report);
  const proof=matchMigrationSignature(candidate,report);proof.bundle.fill(0);proof.report.deploymentVersion=3;
  assert.deepEqual(matchMigrationSignature(candidate,report).report,report);
  const db=await createDatabaseFixture();
  try{
   const c=deriveVerifiedContext({...context(report.organizationId).request,contextExpiresAt:new Date(Date.now()+180000).toISOString(),purposeOfUse:'abh.pack.manage'});
   const payload={ownerRef:{type:'abh.organization',id:report.organizationId,version:1},mediaType:'application/json',content:bundle.toString('utf8'),purposeNames:['abh.pack.manage'],dataClass:'abh.data.internal',sourceRefs:[],region:'local',retentionPolicyRef:ref};
   const cmd={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};let stored:ArtifactRecord|undefined;
   await db.database.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{stored=await new InlineArtifactOwner().store(tx,cmd,payload,async()=>{});return stored.artifactRef;}));
   let denied=false,rotated=false,calls=0;
   const otherKey=await readFile(join(root,'other.pub'),'utf8');
   const admission={signer:async()=>{calls++;return rotated?{...signer,publicKeyPem:otherKey}:signer;},source:async()=>{if(denied)throw new Error('source revoked');}};
   await db.database.transaction(c,options(),async tx=>{
    let called=0;const stopped=new AbortController();stopped.abort();
    await assert.rejects(verifyStoredMigrationSignature(tx,{...options(),signal:stopped.signal},report,stored!.artifactRef,{...admission,signer:async()=>{called++;return signer;}}),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(called,0);assert.equal(tx.signal.aborted,false);tx.assertActive();
    const child=new AbortController();
    await assert.rejects(verifyStoredMigrationSignature(tx,{...options(),signal:child.signal},report,stored!.artifactRef,{...admission,source:async()=>{child.abort();}}),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(tx.signal.aborted,false);tx.assertActive();
   });
   for(const phase of ['signer','finalSource'])await db.database.transaction(c,options(),async tx=>{
    const child=new AbortController();let signerCalls=0,sourceCalls=0;
    await assert.rejects(verifyStoredMigrationSignature(tx,{...options(),signal:child.signal},report,stored!.artifactRef,{
     signer:async()=>{signerCalls++;if(phase==='signer')child.abort();return signer;},
     source:async()=>{sourceCalls++;if(phase==='finalSource'&&sourceCalls===2)child.abort();},
    }),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(signerCalls,1);assert.equal(sourceCalls,phase==='signer'?0:2);assert.equal(tx.signal.aborted,false);
   });
   const recover=()=>db.database.transaction(c,options(),tx=>verifyStoredMigrationSignature(tx,options(),report,stored!.artifactRef,admission));
   assert.deepEqual((await recover()).report(),report);
   denied=true;await assert.rejects(recover(),/source revoked/);denied=false;
   rotated=true;await assert.rejects(recover(),{code:'PRECONDITION_FAILED'});rotated=false;
   calls=0;
   await assert.rejects(db.database.transaction(c,options(),tx=>verifyStoredMigrationSignature(tx,options(),report,stored!.artifactRef,{...admission,signer:async()=>++calls===1?signer:{...signer,publicKeyPem:otherKey}})),{code:'VERSION_CONFLICT'});
   const pack=await packManifest() as PackManifest;pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
   const sqlBytes=new TextEncoder().encode(installedMigrationSql),sqlDigest=await digestBytes(sqlBytes);
   pack.migrations=[{ref:'migration.sql',digest:sqlDigest,sizeBytes:sqlBytes.byteLength,mediaType:'application/sql'}];
   const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
   const step:PackMigrationStep={ref:'migration.sql',digest:sqlDigest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',operations:['Create'],transactional:true,reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
   const store=async(content:string)=>{
    const data={...payload,content},command={...cmd,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(data)};let record:ArtifactRecord|undefined;
    await db.database.transaction(c,options(),tx=>executeCommand(tx,command,async()=>{},async()=>{record=await new InlineArtifactOwner().store(tx,command,data,async()=>{});return record.artifactRef;}));return record!.artifactRef;
   };
   const links:MigrationSignatureBinding[]=[];
   for(const [kind,key] of [['Review','reviewRef'],['DryRun','dryRunRef'],['SafetyPoint','safetyPointRef'],['RecoveryPlan','recoveryPlanRef'],['Compatibility','compatibilityRef']] as const){
    const evidence={...report,kind,packageDigest:pack.integrity.packageDigest,stepDigest:await digestMigrationExecution(step)};
    await writeFile(join(root,'plan-payload'),migrationSignaturePayload(evidence));
    await run(['sign-blob','--key',join(root,'reviewer.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'plan-bundle.json'),join(root,'plan-payload')]);
    step[key]=await store(canonicalJson(evidence));links.push({reportRef:step[key],bundleRef:await store(await readFile(join(root,'plan-bundle.json'),'utf8'))});
   }
   let factsAllowed=true,sourceCalls=0;
   const planAdmission={maxLifetimeMs:{Review:240000,DryRun:240000,SafetyPoint:240000,RecoveryPlan:240000,Compatibility:240000,Retirement:240000},
    reportSource:async()=>{sourceCalls++;},signature:{source:async()=>{},signer:async(evidence:PackMigrationEvidence)=>({...signer,kind:evidence.kind})},supportingFacts:async()=>{if(!factsAllowed)throw new Error('supporting facts denied');}};
   const readPlan=(mapping=links)=>db.database.transaction(c,options(),tx=>readSignedMigrationPlan(tx,options(),pack,[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}],[step],{environmentDigest:digest,deploymentVersion:1},mapping,planAdmission));
   assert.equal((await readPlan())[0]!.reports.length,5);
   for(const boundary of ['source','facts'] as const)await db.database.transaction(c,options(),async tx=>{
    const child=new AbortController();let sources=0,facts=0,signers=0;
    await assert.rejects(readSignedMigrationPlan(tx,{...options(),signal:child.signal},pack,[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}],[step],{environmentDigest:digest,deploymentVersion:1},links,{
     ...planAdmission,reportSource:async()=>{sources++;if(boundary==='source')child.abort();},
     supportingFacts:async()=>{facts++;child.abort();},
     signature:{source:async()=>{},signer:async evidence=>{signers++;return {...signer,kind:evidence.kind};}},
    }),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(sources,1);assert.equal(facts,boundary==='source'?0:1);assert.equal(signers,boundary==='source'?0:2);tx.assertActive();assert.equal(tx.signal.aborted,false);
   });

   sourceCalls=0;await assert.rejects(readPlan(links.slice(1)),{code:'PRECONDITION_FAILED'});assert.equal(sourceCalls,0);
   await assert.rejects(readPlan([...links,links[0]!]),{code:'INVALID_ARGUMENT'});
   await assert.rejects(readPlan(links.map((link,i)=>i===0?{...link,bundleRef:links[1]!.bundleRef}:link)),{code:'PRECONDITION_FAILED'});
   factsAllowed=false;await assert.rejects(readPlan(),/supporting facts denied/);factsAllowed=true;
   for(const revoked of ['signer','report','bundle'] as const){
    let late=false;
    const checks={...planAdmission,
     supportingFacts:async(_artifact:ArtifactRecord,evidence:PackMigrationEvidence)=>{if(evidence.kind==='Compatibility')late=true;},
     reportSource:async(_artifact:ArtifactRecord,kind:PackMigrationEvidence['kind'])=>{if(late&&kind==='Review'&&revoked==='report')throw new Error('late report revocation');},
     signature:{source:async(_artifact:ArtifactRecord,evidence:PackMigrationEvidence)=>{if(late&&evidence.kind==='Review'&&revoked==='bundle')throw new Error('late bundle revocation');},
      signer:async(evidence:PackMigrationEvidence)=>({...signer,kind:evidence.kind,...(late&&evidence.kind==='Review'&&revoked==='signer'?{publicKeyPem:otherKey}:{})})}};
    await assert.rejects(db.database.transaction(c,options(),tx=>readSignedMigrationPlan(tx,options(),pack,[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}],[step],{environmentDigest:digest,deploymentVersion:1},links,checks)),revoked==='signer'?{code:'PRECONDITION_FAILED'}:/late .* revocation/);
   }
   await db.admin`CREATE ROLE hello_migrator LOGIN NOINHERIT`;
   await db.admin`CREATE SCHEMA hello_domain AUTHORIZATION hello_migrator`;
   const source={refs:['input.json','migration.sql'],async open(name:string){return {async *[Symbol.asyncIterator](){yield name==='input.json'?new TextEncoder().encode('abc'):sqlBytes;}};}};
   const prepare=(payload=source,authorize:()=>Promise<void>=async()=>{})=>db.database.transaction(c,options(),tx=>prepareMigrationContent(tx,options(),pack,[step],payload,{environmentDigest:digest,deploymentVersion:1},links,planAdmission,authorize));
   await assert.rejects(prepare(),{code:'FORBIDDEN'});
   await registerPackSchemaOwnership(db.admin,[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}],ref);
   const prepared=await prepare();assert.equal(prepared.content[0]!.sql,installedMigrationSql);assert.equal(prepared.evidence[0]!.reports.length,5);
   sourceCalls=0;
   await assert.rejects(prepare({...source,async open(){return {async *[Symbol.asyncIterator](){yield new TextEncoder().encode('bad');}};}}));assert.equal(sourceCalls,0);
   let admissionCount=0;
   await assert.rejects(prepare(source,async()=>{if(++admissionCount===2)throw new Error('post-content authority revoked');}),/post-content authority revoked/);
   const password=randomBytes(24).toString('hex');
   await db.admin.unsafe(`ALTER ROLE hello_migrator PASSWORD '${password}'`);
   const targetUrl=new URL(db.runtimeUrl);targetUrl.username='hello_migrator';targetUrl.password=password;
   const targetPool=postgres(targetUrl.toString(),{max:1,onnotice:()=>{}}),target=await targetPool.reserve();
   try{
    await db.database.transaction(c,options(),async tx=>{
     const child=new AbortController();child.abort();let authorized=0;
     await assert.rejects(prepareDatabaseMigration(tx,target,{...options(),signal:child.signal},pack,[step],source,{environmentDigest:digest,deploymentVersion:1},links,planAdmission,async()=>{authorized++;}),{code:'DEPENDENCY_TIMEOUT'});
     assert.equal(authorized,0);assert.equal(tx.signal.aborted,false);tx.assertActive();
    });
    const prepareTarget=(checks=planAdmission)=>db.database.transaction(c,options(),tx=>prepareDatabaseMigration(tx,target,options(),pack,[step],source,{environmentDigest:digest,deploymentVersion:1},links,checks,async()=>{}));
    assert.equal((await prepareTarget()).content[0]!.sql,installedMigrationSql);
    await db.admin`ALTER ROLE hello_migrator BYPASSRLS`;
    try{sourceCalls=0;await assert.rejects(prepareTarget(),{code:'FORBIDDEN'});assert.equal(sourceCalls,0);}finally{await db.admin`ALTER ROLE hello_migrator NOBYPASSRLS`;}
    try{
     await assert.rejects(prepareTarget({...planAdmission,supportingFacts:async()=>{await db.admin`ALTER ROLE hello_migrator BYPASSRLS`;}}),{code:'FORBIDDEN'});
    }finally{await db.admin`ALTER ROLE hello_migrator NOBYPASSRLS`;}
    const [tables]=await target`SELECT count(*)::integer AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hello_domain'`;
    assert.equal(tables!.count,0);
    await checkInstalledMigration(db,c,root,executable,run,pack,step,links,target,planAdmission,async()=>{
     return connectMigrationTarget(targetUrl.toString(),options());
    },targetUrl.toString());
   }finally{target.release();await targetPool.end();}
   const tombstone={type:'abh.artifacts.tombstone',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(stored!.artifactRef)};
   await db.database.transaction(c,options(),tx=>new InlineArtifactOwner().tombstone(tx,tombstone,stored!.artifactRef,ref,async()=>{}));
   await assert.rejects(recover(),{code:'VERSION_CONFLICT'});
  }finally{await db.close();}
  const short={...report,expiresAt:new Date(Date.now()+1500).toISOString()};
  await writeFile(join(root,'payload'),migrationSignaturePayload(short));
  await run(['sign-blob','--key',join(root,'reviewer.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'short.json'),join(root,'payload')]);
  const shortBundle=await readFile(join(root,'short.json')),shortCandidate=await verifyMigrationSignature(short,shortBundle,signer,options());
  await new Promise(resolve=>setTimeout(resolve,Math.max(1,Date.parse(short.expiresAt)-Date.now()+10)));
  assert.throws(()=>matchMigrationSignature(shortCandidate,short),{code:'PRECONDITION_FAILED'});
  await assert.rejects(verifyMigrationSignature(short,shortBundle,signer,options()),{code:'PRECONDITION_FAILED'});
 }finally{await rm(root,{recursive:true,force:true});}
});
