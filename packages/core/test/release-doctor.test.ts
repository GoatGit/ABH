import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { CapabilityRef, EntityRef, ReleaseRecord } from '@abh/contracts';
import { validateContract } from '@abh/contracts/schema';
import { inspectReleaseReadiness } from '../src/diagnostics.ts';
import { createDatabaseFixture } from './database-fixture.ts';

const ref = <T extends string>(type: T, id: string = randomUUID(), version = 1) =>
  ({ type, id, version });
const digest = 'sha256:'+'a'.repeat(64);

test('release doctor reports read-only readiness without repairing evidence', {timeout:120_000}, async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const organizationId=randomUUID(),workspaceId=randomUUID(),actorId=randomUUID();
  const [gateId,compatibilityId]= [randomUUID(),randomUUID()];
  const artifact=(id:string):Record<string,unknown>=>({artifactRef:ref('abh.artifact',id),
    resourceOrganizationId:organizationId,ownerRef:ref('abh.organization',organizationId),
    mediaType:'application/json',sizeBytes:2,contentDigest:digest,status:'Available',
    dataClass:'abh.data.internal',purposeNames:['abh.release.manage'],sourceRefs:[],region:'local',
    retentionPolicyRef:ref('abh.organization',organizationId)});
  for(const id of [gateId,compatibilityId])
    await f.admin`INSERT INTO data.artifacts
      (resource_organization_id,id,created_by,updated_by,purpose_names,record,inline_body,content_digest,status)
      VALUES (${organizationId},${id},${actorId},${actorId},ARRAY['abh.release.manage'],
      ${JSON.stringify(artifact(id))}::text::jsonb,${new TextEncoder().encode('{}')},${digest},'Available')`;
  const capability:CapabilityRef={kind:'Connector',id:'doctor.connector',version:'1.0.0',digest};
  const release=(id:string,status:'Draft'|'Ready'):ReleaseRecord=>({releaseRef:ref('abh.release',id),
    resourceOrganizationId:organizationId,
    assets:[{behaviorSlot:'doctor.primary',capabilityExactRefs:[capability]}],
    gateRefs:[ref('abh.artifact',gateId)],compatibilityRef:ref('abh.artifact',compatibilityId),status});
  const [previousId,releaseId]=[randomUUID(),randomUUID()];
  for(const [id,status] of [[previousId,'Ready'],[releaseId,'Ready']] as const)
    await f.admin`INSERT INTO release.releases
      (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,status)
      VALUES (${organizationId},${id},${actorId},${actorId},${workspaceId},ARRAY['abh.release.manage'],
      ${JSON.stringify(release(id,status))}::text::jsonb,${status})`;
  const invoke=async(overrides:Partial<{releaseId:string;organizationId:string;workspaceId:string;timeoutMs:number}>={})=>
    inspectReleaseReadiness({connectionString:f.runtimeUrl,signal:new AbortController().signal,
      organizationId:overrides.organizationId??organizationId,
      releaseId:overrides.releaseId??releaseId,workspaceId:overrides.workspaceId??workspaceId,
      timeoutMs:overrides.timeoutMs??10_000});

  await t.test('invalid arguments never query the database',async()=>{
    for(const overrides of [{organizationId:'no-uuid'},{releaseId:'no-uuid'},{timeoutMs:99}]){
      const result=await invoke(overrides);assert.equal(result.status,'Failed');
      assert.equal(result.errorCode,'INVALID_ARGUMENT');assert.equal(result.violationCount,0);
      assert.equal(validateContract('CliDoctorReleaseResult',result).success,true,JSON.stringify(result));
    }
  });
  await t.test('unknown release has no invented diagnostic',async()=>{
    const result=await invoke({releaseId:randomUUID()});
    assert.equal(result.status,'Failed');assert.equal(result.errorCode,'PRECONDITION_FAILED');
    assert.deepEqual(result.releases,[]);assert.equal(result.violationCount,1);
  });
  await t.test('partial readiness lists only bounded stop reasons',async()=>{
    const assignmentId=randomUUID(),pinId=randomUUID();
    await f.admin`INSERT INTO release.assignments
      (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,release_id,status,selectable,execution_allowed)
      VALUES (${organizationId},${assignmentId},${actorId},${actorId},${workspaceId},ARRAY['abh.release.manage'],
      ${JSON.stringify({assignmentRef:ref('abh.assignment',assignmentId)})}::text::jsonb,
      ${releaseId},'Active',true,true)`;
    await f.admin`INSERT INTO release.pin_sets
      (resource_organization_id,id,created_by,updated_by,workspace_id,purpose_names,record,subject_type,subject_id,
      subject_input_digest,required_slots_digest)
      VALUES (${organizationId},${pinId},${actorId},${actorId},${workspaceId},ARRAY['abh.release.manage'],
      ${JSON.stringify({pinSetRef:ref('abh.pin-set',pinId),pins:[{releaseId,
      assignmentId,capabilityExactRefs:[capability]}]})}::text::jsonb,'abh.action',${randomUUID()},
      ${digest},${digest})`;
    const result=await invoke();
    assert.deepEqual(result.releases[0]!.stopReasons,
      ['CAPABILITY_NOT_INSTALLED']);
    assert.equal(result.violationCount,1);assert.equal(result.releases[0]!.assignmentCount,1);
    assert.equal(result.releases[0]!.pinSetCount,1);assert.equal(result.releases[0]!.assetCount,1);
  });
  await t.test('complete readiness includes a valid rollback candidate',async()=>{
    const packId=randomUUID(),setId=randomUUID();
    await f.admin`INSERT INTO extension.capabilities
      (resource_organization_id,id,pack_id,set_id,kind,capability_id,capability_version,record,
      created_by,updated_by)
      VALUES (${organizationId},${randomUUID()},${packId},${setId},${capability.kind},
      ${capability.id},${capability.version},${JSON.stringify({capability,
      packRef:{type:'abh.installed-pack',id:packId,version:1}})}::text::jsonb,
      ${actorId},${actorId})`;
    const [rollbackCandidate]=await f.admin`SELECT r.id FROM release.releases r
      WHERE r.id<>${releaseId} AND r.status='Ready' AND r.deleted_at IS NULL
      AND 'abh.release.manage'=ANY(r.purpose_names) AND (r.workspace_id=${workspaceId}::uuid OR r.workspace_id IS NULL)
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.record->'assets') candidate
        WHERE candidate->>'behaviorSlot'='doctor.primary')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.record->'gateRefs') gate WHERE NOT (
        gate->>'type'='abh.artifact' AND EXISTS (SELECT 1 FROM data.artifacts a
          WHERE a.id=(gate->>'id')::uuid AND a.version=(gate->>'version')::bigint AND a.status='Available'
          AND a.deleted_at IS NULL AND 'abh.release.manage'=ANY(a.purpose_names))))
      AND EXISTS (SELECT 1 FROM data.artifacts a WHERE a.id=(r.record->'compatibilityRef'->>'id')::uuid
        AND a.version=(r.record->'compatibilityRef'->>'version')::bigint AND a.status='Available'
        AND a.deleted_at IS NULL AND 'abh.release.manage'=ANY(a.purpose_names))`;
    assert.equal(rollbackCandidate!.id,previousId);
    const result=await invoke();
    assert.equal(result.status,'Passed');assert.equal(result.errorCode,null);
    assert.deepEqual(result.releases[0]!.stopReasons,[],JSON.stringify(result));
    assert.equal(result.violationCount,0);assert.equal(result.releases.length,1);
    assert.deepEqual(result.releases[0]!.stopReasons,[]);
    assert.equal(result.releases[0]!.installedCapabilityCount,1);
    assert.deepEqual(result.releases[0]!.rollbackCandidateRefs.map(item=>item.id),[previousId]);
    assert.equal(validateContract('CliDoctorReleaseResult',result).success,true);
  });
});
