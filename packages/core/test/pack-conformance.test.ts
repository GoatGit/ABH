import {enablePack} from '../src/extensions/enable-pack.ts';
import {applyPackEnable} from '../src/extensions/apply-pack-enable.ts';
import {registerPackCapabilities} from '../src/extensions/register-pack-capabilities.ts';
import {PackCapabilityRegistryOwner} from '../src/extensions/capability-registry.ts';
import {prepareInstalledCapabilities} from '../src/extensions/prepare-installed-capabilities.ts';
import {preparePackEnableCommit} from '../src/extensions/prepare-pack-enable-commit.ts';
import {createRequire} from 'node:module';
import {InstalledPackOwner} from '../src/extensions/installed-packs.ts';
import {PackDeploymentRevisionOwner} from '../src/extensions/deployment-revisions.ts';
import {requestPackEnable} from '../src/extensions/request-pack-enable.ts';
import {assignResponsibility} from '../src/human/responsibilities.ts';
import {DecisionOwner,type DecisionEligibility} from '../src/human/decisions.ts';
import {approvalFenceRefs,verifyPackEnableApproval} from '../src/human/approval-proof.ts';
import {lockFences} from '../src/control/fences.ts';
import {preparePackEnableProposal} from '../src/extensions/prepare-pack-enable-proposal.ts';
import {recordPackConformanceArtifact,readPackConformanceArtifact} from '../src/extensions/pack-conformance-artifact.ts';
import {selectMigrationNonApplicability} from '../src/extensions/select-migration-non-applicability.ts';
import {readMigrationNonApplicability} from '../src/extensions/read-migration-non-applicability.ts';
import {recordMigrationNonApplicability} from '../src/extensions/record-migration-non-applicability.ts';
import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {stageLocalPackSnapshot,recoverLocalPackSnapshot} from '../src/extensions/local-pack-staging.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,mkdir,realpath,readdir,lstat,chmod,symlink,link,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {RegisterPackCapabilitiesCommand,DecisionPackage,RequestPackEnableCommand,ResponsibilityAssignmentRecord,ConformanceReport,RecordPackConformanceCommand,RecordPackValidationCommand,PublishPackTrustPolicyCommand,StagePackCommand,RecordPackDataImpactCommand,GrantRecord} from '@abh/contracts';
import {canonicalJson,digestBytes,digestCommandIntent,digestContract,digestPackManifest} from '@abh/contracts/digest';
import {verifyPackConformance,type PackConformancePolicy} from '../src/extensions/verify-pack-conformance.ts';
import {packManifest} from './pack-fixture.ts';
import {validateLocalPack} from '../src/extensions/validate-local-pack.ts';
import {validateCurrentPack,type PackGovernanceSnapshot} from '../src/extensions/validate-current-pack.ts';
import {validatePackArchive} from '../src/extensions/validate-pack-archive.ts';
import {validatePackArchiveFile} from '../src/extensions/validate-pack-archive-file.ts';
import {pack} from 'tar-stream';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {createDatabaseFixture,context,options as databaseOptions} from './database-fixture.ts';
import {PackValidationReportOwner} from '../src/extensions/validation-reports.ts';
import {Database} from '../src/data/uow.ts';
import {publishPackTrustPolicy} from '../src/extensions/publish-pack-trust-policy.ts';
import {recoverStagedPack,recoverStagedPackInTransaction} from '../src/extensions/recover-staged-pack.ts';
import {recoverImpactCheckedPack,readCurrentPackDataImpactInTransaction,readCurrentPackDataImpact,recordPackDataImpact,PackDataImpactOwner} from '../src/extensions/data-impact-reports.ts';
import {verifyImpactSignature,impactSignaturePayload,matchImpactSignature} from '../src/extensions/verify-impact-signature.ts';
import {verifyImpactInventoryArtifacts} from '../src/extensions/impact-inventory-artifacts.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {assessPackDataImpact} from '../src/extensions/pack-data-impact.ts';
import {stagePack} from '../src/extensions/stage-pack.ts';
import {recordPackValidation} from '../src/extensions/record-pack-validation.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {PackTrustPolicyOwner,databasePackGovernanceSource} from '../src/extensions/trust-policies.ts';
import {verifyTrustPolicy,trustPolicySignaturePayload,type SignedTrustPolicyDocument} from '../src/extensions/verify-trust-policy.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {prepareInstalledPack} from '../src/extensions/prepare-installed-pack.ts';
const exec=promisify(execFile),options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});

test('real independent CTK signatures bind complete cases, tested subject, claims, environment, digest and freshness',
 {skip:!process.env.ABH_TEST_COSIGN},async()=>{
 const executable=process.env.ABH_TEST_COSIGN!,root=await mkdtemp(join(tmpdir(),'abh-ctk-sign-'));
 const run=(args:string[])=>exec(executable,args,{cwd:root,env:{...process.env,COSIGN_PASSWORD:''},timeout:10000,maxBuffer:1048576});
 try{
  await run(['generate-key-pair','--output-key-prefix',join(root,'runner')]);
  const manifest=await packManifest(),payload=(await digestPackManifest(manifest)).signaturePayload;
  await writeFile(join(root,'payload'),payload);
  const now=Date.now(),digest='sha256:'+'0'.repeat(64);
  const report:ConformanceReport={subjectDigest:manifest.integrity.packageDigest,suiteVersion:'1.0.0',status:'Complete',
   caseResults:[{caseId:'abh.test.integrity',status:'Passed',reason:null,artifactRefs:[]}],claimedCapabilities:[],knownDeviations:[],
   environment:{profile:'Domain',environmentDigest:digest,fixtureSetDigest:digest,seed:'42'},
   startedAt:new Date(now-2000).toISOString(),finishedAt:new Date(now-1000).toISOString(),artifactRefs:[],reportDigest:digest,signatureRef:'proof/ctk.json'};
  report.reportDigest=await digestContract('ConformanceReport',report);
  const policy:PackConformancePolicy={executable,mode:'OfflinePublicKey',publicKeyPem:await readFile(join(root,'runner.pub'),'utf8'),
   packId:manifest.metadata.id,subjectName:'payload',suiteVersion:'1.0.0',environment:report.environment,
   cases:[{caseId:'abh.test.integrity',status:'Passed'}],claimedCapabilities:[],maxAgeMs:60000};
  async function sign(value:ConformanceReport){
   await writeFile(join(root,'predicate.json'),JSON.stringify(value));
   await run(['attest-blob','--key',join(root,'runner.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'bundle.json'),
    '--predicate',join(root,'predicate.json'),'--type','urn:abh:conformance:v1',join(root,'payload')]);
   return readFile(join(root,'bundle.json'));
  }
  const proof=await sign(report);
  assert.equal((await verifyPackConformance(manifest,proof,policy,options())).reportDigest,report.reportDigest);
  const staging=join(root,'staging');await mkdir(join(staging,'proof'),{recursive:true});
  await writeFile(join(staging,'input.json'),'abc');
  const fixture=new URL('./fixtures/pack-signature/',import.meta.url);
  await writeFile(join(staging,'proof/signature.json'),await readFile(new URL('bundle.json',fixture)));
  await writeFile(join(staging,'proof/source.json'),await readFile(new URL('provenance.json',fixture)));
  await writeFile(join(staging,'proof/ctk.json'),proof);
  const signer={executable,mode:'OfflinePublicKey' as const,packId:manifest.metadata.id,publicKeyPem:await readFile(new URL('signer.pub',fixture),'utf8')};
  const input={root:await realpath(staging),manifest,limits:{maxFileBytes:32768,maxTotalBytes:131072,maxEntries:20},
   policy:{abhVersion:'0.1.0',packId:manifest.metadata.id,allowedModes:['Declarative' as const],allowedLicenses:['Apache-2.0'],
    permissions:manifest.permissions,hostProfileRefs:[],sharedNamespaces:[]},
   trust:{signer,conformance:policy,provenance:{...signer,publicKeyPem:await readFile(new URL('builder.pub',fixture),'utf8'),
    subjectName:'payload',builderId:'https://example.org/builders/release',buildType:'https://example.org/build/v1',
    source:{uri:'git+https://example.org/hello.git',digest:{gitCommit:'0123456789abcdef0123456789abcdef01234567'}}}}};
  const mutable=structuredClone(input),pending=validateLocalPack(mutable,options());
  mutable.trust.conformance.cases=[];mutable.trust.provenance.source.digest.gitCommit='f'.repeat(40);mutable.manifest.metadata.id='org.other.pack';
  const validated=await pending;assert.equal(validated.conformance().reportDigest,report.reportDigest);
  const validation=validated.validation();
  assert.equal(validation.subjectDigest,manifest.integrity.packageDigest);
  assert.equal(validation.conformanceBundleDigest,await digestBytes(proof));
  assert.equal(validation.deploymentPolicyDigest,await digestBytes(new TextEncoder().encode(canonicalJson({deployment:input.policy,trust:input.trust}))));
  assert.equal(validation.reportDigest,await digestContract('PackValidationReport',validation));
  assert.equal(Date.parse(validation.validUntil),Date.parse(report.finishedAt)+policy.maxAgeMs);
  validation.subjectDigest='sha256:'+'f'.repeat(64);assert.equal(validated.validation().subjectDigest,manifest.integrity.packageDigest);
  const governance:PackGovernanceSnapshot={policyRef:{type:'abh.pack-trust-policy',id:'11111111-1111-4111-8111-111111111111',version:1},
   policy:input.policy,trust:input.trust,revokedPackIds:[],revokedDigests:[],reservedVersions:[]};
  let reads=0;const source={async current(id:string,opts:ReturnType<typeof options>){assert.equal(id,manifest.metadata.id);assert.equal(opts.signal.aborted,false);reads++;return governance;}};
  const governed=await validateCurrentPack(input,source,options());assert.equal(reads,2);assert.deepEqual(governed.governanceRef(),governance.policyRef);
  const fromDocument=await validateCurrentPack({root:input.root,limits:input.limits,manifestDocument:{bytes:new TextEncoder().encode(JSON.stringify(manifest)),format:'json'}},source,options());
  assert.equal(fromDocument.validation().subjectDigest,governed.validation().subjectDigest);
  const tar=pack(),tarChunks:Buffer[]=[];const collect=(async()=>{for await(const chunk of tar){assert.ok(Buffer.isBuffer(chunk));tarChunks.push(Buffer.from(chunk));}})();
  tar.entry({name:'manifest.json'},JSON.stringify(manifest));tar.entry({name:'input.json'},'abc');
  for(const name of ['signature','source','ctk'])tar.entry({name:`proof/${name}.json`},await readFile(join(staging,`proof/${name}.json`)));
  tar.finalize();await collect;
  const archiveValidated=await validatePackArchive({bytes:gzipSync(Buffer.concat(tarChunks)),format:'tar.gz',manifest:{ref:'manifest.json',format:'json'},
   limits:{...input.limits,maxArchiveBytes:1048576,maxExpandedBytes:1048576}},source,options());
  assert.equal(archiveValidated.validation().subjectDigest,manifest.integrity.packageDigest);
  const archivePath=join(await realpath(root),'release.tar.gz');await writeFile(archivePath,gzipSync(Buffer.concat(tarChunks)));
  const fromFile=await validatePackArchiveFile({path:archivePath,format:'tar.gz',manifest:{ref:'manifest.json',format:'json'},
   limits:{...input.limits,maxArchiveBytes:1048576,maxExpandedBytes:1048576}},source,options());
  assert.equal(fromFile.validation().subjectDigest,manifest.integrity.packageDigest);
  const durable=join(await realpath(root),'durable');await mkdir(durable,{mode:0o700});
  await assert.rejects(stageLocalPackSnapshot(durable,{...fromFile},options()),{code:'FORBIDDEN'});
  await assert.rejects(stageLocalPackSnapshot(durable,fromFile,{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
  const cancelled=new AbortController(),probe=await open(join(root,'sync-probe'),'w'),filePrototype=Object.getPrototypeOf(probe),originalSync=filePrototype.sync;await probe.close();
  const syncMock=mock.method(filePrototype,'sync',async function(this:import('node:fs/promises').FileHandle){await originalSync.call(this);cancelled.abort();});
  try{await assert.rejects(stageLocalPackSnapshot(durable,fromFile,{...options(),signal:cancelled.signal}),{code:'DEPENDENCY_TIMEOUT'});}finally{syncMock.mock.restore();}
  assert.deepEqual(await readdir(durable),[]);
  const failureMock=mock.method(filePrototype,'sync',async()=>{throw Error('file fsync failed');});
  try{await assert.rejects(stageLocalPackSnapshot(durable,fromFile,options()),/file fsync failed/);}finally{failureMock.mock.restore();}
  assert.deepEqual(await readdir(durable),[]);
  const baseStat=await lstat(durable),publicationFailure=mock.method(filePrototype,'sync',async function(this:import('node:fs/promises').FileHandle){
   const stat=await this.stat();if(stat.ino===baseStat.ino&&stat.dev===baseStat.dev)throw Error('parent fsync failed');await originalSync.call(this);
  });
  try{await assert.rejects(stageLocalPackSnapshot(durable,fromFile,options()),/parent fsync failed/);}finally{publicationFailure.mock.restore();}
  const uncertain=await readdir(durable);assert.equal(uncertain.length,1);assert.equal(uncertain[0]!.startsWith('.pending-'),false);
  assert.equal(await readFile(join(durable,uncertain[0]!,'payload/input.json'),'utf8'),'abc');
  await rm(join(durable,uncertain[0]!),{recursive:true});
  const savedSnapshot=await stageLocalPackSnapshot(durable,fromFile,options());
  assert.deepEqual(await readdir(durable),[savedSnapshot.id]);
  const snapshotPath=join(durable,savedSnapshot.id);
  assert.equal((await lstat(snapshotPath)).mode&0o777,0o700);
  assert.equal((await lstat(join(snapshotPath,'metadata.json'))).mode&0o777,0o600);
  const restarted=await exec(process.execPath,[new URL('./fixtures/recover-pack-snapshot.mjs',import.meta.url).pathname,durable,JSON.stringify(savedSnapshot)]);
  const recovery=JSON.parse(restarted.stdout);assert.equal(recovery.bytes,'abc');assert.equal(recovery.grantsTrust,false);
  assert.deepEqual(recovery.metadata.report,fromFile.validation());assert.deepEqual(recovery.metadata.governanceRef,fromFile.governanceRef());
  const recovered=await recoverLocalPackSnapshot(durable,savedSnapshot,options());
  recovered.metadata().report.packId='org.other.pack';assert.equal(recovered.metadata().report.packId,manifest.metadata.id);
  await assert.rejects(recoverLocalPackSnapshot(durable,{...savedSnapshot,metadataDigest:manifest.integrity.packageDigest},options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(recoverLocalPackSnapshot(durable,{...savedSnapshot,id:'../escape'},options()),{code:'INVALID_ARGUMENT'});
  await chmod(durable,0o755);await assert.rejects(stageLocalPackSnapshot(durable,fromFile,options()),{code:'FORBIDDEN'});await chmod(durable,0o700);
  await symlink(durable,join(await realpath(root),'durable-link'));await assert.rejects(recoverLocalPackSnapshot(join(await realpath(root),'durable-link'),savedSnapshot,options()),{code:'FORBIDDEN'});
  await writeFile(join(snapshotPath,'payload/input.json'),'bad');
  await assert.rejects(recoverLocalPackSnapshot(durable,savedSnapshot,options()),{code:'PRECONDITION_FAILED'});
  await writeFile(join(snapshotPath,'payload/input.json'),'abc');
  const savedProof=await readFile(join(snapshotPath,'payload/proof/ctk.json'));
  await writeFile(join(snapshotPath,'payload/proof/ctk.json'),'{}');
  await assert.rejects(recoverLocalPackSnapshot(durable,savedSnapshot,options()),{code:'PRECONDITION_FAILED'});
  await writeFile(join(snapshotPath,'payload/proof/ctk.json'),savedProof);
  await link(join(snapshotPath,'metadata.json'),join(await realpath(root),'metadata-alias'));
  await assert.rejects(recoverLocalPackSnapshot(durable,savedSnapshot,options()),{code:'INVALID_ARGUMENT'});
  await rm(join(await realpath(root),'metadata-alias'));
  await writeFile(join(snapshotPath,'metadata.json'),'{}');
  await assert.rejects(recoverLocalPackSnapshot(durable,savedSnapshot,options()),{code:'PRECONDITION_FAILED'});
  const databaseFixture=await createDatabaseFixture();
  try{
   const owner=new PackValidationReportOwner(),tenant=context(),foreign=context();
   const command:RecordPackValidationCommand={commandId:randomUUID(),type:'abh.packs.record-validation',schemaVersion:'0.1.0',idempotencyKey:randomUUID(),target:{type:'abh.organization',id:tenant.tenant.resourceOrganizationId},payload:{reportDigest:fromFile.validation().reportDigest,governanceRef:fromFile.governanceRef(),governanceDigest:fromFile.governanceDigest()}};
   const intentDigest=await digestCommandIntent(command);
   let admissions=0;
   const admit=async(evidence:{governanceDigest:string})=>{admissions++;assert.equal(evidence.governanceDigest,fromFile.governanceDigest());};
   const mutableCommand=structuredClone(command);
   const stored=await databaseFixture.database.transaction(tenant,databaseOptions(),tx=>owner.record(tx,mutableCommand,fromFile,async evidence=>{
    await admit(evidence);mutableCommand.payload.reportDigest='sha256:'+'f'.repeat(64);mutableCommand.commandId=randomUUID();
   }));
   const reloaded=await databaseFixture.database.transaction(tenant,{...databaseOptions(),readOnly:true},tx=>owner.read(tx,stored,admit));
   assert.deepEqual(reloaded.report,fromFile.validation());assert.equal(admissions,2);
   const reconnected=await Database.connect(databaseFixture.runtimeUrl,{max:1});
   try{assert.deepEqual((await reconnected.transaction(tenant,databaseOptions(),tx=>new PackValidationReportOwner().read(tx,stored,admit))).report,reloaded.report);}
   finally{await reconnected.close();}
   await assert.rejects(databaseFixture.database.transaction(foreign,databaseOptions(),tx=>owner.read(tx,stored,admit)),{code:'RESOURCE_NOT_FOUND'});
   await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),tx=>owner.record(tx,command,{...fromFile},admit)),{code:'FORBIDDEN'});
   for(const patch of [{payload:{...command.payload,reportDigest:'sha256:'+'f'.repeat(64)}},{commandId:'not-a-uuid'}])
    await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),tx=>owner.record(tx,{...command,...patch},fromFile,admit)),{code:'INVALID_ARGUMENT'});
   await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),async tx=>{
    await owner.record(tx,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},fromFile,admit);throw Error('rollback');
   }),/rollback/);
   const replay=await databaseFixture.database.transaction(tenant,databaseOptions(),tx=>owner.record(tx,{...command,commandId:randomUUID()},fromFile,admit));assert.deepEqual(replay,stored);
   await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),tx=>owner.record(tx,{...command,
    payload:{reportDigest:archiveValidated.validation().reportDigest,governanceRef:archiveValidated.governanceRef(),governanceDigest:archiveValidated.governanceDigest()}},archiveValidated,admit)),{code:'IDEMPOTENCY_CONFLICT'});
   await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),tx=>owner.record(tx,command,fromFile,async()=>{throw Error('revoked');})),/revoked/);
   const counts=await databaseFixture.database.transaction(tenant,databaseOptions(),async tx=>({
    reports:await tx.owner('PackLoader')`SELECT id FROM extension.validation_reports`,
    audits:await tx.owner('ArtifactStore')`SELECT id,record FROM data.audit_records`,
    events:await tx.owner('DurableExecution')`SELECT id,record FROM data.outbox`,
    receipts:await tx.owner('CommandIngress')`SELECT id FROM data.command_receipts`,
   }));
   assert.equal(counts.reports.length,1);assert.equal(counts.audits.length,1);assert.equal(counts.events.length,1);
   assert.equal(counts.receipts.length,1);
   assert.equal(counts.audits[0]!.record.action,command.type);assert.equal(counts.audits[0]!.record.digest,intentDigest);
   assert.equal(counts.events[0]!.record.causationId,command.commandId);
   await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),tx=>tx.owner('PackLoader')`DELETE FROM extension.validation_reports`),{code:'42501'});
   await assert.rejects(databaseFixture.database.transaction(tenant,databaseOptions(),tx=>tx.owner('PackLoader')`UPDATE extension.validation_reports SET version=1`),{code:'42501'});
   const manager=deriveVerifiedContext({...tenant.request,purposeOfUse:'abh.pack.manage'}),org=manager.tenant.resourceOrganizationId;
   const ref=<T extends string>(type:T,id:string=randomUUID())=>({type,id,version:1});
   const scope=ref('abh.organization',org),principal=ref('abh.principal',manager.tenant.actor.id);
   const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],
    actionTypes:['abh.packs.record-validation','abh.packs.publish-trust-policy','abh.packs.stage','abh.packs.record-data-impact'],purposeNames:['abh.pack.manage'],validFrom:new Date(Date.now()-1000).toISOString(),
    validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Pack administrator','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Pack administrator','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
   });
   const trustOwner=new PackTrustPolicyOwner();
   await run(['generate-key-pair','--output-key-prefix',join(root,'administrator')]);
   const administrator={executable,mode:'OfflinePublicKey' as const,publicKeyPem:await readFile(join(root,'administrator.pub'),'utf8'),organizationId:org,
    packId:manifest.metadata.id,policyId:governance.policyRef.id,maxLifetimeMs:120000};
   const policyDocument=(snapshot:PackGovernanceSnapshot):SignedTrustPolicyDocument=>({organizationId:org,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),snapshot});
   const signGovernance=async(snapshot:PackGovernanceSnapshot)=>{
    const document=policyDocument(snapshot);await writeFile(join(root,'policy-payload'),trustPolicySignaturePayload(document));
    await run(['sign-blob','--key',join(root,'administrator.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'policy-bundle.json'),join(root,'policy-payload')]);
    const bundle=await readFile(join(root,'policy-bundle.json'));
    return {document,bundle,candidate:await verifyTrustPolicy(document,bundle,administrator,options())};
   };
   const firstPolicy=await signGovernance(governance);
   await assert.rejects(verifyTrustPolicy({...firstPolicy.document,organizationId:foreign.tenant.resourceOrganizationId},firstPolicy.bundle,administrator,options()),{code:'FORBIDDEN'});
   await assert.rejects(verifyTrustPolicy({...firstPolicy.document,snapshot:{...governance,revokedPackIds:[manifest.metadata.id]}},firstPolicy.bundle,administrator,options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(verifyTrustPolicy(firstPolicy.document,firstPolicy.bundle,{...administrator,publicKeyPem:policy.publicKeyPem},options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(verifyTrustPolicy({...firstPolicy.document,expiresAt:new Date(Date.now()-100).toISOString()},firstPolicy.bundle,administrator,options()),{code:'PRECONDITION_FAILED'});
   const mutablePolicy=structuredClone(firstPolicy.document),mutableProof=Uint8Array.from(firstPolicy.bundle);
   const verifying=verifyTrustPolicy(mutablePolicy,mutableProof,administrator,options());mutablePolicy.snapshot.revokedPackIds.push(manifest.metadata.id);mutableProof.fill(0);
   assert.deepEqual((await verifying).document(),firstPolicy.document);
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,{...firstPolicy.candidate},0,async()=>{})),{code:'FORBIDDEN'});

   const publication:PublishPackTrustPolicyCommand={commandId:randomUUID(),type:'abh.packs.publish-trust-policy',schemaVersion:'0.1.0',idempotencyKey:randomUUID(),
    target:{type:'abh.organization',id:org},payload:{expectedVersion:0,documentDigest:await digestBytes(new TextEncoder().encode(canonicalJson(firstPolicy.document))),
     signerKeyDigest:await digestBytes(new TextEncoder().encode(administrator.publicKeyPem))}};
   let signerAllowed=true;
   const publicationChecks={async fenceRefs(){return [];},async current(_tx:import('../src/data/uow.ts').TenantTransaction,evidence:import('../src/extensions/publish-pack-trust-policy.ts').PackTrustPublicationEvidence){
    assert.equal(evidence.keyDigest,publication.payload.signerKeyDigest);if(!signerAllowed)throw Error('management signer revoked');
   }};
   const publish=(cmd=publication,grants=[grant.grantRef])=>publishPackTrustPolicy(databaseFixture.database,manager,databaseOptions(),cmd,firstPolicy.candidate,grants,publicationChecks);
   await assert.rejects(publish(publication,[]),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(publish({...publication,payload:{...publication.payload,documentDigest:manifest.integrity.packageDigest}}),{code:'INVALID_ARGUMENT'});
   await assert.rejects(publishPackTrustPolicy(databaseFixture.database,tenant,databaseOptions(),publication,firstPolicy.candidate,[grant.grantRef],publicationChecks),{code:'PURPOSE_DENIED'});
   assert.deepEqual(await publish(),governance.policyRef);
   assert.deepEqual(await publish({...publication,commandId:randomUUID()}),governance.policyRef);
   signerAllowed=false;await assert.rejects(publish(),/management signer revoked/);signerAllowed=true;
   const [publicationCounts]=await databaseFixture.admin`SELECT
    (SELECT count(*) FROM data.audit_records WHERE record->>'action'=${publication.type}) AS audits,
    (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.pack.trust-policy-published') AS events,
    (SELECT count(*) FROM data.command_receipts WHERE command_type=${publication.type}) AS receipts`;
   assert.deepEqual(publicationCounts,{audits:'1',events:'1',receipts:'1'});
   const [savedPolicy]=await databaseFixture.admin`SELECT signature_payload,signature_bundle,expires_at FROM extension.trust_policies WHERE resource_organization_id=${org}`;
   assert.equal(savedPolicy!.signature_payload,trustPolicySignaturePayload(firstPolicy.document));assert.deepEqual(savedPolicy!.signature_bundle,JSON.parse(firstPolicy.bundle.toString()));
   const persistentSource=databasePackGovernanceSource(databaseFixture.database,manager,async tx=>{
    await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-validation'},[grant.grantRef]);
   });
   const dbCandidate=await validateCurrentPack(input,persistentSource,options());
   assert.equal(dbCandidate.governanceDigest(),fromFile.governanceDigest());
   const readOnlySource=databasePackGovernanceSource(databaseFixture.database,manager,async()=>{});
   assert.equal((await readOnlySource.current(manifest.metadata.id,options())).policyRef.version,1);
   const managedCommand={...command,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{reportDigest:dbCandidate.validation().reportDigest,governanceRef:dbCandidate.governanceRef(),governanceDigest:dbCandidate.governanceDigest()}};let governanceAllowed=true;
   const checks={async fenceRefs(){return [];},async current(tx:import('../src/data/uow.ts').TenantTransaction,evidence:import('../src/extensions/validation-reports.ts').StoredPackValidation){if(!governanceAllowed)throw Error('governance revoked');await trustOwner.match(tx,evidence);}};
   const invoke=(grants=[grant.grantRef])=>recordPackValidation(databaseFixture.database,manager,databaseOptions(),managedCommand,dbCandidate,grants,checks);
   await assert.rejects(recordPackValidation(databaseFixture.database,tenant,databaseOptions(),managedCommand,fromFile,[grant.grantRef],checks),{code:'PURPOSE_DENIED'});
   await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});
   const workspaceManager=deriveVerifiedContext({...manager.request,workspaceId:randomUUID()});
   await assert.rejects(recordPackValidation(databaseFixture.database,workspaceManager,databaseOptions(),managedCommand,fromFile,[grant.grantRef],checks),{code:'FORBIDDEN'});
   const accepted=await invoke();assert.deepEqual(await invoke(),accepted);
   const stageSnapshot=await stageLocalPackSnapshot(durable,dbCandidate,options());
   const stageCommand:StagePackCommand={commandId:randomUUID(),type:'abh.packs.stage',schemaVersion:'0.1.0',idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},
    payload:{validationRef:{...accepted,type:'abh.pack-validation',version:1},snapshot:stageSnapshot,expectedDeploymentVersion:0}};
   const doStage=(cmd=stageCommand,grants=[grant.grantRef])=>stagePack(databaseFixture.database,manager,databaseOptions(),cmd,durable,grants,checks);
   await assert.rejects(doStage(stageCommand,[]),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(doStage({...stageCommand,payload:{...stageCommand.payload,expectedDeploymentVersion:1}}),{code:'VERSION_CONFLICT'});
   await assert.rejects(doStage({...stageCommand,payload:{...stageCommand.payload,snapshot:savedSnapshot}}),{code:'PRECONDITION_FAILED'});
   await assert.rejects(stagePack(databaseFixture.database,manager,databaseOptions(),stageCommand,durable,[grant.grantRef],{
    ...checks,async current(tx,evidence){await checks.current(tx,evidence);tx.requireCompletion();}
   }),{code:'INTERNAL_ERROR'});
   const [rolledBack]=await databaseFixture.admin`SELECT
    (SELECT count(*) FROM extension.installed_packs WHERE resource_organization_id=${org}) AS packs,
    (SELECT count(*) FROM data.audit_records WHERE record->>'action'=${stageCommand.type}) AS audits,
    (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.pack.staged') AS events,
    (SELECT count(*) FROM data.command_receipts WHERE command_type=${stageCommand.type}) AS receipts`;
   assert.deepEqual(rolledBack,{packs:'0',audits:'0',events:'0',receipts:'0'});
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM extension.deployment_revisions WHERE resource_organization_id=${org}`)[0]!.count,'0');
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM extension.installed_pack_history WHERE resource_organization_id=${org}`)[0]!.count,'0');
   const otherValidationSnapshot=await stageLocalPackSnapshot(durable,fromFile,options());
   await assert.rejects(doStage({...stageCommand,payload:{...stageCommand.payload,snapshot:otherValidationSnapshot}}),{code:'PRECONDITION_FAILED'});
   const stagePool=await Database.connect(databaseFixture.runtimeUrl,{max:2});let stagedRef;
   try{
    const races=await Promise.allSettled([1,2].map(()=>stagePack(stagePool,manager,databaseOptions(),stageCommand,durable,[grant.grantRef],checks)));
    assert.equal(races.filter(result=>result.status==='fulfilled').length,2);
    assert.deepEqual(races[0],races[1]);stagedRef=(races[0] as PromiseFulfilledResult<import('@abh/contracts').EntityRef>).value;
   }finally{await stagePool.close();}
   assert.deepEqual(await doStage({...stageCommand,commandId:randomUUID()}),stagedRef);
   assert.equal(await databaseFixture.database.transaction(manager,databaseOptions(),tx=>new PackDeploymentRevisionOwner().current(tx)),1);
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM extension.deployment_revisions WHERE resource_organization_id=${org}`)[0]!.count,'1');
   const [installed]=await databaseFixture.admin`SELECT record,package_digest,deployment_version FROM extension.installed_packs WHERE resource_organization_id=${org}`;
   assert.equal(installed!.record.status,'Staged');assert.deepEqual(installed!.record.snapshot,stageSnapshot);assert.deepEqual(installed!.record.validationRef,accepted);
   assert.equal(installed!.package_digest,manifest.integrity.packageDigest);assert.equal(Number(installed!.deployment_version),1);
   const installedOwner=new InstalledPackOwner();
   const history=()=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>installedOwner.readHistorical(tx,stagedRef!,async()=>{}));
   assert.deepEqual(await history(),installed!.record);
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM extension.installed_pack_history WHERE resource_organization_id=${org}`)[0]!.count,'1');
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>installedOwner.readHistorical(tx,{...stagedRef!,version:2},async()=>{})),{code:'RESOURCE_NOT_FOUND'});
   await assert.rejects(databaseFixture.database.transaction(deriveVerifiedContext({...foreign.request,purposeOfUse:'abh.pack.manage'}),databaseOptions(),tx=>installedOwner.readHistorical(tx,stagedRef!,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>installedOwner.readHistorical(tx,stagedRef!,async()=>{throw new Error('history admission denied');})),/history admission denied/);
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`UPDATE extension.installed_pack_history SET record=record`),{code:'42501'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`DELETE FROM extension.installed_pack_history`),{code:'42501'});
   const changedHistory={...installed!.record,stagedAt:new Date(Date.parse(installed!.record.stagedAt)-1000).toISOString()};
   await databaseFixture.admin`UPDATE extension.installed_pack_history SET record=${JSON.stringify(changedHistory)}::text::jsonb WHERE id=${stagedRef!.id}`;
   try{
    await assert.rejects(doStage(),{code:'PRECONDITION_FAILED'});
    await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>installedOwner.retainCurrent(tx,stagedRef!)),{code:'VERSION_CONFLICT'});
   }finally{await databaseFixture.admin`UPDATE extension.installed_pack_history SET record=${JSON.stringify(installed!.record)}::text::jsonb WHERE id=${stagedRef!.id}`;}
   // Simulate upgrading a database that has Stage rows but no history table yet.
   await databaseFixture.admin`DROP TABLE extension.installed_pack_history`;
   const historyMigration=createRequire(import.meta.url)('../migrations/1788882000000_installed_pack_history.cjs');let historySql='';historyMigration.up({sql:(value:string)=>{historySql=value;}});
   await databaseFixture.admin.unsafe(historySql);
   await databaseFixture.admin`ALTER TABLE extension.installed_packs DROP CONSTRAINT installed_pack_lifecycle_check,
    ADD CONSTRAINT installed_packs_version_check CHECK(version=1),ADD CONSTRAINT installed_packs_status_check CHECK(status='Staged')`;
   const lifecycleMigration=createRequire(import.meta.url)('../migrations/1788886000000_pack_enable_lifecycle.cjs');let lifecycleSql='';lifecycleMigration.up({sql:(value:string)=>{lifecycleSql=value;}});
   await databaseFixture.admin.unsafe(lifecycleSql);
   // The registered manifest expects the FINAL lifecycle shape, so the simulated
   // upgrade must replay every later constraint evolution (suspension, retirement).
   const suspensionMigration=createRequire(import.meta.url)('../migrations/1788888000000_pack_suspension.cjs');let suspensionSql='';suspensionMigration.up({sql:(value:string)=>{suspensionSql=value;}});
   await databaseFixture.admin.unsafe(suspensionSql);
   const retirementMigration=createRequire(import.meta.url)('../migrations/1788889000000_pack_retirement.cjs');let retirementSql='';retirementMigration.up({sql:(value:string)=>{retirementSql=value;}});
   await databaseFixture.admin.unsafe(retirementSql);
   await databaseFixture.database.verify();
   assert.deepEqual(await history(),installed!.record);
   assert.deepEqual(await doStage(),stagedRef);
   const collision={...installed!.record,packRef:{type:'abh.installed-pack',id:randomUUID(),version:1},deploymentVersion:2,
    manifest:{...manifest,integrity:{...manifest.integrity,packageDigest:'sha256:'+'f'.repeat(64)}}};
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`INSERT INTO extension.installed_packs
    (resource_organization_id,id,purpose_names,record,pack_id,pack_version,package_digest,deployment_version)
    VALUES (${org},${collision.packRef.id},${['abh.pack.manage']},${JSON.stringify(collision)}::text::jsonb,${manifest.metadata.id},${manifest.metadata.version},${collision.manifest.integrity.packageDigest},2)`),{code:'23505'});
   assert.equal((await databaseFixture.database.transaction(foreign,databaseOptions(),tx=>tx.owner('PackLoader')`SELECT id FROM extension.installed_packs`)).length,0);

   const preparedCapabilities=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>prepareInstalledCapabilities(tx,databaseOptions(),stagedRef!,durable,[grant.grantRef],[],{pack:checks,capabilities:{schema:async()=>{throw new Error('no declared schemas');},implementation:async()=>{throw new Error('no declared implementations');}}}));
   assert.deepEqual(preparedCapabilities.installation.packRef,stagedRef);assert.deepEqual(preparedCapabilities.registrations,[]);
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>prepareInstalledCapabilities(tx,databaseOptions(),stagedRef!,durable,[],[],{pack:checks,capabilities:{schema:async()=>{},implementation:async()=>{}}})),{code:'AUTHORITY_REQUIRED'});
   const registryGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.register-capabilities']};
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${registryGrant.grantRef.id},${principal.id},${JSON.stringify(registryGrant)}::text::jsonb,${registryGrant.validFrom},${registryGrant.validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${registryGrant.grantRef.id},1)`;
   });
   const registryCommand:RegisterPackCapabilitiesCommand={type:'abh.packs.register-capabilities',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{packRef:{...stagedRef!,type:'abh.installed-pack'},bindingsDigest:await inputDigest([])}};
   const registryAuthority={stage:[grant.grantRef],register:[registryGrant.grantRef]};
   const registryChecks={pack:checks,capabilities:{schema:async()=>{},implementation:async()=>{}}};
   const registerCapabilities=(cmd=registryCommand,authority=registryAuthority,admission=registryChecks)=>registerPackCapabilities(databaseFixture.database,manager,databaseOptions(),cmd,durable,[],authority,admission);
   await assert.rejects(registerCapabilities(registryCommand,registryAuthority,{...registryChecks,pack:{...checks,current:async(tx,evidence)=>{await checks.current(tx,evidence);tx.requireCompletion();}}}),{code:'INTERNAL_ERROR'});
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM extension.capability_sets WHERE resource_organization_id=${org}`)[0]!.count,'0');
   const registry=await registerCapabilities();assert.equal(registry.replayed,false);assert.deepEqual(await registerCapabilities(),{...registry,replayed:true});
   const readSet=()=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>new PackCapabilityRegistryOwner().readSet(tx,registry.setRef,async()=>{}));
   const set=await readSet();assert.deepEqual(set.packRef,stagedRef);assert.deepEqual(set.registrations,[]);
   assert.equal((await databaseFixture.admin`SELECT status FROM extension.installed_packs WHERE id=${stagedRef!.id}`)[0]!.status,'Staged');
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.command_receipts WHERE id=${registryCommand.commandId}`)[0]!.count,'1');
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.pack-capability-set.registered'`)[0]!.count,'1');
   await assert.rejects(registerCapabilities(registryCommand,{...registryAuthority,register:[]}),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(registerCapabilities(registryCommand,{...registryAuthority,register:[grant.grantRef]}),{code:'FORBIDDEN'});
   await assert.rejects(registerCapabilities({...registryCommand,payload:{...registryCommand.payload,bindingsDigest:'sha256:'+'0'.repeat(64)}}),{code:'INVALID_ARGUMENT'});
   await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${registryGrant.grantRef.id}`;
   await assert.rejects(registerCapabilities(),{code:'AUTHORITY_REQUIRED'});
   await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${registryGrant.grantRef.id}`;
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`UPDATE extension.capability_sets SET record=record`),{code:'42501'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`DELETE FROM extension.capabilities`),{code:'42501'});
   await assert.rejects(databaseFixture.database.transaction(deriveVerifiedContext({...foreign.request,purposeOfUse:'abh.pack.manage'}),databaseOptions(),tx=>new PackCapabilityRegistryOwner().readSet(tx,registry.setRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
   await databaseFixture.admin`UPDATE extension.capability_sets SET record=jsonb_set(record,'{setDigest}',${JSON.stringify('sha256:'+'0'.repeat(64))}::text::jsonb) WHERE id=${registry.setRef.id}`;
   try{await assert.rejects(readSet(),{code:'PRECONDITION_FAILED'});await assert.rejects(registerCapabilities(),{code:'PRECONDITION_FAILED'});}
   finally{await databaseFixture.admin`UPDATE extension.capability_sets SET record=${JSON.stringify(set)}::text::jsonb WHERE id=${registry.setRef.id}`;}
   const resume=(grants=[grant.grantRef])=>recoverStagedPack(databaseFixture.database,manager,databaseOptions(),stagedRef!,durable,grants,checks);
   await assert.rejects(resume([]),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(recoverStagedPack(databaseFixture.database,tenant,databaseOptions(),stagedRef!,durable,[grant.grantRef],checks),{code:'PURPOSE_DENIED'});
   await assert.rejects(recoverStagedPack(databaseFixture.database,workspaceManager,databaseOptions(),stagedRef!,durable,[grant.grantRef],checks),{code:'FORBIDDEN'});
   await assert.rejects(recoverStagedPack(databaseFixture.database,manager,databaseOptions(),{...stagedRef!,version:2},durable,[grant.grantRef],checks),{code:'INVALID_ARGUMENT'});
   const recoveredInstallation=await resume();assert.deepEqual(recoveredInstallation.installation(),installed!.record);
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    const recovered=await recoverStagedPackInTransaction(tx,databaseOptions(),stagedRef!,durable,[grant.grantRef],checks);
    assert.deepEqual(recovered.installation(),installed!.record);
    // Recovery must retain the actual Pack governance lock for following preparation work.
    const key=`${org}/PackLoader/${manifest.metadata.id}`;
    await assert.rejects(databaseFixture.admin.begin(async sql=>{
     await sql`SET LOCAL lock_timeout='50ms'`;
     await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
    }),{code:'55P03'});
   });
   await databaseFixture.admin.begin(async sql=>{
    await sql`SET LOCAL lock_timeout='50ms'`;
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${org}/PackLoader/${manifest.metadata.id}`},0))`;
   });
   recoveredInstallation.installation().manifest.metadata.id='org.other.pack';assert.equal(recoveredInstallation.installation().manifest.metadata.id,manifest.metadata.id);
   let restoredBytes='';for await(const chunk of await recoveredInstallation.files.payload.open('input.json',options()))restoredBytes+=Buffer.from(chunk).toString();assert.equal(restoredBytes,'abc');
   await writeFile(join(durable,stageSnapshot.id,'payload/input.json'),'bad');
   await assert.rejects(resume(),{code:'PRECONDITION_FAILED'});await assert.rejects(doStage(),{code:'PRECONDITION_FAILED'});
   await writeFile(join(durable,stageSnapshot.id,'payload/input.json'),'abc');
   await databaseFixture.admin`UPDATE extension.installed_packs SET record=jsonb_set(record,'{reportDigest}',${JSON.stringify('sha256:'+'e'.repeat(64))}::text::jsonb) WHERE resource_organization_id=${org}`;
   await assert.rejects(resume(),{code:'PRECONDITION_FAILED'});await assert.rejects(doStage(),{code:'PRECONDITION_FAILED'});
   await databaseFixture.admin`UPDATE extension.installed_packs SET record=${JSON.stringify(installed!.record)}::text::jsonb WHERE resource_organization_id=${org}`;
   assert.deepEqual((await resume()).installation().packRef,stagedRef);
   const [stageCounts]=await databaseFixture.admin`SELECT
    (SELECT count(*) FROM data.audit_records WHERE record->>'action'=${stageCommand.type}) AS audits,
    (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.pack.staged') AS events,
    (SELECT count(*) FROM data.command_receipts WHERE command_type=${stageCommand.type}) AS receipts`;
   assert.deepEqual(stageCounts,{audits:'1',events:'1',receipts:'1'});
   await assert.rejects(doStage({...stageCommand,payload:{...stageCommand.payload,expectedDeploymentVersion:1}}),{code:'IDEMPOTENCY_CONFLICT'});
   await assert.rejects(doStage({...stageCommand,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{...stageCommand.payload,expectedDeploymentVersion:1}}),{code:'VERSION_CONFLICT'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`DELETE FROM extension.installed_packs`),{code:'42501'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`UPDATE extension.installed_packs SET status='Enabled'`),{code:'23514'});

   const baseline={complete:true,entries:[]},target={complete:true,entries:[]};
   const storeInventory=async(content:string)=>{
    const payload={ownerRef:stagedRef!,mediaType:'application/json',content,dataClass:'abh.data.internal',purposeNames:['abh.pack.manage'],sourceRefs:[accepted],region:'local',retentionPolicyRef:ref('abh.artifact')};
    const cmd={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
    return databaseFixture.database.transaction(manager,databaseOptions(),tx=>executeCommand(tx,cmd,async()=>{},async()=>
      (await new InlineArtifactOwner().store(tx,cmd,payload,async()=>{})).artifactRef));
   };
   const baselineArtifact=await storeInventory(canonicalJson(baseline)),targetArtifact=await storeInventory(canonicalJson(target));
   const impactReport={issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),packRef:{...stagedRef!,type:'abh.installed-pack' as const,version:1 as const},deploymentVersion:1,
    compilerRef:{kind:'Compiler' as const,id:'org.example.compiler',version:'1.0.0',digest:manifest.integrity.packageDigest},environmentDigest:manifest.integrity.packageDigest,
    baselineSourceRef:baselineArtifact.receipt.resultRef,targetSourceRef:targetArtifact.receipt.resultRef,baseline,target,impact:await assessPackDataImpact(dbCandidate.manifest(),baseline,target)};
   await run(['generate-key-pair','--output-key-prefix',join(root,'compiler')]);
   const compilerSigner={executable,mode:'OfflinePublicKey' as const,publicKeyPem:await readFile(join(root,'compiler.pub'),'utf8'),organizationId:org,compilerRef:impactReport.compilerRef,maxLifetimeMs:120000};
   await writeFile(join(root,'impact-payload'),impactSignaturePayload(org,impactReport));
   await run(['sign-blob','--key',join(root,'compiler.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'impact-bundle.json'),join(root,'impact-payload')]);
   const impactBundle=await readFile(join(root,'impact-bundle.json'));
   await assert.rejects(verifyImpactSignature(org,impactReport,impactBundle,{...compilerSigner,maxLifetimeMs:100},options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(verifyImpactSignature(org,{...impactReport,issuedAt:new Date(Date.now()+10000).toISOString()},impactBundle,compilerSigner,options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(verifyImpactSignature(org,{...impactReport,issuedAt:new Date(Date.now()-5000).toISOString(),expiresAt:new Date(Date.now()-1000).toISOString()},impactBundle,compilerSigner,options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(verifyImpactSignature(org,{...impactReport,expiresAt:new Date(Date.now()+70000).toISOString()},impactBundle,compilerSigner,options()),{code:'PRECONDITION_FAILED'});
   const compilerProof=await verifyImpactSignature(org,impactReport,impactBundle,compilerSigner,options());
   assert.deepEqual(compilerProof.report(),impactReport);
   const compilerEvidence=matchImpactSignature(compilerProof,org,impactReport);
   assert.equal(compilerEvidence.bundleDigest,await digestBytes(impactBundle));
   assert.equal(compilerEvidence.keyDigest,await digestBytes(new TextEncoder().encode(compilerSigner.publicKeyPem)));
   assert.throws(()=>matchImpactSignature({...compilerProof},org,impactReport),{code:'FORBIDDEN'});
   assert.throws(()=>matchImpactSignature(compilerProof,org,{...impactReport,deploymentVersion:2}),{code:'FORBIDDEN'});
   await assert.rejects(verifyImpactSignature(foreign.tenant.resourceOrganizationId,impactReport,impactBundle,compilerSigner,options()),{code:'FORBIDDEN'});
   await assert.rejects(verifyImpactSignature(org,impactReport,impactBundle,{...compilerSigner,compilerRef:{...compilerSigner.compilerRef,version:'2.0.0'}},options()),{code:'FORBIDDEN'});
   await assert.rejects(verifyImpactSignature(org,impactReport,impactBundle,{...compilerSigner,publicKeyPem:administrator.publicKeyPem},options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(verifyImpactSignature(org,{...impactReport,environmentDigest:'sha256:'+'e'.repeat(64)},impactBundle,compilerSigner,options()),{code:'PRECONDITION_FAILED'});
   const mutableImpact=structuredClone(impactReport),mutableBundle=Uint8Array.from(impactBundle);
   const verifyingImpact=verifyImpactSignature(org,mutableImpact,mutableBundle,compilerSigner,options());mutableImpact.deploymentVersion=99;mutableBundle.fill(0);
   assert.deepEqual((await verifyingImpact).report(),impactReport);
   const impactCommand:RecordPackDataImpactCommand={commandId:randomUUID(),type:'abh.packs.record-data-impact',schemaVersion:'0.1.0',idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:{report:impactReport}};
   let compilerAllowed=true;
   // Explicit compiler/source Fixture: production must resolve both source Ref contents and environment under fences.
   let sourceAllowed=true,compilerKeyChanged=false;
   const impactChecks={async signer(){if(!compilerAllowed)throw Error('compiler revoked');return compilerKeyChanged?{...compilerSigner,publicKeyPem:administrator.publicKeyPem}:compilerSigner;},async source(_tx:import('../src/data/uow.ts').TenantTransaction,artifact:import('@abh/contracts').ArtifactRecord){
    if(!sourceAllowed)throw Error('source denied');assert.deepEqual(artifact.ownerRef,stagedRef);assert.deepEqual(artifact.sourceRefs,[accepted]);
   },async fenceRefs(){return [];},async current(tx:import('../src/data/uow.ts').TenantTransaction,r:import('@abh/contracts').PackDataImpactRecord,e:import('../src/extensions/validation-reports.ts').StoredPackValidation){
    if(!compilerAllowed)throw Error('compiler revoked');assert.deepEqual(r.compilerRef,impactReport.compilerRef);assert.deepEqual(r.baselineSourceRef,impactReport.baselineSourceRef);
    assert.deepEqual(r.targetSourceRef,impactReport.targetSourceRef);assert.deepEqual(r.baseline,baseline);assert.deepEqual(r.target,target);
    await checks.current(tx,e);
   }};
   const impactInvoke=(cmd=impactCommand,grants=[grant.grantRef])=>recordPackDataImpact(databaseFixture.database,manager,databaseOptions(),cmd,durable,grants,impactChecks,compilerProof);
   await assert.rejects(impactInvoke(impactCommand,[]),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(impactInvoke({...impactCommand,payload:{report:{...impactReport,deploymentVersion:2}}}),{code:'VERSION_CONFLICT'});
   await assert.rejects(impactInvoke({...impactCommand,payload:{report:{...impactReport,impact:{...impactReport.impact,subjectDigest:'sha256:'+'e'.repeat(64)}}}}),{code:'PRECONDITION_FAILED'});
   await assert.rejects(recordPackDataImpact(databaseFixture.database,manager,databaseOptions(),impactCommand,durable,[grant.grantRef],{
    ...impactChecks,async current(tx,r,e){await impactChecks.current(tx,r,e);tx.requireCompletion();}
   },compilerProof),{code:'INTERNAL_ERROR'});
   const [impactRollback]=await databaseFixture.admin`SELECT (SELECT count(*) FROM extension.data_impact_reports) AS reports,
    (SELECT count(*) FROM data.command_receipts WHERE command_type=${impactCommand.type}) AS receipts`;
   assert.deepEqual(impactRollback,{reports:'0',receipts:'0'});
   const impactRef=await impactInvoke();assert.deepEqual(await impactInvoke({...impactCommand,commandId:randomUUID()}),impactRef);
   const persistedImpact=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>new PackDataImpactOwner().read(tx,impactRef,async r=>assert.deepEqual(r,impactReport)));
   assert.equal(persistedImpact.impact.status,'NotApplicable');
   const sourceVerify=(r:import('@abh/contracts').PackDataImpactRecord)=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>verifyImpactInventoryArtifacts(tx,r,async()=>{}));
   let releaseSources!:()=>void,notifySources!:()=>void;
   const heldSources=new Promise<void>(resolve=>{releaseSources=resolve;}),sourcesLocked=new Promise<void>(resolve=>{notifySources=resolve;});
   const sourceTransaction=databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    await verifyImpactInventoryArtifacts(tx,impactReport,async()=>{});notifySources();await heldSources;
   });
   try{
    await Promise.race([sourcesLocked,sourceTransaction.then(()=>{throw Error('source transaction ended early');})]);
    await assert.rejects(databaseFixture.admin.begin(async sql=>{
     await sql`SET LOCAL lock_timeout='100ms'`;
     await sql`UPDATE data.artifacts SET updated_at=clock_timestamp() WHERE id=${impactReport.targetSourceRef.id}`;
    }),{code:'55P03'});
   }finally{releaseSources();await sourceTransaction;}
   await databaseFixture.admin`UPDATE data.artifacts SET updated_at=clock_timestamp() WHERE id=${impactReport.targetSourceRef.id}`;
   const different=await storeInventory(canonicalJson({complete:false,entries:[]}));
   await assert.rejects(sourceVerify({...impactReport,targetSourceRef:different.receipt.resultRef}),{code:'PRECONDITION_FAILED'});
   const duplicate=await storeInventory('{"complete":false,"complete":true,"entries":[]}');
   await assert.rejects(sourceVerify({...impactReport,targetSourceRef:duplicate.receipt.resultRef}),{code:'INVALID_ARGUMENT'});
   await assert.rejects(sourceVerify({...impactReport,targetSourceRef:{...impactReport.targetSourceRef,version:1}}),{code:'VERSION_CONFLICT'});
   await databaseFixture.admin`UPDATE data.artifacts SET inline_body=${Buffer.from('{}')} WHERE id=${impactReport.targetSourceRef.id}`;
   await assert.rejects(impactInvoke(),{code:'INTERNAL_ERROR'});
   await databaseFixture.admin`UPDATE data.artifacts SET inline_body=${Buffer.from(canonicalJson(target))} WHERE id=${impactReport.targetSourceRef.id}`;

   const impactRead=(grants=[grant.grantRef])=>readCurrentPackDataImpact(databaseFixture.database,manager,databaseOptions(),impactRef,durable,grants,impactChecks);
   const originalNow=Date.now,expiredClock=mock.method(Date,'now',()=>Date.parse(impactReport.expiresAt)+1);
   try{assert.throws(()=>matchImpactSignature(compilerProof,org,impactReport),{code:'PRECONDITION_FAILED'});}finally{expiredClock.mock.restore();}
   assert.equal(Date.now,originalNow);

   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    const current=await readCurrentPackDataImpactInTransaction(tx,databaseOptions(),impactRef,durable,[grant.grantRef],impactChecks);
    assert.deepEqual(current,impactReport);
    for(const key of [`${org}/Deployment`,`${org}/PackLoader/${manifest.metadata.id}`])await assert.rejects(databaseFixture.admin.begin(async sql=>{
     await sql`SET LOCAL lock_timeout='50ms'`;
     await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
    }),{code:'55P03'});
    await assert.rejects(databaseFixture.admin.begin(async sql=>{
     await sql`SET LOCAL lock_timeout='50ms'`;
     await sql`UPDATE data.artifacts SET updated_at=clock_timestamp() WHERE id=${impactReport.targetSourceRef.id}`;
    }),{code:'55P03'});
   });
   await databaseFixture.admin.begin(async sql=>{
    await sql`SET LOCAL lock_timeout='50ms'`;
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${org}/Deployment`},0))`;
    await sql`UPDATE data.artifacts SET updated_at=clock_timestamp() WHERE id=${impactReport.targetSourceRef.id}`;
   });
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    const recovered=await recoverImpactCheckedPack(tx,databaseOptions(),impactRef,durable,[grant.grantRef],impactChecks);
    assert.deepEqual(recovered.impact(),impactReport);assert.deepEqual(recovered.installation(),installed!.record);
    assert.equal(recovered.metadata().manifest.integrity.packageDigest,recovered.impact().impact.subjectDigest);
    let content='';for await(const bytes of await recovered.files.payload.open('input.json',options()))content+=Buffer.from(bytes).toString();
    assert.equal(content,'abc');
    recovered.impact().deploymentVersion=999;recovered.installation().manifest.metadata.id='org.changed.pack';
    assert.equal(recovered.impact().deploymentVersion,1);assert.equal(recovered.installation().manifest.metadata.id,manifest.metadata.id);
   });
   const installedPreparation=()=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>prepareInstalledPack(tx,databaseOptions(),impactRef,durable,[grant.grantRef],impactChecks));
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    let calls=0;const stopped=new AbortController();stopped.abort();
    const guardedChecks={...impactChecks,current:async(...args:Parameters<typeof impactChecks.current>)=>{calls++;return impactChecks.current(...args);}};
    await assert.rejects(prepareInstalledPack(tx,{...databaseOptions(),signal:stopped.signal},impactRef,durable,[grant.grantRef],guardedChecks),{code:'DEPENDENCY_TIMEOUT'});
    await assert.rejects(recoverImpactCheckedPack(tx,{...databaseOptions(),signal:stopped.signal},impactRef,durable,[grant.grantRef],guardedChecks),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(calls,0);tx.assertActive();assert.equal(tx.signal.aborted,false);
   });
   for(const phase of ['source','signer'] as const)await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    const child=new AbortController();let called=0;
    const childChecks={...impactChecks,
     source:async(...args:Parameters<typeof impactChecks.source>)=>{await impactChecks.source(...args);if(phase==='source'){called++;child.abort();}},
     signer:async(...args:Parameters<typeof impactChecks.signer>)=>{const value=await impactChecks.signer(...args);if(phase==='signer'){called++;child.abort();}return value;},
    };
    await assert.rejects(prepareInstalledPack(tx,{...databaseOptions(),signal:child.signal},impactRef,durable,[grant.grantRef],childChecks),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(called,1);tx.assertActive();assert.equal(tx.signal.aborted,false);
   });
   const noMigration=await installedPreparation();assert.equal(noMigration.status,'NotApplicable');
   assert.deepEqual(noMigration.installation.packRef,stagedRef);assert.deepEqual(noMigration.impact,impactReport);assert.equal('prepared' in noMigration,false);
   const nonApplicableInput={commandId:randomUUID(),idempotencyKey:randomUUID(),impactRef,retention:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:stagedRef}};
   const nonApplicableChecks={impact:impactChecks,references:async()=>{},read:async()=>{}};
   const recordNonApplicable=()=>recordMigrationNonApplicability(databaseFixture.database,manager,databaseOptions(),nonApplicableInput,durable,[grant.grantRef],nonApplicableChecks);
   const nonApplicableDiscovery={...nonApplicableChecks,discover:async()=>{}};
   const selectNonApplicable=(limit=20,grants=[grant.grantRef],admission=nonApplicableDiscovery)=>selectMigrationNonApplicability(databaseFixture.database,manager,databaseOptions(),impactRef,durable,grants,admission,limit);
   assert.deepEqual(await selectNonApplicable(),{status:'Missing'});
   const unrelatedPayload={...nonApplicableInput.retention,ownerRef:stagedRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:[impactRef,impactReport.baselineSourceRef,impactReport.targetSourceRef],content:canonicalJson({kind:'unrelated-installation-note'})};
   const unrelatedIdentity={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(unrelatedPayload)};
   await databaseFixture.database.transaction(manager,databaseOptions(),tx=>executeCommand(tx,unrelatedIdentity,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,unrelatedIdentity,unrelatedPayload,async()=>{})).artifactRef));
   assert.deepEqual(await selectNonApplicable(),{status:'Missing'});
   let finalDiscoveryCalls=0;
   await assert.rejects(selectNonApplicable(20,[grant.grantRef],{...nonApplicableDiscovery,discover:async()=>{if(++finalDiscoveryCalls===2)throw new Error('final discovery denied');}}),/final discovery denied/);
   await assert.rejects(selectNonApplicable(0),{code:'INVALID_ARGUMENT'});

   await assert.rejects(selectNonApplicable(20,[]),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(selectNonApplicable(20,[grant.grantRef],{...nonApplicableDiscovery,discover:async()=>{throw new Error('discovery denied');}}),/discovery denied/);
   let nonApplicableReads=0;
   await assert.rejects(recordMigrationNonApplicability(databaseFixture.database,manager,databaseOptions(),nonApplicableInput,durable,[grant.grantRef],{...nonApplicableChecks,read:async()=>{nonApplicableReads++;throw new Error('non-applicability read denied');}}),/non-applicability read denied/);
   assert.equal(nonApplicableReads,1);
   const notApplicableRef=await recordNonApplicable();assert.deepEqual(await recordNonApplicable(),notApplicableRef);
   assert.deepEqual(await selectNonApplicable(),{status:'Selected',artifactRef:notApplicableRef});
   const actualNonApplicable=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>new InlineArtifactOwner().read(tx,notApplicableRef,async()=>{}));
   assert.deepEqual(JSON.parse(new TextDecoder().decode(actualNonApplicable.bytes)),['abh-pack-migration-not-applicable-v1',impactReport]);
   assert.deepEqual(actualNonApplicable.record.ownerRef,stagedRef);assert.ok(actualNonApplicable.record.sourceRefs.some(ref=>ref.id===impactRef.id));
   await assert.rejects(recordMigrationNonApplicability(databaseFixture.database,manager,databaseOptions(),nonApplicableInput,durable,[],nonApplicableChecks),{code:'AUTHORITY_REQUIRED'});
   const readNonApplicable=(artifactRef=notApplicableRef,authority=[grant.grantRef],admission=nonApplicableChecks)=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>readMigrationNonApplicability(tx,databaseOptions(),artifactRef,impactRef,durable,authority,admission));
   const ctkGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.record-conformance']};
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${ctkGrant.grantRef.id},${principal.id},${JSON.stringify(ctkGrant)}::text::jsonb,${ctkGrant.validFrom},${ctkGrant.validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${ctkGrant.grantRef.id},1)`;
   });
   const ctkInput:RecordPackConformanceCommand={type:'abh.packs.record-conformance',schemaVersion:'0.1.0',target:{type:'abh.organization',id:org},commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{packRef:{...stagedRef,type:'abh.installed-pack'},retention:nonApplicableInput.retention}};
   const ctkChecks={pack:checks,references:async()=>{},read:async()=>{}};
   const ctkGrants={stage:[grant.grantRef],record:[ctkGrant.grantRef]};
   const recordCtk=(input=ctkInput,authority=ctkGrants,admission=ctkChecks)=>recordPackConformanceArtifact(databaseFixture.database,manager,databaseOptions(),input,durable,authority,admission);
   const ctkRef=await recordCtk();assert.deepEqual(await recordCtk(),ctkRef);
   const readCtk=(artifact=ctkRef,pack=stagedRef,admission=ctkChecks)=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>readPackConformanceArtifact(tx,databaseOptions(),artifact,pack,durable,[grant.grantRef],admission));
   const ctk=await readCtk();assert.deepEqual(ctk.installation.packRef,stagedRef);assert.deepEqual(ctk.report,fromFile.conformance());
   assert.equal(ctk.report.reportDigest,ctk.validation.conformanceReportDigest);
   for(const authority of [{stage:[],record:[ctkGrant.grantRef]},{stage:[grant.grantRef],record:[]},{stage:[grant.grantRef],record:[grant.grantRef]}])await assert.rejects(recordCtk(ctkInput,authority));
   await assert.rejects(readCtk(ctkRef,ref('abh.installed-pack')),{code:'RESOURCE_NOT_FOUND'});
   await assert.rejects(readCtk(notApplicableRef),{code:'PRECONDITION_FAILED'});
   await assert.rejects(recordCtk(ctkInput,ctkGrants,{...ctkChecks,read:async()=>{throw new Error('CTK read denied');}}),/CTK read denied/);
   await assert.rejects(readCtk(ctkRef,stagedRef,{...ctkChecks,references:async()=>{throw new Error('CTK source denied');}}),/CTK source denied/);
   const savedCtk=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>new InlineArtifactOwner().read(tx,ctkRef,async()=>{}));
   for(const body of [' '+new TextDecoder().decode(savedCtk.bytes),canonicalJson(['abh-pack-conformance-v1',{...ctk.report,subjectDigest:'sha256:'+'e'.repeat(64)}])]){
    const payload={...ctkInput.payload.retention,ownerRef:stagedRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:savedCtk.record.sourceRefs,content:body};
    const identity={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
    const bad=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>executeCommand(tx,identity,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,identity,payload,async()=>{})).artifactRef));
    await assert.rejects(readCtk(bad.receipt.resultRef),{code:'PRECONDITION_FAILED'});
   }
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    const child=new AbortController();let reads=0;
    await assert.rejects(readPackConformanceArtifact(tx,{...databaseOptions(),signal:child.signal},ctkRef,stagedRef,durable,[grant.grantRef],{...ctkChecks,read:async()=>{reads++;child.abort();}}),{code:'DEPENDENCY_TIMEOUT'});
    assert.equal(reads,1);tx.assertActive();assert.equal(tx.signal.aborted,false);
   });
   const enableInput={capabilitySetRef:registry.setRef,packRef:stagedRef,impactRef,migrationVerificationRef:notApplicableRef,ctkRef,impactUpperBound:{scopeRefs:[scope],resourceRequirements:[],maxMoney:[],description:'Enable tested Pack'},expiresAt:new Date(Math.min(Date.parse(impactReport.expiresAt),Date.parse(ctk.validation.validUntil))-1000).toISOString()};
   const enableChecks={capabilityFenceRefs:async()=>[],capabilities:async()=>{},migration:nonApplicableChecks,conformance:ctkChecks,impact:async()=>{}};
   const prepareEnable=(input=enableInput,admission=enableChecks)=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>preparePackEnableProposal(tx,databaseOptions(),input,durable,{impact:[grant.grantRef],stage:[grant.grantRef]},admission));
   const enable=await prepareEnable();assert.deepEqual(enable.packRef,stagedRef);assert.equal(enable.proposalDigest,await digestContract('PackEnableProposal',enable));
   assert.equal(enable.subjectDigest,ctk.installation.manifest.integrity.packageDigest);assert.equal(enable.environmentDigest,impactReport.environmentDigest);assert.equal(enable.expectedDeploymentVersion,impactReport.deploymentVersion);
   assert.deepEqual(enable.capabilitySetRef,registry.setRef);assert.equal(enable.capabilitySetDigest,set.setDigest);
   await assert.rejects(prepareEnable({...enableInput,capabilitySetRef:ref('abh.pack-capability-set')}),{code:'RESOURCE_NOT_FOUND'});
   await assert.rejects(prepareEnable(enableInput,{...enableChecks,capabilities:async()=>{throw new Error('capability admission denied');}}),/capability admission denied/);
   let capabilityReads=0;
   await assert.rejects(prepareEnable(enableInput,{...enableChecks,capabilities:async()=>{if(++capabilityReads===2)throw new Error('capability admission withdrawn');}}),/capability admission withdrawn/);
   try{await assert.rejects(prepareEnable(enableInput,{...enableChecks,capabilities:async()=>{sourceAllowed=false;}}),/source denied/);}finally{sourceAllowed=true;}
   try{
    await assert.rejects(prepareEnable(enableInput,{...enableChecks,impact:async()=>{
     await databaseFixture.admin`UPDATE extension.capability_sets SET record=jsonb_set(record,'{setDigest}',${JSON.stringify('sha256:'+'0'.repeat(64))}::text::jsonb) WHERE id=${registry.setRef.id}`;
    }}),{code:'PRECONDITION_FAILED'});
   }finally{await databaseFixture.admin`UPDATE extension.capability_sets SET record=${JSON.stringify(set)}::text::jsonb WHERE id=${registry.setRef.id}`;}
   assert.deepEqual(enable.ctkRef,ctkRef);assert.deepEqual(enable.validationRef,ctk.installation.validationRef);
   await assert.rejects(prepareEnable({...enableInput,ctkRef:notApplicableRef}),{code:'PRECONDITION_FAILED'});
   await assert.rejects(prepareEnable({...enableInput,packRef:ref('abh.installed-pack')}),{code:'PRECONDITION_FAILED'});
   await assert.rejects(prepareEnable({...enableInput,expiresAt:new Date(Date.now()-1000).toISOString()}),{code:'PRECONDITION_FAILED'});
   await assert.rejects(prepareEnable({...enableInput,expiresAt:new Date(Date.now()+3600000).toISOString()}),{code:'PRECONDITION_FAILED'});
   await assert.rejects(prepareEnable(enableInput,{...enableChecks,impact:async()=>{throw new Error('deployment impact denied');}}),/deployment impact denied/);
   try{await assert.rejects(prepareEnable(enableInput,{...enableChecks,impact:async()=>{sourceAllowed=false;}}),/source denied/);}finally{sourceAllowed=true;}
   const requestGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.request-enable']};
   const reviewGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.decisions.submit'],purposeNames:['abh.decision.review']};
   const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment'),resourceOrganizationId:org,principalRef:principal,responsibilityType:'Authorization',scopeRefs:[scope],validFrom:grant.validFrom,validUntil:grant.validUntil,templateRef:ctkRef,status:'Active'};
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    for(const item of [requestGrant,reviewGrant]){
     await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${item.grantRef.id},${principal.id},${JSON.stringify(item)}::text::jsonb,${item.validFrom},${item.validUntil},'Active')`;
     await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${item.grantRef.id},1)`;
    }
    await assignResponsibility(tx,{commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.responsibilities.assign',digest:await inputDigest(assignment)},assignment);
   });
   const enableRequestRef=ref('abh.responsibility-request'),enableEvidence=[enable.validationRef,enable.governanceRef,enable.ctkRef,enable.impactRef,enable.migrationVerificationRef,enable.capabilitySetRef];
   const enablePackage:DecisionPackage={requestRef:enableRequestRef,routeRevision:1,slotId:'enable',subjectRef:enable.packRef,proposalDigest:enable.proposalDigest,question:'Enable this Pack?',recommendation:'Review signed deployment evidence',alternatives:['Reject'],impactUpperBound:enable.impactUpperBound,risks:['Pack capabilities become available'],evidenceRefs:enableEvidence,validUntil:enable.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)};
   enablePackage.packageDigest=await digestContract('DecisionPackage',enablePackage);
   const requestCommand:RequestPackEnableCommand={commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.packs.request-enable',schemaVersion:'0.1.0',target:{type:'abh.organization',id:org},payload:{proposal:enable,responsibility:{request:{requestRef:enableRequestRef,resourceOrganizationId:org,kind:'Authorization',subjectRef:enable.packRef,proposalDigest:enable.proposalDigest,evidenceRefs:enableEvidence,requiredSlots:[{slotId:'enable',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:'ALL',required:true,dependsOnSlotIds:[],seats:[{seatId:'reviewer',responsibilityRefs:[assignment.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],expiresAt:enable.expiresAt,status:'Unresolved'},packages:[enablePackage]}}};
   const routingFences=[scope,principal,assignment.responsibilityRef,reviewGrant.grantRef];
   const enableEligibility:DecisionEligibility={lock:async tx=>{await lockFences(tx,routingFences);},candidate:async()=>true,submit:async(tx,d)=>{await assertCurrentGrants(tx,{objectRef:d.decisionRef,scopeRefs:[scope],action:'abh.decisions.submit'},[reviewGrant.grantRef]);return [reviewGrant.grantRef];},revalidate:async(tx,d)=>{await assertCurrentGrants(tx,{objectRef:d.decisionRef,scopeRefs:[scope],action:'abh.decisions.submit'},[reviewGrant.grantRef]);},conditions:async()=>[]};
   const requestChecks={proposal:enableChecks,eligibility:enableEligibility,fenceRefs:async()=>routingFences,routing:async()=>{}};
   const requestAuthority={request:[requestGrant.grantRef],impact:[grant.grantRef],stage:[grant.grantRef]};
   const requestEnable=(input=requestCommand,authority=requestAuthority,admission=requestChecks)=>requestPackEnable(databaseFixture.database,manager,databaseOptions(),input,durable,authority,admission);
   for(const mutate of [
    (cmd:RequestPackEnableCommand)=>{cmd.payload.responsibility.request.subjectRef={...enable.packRef,version:2};},
    (cmd:RequestPackEnableCommand)=>{cmd.payload.responsibility.packages[0]!.evidenceRefs=enableEvidence.slice(0,-1);},
    (cmd:RequestPackEnableCommand)=>{cmd.payload.responsibility.packages[0]!.impactUpperBound={...enable.impactUpperBound,description:'Unreviewed impact'};},
   ]){
    const changed=structuredClone(requestCommand);mutate(changed);changed.payload.responsibility.packages[0]!.packageDigest=await digestContract('DecisionPackage',changed.payload.responsibility.packages[0]!);
    await assert.rejects(requestEnable(changed),{code:'DECISION_PACKAGE_INCOMPLETE'});
   }
   const requested=await requestEnable();assert.equal(requested.replayed,false);
   const requestReplay=await requestEnable();assert.equal(requestReplay.replayed,true);assert.deepEqual(requestReplay.requestRef,requested.requestRef);
   const changedQuestion=structuredClone(requestCommand);changedQuestion.payload.responsibility.packages[0]!.question='A different question';
   changedQuestion.payload.responsibility.packages[0]!.packageDigest=await digestContract('DecisionPackage',changedQuestion.payload.responsibility.packages[0]!);
   await assert.rejects(requestEnable(changedQuestion),{code:'IDEMPOTENCY_CONFLICT'});
   const decisionOwner=new DecisionOwner(),reviewContext=deriveVerifiedContext({...manager.request,purposeOfUse:'abh.decision.review'});
   const openedEnable=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>decisionOwner.getRequest(tx,enableRequestRef.id));assert.equal(openedEnable.status,'Open');
   const decision=await databaseFixture.database.transaction(reviewContext,databaseOptions(),tx=>decisionOwner.getDecision(tx,openedEnable.decisionRefs[0]!.id));
   const approved=await databaseFixture.database.transaction(reviewContext,databaseOptions(),async tx=>decisionOwner.submit(tx,{commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.decisions.submit',digest:await inputDigest(decision.decisionRef)},decision.decisionRef,{response:'Approved',packageDigest:enablePackage.packageDigest,conditionRefs:[]},enableEligibility));
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{await lockFences(tx,[scope,...await approvalFenceRefs(tx,approved.completion!.completionEvidenceRef)]);await verifyPackEnableApproval(tx,approved.completion!.completionEvidenceRef,enable);});
   const enableGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.enable']};
   await databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${enableGrant.grantRef.id},${principal.id},${JSON.stringify(enableGrant)}::text::jsonb,${enableGrant.validFrom},${enableGrant.validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${enableGrant.grantRef.id},1)`;
   });
   const enablePayload={proposal:enable,approvalRef:approved.completion!.completionEvidenceRef};
   const commitAuthority={enable:[enableGrant.grantRef],impact:[grant.grantRef],stage:[grant.grantRef]};
   const commitChecks={proposal:enableChecks,fenceRefs:async()=>[],installation:async()=>{}};
   const prepareCommit=(payload=enablePayload,authority=commitAuthority,admission=commitChecks)=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>preparePackEnableCommit(tx,databaseOptions(),payload,durable,authority,admission));
   const prospective=await prepareCommit();assert.deepEqual(prospective.previousPackRef,stagedRef);assert.deepEqual(prospective.enabledPackRef,{...stagedRef,version:2});assert.equal(prospective.deploymentVersion,2);
   assert.deepEqual(prospective.approvalRef,approved.completion!.completionEvidenceRef);
   assert.equal((await databaseFixture.admin`SELECT status FROM extension.installed_packs WHERE id=${stagedRef!.id}`)[0]!.status,'Staged');
   assert.equal(await databaseFixture.database.transaction(manager,databaseOptions(),tx=>new PackDeploymentRevisionOwner().current(tx)),1);
   const enableIdentity={type:'abh.packs.enable',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(enablePayload)};
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),async tx=>{
    const result=await executeCommand(tx,enableIdentity,async()=>{},async()=>{
     const saved=await applyPackEnable(tx,databaseOptions(),enableIdentity,enablePayload,durable,commitAuthority,commitChecks);
     assert.equal(saved.status,'Enabled');assert.deepEqual(saved.packRef,{...stagedRef,version:2});
     assert.deepEqual(await new InstalledPackOwner().readHistorical(tx,stagedRef,async()=>{}),installed!.record);
     assert.equal(await new PackDeploymentRevisionOwner().current(tx),2);
     return saved.packRef;
    });
    assert.equal(result.receipt.resultRef.version,2);
    assert.equal((await tx.owner('PackLoader')`SELECT count(*) FROM extension.installed_pack_history WHERE id=${stagedRef.id}`)[0]!.count,'2');
    throw new Error('rollback complete Enabled transition');
   }),/rollback complete Enabled transition/);
   assert.equal((await databaseFixture.admin`SELECT status FROM extension.installed_packs WHERE id=${stagedRef.id}`)[0]!.status,'Staged');
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.command_receipts WHERE id=${enableIdentity.commandId}`)[0]!.count,'0');
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.outbox WHERE record->>'causationId'=${enableIdentity.commandId}`)[0]!.count,'0');
   assert.equal(await databaseFixture.database.transaction(manager,databaseOptions(),tx=>new PackDeploymentRevisionOwner().current(tx)),1);
   // Issue a real short-lived proposal so replay can be tested after its DB expiry.
   const shortRequest=structuredClone(requestCommand),shortProposal={...enable,expiresAt:new Date(Date.now()+5000).toISOString()};
   shortProposal.proposalDigest=await digestContract('PackEnableProposal',shortProposal);
   shortRequest.commandId=randomUUID();shortRequest.idempotencyKey=randomUUID();shortRequest.payload.proposal=shortProposal;
   const shortRef=ref('abh.responsibility-request');
   Object.assign(shortRequest.payload.responsibility.request,{requestRef:shortRef,proposalDigest:shortProposal.proposalDigest,expiresAt:shortProposal.expiresAt});
   for(const pkg of shortRequest.payload.responsibility.packages){Object.assign(pkg,{requestRef:shortRef,proposalDigest:shortProposal.proposalDigest,validUntil:shortProposal.expiresAt});pkg.packageDigest=await digestContract('DecisionPackage',pkg);}
   await requestEnable(shortRequest);
   const shortOpened=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>decisionOwner.getRequest(tx,shortRef.id));
   const shortDecision=await databaseFixture.database.transaction(reviewContext,databaseOptions(),tx=>decisionOwner.getDecision(tx,shortOpened.decisionRefs[0]!.id));
   const shortApproved=await databaseFixture.database.transaction(reviewContext,databaseOptions(),async tx=>decisionOwner.submit(tx,{commandId:randomUUID(),idempotencyKey:randomUUID(),type:'abh.decisions.submit',digest:await inputDigest(shortDecision.decisionRef)},shortDecision.decisionRef,{response:'Approved',packageDigest:shortDecision.package.packageDigest,conditionRefs:[]},enableEligibility));
   const shortPayload={proposal:shortProposal,approvalRef:shortApproved.completion!.completionEvidenceRef};
   const enableCommand={type:'abh.packs.enable' as const,schemaVersion:'0.1.0' as const,commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization' as const,id:org},payload:shortPayload};
   let replayReads=0;
   const commandChecks={commit:commitChecks,replay:{fenceRefs:async()=>[],current:async()=>{replayReads++;}}};
   const invokeEnable=(cmd=enableCommand,authority=commitAuthority,admission=commandChecks)=>enablePack(databaseFixture.database,manager,databaseOptions(),cmd,durable,authority,admission);
   await assert.rejects(invokeEnable(enableCommand,{...commitAuthority,enable:[]}),{code:'AUTHORITY_REQUIRED'});
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.command_receipts WHERE id=${enableCommand.commandId}`)[0]!.count,'0');
   try{
    const acceptedEnable=await invokeEnable();assert.equal(acceptedEnable.replayed,false);assert.equal(acceptedEnable.packRef.version,2);
    assert.equal((await databaseFixture.admin`SELECT status FROM extension.installed_packs WHERE id=${stagedRef.id}`)[0]!.status,'Enabled');
    assert.deepEqual(await doStage(),stagedRef);
    const replayed=await invokeEnable({...enableCommand,commandId:randomUUID()});assert.equal(replayed.replayed,true);assert.equal(replayed.commandId,enableCommand.commandId);assert.deepEqual(replayed.packRef,acceptedEnable.packRef);
    assert.equal(replayReads,1);
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(shortProposal.expiresAt)-Date.now()+25)));
    assert.equal((await databaseFixture.admin`SELECT clock_timestamp()>${shortProposal.expiresAt}::timestamptz AS expired`)[0]!.expired,true);
    assert.equal((await invokeEnable()).replayed,true);
    await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${reviewGrant.grantRef.id}`;
    try{assert.equal((await invokeEnable()).replayed,true);}finally{await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${reviewGrant.grantRef.id}`;}

    await invokeEnable(enableCommand,commitAuthority,{...commandChecks,commit:{...commitChecks,installation:async()=>{throw new Error('initial admission must not repeat');}}});
    await assert.rejects(invokeEnable({...enableCommand,payload:{...enablePayload,approvalRef:ref('abh.request-completion-evidence')}}),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(invokeEnable({...enableCommand,commandId:randomUUID(),idempotencyKey:randomUUID()}),{code:'VERSION_CONFLICT'});
    await assert.rejects(invokeEnable(enableCommand,commitAuthority,{...commandChecks,replay:{...commandChecks.replay,current:async()=>{throw new Error('replay read denied');}}}),/replay read denied/);
    await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${enableGrant.grantRef.id}`;
    await assert.rejects(invokeEnable(),{code:'AUTHORITY_REQUIRED'});
    await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${enableGrant.grantRef.id}`;
    const payloadPath=join(durable,stageSnapshot.id,'payload','input.json'),payloadBytes=await readFile(payloadPath);
    try{await writeFile(payloadPath,'abd');await assert.rejects(invokeEnable(),{code:'PRECONDITION_FAILED'});}finally{await writeFile(payloadPath,payloadBytes);}
    try{await assert.rejects(invokeEnable(enableCommand,commitAuthority,{...commandChecks,replay:{...commandChecks.replay,current:async()=>{
     await databaseFixture.admin`UPDATE extension.capability_sets SET record=jsonb_set(record,'{setDigest}',${JSON.stringify('sha256:'+'0'.repeat(64))}::text::jsonb) WHERE id=${registry.setRef.id}`;
    }}}),{code:'PRECONDITION_FAILED'});}finally{await databaseFixture.admin`UPDATE extension.capability_sets SET record=${JSON.stringify(set)}::text::jsonb WHERE id=${registry.setRef.id}`;}
    const sameInputs={...governance,policyRef:{...governance.policyRef,version:2},revokedPackIds:['org.other.pack']};
    const sameInputsSigned=await signGovernance(sameInputs);
    try{
     await databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,sameInputsSigned.candidate,1,async()=>{}));
     assert.equal((await invokeEnable()).replayed,true);
     const changedKey=await signGovernance({...sameInputs,policyRef:{...governance.policyRef,version:3},trust:{...sameInputs.trust,signer:{...sameInputs.trust.signer,publicKeyPem:administrator.publicKeyPem}}});
     await databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,changedKey.candidate,2,async()=>{}));
     await assert.rejects(invokeEnable(),{code:'VERSION_CONFLICT'});
    }finally{await databaseFixture.admin`DELETE FROM extension.trust_policies WHERE resource_organization_id=${org} AND version>=2`;}
    const [receiptBefore]=await databaseFixture.admin`SELECT record FROM data.command_receipts WHERE id=${enableCommand.commandId}`;
    try{
     await databaseFixture.admin`UPDATE data.command_receipts SET record=jsonb_set(record,'{commandType}','"abh.packs.stage"') WHERE id=${enableCommand.commandId}`;
     await assert.rejects(invokeEnable(),{code:'PRECONDITION_FAILED'});
    }finally{await databaseFixture.admin`UPDATE data.command_receipts SET record=${JSON.stringify(receiptBefore!.record)}::text::jsonb WHERE id=${enableCommand.commandId}`;}
    const replayPool=await Database.connect(databaseFixture.runtimeUrl,{max:2});
    try{
     const retries=await Promise.all([1,2].map(()=>enablePack(replayPool,manager,databaseOptions(),{...enableCommand,commandId:randomUUID()},durable,commitAuthority,commandChecks)));
     assert.ok(retries.every(value=>value.replayed&&value.commandId===enableCommand.commandId));
    }finally{await replayPool.close();}
    const counts=await databaseFixture.admin`SELECT
     (SELECT count(*) FROM data.command_receipts WHERE id=${enableCommand.commandId}) AS receipts,
     (SELECT count(*) FROM data.outbox WHERE record->>'causationId'=${enableCommand.commandId}) AS events,
     (SELECT count(*) FROM extension.installed_pack_history WHERE id=${stagedRef.id}) AS history,
     (SELECT count(*) FROM extension.deployment_revisions WHERE resource_organization_id=${org}) AS revisions`;
    assert.deepEqual(Object.values(counts[0]!),['1','1','2','2']);
   }finally{
    // Reset this isolated test fixture after observing a real committed command;
    // the rest of this test independently exercises Staged-only management paths.
    await databaseFixture.admin.begin(async sql=>{
     await sql`UPDATE extension.installed_packs SET version=1,status='Staged',deployment_version=1,record=${JSON.stringify(installed!.record)}::text::jsonb WHERE id=${stagedRef.id}`;
     await sql`DELETE FROM extension.installed_pack_history WHERE id=${stagedRef.id} AND version=2`;
     await sql`DELETE FROM extension.deployment_revisions WHERE resource_organization_id=${org} AND deployment_version=2`;
     await sql`DELETE FROM data.outbox WHERE record->>'causationId'=${enableCommand.commandId}`;
     await sql`DELETE FROM data.audit_records WHERE resource_organization_id=${org} AND record->>'action'='abh.packs.enable'`;
     await sql`DELETE FROM data.command_receipts WHERE id=${enableCommand.commandId}`;
     await sql`UPDATE control.grants SET status='Active' WHERE id=${enableGrant.grantRef.id}`;
    });
   }
   await assert.rejects(prepareCommit(enablePayload,{...commitAuthority,enable:[]}),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(prepareCommit(enablePayload,{...commitAuthority,enable:[requestGrant.grantRef]}),{code:'FORBIDDEN'});
   await assert.rejects(prepareCommit({...enablePayload,approvalRef:{...enablePayload.approvalRef,version:2}}),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(prepareCommit(enablePayload,commitAuthority,{...commitChecks,installation:async()=>{throw new Error('isolation unavailable');}}),/isolation unavailable/);
   try{await assert.rejects(prepareCommit(enablePayload,commitAuthority,{...commitChecks,installation:async()=>{sourceAllowed=false;}}),/source denied/);}finally{sourceAllowed=true;}
   await assert.rejects(prepareCommit(enablePayload,commitAuthority,{...commitChecks,installation:async()=>{
    await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${reviewGrant.grantRef.id}`;
   }}),{code:'AUTHORITY_REQUIRED'});
   await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${reviewGrant.grantRef.id}`;
   await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${enableGrant.grantRef.id}`;
   await assert.rejects(prepareCommit(),{code:'AUTHORITY_REQUIRED'});
   await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${enableGrant.grantRef.id}`;
   assert.equal((await requestEnable()).replayed,true);
   await assert.rejects(requestEnable(requestCommand,{...requestAuthority,request:[]}),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(requestEnable(requestCommand,{...requestAuthority,request:[grant.grantRef]}),{code:'FORBIDDEN'});
   await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${requestGrant.grantRef.id}`;
   await assert.rejects(requestEnable(),{code:'AUTHORITY_REQUIRED'});
   await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${requestGrant.grantRef.id}`;
   const beforeRequestRollback=await databaseFixture.admin`SELECT count(*) FROM human.requests WHERE resource_organization_id=${org}`;
   const rollbackRequest=structuredClone(requestCommand);rollbackRequest.commandId=randomUUID();rollbackRequest.idempotencyKey=randomUUID();rollbackRequest.payload.responsibility.request.requestRef=ref('abh.responsibility-request');
   rollbackRequest.payload.responsibility.packages[0]!.requestRef=rollbackRequest.payload.responsibility.request.requestRef;
   rollbackRequest.payload.responsibility.packages[0]!.packageDigest=await digestContract('DecisionPackage',rollbackRequest.payload.responsibility.packages[0]!);
   let routingCalls=0;
   await assert.rejects(requestEnable(rollbackRequest,requestAuthority,{...requestChecks,routing:async()=>{if(++routingCalls===2)throw new Error('routing withdrawn');}}),/routing withdrawn/);
   assert.deepEqual(await databaseFixture.admin`SELECT count(*) FROM human.requests WHERE resource_organization_id=${org}`,beforeRequestRollback);
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.command_receipts WHERE id=${rollbackRequest.commandId}`)[0]!.count,'0');
   let finalRoutingCalls=0;
   try{await assert.rejects(requestEnable(requestCommand,requestAuthority,{...requestChecks,routing:async()=>{if(++finalRoutingCalls===2)sourceAllowed=false;}}),/source denied/);}finally{sourceAllowed=true;}
   assert.equal(finalRoutingCalls,2);
   const ctkBefore=await databaseFixture.admin`SELECT count(*) FROM data.artifacts WHERE resource_organization_id=${org}`;
   const ctkRolledBack={...ctkInput,commandId:randomUUID(),idempotencyKey:randomUUID()};
   await assert.rejects(recordCtk(ctkRolledBack,ctkGrants,{...ctkChecks,read:async()=>{throw new Error('CTK rollback');}}),/CTK rollback/);
   assert.deepEqual(await databaseFixture.admin`SELECT count(*) FROM data.artifacts WHERE resource_organization_id=${org}`,ctkBefore);
   assert.equal((await databaseFixture.admin`SELECT count(*) FROM data.command_receipts WHERE id=${ctkRolledBack.commandId}`)[0]!.count,'0');
   await databaseFixture.admin`UPDATE control.grants SET status='Revoked' WHERE id=${ctkGrant.grantRef.id}`;
   await assert.rejects(recordCtk(),{code:'AUTHORITY_REQUIRED'});
   await databaseFixture.admin`UPDATE control.grants SET status='Active' WHERE id=${ctkGrant.grantRef.id}`;
   const secondNonApplicable=await recordMigrationNonApplicability(databaseFixture.database,manager,databaseOptions(),{...nonApplicableInput,commandId:randomUUID(),idempotencyKey:randomUUID()},durable,[grant.grantRef],nonApplicableChecks);
   assert.notEqual(secondNonApplicable.id,notApplicableRef.id);
   assert.deepEqual(await selectNonApplicable(),{status:'Ambiguous'});
   assert.deepEqual(await selectNonApplicable(1),{status:'Incomplete'});
   sourceAllowed=false;await assert.rejects(selectNonApplicable(),/source denied/);sourceAllowed=true;
   for(const content of [canonicalJson(['abh-pack-migration-not-applicable-v1',{...impactReport,deploymentVersion:999}]),' '+new TextDecoder().decode(actualNonApplicable.bytes)]){
    const payload={...nonApplicableInput.retention,ownerRef:stagedRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:actualNonApplicable.record.sourceRefs,content};
    const identity={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
    const substituted=await databaseFixture.database.transaction(manager,databaseOptions(),tx=>executeCommand(tx,identity,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,identity,payload,async()=>{})).artifactRef));
    await assert.rejects(readNonApplicable(substituted.receipt.resultRef),{code:'PRECONDITION_FAILED'});
    await assert.rejects(selectNonApplicable(),{code:'PRECONDITION_FAILED'});
   }
   const currentNonApplicable=await readNonApplicable();assert.deepEqual(currentNonApplicable.impact,impactReport);assert.deepEqual(currentNonApplicable.installation.packRef,stagedRef);
   await assert.rejects(readNonApplicable(notApplicableRef,[]),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(readNonApplicable(impactReport.baselineSourceRef),{code:'PRECONDITION_FAILED'});
   await assert.rejects(readNonApplicable(notApplicableRef,[grant.grantRef],{...nonApplicableChecks,read:async()=>{throw new Error('read report denied');}}),/read report denied/);
   sourceAllowed=false;await assert.rejects(readNonApplicable(),/source denied/);sourceAllowed=true;
   let resultReads=0;
   try{await assert.rejects(readNonApplicable(notApplicableRef,[grant.grantRef],{...nonApplicableChecks,read:async()=>{if(++resultReads===2)sourceAllowed=false;}}),/source denied/);}finally{sourceAllowed=true;}
   sourceAllowed=false;await assert.rejects(recordNonApplicable(),/source denied/);sourceAllowed=true;
   sourceAllowed=false;await assert.rejects(installedPreparation(),/source denied/);sourceAllowed=true;
   assert.deepEqual(await impactRead(),impactReport);await assert.rejects(impactRead([]),{code:'AUTHORITY_REQUIRED'});
   const [persistedProof]=await databaseFixture.admin`SELECT signature_bundle,signer_key_digest,bundle_digest FROM extension.data_impact_reports WHERE id=${impactRef.id}`;
   assert.deepEqual(Buffer.from(persistedProof!.signature_bundle),impactBundle);
   assert.equal(persistedProof!.signer_key_digest,compilerEvidence.keyDigest);
   await databaseFixture.admin`UPDATE extension.data_impact_reports SET signature_bundle=${Buffer.from('{}')} WHERE id=${impactRef.id}`;
   await assert.rejects(impactRead(),{code:'PRECONDITION_FAILED'});
   await databaseFixture.admin`UPDATE extension.data_impact_reports SET signature_bundle=NULL,signer_key_digest=NULL,bundle_digest=NULL WHERE id=${impactRef.id}`;
   await assert.rejects(impactRead(),{code:'PRECONDITION_FAILED'});
   await databaseFixture.admin`UPDATE extension.data_impact_reports SET signature_bundle=${impactBundle},signer_key_digest=${compilerEvidence.keyDigest},bundle_digest=${compilerEvidence.bundleDigest} WHERE id=${impactRef.id}`;
   compilerKeyChanged=true;await assert.rejects(impactRead(),{code:'PRECONDITION_FAILED'});await assert.rejects(impactInvoke(),{code:'PRECONDITION_FAILED'});compilerKeyChanged=false;
   await assert.rejects(recordPackDataImpact(databaseFixture.database,manager,databaseOptions(),impactCommand,durable,[grant.grantRef],impactChecks,{...compilerProof}),{code:'FORBIDDEN'});
   const shortReport={...impactReport,issuedAt:new Date(Date.now()-100).toISOString(),expiresAt:new Date(Date.now()+1500).toISOString()};
   await writeFile(join(root,'short-impact-payload'),impactSignaturePayload(org,shortReport));
   await run(['sign-blob','--key',join(root,'compiler.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'short-impact-bundle.json'),join(root,'short-impact-payload')]);
   const shortProof=await verifyImpactSignature(org,shortReport,await readFile(join(root,'short-impact-bundle.json')),compilerSigner,options());
   let keyReads=0;
   const shortCommand={...impactCommand,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{report:shortReport}};
   await assert.rejects(recordPackDataImpact(databaseFixture.database,manager,databaseOptions(),shortCommand,durable,[grant.grantRef],{
    ...impactChecks,async signer(){if(++keyReads===2)await new Promise(resolve=>setTimeout(resolve,Math.max(1,Date.parse(shortReport.expiresAt)-Date.now()+10)));return compilerSigner;}
   },shortProof),{code:'PRECONDITION_FAILED'});
   assert.equal(keyReads,2);
   const [expiredWrites]=await databaseFixture.admin`SELECT
    (SELECT count(*) FROM data.command_receipts WHERE id=${shortCommand.commandId}) AS receipts,
    (SELECT count(*) FROM data.outbox WHERE record->>'causationId'=${shortCommand.commandId}) AS events,
    (SELECT count(*) FROM extension.data_impact_reports WHERE record->>'expiresAt'=${shortReport.expiresAt}) AS reports`;
   assert.deepEqual(expiredWrites,{receipts:'0',events:'0',reports:'0'});
   sourceAllowed=false;await assert.rejects(impactInvoke(),/source denied/);await assert.rejects(impactRead(),/source denied/);sourceAllowed=true;
   const wrongSources={...impactCommand,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{report:{...impactReport,targetSourceRef:different.receipt.resultRef}}};
   await assert.rejects(recordPackDataImpact(databaseFixture.database,manager,databaseOptions(),wrongSources,durable,[grant.grantRef],{
    ...impactChecks,async current(tx,_r,e){await checks.current(tx,e);}
   },compilerProof),{code:'PRECONDITION_FAILED'});

   await assert.rejects(readCurrentPackDataImpact(databaseFixture.database,workspaceManager,databaseOptions(),impactRef,durable,[grant.grantRef],impactChecks),{code:'FORBIDDEN'});
   await assert.rejects(readCurrentPackDataImpact(databaseFixture.database,tenant,databaseOptions(),impactRef,durable,[grant.grantRef],impactChecks),{code:'PURPOSE_DENIED'});
   await databaseFixture.admin`UPDATE extension.data_impact_reports SET record_digest=${'sha256:'+'e'.repeat(64)} WHERE id=${impactRef.id}`;
   await assert.rejects(impactRead(),{code:'PRECONDITION_FAILED'});
   await databaseFixture.admin`UPDATE extension.data_impact_reports SET record_digest=${await digestBytes(new TextEncoder().encode(canonicalJson(impactReport)))} WHERE id=${impactRef.id}`;
   await writeFile(join(durable,stageSnapshot.id,'payload/input.json'),'bad');await assert.rejects(impactRead(),{code:'PRECONDITION_FAILED'});
   await writeFile(join(durable,stageSnapshot.id,'payload/input.json'),'abc');assert.deepEqual(await impactRead(),impactReport);

   const [impactCounts]=await databaseFixture.admin`SELECT (SELECT count(*) FROM extension.data_impact_reports) AS reports,
    (SELECT count(*) FROM data.command_receipts WHERE command_type=${impactCommand.type}) AS receipts,
    (SELECT count(*) FROM data.audit_records WHERE record->>'action'=${impactCommand.type}) AS audits,
    (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.pack.data-impact-recorded') AS events`;
   assert.deepEqual(impactCounts,{reports:'1',receipts:'1',audits:'1',events:'1'});
   for(const complete of [false,true]){
    const changedTarget={complete,entries:complete?[{kind:'Projection' as const,id:'org.example.projection',digest:manifest.integrity.packageDigest}]:[]};
    const changedArtifact=await storeInventory(canonicalJson(changedTarget));
    const changedReport={...impactReport,target:changedTarget,targetSourceRef:changedArtifact.receipt.resultRef,impact:await assessPackDataImpact(dbCandidate.manifest(),baseline,changedTarget)};
    await writeFile(join(root,'changed-impact'),impactSignaturePayload(org,changedReport));
    await run(['sign-blob','--key',join(root,'compiler.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'changed-impact-bundle'),join(root,'changed-impact')]);
    const changedProof=await verifyImpactSignature(org,changedReport,await readFile(join(root,'changed-impact-bundle')),compilerSigner,options());
    const changedChecks={...impactChecks,current:async(tx:import('../src/data/uow.ts').TenantTransaction,r:import('@abh/contracts').PackDataImpactRecord,e:import('../src/extensions/validation-reports.ts').StoredPackValidation)=>{
     assert.deepEqual(r,changedReport);await checks.current(tx,e);
    }};
    const changedCommand={...impactCommand,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{report:changedReport}};
    const changedRef=await recordPackDataImpact(databaseFixture.database,manager,databaseOptions(),changedCommand,durable,[grant.grantRef],changedChecks,changedProof);
    await assert.rejects(recordMigrationNonApplicability(databaseFixture.database,manager,databaseOptions(),{...nonApplicableInput,commandId:randomUUID(),idempotencyKey:randomUUID(),impactRef:changedRef},durable,[grant.grantRef],{...nonApplicableChecks,impact:changedChecks}),{code:'PRECONDITION_FAILED'});
    const prepareChanged=()=>databaseFixture.database.transaction(manager,databaseOptions(),tx=>prepareInstalledPack(tx,databaseOptions(),changedRef,durable,[grant.grantRef],changedChecks));
    if(!complete)await assert.rejects(prepareChanged(),{code:'PRECONDITION_FAILED'});
    else {const pending=await prepareChanged();assert.equal(pending.status,'DataVerificationRequired');assert.equal('prepared' in pending,false);}
   }

   compilerAllowed=false;await assert.rejects(impactInvoke(),/compiler revoked/);await assert.rejects(impactRead(),/compiler revoked/);compilerAllowed=true;
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`UPDATE extension.data_impact_reports SET record=record`),{code:'42501'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`DELETE FROM extension.data_impact_reports`),{code:'42501'});
   const next={...structuredClone(governance),policyRef:{...governance.policyRef,version:2},revokedPackIds:[manifest.metadata.id]};
   const signedNext=await signGovernance(next);
   await assert.rejects(publishPackTrustPolicy(databaseFixture.database,manager,databaseOptions(),{...publication,commandId:randomUUID(),payload:{...publication.payload,
    expectedVersion:1,documentDigest:await digestBytes(new TextEncoder().encode(canonicalJson(signedNext.document)))}},signedNext.candidate,[grant.grantRef],publicationChecks),{code:'IDEMPOTENCY_CONFLICT'});
   await databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,signedNext.candidate,1,async()=>{}));
   await assert.rejects(invoke(),{code:'VERSION_CONFLICT'});
   await assert.rejects(doStage(),{code:'VERSION_CONFLICT'});
   await assert.rejects(impactInvoke(),{code:'VERSION_CONFLICT'});
   await assert.rejects(impactRead(),{code:'VERSION_CONFLICT'});
   await assert.rejects(resume(),{code:'VERSION_CONFLICT'});
   await assert.rejects(validateCurrentPack(input,readOnlySource,options()),{code:'FORBIDDEN'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,signedNext.candidate,1,async()=>{})),{code:'VERSION_CONFLICT'});
   const restored={...structuredClone(governance),policyRef:{...governance.policyRef,version:3}};
   const signedRestored=await signGovernance(restored);
   await databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,signedRestored.candidate,2,async()=>{}));
   const concurrent=await Database.connect(databaseFixture.runtimeUrl,{max:2});
   const version4={...restored,policyRef:{...restored.policyRef,version:4},reservedVersions:[{packId:manifest.metadata.id,version:manifest.metadata.version,packageDigest:manifest.integrity.packageDigest},{packId:'org.other.pack',version:manifest.metadata.version,packageDigest:'sha256:'+'e'.repeat(64)}]};
   const conflictingReservation=await signGovernance({...version4,reservedVersions:[{...version4.reservedVersions[0]!,packageDigest:'sha256:'+'f'.repeat(64)}]});
   const conflictingPublication={...publication,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{...publication.payload,expectedVersion:3,
    documentDigest:await digestBytes(new TextEncoder().encode(canonicalJson(conflictingReservation.document)))}};
   await assert.rejects(publishPackTrustPolicy(databaseFixture.database,manager,databaseOptions(),conflictingPublication,conflictingReservation.candidate,[grant.grantRef],publicationChecks),{code:'PRECONDITION_FAILED'});
   const [reservationRollback]=await databaseFixture.admin`SELECT
    (SELECT max(version) FROM extension.trust_policies WHERE resource_organization_id=${org}) AS version,
    (SELECT count(*) FROM data.command_receipts WHERE id=${conflictingPublication.commandId}) AS receipts,
    (SELECT count(*) FROM data.outbox WHERE record->>'causationId'=${conflictingPublication.commandId}) AS events`;
   assert.equal(Number(reservationRollback!.version),3);assert.equal(Number(reservationRollback!.receipts),0);assert.equal(Number(reservationRollback!.events),0);
   const signedVersion4=await signGovernance(version4);
   try{
    const racePayload={...publication.payload,expectedVersion:3,documentDigest:await digestBytes(new TextEncoder().encode(canonicalJson(signedVersion4.document)))};
    const races=await Promise.allSettled([1,2].map(()=>publishPackTrustPolicy(concurrent,manager,databaseOptions(),{...publication,commandId:randomUUID(),idempotencyKey:randomUUID(),payload:racePayload},signedVersion4.candidate,[grant.grantRef],publicationChecks)));
    assert.equal(races.filter(result=>result.status==='fulfilled').length,1);
    const failed=races.find(result=>result.status==='rejected');assert.equal(failed?.status==='rejected'?(failed.reason as {code:string}).code:'','VERSION_CONFLICT');
   }finally{await concurrent.close();}
   const removedHistory=await signGovernance({...restored,policyRef:{...restored.policyRef,version:5}});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>trustOwner.publish(tx,removedHistory.candidate,4,async()=>{})),{code:'PRECONDITION_FAILED'});
   const foreignManager=deriveVerifiedContext({...foreign.request,purposeOfUse:'abh.pack.manage'});
   await assert.rejects(databaseFixture.database.transaction(foreignManager,databaseOptions(),tx=>trustOwner.current(tx,manifest.metadata.id)),{code:'RESOURCE_NOT_FOUND'});
   await assert.rejects(databaseFixture.database.transaction(manager,databaseOptions(),tx=>tx.owner('PackLoader')`UPDATE extension.trust_policies SET version=version`),{code:'42501'});
   governanceAllowed=false;await assert.rejects(invoke(),/governance revoked/);governanceAllowed=true;
   await databaseFixture.admin`UPDATE identity.memberships SET status='Revoked' WHERE resource_organization_id=${org} AND principal_id=${principal.id}`;
   await assert.rejects(invoke());
   await databaseFixture.admin`UPDATE identity.memberships SET status='Active' WHERE resource_organization_id=${org} AND principal_id=${principal.id}`;
   await databaseFixture.admin`UPDATE control.grants SET status='Revoked',record=jsonb_set(record,'{status}','"Revoked"') WHERE id=${grant.grantRef.id}`;
   await assert.rejects(invoke(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(publish(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(doStage(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(impactInvoke(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(impactRead(),{code:'AUTHORITY_REQUIRED'});
   await assert.rejects(resume(),{code:'AUTHORITY_REQUIRED'});
  }finally{await databaseFixture.close();}
  let archived='';for await(const chunk of await archiveValidated.files.payload.open('input.json',options()))archived+=Buffer.from(chunk).toString();assert.equal(archived,'abc');
  assert.equal(governed.governanceDigest(),await digestBytes(new TextEncoder().encode(canonicalJson(governance))));
  governed.governanceRef().version=99;assert.equal(governed.governanceRef().version,1);
  for(const change of [{revokedPackIds:[manifest.metadata.id]},
   {revokedDigests:[manifest.integrity.packageDigest]},
   {reservedVersions:[{packId:manifest.metadata.id,version:manifest.metadata.version,packageDigest:'sha256:'+'f'.repeat(64)}]}]){
   let calls=0;await assert.rejects(validateCurrentPack(input,{async current(){calls++;return {...governance,...change};}},options()));assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(validateCurrentPack(input,{async current(){return {...governance,policyRef:{...governance.policyRef,version:++calls}};}},options()),{code:'PRECONDITION_FAILED'});
  calls=0;
  await assert.rejects(validateCurrentPack(input,{async current(){return ++calls===1?governance:{...governance,revokedPackIds:[manifest.metadata.id]};}},options()),{code:'FORBIDDEN'});
  calls=0;
  await assert.rejects(validateCurrentPack(input,{async current(){return ++calls===1?governance:{...governance,revokedPackIds:['org.other.pack']};}},options()),{code:'PRECONDITION_FAILED'});
  const reserved={packId:manifest.metadata.id,version:manifest.metadata.version,packageDigest:manifest.integrity.packageDigest};
  await assert.rejects(validateCurrentPack(input,{async current(){return {...governance,reservedVersions:[reserved,reserved]};}},options()),{code:'INVALID_ARGUMENT'});
  await assert.rejects(validateCurrentPack(input,{async current(){return {...governance,revokedDigests:[validated.validation().conformanceBundleDigest]};}},options()),{code:'FORBIDDEN'});
  validated.conformance().caseResults.length=0;assert.equal(validated.conformance().caseResults.length,1);
  await writeFile(join(staging,'input.json'),'abd');
  const stream=await validated.files.payload.open('input.json',options());let content='';for await(const bytes of stream)content+=Buffer.from(bytes).toString();assert.equal(content,'abc');
  await assert.rejects(validateLocalPack(input,options()),{code:'PRECONDITION_FAILED'});
  await writeFile(join(staging,'input.json'),'abc');
  for(const name of ['signature','source','ctk']){
   const path=join(staging,`proof/${name}.json`),original=await readFile(path);await writeFile(path,'{}');
   await assert.rejects(validateLocalPack(input,options()),{code:'INVALID_ARGUMENT'});await writeFile(path,original);
  }
  for(const override of [{cases:[...policy.cases,{caseId:'abh.test.missing',status:'Passed' as const}]},
   {environment:{...policy.environment,seed:'43'}},{suiteVersion:'2.0.0'},{maxAgeMs:1},
   {publicKeyPem:await readFile(new URL('./fixtures/pack-signature/signer.pub',import.meta.url),'utf8')}])
   await assert.rejects(verifyPackConformance(manifest,proof,{...policy,...override},options()),{code:'PRECONDITION_FAILED'});
  const variants:Partial<ConformanceReport>[]=[{status:'Incomplete'},
   {caseResults:[{...report.caseResults[0]!,status:'Failed',reason:'wrong bytes'}]},
   {caseResults:[{...report.caseResults[0]!,status:'Skipped',reason:'optional'}]},
   {knownDeviations:[{caseId:'abh.test.integrity',reason:'known gap'}]},
   {subjectDigest:'sha256:'+'1'.repeat(64)},
   {finishedAt:new Date(now+60000).toISOString()},
   {claimedCapabilities:[{kind:'abh.tool',id:'org.example.hello.extra',version:'1.0.0',claimed:true}]}];
  for(const variant of variants){const changed={...structuredClone(report),...variant};changed.reportDigest=await digestContract('ConformanceReport',changed);
   await assert.rejects(verifyPackConformance(manifest,await sign(changed),policy,options()),{code:'PRECONDITION_FAILED'});}
  await assert.rejects(verifyPackConformance(manifest,await sign({...report,reportDigest:digest}),policy,options()),{code:'PRECONDITION_FAILED'});
  const optional={...report,caseResults:[{...report.caseResults[0]!,status:'Skipped' as const,reason:'not claimed'}]};optional.reportDigest=await digestContract('ConformanceReport',optional);
  assert.equal((await verifyPackConformance(manifest,await sign(optional),{...policy,cases:[{caseId:'abh.test.integrity',status:'Skipped'}]},options())).caseResults[0]!.status,'Skipped');
 }finally{await rm(root,{recursive:true,force:true});}
});
