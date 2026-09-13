import {preparePackCapabilityResolution,resolvePreparedPackCapability} from '../src/extensions/prepare-pack-capability-resolution.ts';
import {lockPackCapabilityDeployment} from '../src/extensions/query-pack-capabilities.ts';
import {lockFences} from '../src/control/fences.ts';
import {createAbhClient,AbhClientError} from '@abh/core/client';
import {IdentityIngress} from '../src/identity/ingress.ts';
import {createCoreHttpApp} from '../src/server/http.ts';
import {CoreError} from '../src/internal/errors.ts';
import {resolvePackCapability} from '../src/extensions/resolve-pack-capability.ts';
import {StaticReleaseOwner} from '../src/release/static.ts';
import {inputDigest} from '../src/data/journal.ts';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {GrantRecord,QueryPackCapabilitiesQuery} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract,digestPackManifest} from '@abh/contracts/digest';
import {contract} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {queryPackCapabilities} from '../src/extensions/query-pack-capabilities.ts';
import {PackCapabilityRegistryOwner} from '../src/extensions/capability-registry.ts';
import {preparePackCapabilities} from '../src/extensions/prepare-pack-capabilities.ts';
import {InstalledPackOwner} from '../src/extensions/installed-packs.ts';
import {packManifest} from './pack-fixture.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1});
test('business capability discovery sees only Enabled candidates under an independent current Grant',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());const business=context(),manage=deriveVerifiedContext({...business.request,purposeOfUse:'abh.pack.manage'}),org=business.tenant.resourceOrganizationId;
 const principal={type:'abh.principal' as const,id:business.tenant.actor.id,version:1},scope={type:'abh.organization',id:org,version:1},digest='sha256:'+'a'.repeat(64),now=Date.now();
 const grant:GrantRecord={grantRef:ref('abh.grant'),principalRef:principal,resourceOrganizationId:org,scopeRefs:[scope],actionTypes:['abh.capabilities.read'],purposeNames:['abh.action.prepare','abh.action.execute','abh.operation.reconcile'],validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+60000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
 await f.database.transaction(manage,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Registry test','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Reader','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  for(const target of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
 });
 const base=await packManifest(),raw={...base,capabilities:{provides:['1.0.0','1.1.0','2.0.0-beta.1'].map(version=>({kind:'abh.tool',id:'org.example.hello.tool',version})),requires:[]},permissions:{...base.permissions,purposes:['abh.action.safety-stop']}};
 const {signaturePayload:_,...digests}=await digestPackManifest(raw),manifest=contract('PackManifest',{...raw,integrity:{...raw.integrity,...digests}}),packRef=ref('abh.installed-pack');
 const policy={abhVersion:'0.1.0',packId:manifest.metadata.id,allowedModes:['Declarative'],allowedLicenses:['Apache-2.0'],permissions:manifest.permissions,hostProfileRefs:[],sharedNamespaces:[]};
 const common={executable:'/fixture/cosign',mode:'OfflinePublicKey',publicKeyPem:await readFile(new URL('./fixtures/pack-signature/signer.pub',import.meta.url),'utf8'),packId:manifest.metadata.id};
 const trust={signer:common,provenance:{...common,subjectName:'payload',builderId:'fixture',buildType:'fixture',source:{uri:'fixture',digest:{sha256:'a'}}},conformance:{...common,subjectName:'payload',suiteVersion:'1.0.0',environment:{profile:'Domain',environmentDigest:digest,fixtureSetDigest:digest,seed:'42'},cases:[{caseId:'abh.test.integrity',status:'Passed'}],claimedCapabilities:[],maxAgeMs:60000}};
 const governance=contract('PackGovernanceSnapshot',{policyRef:ref('abh.pack-trust-policy'),policy,trust,revokedPackIds:[],revokedDigests:[],reservedVersions:[]});
 const governanceDigest=await digestBytes(new TextEncoder().encode(canonicalJson(governance)));
 const validation=contract('PackValidationReport',{packId:manifest.metadata.id,packVersion:manifest.metadata.version,subjectDigest:manifest.integrity.packageDigest,manifestDigest:manifest.integrity.manifestDigest,artifactSetDigest:manifest.integrity.artifactSetDigest,deploymentPolicyDigest:await digestBytes(new TextEncoder().encode(canonicalJson({deployment:policy,trust}))),signatureBundleDigest:digest,provenanceBundleDigest:digest,conformanceBundleDigest:digest,conformanceReportDigest:digest,validatedAt:new Date(now).toISOString(),validUntil:grant.validUntil,profile:'LocalOfflinePublicKey',reportDigest:digest});
 validation.reportDigest=await digestContract('PackValidationReport',validation);
 const staged=contract('InstalledPackRecord',{packRef,manifest,snapshot:{id:randomUUID(),metadataDigest:digest},validationRef:ref('abh.pack-validation'),reportDigest:validation.reportDigest,governanceRef:governance.policyRef,governanceDigest,deploymentVersion:1,status:'Staged',stagedAt:new Date(now).toISOString()});
 // Admin-seeded metadata fixture; this test does not claim real signature/Enable validation.
 await f.database.transaction(manage,options(),async tx=>{
  await tx.owner('PackLoader')`INSERT INTO extension.installed_packs(resource_organization_id,id,purpose_names,record,pack_id,pack_version,package_digest,deployment_version) VALUES (${org},${packRef.id},ARRAY['abh.pack.manage'],${JSON.stringify(staged)}::text::jsonb,${manifest.metadata.id},${manifest.metadata.version},${manifest.integrity.packageDigest},1)`;
  await tx.owner('PackLoader')`INSERT INTO extension.validation_reports(resource_organization_id,id,purpose_names,record,governance_ref,governance_digest,report_digest) VALUES (${org},${staged.validationRef.id},ARRAY['abh.pack.manage'],${JSON.stringify(validation)}::text::jsonb,${JSON.stringify(governance.policyRef)}::text::jsonb,${governanceDigest},${validation.reportDigest})`;
  const document={organizationId:org,issuedAt:grant.validFrom,expiresAt:grant.validUntil,snapshot:governance};
  await tx.owner('PackLoader')`INSERT INTO extension.trust_policies(resource_organization_id,id,version,purpose_names,record,pack_id,snapshot_digest,signature_payload,signature_bundle,signer_key_digest,verified_at,expires_at) VALUES (${org},${governance.policyRef.id},1,ARRAY['abh.pack.manage'],${JSON.stringify(governance)}::text::jsonb,${manifest.metadata.id},${governanceDigest},${canonicalJson(['abh-pack-trust-v1',document])},'{}'::jsonb,${digest},${grant.validFrom},${grant.validUntil})`;
 });
 const bindings=manifest.capabilities.provides.map((capability,index)=>({capability,schemaPath:'input.json',implementationRef:ref('abh.artifact'),healthRef:ref('abh.artifact'),safetyStop:index===2,permissionEnvelope:manifest.permissions}));
 const registrations=await preparePackCapabilities(manifest,packRef,bindings,{refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abc');}})},options(),{schema:async()=>{},implementation:async()=>{}});
 const owner=new PackCapabilityRegistryOwner(),setRef=await f.database.transaction(manage,options(),tx=>owner.register(tx,{type:'abh.packs.register-capabilities',commandId:randomUUID(),idempotencyKey:randomUUID(),digest},packRef,registrations,async()=>{}));
 const set=await f.database.transaction(manage,options(),tx=>owner.readSet(tx,setRef,async()=>{}));
 const query:QueryPackCapabilitiesQuery={kind:'abh.tool',limit:100},admission={fenceRefs:async()=>[],inspect:async()=>({visible:true,compatible:true,healthy:true})};
 const invoke=(q=query,checks=admission,grants=[grant.grantRef])=>queryPackCapabilities(f.database,business,options(),q,grants,checks);
 assert.deepEqual(await invoke(),{candidates:[],complete:true});
 await assert.rejects(invoke(query,admission,[]),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(queryPackCapabilities(f.database,manage,options(),query,[grant.grantRef],admission),{code:'PURPOSE_DENIED'});
 const proposal=contract('PackEnableProposal',{action:'EnablePack',resourceOrganizationId:org,packRef,subjectDigest:manifest.integrity.packageDigest,expectedDeploymentVersion:1,environmentDigest:digest,validationRef:staged.validationRef,governanceRef:staged.governanceRef,governanceDigest,ctkRef:ref('abh.artifact'),impactRef:ref('abh.pack-data-impact'),migrationVerificationRef:ref('abh.artifact'),capabilitySetRef:setRef,capabilitySetDigest:set.setDigest,impactUpperBound:{scopeRefs:[scope],resourceRequirements:[],maxMoney:[],description:'Fixture'},expiresAt:grant.validUntil,proposalDigest:digest});proposal.proposalDigest=await digestContract('PackEnableProposal',proposal);
 const enabled=contract('InstalledPackRecord',{...staged,packRef:{...packRef,version:2},status:'Enabled',deploymentVersion:2,enablement:{proposal,previousPackRef:packRef,enabledPackRef:{...packRef,version:2},deploymentVersion:2,approvalRef:ref('abh.request-completion-evidence'),enabledAt:new Date().toISOString()}});
 await f.database.transaction(manage,options(),tx=>tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=2,status='Enabled',deployment_version=2,record=${JSON.stringify(enabled)}::text::jsonb WHERE id=${packRef.id}`);
 const result=await invoke();assert.equal(result.candidates.length,3);assert.equal(result.complete,true);assert.equal(result.candidates[0]!.capability.version,'2.0.0-beta.1');
 assert.equal(result.candidates[0]!.safetyStop,true);assert.deepEqual(result.candidates.slice(1).map(candidate=>candidate.safetyStop),[false,false]);
 const safetyOnly=await invoke({...query,safetyStop:true});assert.deepEqual(safetyOnly.candidates.map(candidate=>candidate.safetyStop),[true]);assert.equal(safetyOnly.complete,true);
 const normalOnly=await invoke({...query,safetyStop:false});assert.deepEqual(normalOnly.candidates.map(candidate=>candidate.safetyStop),[false,false]);assert.equal(normalOnly.complete,true);
 assert.equal('implementationRef' in result.candidates[0]!,false);
 await t.test('HTTP discovery uses verified identity and current read Grant without exposing implementation',async()=>{
  const issuer='development.fake',audience='abh.capabilities',subject='capability-reader';
  const identityDigest=await inputDigest([issuer,subject]);
  await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${principal.id},1)`;
  const identity=new IdentityIngress(f.database,{verify:async()=>({status:'Completed',data:{issuer,audience,subject,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:grant.validUntil,evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
  let grants=[grant.grantRef];
  const installed={grants:async function(){assert.equal(this,installed);return grants;},admission:{...admission}};
  const installation={database:f.database,identity,credentials:async(request:{headers:Record<string,unknown>})=>{
   if(request.headers.authorization!=='Bearer reader')throw new CoreError('UNAUTHENTICATED');
   return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.action.prepare'};
  },capabilityQuery:installed};
  assert.throws(()=>createCoreHttpApp({...installation,capabilityQuery:{...installed,admission:{} as typeof installed.admission}}),/Capability query governance installation required/);
  const unavailable=createCoreHttpApp({database:f.database,identity,credentials:installation.credentials});t.after(()=>unavailable.close());
  assert.equal((await unavailable.inject({method:'GET',url:'/v1/queries/abh.capabilities.query?kind=abh.tool&limit=100',headers:{authorization:'Bearer reader'}})).statusCode,404);
  const app=createCoreHttpApp(installation);t.after(()=>app.close());
  installed.grants=async()=>{throw new Error('replacement must not run');};
  installed.admission.inspect=async()=>{throw new Error('replacement must not run');};
  const url='/v1/queries/abh.capabilities.query?kind=abh.tool&limit=100',headers={authorization:'Bearer reader'};
  const counts=async()=>{const [row]=await f.admin`SELECT (SELECT count(*) FROM data.command_receipts) AS receipts,(SELECT count(*) FROM data.audit_records) AS audit,(SELECT count(*) FROM data.outbox) AS outbox`;return {...row};};
  const before=await counts();
  const address=await app.listen({host:'127.0.0.1',port:0}),client=createAbhClient({baseUrl:address,headers:async()=>headers});
  assert.deepEqual(await client.capabilities.query(query),result);
  const narrowed=await client.capabilities.query({...query,versionRange:'>=1.0.0 <2.0.0',limit:1});assert.equal(narrowed.candidates.length,1);assert.equal(narrowed.complete,false);
  const response=await app.inject({method:'GET',url,headers});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json(),result);
  const limited=await app.inject({method:'GET',url:url.replace('limit=100','limit=1'),headers});assert.equal(limited.statusCode,200);assert.equal(limited.json().complete,false);assert.equal(limited.json().candidates.length,1);
  assert.equal((await app.inject({method:'GET',url})).statusCode,401);
  for(const invalid of [url+'&extra=true',url.replace('limit=100','limit=101'),url+'&versionRange=invalid'])assert.equal((await app.inject({method:'GET',url:invalid,headers})).statusCode,400);
  grants=[];assert.equal((await app.inject({method:'GET',url,headers})).statusCode,403);
  await assert.rejects(client.capabilities.query(query),(error:unknown)=>error instanceof AbhClientError&&error.code==='ABH_ERROR'&&error.response?.error.code==='FORBIDDEN');
  grants=[grant.grantRef];
  try{await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;assert.equal((await app.inject({method:'GET',url,headers})).statusCode,403);}
  finally{await f.admin`UPDATE control.grants SET status='Active' WHERE id=${grant.grantRef.id}`;}
  assert.deepEqual(await counts(),before);
 });
 assert.equal((await invoke({...query,versionRange:'*'})).candidates.length,2);
 assert.equal((await invoke({...query,limit:1})).complete,false);
 assert.equal((await invoke({...query,capabilityId:bindings[0]!.capability.id,version:'1.0.0'})).candidates.length,1);
 await assert.rejects(invoke({...query,versionRange:'not semver'}),{code:'INVALID_ARGUMENT'});
 assert.equal((await invoke(query,{...admission,inspect:async()=>({visible:false,compatible:true,healthy:true})})).candidates.length,0);
 assert.equal((await invoke(query,{...admission,inspect:async()=>({visible:true,compatible:false,healthy:false})})).candidates[0]!.healthy,false);
 await assert.rejects(f.database.transaction(business,options(),tx=>new InstalledPackOwner().read(tx,enabled.packRef,async()=>{})),{code:'FORBIDDEN'});
 try{await assert.rejects(invoke(query,{...admission,inspect:async()=>{await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;return {visible:true,compatible:true,healthy:true};}}),{code:'AUTHORITY_REQUIRED'});}finally{await f.admin`UPDATE control.grants SET status='Active' WHERE id=${grant.grantRef.id}`;}
 try{await assert.rejects(invoke(query,{...admission,inspect:async()=>{await f.admin`UPDATE extension.capability_sets SET record=jsonb_set(record,'{setDigest}',${JSON.stringify(digest)}::text::jsonb) WHERE id=${setRef.id}`;return {visible:true,compatible:true,healthy:true};}}),{code:'PRECONDITION_FAILED'});}finally{await f.admin`UPDATE extension.capability_sets SET record=${JSON.stringify(set)}::text::jsonb WHERE id=${setRef.id}`;}
 await t.test('exact resolution binds actual Pins, registered implementation and verified private Schema',async st=>{
  const releaseOwner=new StaticReleaseOwner(),exact={kind:'Tool' as const,id:registrations[0]!.capability.id,version:registrations[0]!.capability.version,digest:registrations[0]!.registrationDigest};
  const release={releaseRef:ref('abh.release'),resourceOrganizationId:org,assets:[{behaviorSlot:'org.example.slot',capabilityExactRefs:[exact]}],gateRefs:[ref('abh.artifact')],compatibilityRef:ref('abh.artifact'),status:'Ready' as const};
  const assignment={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,releaseRef:release.releaseRef,scopeRefs:[scope],scopeTier:'Organization' as const,status:'Active' as const,selectable:true,executionAllowed:true,evidenceRefs:[ref('abh.decision')]};
  const request={subjectRef:ref('abh.action'),subjectInputDigest:digest,requiredBehaviorSlots:['org.example.slot'],verifiedScope:[scope],requestContextRef:{...ref('abh.request-context'),id:business.tenant.requestId},preparationAuthorityRefs:[ref('abh.execution-authority')]};
  const pins=await f.database.transaction(business,options(),async tx=>{
   await releaseOwner.configure(tx,{type:'abh.releases.configure-static',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(release)},{release,assignment});
   return releaseOwner.resolveAndPin(tx,{type:'abh.releases.resolve-pins',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(request)},request);
  });
  const implementation=Object.freeze({name:'trusted-fixture'}),binding={exactRef:exact,registeredKind:'abh.tool',implementationRef:registrations[0]!.implementationRef,implementation};
  const input={exactRef:exact,pinSet:pins,request,behaviorSlot:'org.example.slot'};
  const checks={query:admission,fenceRefs:async()=>[],current:async()=>{},source:async()=>({refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abc');}})})};
  const resolve=(mapped=binding,check=checks)=>f.database.transaction(business,options(),tx=>resolvePackCapability(tx,options(),input,mapped,[grant.grantRef],check));
  const value=await resolve();assert.equal(value.implementation,implementation);assert.equal(value.safetyStop,false);assert.deepEqual(value.assignmentRef,assignment.assignmentRef);assert.equal(new TextDecoder().decode(value.schema()),'abc');value.schema().fill(0);assert.equal(new TextDecoder().decode(value.schema()),'abc');
  await st.test('exact resolution exposes immutable registered safety metadata',async()=>{
   const betaRegistration=registrations[2]!,betaExact={kind:'Tool' as const,id:betaRegistration.capability.id,
     version:betaRegistration.capability.version,digest:betaRegistration.registrationDigest};
   const safetyRelease={releaseRef:ref('abh.release'),resourceOrganizationId:org,assets:[{behaviorSlot:'org.example.safety',capabilityExactRefs:[betaExact]}],
     gateRefs:[ref('abh.artifact')],compatibilityRef:ref('abh.artifact'),status:'Ready' as const};
   const safetyAssignment={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,releaseRef:safetyRelease.releaseRef,scopeRefs:[scope],
     scopeTier:'Organization' as const,status:'Active' as const,selectable:true,executionAllowed:true,evidenceRefs:[ref('abh.decision')]};
   const safetyRequest={subjectRef:ref('abh.action'),subjectInputDigest:digest,requiredBehaviorSlots:['org.example.safety'],verifiedScope:[scope],
     requestContextRef:{...ref('abh.request-context'),id:business.tenant.requestId},preparationAuthorityRefs:[ref('abh.execution-authority')]};
   const safetyPins=await f.database.transaction(business,options(),async tx=>{
     await releaseOwner.configure(tx,{type:'abh.releases.configure-static',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(safetyRelease)},{release:safetyRelease,assignment:safetyAssignment});
     return releaseOwner.resolveAndPin(tx,{type:'abh.releases.resolve-pins',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(safetyRequest)},safetyRequest);
   });
   const safetyBinding={exactRef:betaExact,registeredKind:'abh.tool',implementationRef:betaRegistration.implementationRef,implementation};
   await assert.rejects(f.database.transaction(business,options(),tx=>resolvePackCapability(tx,options(),
     {exactRef:exact,requireSafetyStop:true,pinSet:pins,request,behaviorSlot:'org.example.slot'},binding,[grant.grantRef],checks)),{code:'PIN_INPUT_CONFLICT'});
   const safetyValue=await f.database.transaction(business,options(),tx=>resolvePackCapability(tx,options(),
     {exactRef:betaExact,requireSafetyStop:true,pinSet:safetyPins,request:safetyRequest,behaviorSlot:'org.example.safety'},safetyBinding,[grant.grantRef],checks));
   assert.equal(safetyValue.safetyStop,true);
  });
  await st.test('prepared resolution consumes once in its original UoW after ordered execution locks',async()=>{
   const token=await f.database.transaction(business,options(),async tx=>{
    const declaration=await preparePackCapabilityResolution(tx,options(),input,binding,[grant.grantRef],checks);
    assert.equal('implementation' in declaration,false);assert.equal(Object.isFrozen(declaration.fenceRefs),true);
    await lockFences(tx,declaration.fenceRefs);
    const actionKey=`${org}/ActionEngine/abh.action/${request.subjectRef.id}`;
    await tx.lock(4,actionKey,()=>tx.owner('ActionEngine')`SELECT pg_advisory_xact_lock(hashtextextended(${actionKey},0))`);
    await lockPackCapabilityDeployment(tx);
    const operationKey=`${org}/OperationController/abh.operation/${randomUUID()}`;
    await tx.lock(4,operationKey,()=>tx.owner('OperationController')`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey},0))`);
    await assert.rejects(resolvePreparedPackCapability(tx,structuredClone(declaration)),{code:'PRECONDITION_FAILED'});
    const result=await resolvePreparedPackCapability(tx,declaration);assert.equal(result.implementation,implementation);assert.deepEqual(result.assignmentRef,assignment.assignmentRef);
    await assert.rejects(resolvePreparedPackCapability(tx,declaration),{code:'PRECONDITION_FAILED'});
    return declaration;
   });
   await assert.rejects(f.database.transaction(business,options(),tx=>resolvePreparedPackCapability(tx,token)),{code:'PRECONDITION_FAILED'});
   for(const omit of ['fences','deployment'])await assert.rejects(f.database.transaction(business,options(),async tx=>{
    const declaration=await preparePackCapabilityResolution(tx,options(),input,binding,[grant.grantRef],checks);
    if(omit!=='fences')await lockFences(tx,declaration.fenceRefs);
    if(omit!=='deployment')await lockPackCapabilityDeployment(tx);
    const key=`${org}/OperationController/abh.operation/${randomUUID()}`;
    await tx.lock(4,key,()=>tx.owner('OperationController')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    await resolvePreparedPackCapability(tx,declaration);
   }),{code:'INTERNAL_ERROR'});
   const abandoned=await f.database.transaction(business,options(),tx=>preparePackCapabilityResolution(tx,options(),input,binding,[grant.grantRef],checks));
   await assert.rejects(f.database.transaction(business,options(),tx=>resolvePreparedPackCapability(tx,abandoned)),{code:'PRECONDITION_FAILED'});
   await assert.rejects(f.database.transaction(business,options(),async tx=>{
    const declaration=await preparePackCapabilityResolution(tx,options(),input,binding,[grant.grantRef],checks);
    await lockFences(tx,declaration.fenceRefs);
    await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;
    return resolvePreparedPackCapability(tx,declaration);
   }),{code:'AUTHORITY_REQUIRED'});
   await f.admin`UPDATE control.grants SET status='Active' WHERE id=${grant.grantRef.id}`;
  });
  await assert.rejects(resolve({...binding,implementationRef:ref('abh.artifact')}),{code:'PRECONDITION_FAILED'});
  await assert.rejects(resolve({...binding,exactRef:{...exact,digest}}),{code:'PIN_INPUT_CONFLICT'});
  await assert.rejects(resolve(binding,{...checks,source:async()=>({refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abd');}})})}),{code:'PRECONDITION_FAILED'});
  await assert.rejects(resolve(binding,{...checks,query:{...admission,inspect:async()=>({visible:true,compatible:true,healthy:false})}}),{code:'PRECONDITION_FAILED'});
  try{await assert.rejects(resolve(binding,{...checks,source:async()=>{
   await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;
   return checks.source();
  }}),{code:'AUTHORITY_REQUIRED'});}finally{await f.admin`UPDATE control.grants SET status='Active' WHERE id=${grant.grantRef.id}`;}
  let sourceReads=0;
  try{await assert.rejects(resolve(binding,{...checks,source:async()=>{
   if(++sourceReads===2)await f.admin`UPDATE extension.capability_sets SET record=jsonb_set(record,'{setDigest}',${JSON.stringify(digest)}::text::jsonb) WHERE id=${setRef.id}`;
   return checks.source();
  }}),{code:'PRECONDITION_FAILED'});}finally{await f.admin`UPDATE extension.capability_sets SET record=${JSON.stringify(set)}::text::jsonb WHERE id=${setRef.id}`;}
  assert.equal(sourceReads,2);
  const paused=await f.database.transaction(business,options(),tx=>releaseOwner.stop(tx,{type:'abh.assignments.pause',commandId:randomUUID(),idempotencyKey:randomUUID(),digest},assignment.assignmentRef,ref('abh.decision')));
  assert.equal(paused.version,2);await assert.rejects(resolve(),{code:'RELEASE_SCOPE_MISMATCH'});
 });
 const stop=new AbortController();let calls=0;
 await assert.rejects(queryPackCapabilities(f.database,business,{...options(),signal:stop.signal},query,[grant.grantRef],{...admission,inspect:async()=>{calls++;stop.abort();return {visible:true,compatible:true,healthy:true};}}),{code:'DEPENDENCY_TIMEOUT'});
 assert.equal(calls,1);
 const execution=deriveVerifiedContext({...business.request,purposeOfUse:'abh.action.execute'});
 assert.equal((await queryPackCapabilities(f.database,execution,options(),query,[grant.grantRef],admission)).candidates.length,3);
 assert.throws(()=>deriveVerifiedContext({...business.request,actingOrganizationId:randomUUID()}),{code:'UNAUTHENTICATED'});
 assert.equal((await invoke()).candidates.length,3);
});
