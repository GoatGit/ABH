import {checkPackInspectionJobExecution} from './pack-inspection-job-execution-fixture.ts';
import {checkPackInspectionCancellation} from './pack-inspection-cancel-fixture.ts';
import {checkPackInspectionWaiting} from './pack-inspection-wait-fixture.ts';
import {checkPackInspectionCompletion} from './pack-inspection-complete-fixture.ts';
import {checkPackInspectionExpiry} from './pack-inspection-expiry-fixture.ts';
import {checkPackInspectionStart} from './pack-inspection-start-fixture.ts';
import {checkPackInspectionRequest} from './pack-inspection-request-fixture.ts';
import {checkPackInspectionLifecycle} from './pack-inspection-lifecycle-fixture.ts';
import {checkPackInspectionFencing} from './pack-inspection-fencing-fixture.ts';
import {claimPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
import {inspectMigrationTarget} from '../src/extensions/inspect-migration-target.ts';
import {checkPackInspectionLeases} from './pack-inspection-leases-fixture.ts';
import {checkMigrationStateDiscovery} from './migration-state-discovery-fixture.ts';
import type {MigrationStateDiscoveryBinding} from '../src/extensions/discover-migration-state.ts';
import {preparePackInspection,type PackInspectionPreparation} from '../src/extensions/prepare-pack-inspection.ts';
import {createTenantRuntimeLoops,joinRuntimeLoops,type TenantRuntimeOptions} from '../src/durable/runtime-host.ts';
import {runPackInspectionWorker} from '../src/extensions/inspection-worker.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {selectCurrentPackDataImpact} from '../src/extensions/select-pack-data-impact.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {checkStagedDiscovery} from './staged-pack-discovery-fixture.ts';
import {runInstalledMigrationInspection} from '../src/extensions/run-installed-migration-inspection.ts';
import {persistMigrationState} from '../src/extensions/persist-migration-state.ts';
import {readRevalidatedMigrationState} from '../src/extensions/read-migration-state.ts';
import {verifyInstalledMigrationState} from '../src/extensions/verify-installed-migration-state.ts';
import {persistMigrationDataResult} from '../src/extensions/persist-data-result.ts';
import {readRevalidatedDataResult} from '../src/extensions/read-data-result.ts';
import {verifyInstalledMigrationData} from '../src/extensions/verify-installed-data.ts';
import {dataSignaturePayload,type MigrationDataReport} from '../src/extensions/verify-data-signature.ts';
import type {MigrationDataCheck} from '../src/extensions/verify-migration-data.ts';
import {persistMigrationStructureResult} from '../src/extensions/persist-structure-result.ts';
import {verifyInstalledMigrationStructure} from '../src/extensions/verify-installed-structure.ts';
import {structureSignaturePayload} from '../src/extensions/verify-structure-signature.ts';
import type {MigrationStructureExpectation} from '../src/extensions/verify-migration-structure.ts';
import {recoverSignedMigrationObservation} from '../src/extensions/recover-signed-migration-observation.ts';
import {readSignedMigrationExecutionResult} from '../src/extensions/read-signed-migration-result.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import type postgres from 'postgres';
import type {PackManifest,PackMigrationStep,ConformanceReport,PackGovernanceSnapshot,GrantRecord,RecordPackValidationCommand,StagePackCommand,RecordPackDataImpactCommand} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract,digestPackManifest} from '@abh/contracts/digest';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {verifyTrustPolicy,trustPolicySignaturePayload} from '../src/extensions/verify-trust-policy.ts';
import {PackTrustPolicyOwner,databasePackGovernanceSource} from '../src/extensions/trust-policies.ts';
import {validateCurrentPack} from '../src/extensions/validate-current-pack.ts';
import {recordPackValidation} from '../src/extensions/record-pack-validation.ts';
import {stageLocalPackSnapshot} from '../src/extensions/local-pack-staging.ts';
import {stagePack} from '../src/extensions/stage-pack.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {assessPackDataImpact} from '../src/extensions/pack-data-impact.ts';
import {impactSignaturePayload,verifyImpactSignature} from '../src/extensions/verify-impact-signature.ts';
import {recordPackDataImpact} from '../src/extensions/data-impact-reports.ts';
import {prepareInstalledPack} from '../src/extensions/prepare-installed-pack.ts';
import {migrationResultSignaturePayload,verifyMigrationResultSignature,matchMigrationResultSignature} from '../src/extensions/verify-migration-result-signature.ts';
import {recoverMigrationObservation} from '../src/extensions/recover-migration-observation.ts';
import {readStoredMigrationExecutionResult} from '../src/extensions/read-migration-result.ts';
import {persistMigrationExecutionResult} from '../src/extensions/persist-migration-result.ts';
import {executeInstalledMigrationClaim} from '../src/extensions/execute-installed-migration.ts';
import {claimPackMigrationAttempt} from '../src/extensions/migration-journal.ts';
import type {MigrationSignatureBinding,SignedMigrationPlanAdmission} from '../src/extensions/signed-migration-plan.ts';
export const installedMigrationSql="CREATE TABLE hello_domain.installed_items (id integer PRIMARY KEY, label text DEFAULT 'new');";
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkInstalledMigration(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,root:string,executable:string,run:(args:string[])=>Promise<unknown>,pack:PackManifest,step:PackMigrationStep,links:MigrationSignatureBinding[],target:postgres.ReservedSql,admission:SignedMigrationPlanAdmission,createTarget:()=>Promise<{connection:postgres.ReservedSql;dispose():Promise<void>}>,targetUrl:string){
 const org=c.tenant.resourceOrganizationId,ref=<T extends string>(type:T,id:string=randomUUID())=>({type,id,version:1});
 const scope=ref('abh.organization',org),principal=ref('abh.principal',c.tenant.actor.id);
 const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.packs.record-validation','abh.packs.stage','abh.packs.record-data-impact','abh.packs.request-inspection','abh.pack-inspection-jobs.start','abh.pack-inspection-jobs.expire','abh.pack-inspection-jobs.complete','abh.pack-inspection-jobs.wait','abh.pack-inspection-jobs.cancel','abh.pack-inspection-jobs.fail-lost-lease','abh.pack-inspection-jobs.fail'],purposeNames:['abh.pack.manage'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+180000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Migration org','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Manager','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 for(const key of ['release','builder','ctk','admin','compiler'])await run(['generate-key-pair','--output-key-prefix',join(root,'installed-'+key)]);
 const keyConfig=async(key:string)=>({executable,mode:'OfflinePublicKey' as const,publicKeyPem:await readFile(join(root,'installed-'+key+'.pub'),'utf8')});
 const sign=async(key:string,content:string,name:string)=>{
  await writeFile(join(root,name),content);await run(['sign-blob','--key',join(root,'installed-'+key+'.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,name+'.bundle'),join(root,name)]);return readFile(join(root,name+'.bundle'));
 };
 const payload=(await digestPackManifest(pack)).signaturePayload;await writeFile(join(root,'payload'),payload);
 const release=await sign('release',payload,'release-payload');
 const source={uri:'git+https://example.org/hello.git',digest:{gitCommit:'0123456789abcdef0123456789abcdef01234567'}};
 const provenance={buildDefinition:{buildType:'https://example.org/build/v1',externalParameters:{},internalParameters:{},resolvedDependencies:[source]},runDetails:{builder:{id:'https://example.org/builder'},metadata:{invocationId:'migration-fixture'}}};
 const attest=async(key:string,predicate:unknown,type:string,name:string)=>{
  await writeFile(join(root,name),JSON.stringify(predicate));await run(['attest-blob','--key',join(root,'installed-'+key+'.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,name+'.bundle'),'--predicate',join(root,name),'--type',type,join(root,'payload')]);return readFile(join(root,name+'.bundle'));
 };
 const provenanceBundle=await attest('builder',provenance,'https://slsa.dev/provenance/v1','provenance');
 const environment={profile:'Domain' as const,environmentDigest:'sha256:'+'a'.repeat(64),fixtureSetDigest:pack.integrity.packageDigest,seed:'1'};
 const conformance:ConformanceReport={subjectDigest:pack.integrity.packageDigest,suiteVersion:'1.0.0',status:'Complete',caseResults:[{caseId:'abh.test.migration',status:'Passed',reason:null,artifactRefs:[]}],claimedCapabilities:[],knownDeviations:[],environment,startedAt:new Date(Date.now()-2000).toISOString(),finishedAt:new Date(Date.now()-1000).toISOString(),artifactRefs:[],reportDigest:pack.integrity.packageDigest,signatureRef:pack.integrity.conformanceRef};
 conformance.reportDigest=await digestContract('ConformanceReport',conformance);
 const ctk=await attest('ctk',conformance,'urn:abh:conformance:v1','ctk');
 assert.equal(pack.resources.enforcement,'HostProfile');
 if(pack.resources.enforcement!=='HostProfile')throw new Error('TrustedCode fixture requires resource profile');
 const governance:PackGovernanceSnapshot={policyRef:ref('abh.pack-trust-policy'),policy:{abhVersion:'0.1.0',packId:pack.metadata.id,allowedModes:['TrustedCode'],allowedLicenses:['Apache-2.0'],permissions:pack.permissions,hostProfileRefs:[pack.resources.profileRef!],sharedNamespaces:[]},trust:{signer:{...await keyConfig('release'),packId:pack.metadata.id},provenance:{...await keyConfig('builder'),packId:pack.metadata.id,subjectName:'payload',builderId:provenance.runDetails.builder.id,buildType:provenance.buildDefinition.buildType,source},conformance:{...await keyConfig('ctk'),packId:pack.metadata.id,subjectName:'payload',suiteVersion:'1.0.0',environment,cases:[{caseId:'abh.test.migration',status:'Passed'}],claimedCapabilities:[],maxAgeMs:180000}},revokedPackIds:[],revokedDigests:[],reservedVersions:[]};
 const document={organizationId:org,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+180000).toISOString(),snapshot:governance};
 const signedPolicy=await verifyTrustPolicy(document,await sign('admin',trustPolicySignaturePayload(document),'policy'),{...await keyConfig('admin'),organizationId:org,packId:pack.metadata.id,policyId:governance.policyRef.id,maxLifetimeMs:240000},options());
 // Explicit deployment publisher Fixture; signature and database publication are real.
 await f.database.transaction(c,options(),tx=>new PackTrustPolicyOwner().publish(tx,signedPolicy,0,async()=>{}));
 const staging=join(await realpath(root),'installed-staging'),durable=join(await realpath(root),'installed-durable');await mkdir(join(staging,'proof'),{recursive:true});await mkdir(durable,{mode:0o700});
 await writeFile(join(staging,'input.json'),'abc');await writeFile(join(staging,'migration.sql'),installedMigrationSql);
 for(const [name,bytes] of [[pack.integrity.signatureRef,release],[pack.integrity.provenanceRef,provenanceBundle],[pack.integrity.conformanceRef,ctk]] as const)await writeFile(join(staging,name),bytes);
 const candidate=await validateCurrentPack({root:staging,manifest:pack,limits:{maxFileBytes:65536,maxTotalBytes:262144,maxEntries:20}},databasePackGovernanceSource(f.database,c,async()=>{}),options());
 const checks={fenceRefs:async()=>[],current:async(tx:import('../src/data/uow.ts').TenantTransaction,e:import('../src/extensions/validation-reports.ts').StoredPackValidation)=>new PackTrustPolicyOwner().match(tx,e)};
 const validationCommand:RecordPackValidationCommand={type:'abh.packs.record-validation',commandId:randomUUID(),idempotencyKey:randomUUID(),schemaVersion:'0.1.0',target:{type:'abh.organization',id:org},payload:{reportDigest:candidate.validation().reportDigest,governanceRef:candidate.governanceRef(),governanceDigest:candidate.governanceDigest()}};
 const validationRef=await recordPackValidation(f.database,c,options(),validationCommand,candidate,[grant.grantRef],checks);
 const stageCommand:StagePackCommand={type:'abh.packs.stage',commandId:randomUUID(),idempotencyKey:randomUUID(),schemaVersion:'0.1.0',target:{type:'abh.organization',id:org},payload:{validationRef:{...validationRef,type:'abh.pack-validation',version:1},snapshot:await stageLocalPackSnapshot(durable,candidate,options()),expectedDeploymentVersion:0}};
 const packRef=await stagePack(f.database,c,options(),stageCommand,durable,[grant.grantRef],checks);
 await checkStagedDiscovery(f,c,packRef,grant.grantRef);
 const inventory={complete:true,entries:[]};
 const store=async()=>{
  const data={ownerRef:packRef,mediaType:'application/json',content:canonicalJson(inventory),purposeNames:['abh.pack.manage'],dataClass:'abh.data.internal',sourceRefs:[validationRef],region:'local',retentionPolicyRef:ref('abh.artifact')};
  const cmd={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(data)};
  return (await f.database.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,cmd,data,async()=>{})).artifactRef))).receipt.resultRef;
 };
 const impact={issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+180000).toISOString(),packRef:{...packRef,type:'abh.installed-pack' as const,version:1 as const},deploymentVersion:1,compilerRef:{kind:'Compiler' as const,id:'org.example.compiler',version:'1.0.0',digest:pack.integrity.packageDigest},environmentDigest:environment.environmentDigest,baselineSourceRef:await store(),targetSourceRef:await store(),baseline:inventory,target:inventory,impact:await assessPackDataImpact(pack,inventory,inventory)};
 const compiler={...await keyConfig('compiler'),organizationId:org,compilerRef:impact.compilerRef,maxLifetimeMs:240000};
 const impactProof=await verifyImpactSignature(org,impact,await sign('compiler',impactSignaturePayload(org,impact),'impact'),compiler,options());
 let afterMigration=false,lateImpactCheck:()=>Promise<void>=async()=>{};
 const impactChecks={signer:async()=>compiler,source:async()=>{if(afterMigration)await lateImpactCheck();},fenceRefs:async()=>[],current:async(tx:import('../src/data/uow.ts').TenantTransaction,_r:unknown,e:import('../src/extensions/validation-reports.ts').StoredPackValidation)=>checks.current(tx,e)};
 const impactCommand:RecordPackDataImpactCommand={type:'abh.packs.record-data-impact',commandId:randomUUID(),idempotencyKey:randomUUID(),schemaVersion:'0.1.0',target:{type:'abh.organization',id:org},payload:{report:impact}};
 const impactRef=await recordPackDataImpact(f.database,c,options(),impactCommand,durable,[grant.grantRef],impactChecks,impactProof);
 const selectImpact=(environment=impact.environmentDigest,authorize:()=>Promise<void>=async()=>{},policy=impactChecks)=>f.database.transaction(c,options(),tx=>selectCurrentPackDataImpact(tx,options(),packRef,environment,impact.deploymentVersion,durable,[grant.grantRef],policy,async()=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},[grant.grantRef]);await authorize();}));
 const selectedImpact=await selectImpact();assert.equal(selectedImpact.status,'Selected');if(selectedImpact.status==='Selected')assert.deepEqual(selectedImpact.impactRef,impactRef);
 assert.equal((await selectImpact(('sha256:'+'0'.repeat(64)) as typeof impact.environmentDigest)).status,'Missing');
 await assert.rejects(selectImpact(('sha256:'+'0'.repeat(64)) as typeof impact.environmentDigest,async()=>{throw new Error('impact discovery denied');}),/impact discovery denied/);
 let selectionAdmissions=0,selectionWithdrawn=false;
 await assert.rejects(selectImpact(impact.environmentDigest,async()=>{if(++selectionAdmissions===2)selectionWithdrawn=true;},{...impactChecks,source:async()=>{if(selectionWithdrawn)throw new Error('impact source withdrawn after selection admission');}}),/impact source withdrawn after selection admission/);
 // A second independently recorded report must not be selected by ordering alone.
 const duplicateImpact=await recordPackDataImpact(f.database,c,options(),{...impactCommand,commandId:randomUUID(),idempotencyKey:randomUUID()},durable,[grant.grantRef],impactChecks,impactProof);
 try{assert.equal((await selectImpact()).status,'Ambiguous');}finally{await f.admin`DELETE FROM extension.data_impact_reports WHERE resource_organization_id=${org} AND id=${duplicateImpact.id}`;}
 const prepare=()=>f.database.transaction(c,options(),tx=>prepareInstalledPack(tx,options(),impactRef,durable,[grant.grantRef],impactChecks,{connection:target,steps:[step],signatures:links,admission:{...admission,supportingFacts:async(...args)=>{await admission.supportingFacts(...args);afterMigration=true;}}}));
 const prepared=await prepare();assert.equal(prepared.status,'MigrationPrepared');assert.equal(prepared.prepared!.content[0]!.sql,installedMigrationSql);assert.equal(prepared.impact.impact.status,'Required');
 // Hand-authored expected DDL is signed before the migration is executed.
 const structure:MigrationStructureExpectation={inventory:[{schema:'hello_domain',relations:[{name:'installed_items',kind:'r'}]}],tables:[{schema:'hello_domain',name:'installed_items',expected:{schema:'hello_domain',name:'installed_items',owner:'hello_migrator',kind:'r',rls:false,forceRls:false,partition:{key:null,bound:null,parents:[]},columns:[{name:'id',typeSchema:'pg_catalog',typeName:'int4',typeModifier:-1,notNull:true,identity:'',generated:'',defaultExpression:null},{name:'label',typeSchema:'pg_catalog',typeName:'text',typeModifier:-1,notNull:false,identity:'',generated:'',defaultExpression:"'new'::text"}],indexes:[{name:'installed_items_pkey',definition:'CREATE UNIQUE INDEX installed_items_pkey ON hello_domain.installed_items USING btree (id)',valid:true,ready:true,live:true,unique:true,primary:true,replicaIdentity:false}],constraints:[{name:'installed_items_pkey',type:'p',definition:'PRIMARY KEY (id)',validated:true,deferrable:false,initiallyDeferred:false}],policies:[],triggers:[]}}],sequences:[],views:[],acl:[{schema:'hello_domain',name:'installed_items',kind:'r',grants:['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].map(privilege=>({column:null,grantor:'hello_migrator',grantee:'hello_migrator',privilege,grantable:false}))}]};
 const structureReport={binding:{organizationId:org,packId:pack.metadata.id,packVersion:pack.metadata.version,packageDigest:pack.integrity.packageDigest,planDigest:await digestBytes(new TextEncoder().encode(canonicalJson([step]))),expectedDigest:await digestBytes(new TextEncoder().encode(canonicalJson(structure)))},environmentDigest:impact.environmentDigest,deploymentVersion:impact.deploymentVersion,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+180000).toISOString()};
 const structureBundle=await sign('admin',structureSignaturePayload(structureReport),'structure');
 const storeStructure=async(content:string,sourceRefs:import('@abh/contracts').EntityRef[]=[])=>{
  const data={ownerRef:packRef,mediaType:'application/json',content,purposeNames:['abh.pack.manage'],dataClass:'abh.data.internal',sourceRefs,region:'local',retentionPolicyRef:ref('abh.artifact')};
  const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(data)};
  return (await f.database.transaction(c,options(),tx=>executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,command,data,async()=>{})).artifactRef))).receipt.resultRef;
 };
 const structureRef=await storeStructure(structureSignaturePayload(structureReport)),structureBundleRef=await storeStructure(structureBundle.toString('utf8'),[structureRef]);
 const structureSigner={...await keyConfig('admin'),organizationId:org,packId:pack.metadata.id,maxLifetimeMs:240000};
 const inspectInstalled=async(source:()=>Promise<void>=async()=>{})=>{
  await target`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  try{return await f.database.transaction(c,{...options(),deadline:Date.now()+30000},tx=>verifyInstalledMigrationStructure(tx,{...options(),deadline:Date.now()+30000},impactRef,durable,[grant.grantRef],impactChecks,{connection:target,steps:[step],signatures:links,admission},structure,structureRef,structureBundleRef,{source,signer:async()=>structureSigner}));}
  finally{await target`ROLLBACK`;}
 };
 await assert.rejects(inspectInstalled(),{code:'PRECONDITION_FAILED'});
 await assert.rejects(inspectInstalled(async()=>{throw new Error('structure source withdrawn');}),/structure source withdrawn/);
 let structureSources=0;
 try{await assert.rejects(inspectInstalled(async()=>{if(++structureSources===4)lateImpactCheck=async()=>{throw new Error('installed impact withdrawn during inspection');};}),/installed impact withdrawn during inspection/);}
 finally{lateImpactCheck=async()=>{};}

 // Persist the actual prepared binding; this maintenance claim still does not execute SQL.
 const claimInput={organizationId:org,step:prepared.prepared!.content[0]!.step,environmentDigest:prepared.impact.environmentDigest,deploymentVersion:prepared.impact.deploymentVersion,impactRef,evidenceRefs:links.flatMap(link=>[link.reportRef,link.bundleRef])};
 const [claimed]=await claimPackMigrationAttempt(f.admin,prepared.installation.manifest,[claimInput]);
 assert.equal(claimed!.created,true);assert.equal(claimed!.record.packageDigest,prepared.prepared!.packageDigest);
 const [replayed]=await claimPackMigrationAttempt(f.admin,prepared.installation.manifest,[claimInput]);
 assert.equal(replayed!.created,false);assert.deepEqual(replayed!.record,claimed!.record);
 const executionTarget=await createTarget();let checkedActualResult=false;let delayedExecutionCheck:PromiseLike<unknown>|undefined;
 const executed=await f.database.transaction(c,options(),tx=>executeInstalledMigrationClaim(tx,executionTarget,options(),claimed!,durable,[grant.grantRef],impactChecks,{steps:[step],signatures:links,admission},async(record,sql)=>{
  assert.equal(record.packageDigest,pack.integrity.packageDigest);
  assert.equal((await sql`SELECT current_user AS role`)[0]!.role,'hello_migrator');checkedActualResult=true;delayedExecutionCheck=sql`SELECT 1`;
  const [created]=await sql`SELECT to_regclass('hello_domain.installed_items')::text AS name`;assert.equal(created!.name,'hello_domain.installed_items');
 }));
 assert.deepEqual(executed,{kind:'CommitAcknowledged',sqlStarted:true,connectionClosed:true});assert.equal(checkedActualResult,true);await assert.rejects(Promise.resolve(delayedExecutionCheck),{code:'DEPENDENCY_TIMEOUT'});
 const verifiedStructure=await inspectInstalled();assert.equal(verifiedStructure.matched,true);assert.deepEqual(verifiedStructure.tables!.results[0]!.actual,structure.tables[0]!.expected);
 const structureEvidence=await persistMigrationStructureResult(f.database,c,options(),verifiedStructure,{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref('abh.artifact')},async()=>{},async()=>{});
 await f.database.transaction(c,options(),async tx=>{const stored=await new InlineArtifactOwner().read(tx,structureEvidence,async()=>{});const observation=JSON.parse(new TextDecoder().decode(stored.bytes));assert.equal(observation[1].result.matched,true);assert.deepEqual(observation[1].result.tables.results[0].actual,structure.tables[0]!.expected);});
 await target`ALTER TABLE hello_domain.installed_items ALTER COLUMN label SET DEFAULT 'changed'`;
 try{const drift=await inspectInstalled();assert.equal(drift.matched,false);assert.deepEqual(drift.tables!.results[0]!.differences,['columns']);}finally{await target`ALTER TABLE hello_domain.installed_items ALTER COLUMN label SET DEFAULT 'new'`;}

 // The same installed migration must now validate actual rows, not only DDL.
 await target`INSERT INTO hello_domain.installed_items (id) VALUES (1),(2)`;
 const dataChecks:MigrationDataCheck[]=[{schema:'hello_domain',table:'installed_items',rowCount:'2',nonNull:['id','label'],uniqueKeys:[['id']]}];
 const dataReport:MigrationDataReport={...structureReport,binding:{...structureReport.binding,kind:'DataInvariants',expectedDigest:await digestBytes(new TextEncoder().encode(canonicalJson(dataChecks)))}};
 const dataBundle=await sign('admin',dataSignaturePayload(dataReport),'installed-data');
 const dataRef=await storeStructure(dataSignaturePayload(dataReport)),dataBundleRef=await storeStructure(dataBundle.toString('utf8'),[dataRef]);
 const inspectData=async(source:()=>Promise<void>=async()=>{})=>{
  await target`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  try{return await f.database.transaction(c,{...options(),deadline:Date.now()+30000},tx=>verifyInstalledMigrationData(tx,{...options(),deadline:Date.now()+30000},impactRef,durable,[grant.grantRef],impactChecks,{connection:target,steps:[step],signatures:links,admission},dataChecks,dataRef,dataBundleRef,{source,signer:async()=>structureSigner}));}finally{await target`ROLLBACK`;}
 };
 const inspectState=async(dataSource:()=>Promise<void>=async()=>{},structureSource:()=>Promise<void>=async()=>{},saved?:import('@abh/contracts').EntityRef,oldResult?:Awaited<ReturnType<typeof verifyInstalledMigrationState>>)=>{
  await target`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  try{return await f.database.transaction(c,{...options(),deadline:Date.now()+30000},async tx=>{
   const inspect=()=>verifyInstalledMigrationState(tx,{...options(),deadline:Date.now()+30000},impactRef,durable,[grant.grantRef],impactChecks,{connection:target,steps:[step],signatures:links,admission},{expectation:structure,reportRef:structureRef,bundleRef:structureBundleRef,sources:{source:structureSource,signer:async()=>structureSigner}},{expectation:dataChecks,reportRef:dataRef,bundleRef:dataBundleRef,sources:{source:dataSource,signer:async()=>structureSigner}});
   if(saved)return (await readRevalidatedMigrationState(tx,{...options(),deadline:Date.now()+30000},saved,[structureRef,structureBundleRef,dataRef,dataBundleRef],()=>oldResult?Promise.resolve(oldResult):inspect(),async()=>{})).current;
   return inspect();
  });}finally{await target`ROLLBACK`;}
 };
 const stateRetention={dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref('abh.artifact')};
 const ownedInspect=(tx:import('../src/data/uow.ts').TenantTransaction,sql:postgres.ReservedSql,ownedOptions:import('../src/data/uow.ts').TransactionOptions)=>verifyInstalledMigrationState(tx,ownedOptions,impactRef,durable,[grant.grantRef],impactChecks,{connection:sql,steps:[step],signatures:links,admission},{expectation:structure,reportRef:structureRef,bundleRef:structureBundleRef,sources:{source:async()=>{},signer:async()=>structureSigner}},{expectation:dataChecks,reportRef:dataRef,bundleRef:dataBundleRef,sources:{source:async()=>{},signer:async()=>structureSigner}});
 const inspectionConfiguration=():PackInspectionPreparation=>({root:durable,targetUrl,environmentDigest:impact.environmentDigest,grants:[grant.grantRef],impact:impactChecks,select:async tx=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},[grant.grantRef]);},migration:{steps:[step],signatures:links,admission},structure:{expectation:structure,reportRef:structureRef,bundleRef:structureBundleRef,sources:{source:async()=>{},signer:async()=>structureSigner}},data:{expectation:dataChecks,reportRef:dataRef,bundleRef:dataBundleRef,sources:{source:async()=>{},signer:async()=>structureSigner}},observation:{retention:stateRetention,admit:async()=>{},read:async()=>{}},recoveryDiscovery:{admission:{fenceRefs:async()=>[],admit:async()=>{},read:async()=>{}}}});
 assert.ok(selectedImpact.status==='Selected');
 const installation=selectedImpact.recovered.installation();
 await checkPackInspectionRequest(f,c,installation,grant.grantRef);
 await checkPackInspectionCancellation(f,c,installation,grant.grantRef);
 const initialInspection=await preparePackInspection(f.database,c,{...options(),deadline:Date.now()+30000},installation,inspectionConfiguration());
 assert.ok(initialInspection.status==='Ready');
 const installedRun=await runInstalledMigrationInspection(f.database,c,{...options(),deadline:Date.now()+30000},initialInspection.target,initialInspection.run);
 const combined=installedRun.state;assert.equal(installedRun.recovered,false);assert.equal(combined.matched,true);assert.equal(combined.structure.matched,true);assert.equal(combined.data.matched,true);
 const observationBinding:MigrationStateDiscoveryBinding={packRef,packageDigest:pack.integrity.packageDigest,environmentDigest:impact.environmentDigest,deploymentVersion:impact.deploymentVersion,sources:[structureRef,structureBundleRef,dataRef,dataBundleRef]};
 const conflicts=inspectionConfiguration();
 conflicts.observation.recovery={artifactRef:installedRun.observationRef,sources:observationBinding.sources};
 await assert.rejects(preparePackInspection(f.database,c,options(),installation,conflicts),{code:'INVALID_ARGUMENT'});
 await checkMigrationStateDiscovery(f,c,observationBinding,grant.grantRef,installedRun.observationRef,async()=>{
  for(const [maxScanned,status] of [[20,'ObservationAmbiguous'],[1,'ObservationSearchIncomplete']] as const){
   const configuration=inspectionConfiguration();configuration.targetUrl='blocked selection must not acquire a target';configuration.recoveryDiscovery!.maxScanned=maxScanned;
   assert.deepEqual(await preparePackInspection(f.database,c,{...options(),deadline:Date.now()+30000},installation,configuration),{status});
  }
 });
 const workerStop=new AbortController();let workerObserved=false;
 const workerContext=deriveVerifiedContext({...c.tenant,correlationId:randomUUID(),receivedAt:new Date().toISOString(),authnStrength:{level:'SingleFactor'},actor:{type:'Service',id:c.tenant.actor.id}});
 await f.admin`UPDATE identity.principals SET identity_kind='Service' WHERE resource_organization_id=${org} AND id=${c.tenant.actor.id}`;
 try{
  await checkPackInspectionLeases(f,workerContext,installation,grant.grantRef);
  const runningInspection=await checkPackInspectionStart(f,workerContext,installation,grant.grantRef);
  await checkPackInspectionExpiry(f,workerContext,runningInspection,grant.grantRef);
  const waitingInspection=await checkPackInspectionWaiting(f,workerContext,installation,grant.grantRef,async()=>{
   const configuration=inspectionConfiguration();configuration.environmentDigest='sha256:'+'0'.repeat(64);configuration.targetUrl='blocked selection must not acquire a target';
   const blocked=await preparePackInspection(f.database,workerContext,options(),installation,configuration);assert.notEqual(blocked.status,'Ready');if(blocked.status==='Ready')throw new Error('expected blocked');return blocked;
  });

  await checkPackInspectionCancellation(f,workerContext,installation,grant.grantRef,waitingInspection);
  const hostedLease=await claimPackInspectionLease(f.database,workerContext,options(),installation,[grant.grantRef],randomUUID());
  const leaseBinding={installation,grants:[grant.grantRef],token:hostedLease};
  const hostedInspection:NonNullable<TenantRuntimeOptions['packInspection']>={context:async()=>workerContext,grants:[grant.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true},prepare:async(candidate,scoped)=>{
   assert.deepEqual(candidate.packRef,packRef);
   const configuration=inspectionConfiguration();configuration.observation.lease=structuredClone(leaseBinding);
   const absent={...configuration,targetUrl:'invalid target must never be opened',environmentDigest:('sha256:'+'0'.repeat(64)) as typeof impact.environmentDigest};
   assert.deepEqual(await preparePackInspection(f.database,workerContext,scoped,candidate,absent),{status:'Missing'});
   await assert.rejects(preparePackInspection(f.database,workerContext,scoped,candidate,{...absent,select:async()=>{throw new Error('inspection selection denied');}}),/inspection selection denied/);
   const prepared=preparePackInspection(f.database,workerContext,scoped,candidate,configuration);
   configuration.targetUrl='replaced URL must not be used';configuration.grants=[];configuration.observation.lease!.token.workerId=randomUUID();
   configuration.recoveryDiscovery!.maxScanned=0;configuration.recoveryDiscovery!.admission.read=async()=>assert.fail('replaced discovery reader must not run');
   configuration.select=async()=>assert.fail('replaced selection must not run');
   configuration.structure.sources.signer=async()=>{throw new Error('replaced structure signer must not run');};
   configuration.observation.read=async()=>assert.fail('replaced observation reader must not run');
   return prepared;
  },onObservation:async(_candidate,result)=>{assert.equal(result.recovered,true);assert.deepEqual(result.observationRef,installedRun.observationRef);assert.equal(result.state.matched,true);workerObserved=true;},onPage:async result=>{assert.equal(result.scanned,1);assert.equal(result.observed,1);assert.equal(result.mismatched,0);workerStop.abort();}};
  // Exercise the real optional Pack loop produced by the tenant host. Other
  // installed loops have separate integration fixtures and are not started here.
  const hostLoops=createTenantRuntimeLoops(f.database,{recovery:{},publisher:{},consumption:{},packInspection:hostedInspection} as Omit<TenantRuntimeOptions,'signal'>);
  hostedInspection.context=async()=>{throw new Error('replaced context must not run');};
  hostedInspection.prepare=async()=>{throw new Error('replaced preparation must not run');};
  hostedInspection.discovery.canRead=async()=>false;
  hostedInspection.grants=[];hostedInspection.pageSize=0;
  await joinRuntimeLoops(workerStop.signal,[hostLoops[0]!]);
  assert.equal(workerObserved,true);
  await releasePackInspectionLease(f.database,workerContext,options(),installation,[grant.grantRef],hostedLease);
  await assert.rejects(runInstalledMigrationInspection(f.database,workerContext,{...options(),deadline:Date.now()+30000},await createTarget(),{inspect:ownedInspect,retention:stateRetention,admit:async()=>{},read:async()=>{},recovery:{artifactRef:installedRun.observationRef,sources:[structureRef,structureBundleRef,dataRef,dataBundleRef]},lease:leaseBinding}),{code:'PRECONDITION_FAILED'});
  await checkPackInspectionFencing(f,workerContext,installation,grant.grantRef,async()=>{
   const limits={...options(),deadline:Date.now()+30000};
   return f.database.transaction(workerContext,limits,async tx=>inspectMigrationTarget(tx,await createTarget(),limits,(sql,scoped)=>ownedInspect(tx,sql,scoped)));
  },stateRetention);

  await checkPackInspectionLifecycle(f,workerContext,installation,grant.grantRef,(candidate,scoped)=>preparePackInspection(f.database,workerContext,scoped,candidate,inspectionConfiguration()),installedRun.observationRef);
  // Blocked candidates produce individual diagnostics without acquiring a target.
  for(const status of ['Missing','Ambiguous','ObservationAmbiguous','ObservationSearchIncomplete'] as const){
   const stop=new AbortController();let reported=0;
   const blocked:NonNullable<TenantRuntimeOptions['packInspection']>={context:async()=>workerContext,grants:[grant.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true},prepare:async()=>({status}),
    onBlocked:async function(candidate,reason){assert.equal(this,blocked);assert.deepEqual(candidate.packRef,packRef);assert.deepEqual(reason,{status});reported++;candidate.packRef.id=randomUUID();},
    onObservation:async()=>assert.fail('blocked candidate cannot produce evidence'),
    onPage:async page=>{assert.deepEqual(page,{scanned:1,observed:0,mismatched:0,missing:status==='Missing'?1:0,ambiguous:status==='Ambiguous'?1:0,observationAmbiguous:status==='ObservationAmbiguous'?1:0,observationSearchIncomplete:status==='ObservationSearchIncomplete'?1:0,leaseBusy:0});stop.abort();}};
   const loops=createTenantRuntimeLoops(f.database,{recovery:{},publisher:{},consumption:{},packInspection:blocked} as Omit<TenantRuntimeOptions,'signal'>);
   blocked.onBlocked=async()=>assert.fail('replaced diagnostic must not run');
   await joinRuntimeLoops(stop.signal,[loops[0]!]);assert.equal(reported,1);
  }
  const diagnosticStop=new AbortController();let diagnosticSignal:AbortSignal|undefined;
  await runPackInspectionWorker(f.database,{signal:diagnosticStop.signal,context:async()=>workerContext,grants:[grant.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true},prepare:async()=>({status:'Missing'}),onBlocked:async(_candidate,_reason,limits)=>{diagnosticSignal=limits.signal;diagnosticStop.abort();return new Promise<void>(()=>{});},onPage:async()=>assert.fail('cancelled diagnostic cannot finish page')});
  assert.equal(diagnosticSignal?.aborted,true);
  let refreshed=0,closedOnIdentity=0;
  await assert.rejects(runPackInspectionWorker(f.database,{signal:new AbortController().signal,context:async()=>++refreshed===1?workerContext:c,grants:[grant.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true},prepare:async()=>{
   const acquired=await createTarget();return {status:'Ready',target:{connection:acquired.connection,dispose:async()=>{closedOnIdentity++;await acquired.dispose();}},run:{inspect:ownedInspect,retention:stateRetention,admit:async()=>{},read:async()=>{}}};
  }}),{code:'FORBIDDEN'});assert.equal(closedOnIdentity,1);
  const cancelledWorker=new AbortController();let closedLate!:()=>void;const lateClosed=new Promise<void>(resolve=>{closedLate=resolve;});
  await runPackInspectionWorker(f.database,{signal:cancelledWorker.signal,context:async()=>workerContext,grants:[grant.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true},prepare:async()=>{
   const acquired=await createTarget();cancelledWorker.abort();return {status:'Ready',target:{connection:acquired.connection,dispose:async()=>{try{await acquired.dispose();}finally{closedLate();}}},run:{inspect:ownedInspect,retention:stateRetention,admit:async()=>{},read:async()=>{}}};
  },onObservation:async()=>{assert.fail('cancelled preparation cannot inspect');}});await lateClosed;
  try{
   await checkPackInspectionCompletion(f,workerContext,installation,grant.grantRef,async(binding,mismatch)=>{
    await target`UPDATE hello_domain.installed_items SET label=${mismatch?null:'new'} WHERE id=2`;
    return runInstalledMigrationInspection(f.database,workerContext,{...options(),deadline:Date.now()+30000},await createTarget(),{inspect:ownedInspect,retention:stateRetention,admit:async()=>{},read:async()=>{},lease:binding});
   },installedRun);
  }finally{await target`UPDATE hello_domain.installed_items SET label='new' WHERE id=2`;}


  await checkPackInspectionJobExecution(f,workerContext,installation,grant.grantRef,inspectionConfiguration);
 }finally{await f.admin`UPDATE identity.principals SET identity_kind='Human' WHERE resource_organization_id=${org} AND id=${c.tenant.actor.id}`;}
 const persistState=(value=combined)=>persistMigrationState(f.database,c,options(),value,stateRetention,async()=>{},async()=>{});
 await assert.rejects(persistState({...combined}),{code:'PRECONDITION_FAILED'});
 combined.matched=false;await assert.rejects(persistState(),{code:'PRECONDITION_FAILED'});combined.matched=true;
 const originalData=combined.data;combined.data={...combined.data};await assert.rejects(persistState(),{code:'PRECONDITION_FAILED'});combined.data=originalData;
 const stateEvidence=await persistState();assert.deepEqual(stateEvidence,installedRun.observationRef);assert.deepEqual(await persistState(),stateEvidence);
 await assert.rejects(persistMigrationState(f.database,c,options(),combined,stateRetention,async()=>{throw new Error('combined persistence source withdrawn');},async()=>{}),/combined persistence source withdrawn/);
 const recoverState=async(saved=stateEvidence,oldResult?:typeof combined)=>{
  const result=await runInstalledMigrationInspection(f.database,c,{...options(),deadline:Date.now()+30000},await createTarget(),{inspect:oldResult?async()=>oldResult:ownedInspect,retention:stateRetention,admit:async()=>{},read:async()=>{},recovery:{artifactRef:saved,sources:[structureRef,structureBundleRef,dataRef,dataBundleRef]}});
  assert.equal(result.recovered,true);assert.deepEqual(result.observationRef,saved);return result.state;
 };
 assert.equal((await recoverState()).matched,true);
 await assert.rejects(recoverState(stateEvidence,combined),{code:'PRECONDITION_FAILED'});
 let withdrawn=false;
 await assert.rejects(inspectState(async()=>{withdrawn=true;},async()=>{if(withdrawn)throw new Error('structure source withdrawn during combined data check');}),/structure source withdrawn during combined data check/);
 let restarted=false;
 await assert.rejects(inspectState(async()=>{if(!restarted){restarted=true;await target`ROLLBACK`;await target`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;}}),{code:'PRECONDITION_FAILED'});
 const checkedData=await inspectData();assert.equal(checkedData.matched,true);assert.equal(checkedData.results[0]!.rowCount,'2');assert.equal(checkedData.binding.packageDigest,pack.integrity.packageDigest);
 const dataRetention={dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref('abh.artifact')};
 const persistData=(value=checkedData)=>persistMigrationDataResult(f.database,c,options(),value,dataRetention,async()=>{},async()=>{});
 await assert.rejects(persistData({...checkedData}),{code:'PRECONDITION_FAILED'});
 checkedData.results[0]!.rowCount='3';
 await assert.rejects(persistData(),{code:'PRECONDITION_FAILED'});checkedData.results[0]!.rowCount='2';
 const dataEvidence=await persistData();assert.deepEqual(await persistData(),dataEvidence);
 const recoverData=async(stale=false,observationRef:import('@abh/contracts').EntityRef=dataEvidence)=>{
  await target`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  try{return await f.database.transaction(c,{...options(),deadline:Date.now()+30000},tx=>readRevalidatedDataResult(tx,options(),observationRef,dataRef,dataBundleRef,()=>stale?Promise.resolve(checkedData):verifyInstalledMigrationData(tx,{...options(),deadline:Date.now()+30000},impactRef,durable,[grant.grantRef],impactChecks,{connection:target,steps:[step],signatures:links,admission},dataChecks,dataRef,dataBundleRef,{source:async()=>{},signer:async()=>structureSigner}),async()=>{}));}finally{await target`ROLLBACK`;}
 };
 const savedData=await f.database.transaction(c,options(),async tx=>JSON.parse(new TextDecoder().decode((await new InlineArtifactOwner().read(tx,dataEvidence,async()=>{})).bytes)));
 savedData[1].result.results[0].rowCount='9223372036854775808';
 const invalidDataEvidence=await storeStructure(canonicalJson(savedData),[dataRef,dataBundleRef]);
 await assert.rejects(recoverData(false,invalidDataEvidence),{code:'PRECONDITION_FAILED'});
 assert.equal((await recoverData()).current.matched,true);
 await assert.rejects(recoverData(true),{code:'PRECONDITION_FAILED'});
 await target`UPDATE hello_domain.installed_items SET label=NULL WHERE id=2`;
 try{await assert.rejects(recoverState(),{code:'PRECONDITION_FAILED'});const combinedDrift=await inspectState();assert.equal(combinedDrift.matched,false);assert.equal(combinedDrift.structure.matched,true);assert.equal(combinedDrift.data.matched,false);const driftState=await persistState(combinedDrift);assert.equal((await recoverState(driftState)).matched,false);await assert.rejects(recoverData(),{code:'PRECONDITION_FAILED'});const drift=await inspectData();assert.equal(drift.matched,false);const driftRef=await persistData(drift);await f.database.transaction(c,options(),async tx=>{const stored=await new InlineArtifactOwner().read(tx,driftRef,async()=>{});assert.equal(JSON.parse(new TextDecoder().decode(stored.bytes))[1].result.matched,false);});assert.equal(drift.results[0]!.nulls[1]!.count,'1');assert.equal((await inspectInstalled()).matched,true);}finally{await target`UPDATE hello_domain.installed_items SET label='new' WHERE id=2`;}
 let dataSources=0;
 try{await assert.rejects(inspectData(async()=>{if(++dataSources===4)lateImpactCheck=async()=>{throw new Error('installed impact withdrawn during data verification');};}),/installed impact withdrawn during data verification/);}finally{lateImpactCheck=async()=>{};}
 const retain={dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref('abh.artifact')};
 const persist=(value=executed)=>persistMigrationExecutionResult(f.database,f.admin,c,options(),value,retain,async()=>{},async()=>{});
 await assert.rejects(persist({...executed}),{code:'PRECONDITION_FAILED'});
 await f.admin`CREATE FUNCTION extension.fail_execution_observation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected observation persistence failure'; END$$`;
 await f.admin`CREATE TRIGGER fail_execution_observation BEFORE INSERT ON extension.migration_observations FOR EACH ROW EXECUTE FUNCTION extension.fail_execution_observation()`;
 try{await assert.rejects(persist(),{code:'P0001'});}finally{await f.admin`DROP TRIGGER fail_execution_observation ON extension.migration_observations`;await f.admin`DROP FUNCTION extension.fail_execution_observation()`;}
 const counts=await f.admin`SELECT count(*)::integer AS n FROM data.artifacts WHERE record->'ownerRef'->>'id'=${claimed!.record.attemptRef.id}`;
 assert.equal(counts[0]!.n,1);
 const [orphan]=await f.admin`SELECT record FROM data.artifacts WHERE record->'ownerRef'->>'id'=${claimed!.record.attemptRef.id}`;
 const orphanRef=orphan!.record.artifactRef;
 const recover=()=>recoverMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,orphanRef,{authorize:async()=>{},source:async()=>{}});
 await assert.rejects(recoverMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,orphanRef,{authorize:async()=>{throw new Error('recovery authority denied');},source:async()=>{}}),/recovery authority denied/);
 await assert.rejects(recoverMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,orphanRef,{authorize:async()=>{},source:async()=>{throw new Error('capture producer denied');}}),/capture producer denied/);
 try{
  await assert.rejects(recoverMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,orphanRef,{authorize:async()=>{},source:async()=>{
   await f.admin`UPDATE extension.migration_attempts SET record=jsonb_set(record,'{deploymentVersion}','99') WHERE id=${claimed!.record.attemptRef.id}`;
  }}),{code:'VERSION_CONFLICT'});
 }finally{await f.admin`UPDATE extension.migration_attempts SET record=${JSON.stringify(claimed!.record)}::text::jsonb WHERE id=${claimed!.record.attemptRef.id}`;}
 assert.equal((await f.admin`SELECT count(*)::integer AS n FROM extension.migration_observations WHERE attempt_id=${claimed!.record.attemptRef.id}`)[0]!.n,0);
 const recoveredObservation=await recover();assert.equal(recoveredObservation.observation.kind,'CommitAcknowledged');assert.deepEqual(await recover(),recoveredObservation);
 const savedResult=await persist();assert.deepEqual(savedResult,recoveredObservation);assert.equal(savedResult.observation.kind,'CommitAcknowledged');
 assert.deepEqual(await persist(),savedResult);
 assert.equal((await f.admin`SELECT count(*)::integer AS n FROM data.artifacts WHERE record->'ownerRef'->>'id'=${claimed!.record.attemptRef.id}`)[0]!.n,1);
 const resultBody=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,savedResult.artifactRef,async()=>{}));
 const envelope=JSON.parse(new TextDecoder().decode(resultBody.bytes));assert.equal(envelope[0],'abh-pack-migration-execution-v1');assert.deepEqual(envelope[1].result,executed);assert.deepEqual(envelope[1].attempt,claimed!.record);
 const readStored=(expected=claimed!.record)=>f.database.transaction(c,options(),tx=>readStoredMigrationExecutionResult(tx,savedResult.artifactRef,expected,async()=>{}));
 const restored=await readStored();assert.deepEqual(restored.result,executed);assert.deepEqual(restored.attempt,claimed!.record);
 await assert.rejects(persist(restored.result),{code:'PRECONDITION_FAILED'});
 await assert.rejects(readStored({...claimed!.record,deploymentVersion:99}),{code:'PRECONDITION_FAILED'});
 await assert.rejects(f.database.transaction(c,options(),tx=>readStoredMigrationExecutionResult(tx,savedResult.artifactRef,claimed!.record,async()=>{throw new Error('recovery source denied');})),/recovery source denied/);
 restored.result.kind='OutcomeUnknown';assert.equal((await readStored()).result.kind,'CommitAcknowledged');
 const replaceResult=async(content:string)=>{
  const bytes=new TextEncoder().encode(content),digest=await digestBytes(bytes),record={...resultBody.record,sizeBytes:bytes.length,contentDigest:digest};
  await f.admin`UPDATE data.artifacts SET inline_body=${bytes},content_digest=${digest},record=${JSON.stringify(record)}::text::jsonb WHERE id=${savedResult.artifactRef.id}`;
 };
 // Recompute Artifact hashes so rejection tests the result envelope itself.
 for(const change of [
  (v:any)=>{v[0]='untrusted-domain';},
  (v:any)=>{v[1].result.kind='Verified';},
  (v:any)=>{v[1].result.sqlStarted=false;},
  (v:any)=>{v[1].result.retryAllowed=true;},
  (v:any)=>{v[1].observedAt='2999-01-01T00:00:00Z';},
  (v:any)=>{v[1].attempt.environmentDigest='sha256:'+'f'.repeat(64);},
 ]){
  const changed=structuredClone(envelope);change(changed);
  try{await replaceResult(canonicalJson(changed));await assert.rejects(readStored(),{code:'PRECONDITION_FAILED'});}finally{await replaceResult(canonicalJson(envelope));}
 }
 try{await replaceResult(JSON.stringify(envelope,null,2));await assert.rejects(readStored(),{code:'PRECONDITION_FAILED'});}finally{await replaceResult(canonicalJson(envelope));}

 await run(['generate-key-pair','--output-key-prefix',join(root,'installed-capture')]);
 // This joint fixture also runs inspection workers and failure recovery before signing the original result.
 // Keep their runtime outside the freshness test; the explicit maxAgeMs:1 case below still rejects stale evidence.
 const captureKey={...await keyConfig('capture'),organizationId:org,packId:pack.metadata.id,maxAgeMs:300000};
 const signedResult=envelope[1];const resultBundle=await sign('capture',migrationResultSignaturePayload(signedResult),'execution-result');
 const resultProof=await verifyMigrationResultSignature(signedResult,resultBundle,captureKey,options());
 assert.deepEqual(resultProof.record(),signedResult);assert.deepEqual(matchMigrationResultSignature(resultProof,signedResult).record,signedResult);
 assert.throws(()=>matchMigrationResultSignature({...resultProof},signedResult),{code:'FORBIDDEN'});
 const changedResult=structuredClone(signedResult);changedResult.result.kind='OutcomeUnknown';
 assert.throws(()=>matchMigrationResultSignature(resultProof,changedResult),{code:'FORBIDDEN'});
 await assert.rejects(verifyMigrationResultSignature(changedResult,resultBundle,captureKey,options()));
 for(const patch of [{organizationId:randomUUID()},{packId:'org.other.pack'}])await assert.rejects(verifyMigrationResultSignature(signedResult,resultBundle,{...captureKey,...patch},options()),{code:'FORBIDDEN'});
 await assert.rejects(verifyMigrationResultSignature(signedResult,resultBundle,{...captureKey,...await keyConfig('compiler')},options()));
 await assert.rejects(verifyMigrationResultSignature(signedResult,resultBundle,{...captureKey,maxAgeMs:1},options()),{code:'PRECONDITION_FAILED'});
 const proofCopy=matchMigrationResultSignature(resultProof,signedResult);proofCopy.bundle.fill(0);proofCopy.record.result.kind='OutcomeUnknown';assert.deepEqual(resultProof.record(),signedResult);
 const bundlePayload={...retain,ownerRef:claimed!.record.attemptRef,mediaType:'application/json',content:new TextDecoder().decode(resultBundle),purposeNames:['abh.pack.manage'],sourceRefs:[savedResult.artifactRef]};
 const bundleCommand={commandId:randomUUID(),type:'abh.artifacts.store-inline',idempotencyKey:randomUUID(),digest:await inputDigest(bundlePayload)};
 const bundleArtifact=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().store(tx,bundleCommand,bundlePayload,async()=>{}));
 const signedAdmission={signer:async()=>captureKey,source:async()=>{}};
 const readSigned=(checks:import('../src/extensions/read-signed-migration-result.ts').SignedMigrationResultAdmission=signedAdmission)=>f.database.transaction(c,options(),tx=>readSignedMigrationExecutionResult(tx,options(),claimed!.record,savedResult.artifactRef,bundleArtifact.artifactRef,checks));
 assert.deepEqual((await readSigned()).record,signedResult);
 const signedRecover=()=>recoverSignedMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,savedResult.artifactRef,bundleArtifact.artifactRef,async()=>{},signedAdmission);
 assert.deepEqual(await signedRecover(),savedResult);
 let recoveryKeyReads=0;
 await assert.rejects(recoverSignedMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,savedResult.artifactRef,bundleArtifact.artifactRef,async()=>{},{...signedAdmission,signer:async()=>{
  if(++recoveryKeyReads===3)throw new Error('capture key revoked after observation lookup');return captureKey;
 }}),/capture key revoked after observation lookup/);

 await assert.rejects(recoverSignedMigrationObservation(f.database,f.admin,c,options(),claimed!.record.attemptRef,savedResult.artifactRef,bundleArtifact.artifactRef,async()=>{throw new Error('signed recovery denied');},signedAdmission),/signed recovery denied/);

 let keyReads=0;
 await assert.rejects(readSigned({...signedAdmission,signer:async()=>++keyReads===1?captureKey:{...captureKey,maxAgeMs:60000}}),{code:'VERSION_CONFLICT'});
 for(const rejected of ['Result','Bundle'] as const){
  let seen=0;
  await assert.rejects(readSigned({...signedAdmission,source:async(_artifact,role)=>{if(role===rejected&&++seen===2)throw new Error('late capture source revoked');}}),/late capture source revoked/);
 }
 await f.admin`UPDATE data.artifacts SET inline_body=${new TextEncoder().encode('{}')} WHERE id=${bundleArtifact.artifactRef.id}`;
 try{await assert.rejects(readSigned());await assert.rejects(signedRecover());}finally{await f.admin`UPDATE data.artifacts SET inline_body=${resultBundle} WHERE id=${bundleArtifact.artifactRef.id}`;}
 const replayTarget=await createTarget();
 assert.equal((await f.database.transaction(c,options(),tx=>executeInstalledMigrationClaim(tx,replayTarget,options(),replayed!,durable,[grant.grantRef],impactChecks,{steps:[step],signatures:links,admission},async()=>{throw new Error('replay must not verify or execute');}))).sqlStarted,false);
 afterMigration=false;lateImpactCheck=async()=>{await f.admin`ALTER ROLE hello_migrator BYPASSRLS`;};
 try{await assert.rejects(prepare(),{code:'FORBIDDEN'});}finally{await f.admin`ALTER ROLE hello_migrator NOBYPASSRLS`;lateImpactCheck=async()=>{};afterMigration=false;}
 const reviewLifetime=admission.maxLifetimeMs.Review;
 lateImpactCheck=async()=>{Object.assign(admission.maxLifetimeMs,{Review:reviewLifetime+1});};
 try{await assert.rejects(prepare(),{code:'VERSION_CONFLICT'});}finally{Object.assign(admission.maxLifetimeMs,{Review:reviewLifetime});lateImpactCheck=async()=>{};afterMigration=false;}
 await writeFile(join(durable,stageCommand.payload.snapshot.id,'payload/migration.sql'),'SELECT 2;');await assert.rejects(prepare(),{code:'PRECONDITION_FAILED'});
 await writeFile(join(durable,stageCommand.payload.snapshot.id,'payload/migration.sql'),installedMigrationSql);
 await f.admin`UPDATE control.grants SET status='Revoked',record=jsonb_set(record,'{status}','"Revoked"') WHERE id=${grant.grantRef.id}`;
 await assert.rejects(prepare());
}
