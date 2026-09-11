import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {validateContract} from '@abh/contracts/schema';
import {digestContract} from '@abh/contracts/digest';
import {contract} from '../src/data/journal.ts';
import {verifyDatabase} from '../src/data/readiness.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {InstalledPackOwner} from '../src/extensions/installed-packs.ts';
import {packManifest} from './pack-fixture.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
const ref=(type:string)=>({type,id:randomUUID(),version:1});
test('Enabled storage requires exact transition evidence and limits runtime updates to lifecycle columns',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'}),org=c.tenant.resourceOrganizationId,owner=new InstalledPackOwner();
 const manifest=await packManifest(),packRef=ref('abh.installed-pack'),digest=manifest.integrity.packageDigest;
 const staged=contract('InstalledPackRecord',{packRef,manifest,snapshot:{id:randomUUID(),metadataDigest:digest},validationRef:ref('abh.pack-validation'),reportDigest:digest,governanceRef:ref('abh.pack-trust-policy'),governanceDigest:digest,deploymentVersion:1,status:'Staged',stagedAt:new Date(Date.now()-1000).toISOString()});
 const proposal=contract('PackEnableProposal',{action:'EnablePack',resourceOrganizationId:org,packRef,subjectDigest:digest,expectedDeploymentVersion:1,environmentDigest:digest,validationRef:staged.validationRef,governanceRef:staged.governanceRef,governanceDigest:digest,ctkRef:ref('abh.artifact'),impactRef:ref('abh.pack-data-impact'),migrationVerificationRef:ref('abh.artifact'),capabilitySetRef:ref('abh.pack-capability-set'),capabilitySetDigest:digest,impactUpperBound:{scopeRefs:[{type:'abh.organization',id:org,version:1}],resourceRequirements:[],maxMoney:[],description:'Storage fixture'},expiresAt:new Date(Date.now()+60000).toISOString(),proposalDigest:digest});
 proposal.proposalDigest=await digestContract('PackEnableProposal',proposal);
 const enablement={proposal,previousPackRef:packRef,enabledPackRef:{...packRef,version:2},deploymentVersion:2,approvalRef:ref('abh.request-completion-evidence'),enabledAt:new Date().toISOString()};
 const enabled=contract('InstalledPackRecord',{...staged,packRef:enablement.enabledPackRef,status:'Enabled',deploymentVersion:2,enablement});
 // Administrative storage fixture only. Signed proposal/approval and atomic writes
 // are exercised through applyPackEnable in pack-conformance.test.ts.
 await f.admin`INSERT INTO extension.installed_packs(resource_organization_id,id,created_by,updated_by,purpose_names,record,pack_id,pack_version,package_digest,deployment_version) VALUES (${org},${packRef.id},${c.tenant.actor.id},${c.tenant.actor.id},ARRAY['abh.pack.manage'],${JSON.stringify(staged)}::text::jsonb,${manifest.metadata.id},${manifest.metadata.version},${digest},1)`;
 await f.database.transaction(c,options(),tx=>owner.retainCurrent(tx,packRef));
 for(const patch of [{enablement:undefined},{packRef:{...packRef,version:3}},{deploymentVersion:3},{status:'Staged'},
  {enablement:{...enablement,enabledPackRef:packRef}},{enablement:{...enablement,proposal:{...proposal,subjectDigest:'sha256:'+'b'.repeat(64)}}},
  {enablement:{...enablement,enabledAt:proposal.expiresAt}}]){
  const bad=JSON.parse(JSON.stringify({...enabled,...patch}));assert.equal(validateContract('InstalledPackRecord',bad).success,false);
  await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=${bad.packRef.version},record=${JSON.stringify(bad)}::text::jsonb,status=${bad.status},deployment_version=${bad.deploymentVersion} WHERE id=${packRef.id}`),{code:'23514'});
 }
 for(const sql of ['UPDATE extension.installed_packs SET pack_id=pack_id','UPDATE extension.installed_packs SET package_digest=package_digest','UPDATE extension.installed_packs SET resource_organization_id=resource_organization_id','UPDATE extension.installed_pack_history SET record=record']){
  await assert.rejects(f.raw.unsafe(sql),{code:'42501'});
 }
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=2,status='Enabled',record=${JSON.stringify(enabled)}::text::jsonb,deployment_version=2 WHERE id=${packRef.id}`;
  assert.deepEqual(await owner.retainCurrent(tx,enabled.packRef),enabled);
 });
 await f.database.transaction(c,options(),async tx=>{
  assert.deepEqual(await owner.read(tx,enabled.packRef,async()=>{}),enabled);
  assert.deepEqual(await owner.readHistorical(tx,packRef,async()=>{}),staged);
  assert.deepEqual(await owner.readHistorical(tx,enabled.packRef,async()=>{}),enabled);
  await assert.rejects(owner.read(tx,packRef,async()=>{}),{code:'VERSION_CONFLICT'});
 });
 await verifyDatabase(f.raw);
 await f.admin`GRANT UPDATE(pack_id) ON extension.installed_packs TO abh_runtime`;
 await assert.rejects(verifyDatabase(f.raw));
 await f.admin`REVOKE UPDATE(pack_id) ON extension.installed_packs FROM abh_runtime`;
 await f.admin`REVOKE UPDATE(status) ON extension.installed_packs FROM abh_runtime`;
 await assert.rejects(verifyDatabase(f.raw));
 await f.admin`GRANT UPDATE(status) ON extension.installed_packs TO abh_runtime`;
 await verifyDatabase(f.raw);
 await f.admin`ALTER TABLE extension.installed_packs DROP CONSTRAINT installed_pack_lifecycle_check`;
 await f.admin`ALTER TABLE extension.installed_packs ADD CONSTRAINT installed_pack_lifecycle_check CHECK(version>0)`;
 await assert.rejects(verifyDatabase(f.raw));
});
