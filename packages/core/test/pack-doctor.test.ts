import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { validateContract } from '@abh/contracts/schema';
import { digestPackManifest } from '@abh/contracts/digest';
import { contract } from '../src/data/journal.ts';
import { inspectPackInstallReadiness } from '../src/diagnostics.ts';
import { createDatabaseFixture, context } from './database-fixture.ts';
import { packManifest } from './pack-fixture.ts';

test('pack doctor reports read-only installation gaps without repairing records', {timeout:120_000}, async t=>{
  const invalid=await inspectPackInstallReadiness({connectionString:'postgres://fixture:secret@127.0.0.1:1/db',
    signal:new AbortController().signal,organizationId:'no-uuid',packId:'org.example.pack',
    packVersion:'1.0.0',timeoutMs:10_000});
  assert.equal(invalid.errorCode,'INVALID_ARGUMENT');
  assert.equal(validateContract('CliDoctorPackResult',invalid).success,true);

  const f=await createDatabaseFixture();t.after(()=>f.close());
  const organizationId=randomUUID(),actorId=randomUUID(),manifest=await packManifest();
  const {signaturePayload:_,...digests}=await digestPackManifest(manifest);
  const validManifest={...manifest,integrity:{...manifest.integrity,...digests}};
  const packRef={type:'abh.installed-pack' as const,id:randomUUID(),version:1};
  const digest='sha256:'+'a'.repeat(64);
  const record=contract('InstalledPackRecord',{packRef,manifest:validManifest,
    snapshot:{id:randomUUID(),metadataDigest:digest},
    validationRef:{type:'abh.pack-validation',id:randomUUID(),version:1},reportDigest:digest,
    governanceRef:{type:'abh.pack-trust-policy',id:randomUUID(),version:1},governanceDigest:digest,
    deploymentVersion:1,status:'Staged',stagedAt:new Date().toISOString()});
  await f.admin`INSERT INTO extension.installed_packs
    (resource_organization_id,id,created_by,updated_by,purpose_names,record,pack_id,pack_version,
     package_digest,deployment_version)
    VALUES (${organizationId},${packRef.id},${actorId},${actorId},ARRAY['abh.pack.manage'],
      ${JSON.stringify(record)}::text::jsonb,${validManifest.metadata.id},${validManifest.metadata.version},
      ${validManifest.integrity.packageDigest},1)`;
  const invoke=(overrides:Partial<{packId:string;packVersion:string;organizationId:string;timeoutMs:number}>={})=>
    inspectPackInstallReadiness({connectionString:f.runtimeUrl,signal:new AbortController().signal,
      organizationId:overrides.organizationId??organizationId,
      packId:overrides.packId??validManifest.metadata.id,
      packVersion:overrides.packVersion??validManifest.metadata.version,
      timeoutMs:overrides.timeoutMs??10_000});

  await t.test('invalid arguments never query the database',async()=>{
    for(const overrides of [{organizationId:'no-uuid'},{packId:'Bad Pack'},{packVersion:'latest'},{timeoutMs:99}]){
      const result=await invoke(overrides);
      assert.equal(result.status,'Failed');assert.equal(result.errorCode,'INVALID_ARGUMENT');
      assert.deepEqual(result.packs,[]);assert.equal(result.violationCount,0);
      assert.equal(validateContract('CliDoctorPackResult',result).success,true,JSON.stringify(result));
    }
  });
  await t.test('unknown pack has no invented diagnostic',async()=>{
    const result=await invoke({packVersion:'2.0.0'});
    assert.equal(result.status,'Failed');assert.equal(result.errorCode,'PRECONDITION_FAILED');
    assert.deepEqual(result.packs,[]);assert.equal(result.violationCount,1,JSON.stringify(result));
  });
  await t.test('partial readiness reports only bounded persisted gaps',async()=>{
    const result=await invoke(),pack=result.packs[0];
    assert.equal(result.status,'Failed');assert.equal(result.errorCode,'PRECONDITION_FAILED');
    assert.equal(result.violationCount,4);assert.ok(pack);
    assert.deepEqual(pack.stopReasons,['VALIDATION_EVIDENCE_MISSING','GOVERNANCE_EVIDENCE_MISSING',
      'CAPABILITY_REGISTRATION_INVALID','DEPLOYMENT_REVISION_MISSING']);
    assert.equal(pack.expectedCapabilityCount,0);assert.equal(pack.registeredCapabilityCount,0);
    assert.equal(pack.capabilitySetRef,null);assert.equal(pack.deploymentRevisionRef,null);
    assert.equal(validateContract('CliDoctorPackResult',result).success,true,JSON.stringify(result));
  });
});
