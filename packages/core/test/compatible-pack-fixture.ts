import type {ResolvePackCapabilityAdmission} from '../src/extensions/resolve-pack-capability.ts';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {GrantRecord} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract,digestPackManifest} from '@abh/contracts/digest';
import {contract} from '../src/data/journal.ts';
import type {Database} from '../src/data/uow.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {PackCapabilityRegistryOwner} from '../src/extensions/capability-registry.ts';
import {preparePackCapabilities} from '../src/extensions/prepare-pack-capabilities.ts';
import {packManifest} from './pack-fixture.ts';
import {options} from './database-fixture.ts';
const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1});
/** Administrative metadata fixture, not signed Pack installation evidence. */
export async function compatiblePackFixture(database:Database,business:VerifiedContext,queryGrant:GrantRecord){
 const f={database},manage=deriveVerifiedContext({...business.request,purposeOfUse:'abh.pack.manage'}),org=business.tenant.resourceOrganizationId;
 const scope={type:'abh.organization',id:org,version:1},digest='sha256:'+'a'.repeat(64),now=Date.now();
 const grant:GrantRecord={...queryGrant,grantRef:ref('abh.grant'),actionTypes:['abh.capabilities.read']};
 await database.transaction(manage,options(),async tx=>{
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${grant.principalRef.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
 });
 const raw={...await packManifest(),kind:'ConnectorPack',capabilities:{provides:['2.0.0'].map(version=>({kind:'abh.connector',id:'org.example.hello.recovery-connector',version})),requires:[]}};
 const {signaturePayload:_,...digests}=await digestPackManifest(raw),manifest=contract('PackManifest',{...raw,integrity:{...raw.integrity,...digests}}),packRef=ref('abh.installed-pack');
 const policy={abhVersion:'0.1.0',packId:manifest.metadata.id,allowedModes:['Declarative'],allowedLicenses:['Apache-2.0'],permissions:manifest.permissions,hostProfileRefs:[],sharedNamespaces:[]};
 const common={executable:'/fixture/cosign',mode:'OfflinePublicKey',publicKeyPem:await readFile(new URL('./fixtures/pack-signature/signer.pub',import.meta.url),'utf8'),packId:manifest.metadata.id};
 const trust={signer:common,provenance:{...common,subjectName:'payload',builderId:'fixture',buildType:'fixture',source:{uri:'fixture',digest:{sha256:'a'}}},conformance:{...common,subjectName:'payload',suiteVersion:'1.0.0',environment:{profile:'Connector',environmentDigest:digest,fixtureSetDigest:digest,seed:'42'},cases:[{caseId:'abh.test.integrity',status:'Passed'}],claimedCapabilities:[],maxAgeMs:60000}};
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
 const bindings=manifest.capabilities.provides.map(capability=>({capability,schemaPath:'input.json',implementationRef:ref('abh.artifact'),healthRef:ref('abh.artifact'),permissionEnvelope:manifest.permissions}));
 const registrations=await preparePackCapabilities(manifest,packRef,bindings,{refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abc');}})},options(),{schema:async()=>{},implementation:async()=>{}});
 const owner=new PackCapabilityRegistryOwner(),setRef=await f.database.transaction(manage,options(),tx=>owner.register(tx,{type:'abh.packs.register-capabilities',commandId:randomUUID(),idempotencyKey:randomUUID(),digest},packRef,registrations,async()=>{}));
 const set=await f.database.transaction(manage,options(),tx=>owner.readSet(tx,setRef,async()=>{}));
 const proposal=contract('PackEnableProposal',{action:'EnablePack',resourceOrganizationId:org,packRef,subjectDigest:manifest.integrity.packageDigest,expectedDeploymentVersion:1,environmentDigest:digest,validationRef:staged.validationRef,governanceRef:staged.governanceRef,governanceDigest,ctkRef:ref('abh.artifact'),impactRef:ref('abh.pack-data-impact'),migrationVerificationRef:ref('abh.artifact'),capabilitySetRef:setRef,capabilitySetDigest:set.setDigest,impactUpperBound:{scopeRefs:[scope],resourceRequirements:[],maxMoney:[],description:'Fixture'},expiresAt:grant.validUntil,proposalDigest:digest});proposal.proposalDigest=await digestContract('PackEnableProposal',proposal);
 const enabled=contract('InstalledPackRecord',{...staged,packRef:{...packRef,version:2},status:'Enabled',deploymentVersion:2,enablement:{proposal,previousPackRef:packRef,enabledPackRef:{...packRef,version:2},deploymentVersion:2,approvalRef:ref('abh.request-completion-evidence'),enabledAt:new Date().toISOString()}});
 await f.database.transaction(manage,options(),tx=>tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=2,status='Enabled',deployment_version=2,record=${JSON.stringify(enabled)}::text::jsonb WHERE id=${packRef.id}`);
 const entry=registrations[0]!,exact={kind:'Connector' as const,id:entry.capability.id,version:entry.capability.version,digest:entry.registrationDigest};
 return {exact,packRef:enabled.packRef,grant,implementationRef:entry.implementationRef,admission:{fenceRefs:async()=>[],query:{fenceRefs:async()=>[],inspect:async()=>({visible:true,compatible:true,healthy:true})},current:async()=>{},source:async()=>({refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abc');}})})} as ResolvePackCapabilityAdmission};
}
