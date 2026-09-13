import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {LearningCandidateRecord} from '@abh/contracts';
import {validateContract} from '@abh/contracts/schema';
import postgres from 'postgres';
import {inspectLearningCandidateReadiness} from '../src/diagnostics.ts';
import {createDatabaseFixture} from './database-fixture.ts';

const ref=<T extends string>(type:T,id=randomUUID(),version=1):{type:T;id:string;version:number}=>
  ({type,id,version});

test('learning candidate doctor reports bounded readiness and withdrawal propagation',{timeout:120_000},async t=>{
  const fixture=await createDatabaseFixture();t.after(()=>fixture.close());
  const organizationId=randomUUID(),actorId=randomUUID(),workspaceId=randomUUID(),signal=new AbortController().signal;
  const candidateId=randomUUID(),profileId=randomUUID(),runId=randomUUID(),gateId=randomUUID(),releaseId=randomUUID();
  const candidate:LearningCandidateRecord={candidateRef:ref('abh.learning-candidate',candidateId),
    resourceOrganizationId:organizationId,caseRef:ref('abh.learning-case'),assetKind:'model.prompt',
    baseVersion:1,candidateArtifactRef:ref('abh.artifact'),scopeRef:ref('abh.organization',organizationId),
    risk:'learning.low',status:'Draft',producer:{type:'Human',id:actorId},receiptRef:ref('abh.command',randomUUID()),
    createdAt:new Date().toISOString(),digest:'sha256:'+'0'.repeat(64)};
  await fixture.admin`INSERT INTO core.learning_candidates
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,case_id,asset_kind,status,receipt_id)
    VALUES (${organizationId},${candidateId},${workspaceId},${actorId},${actorId},ARRAY['abh.learning.capture'],
      ${JSON.stringify(candidate)}::text::jsonb,${randomUUID()},'model.prompt','Draft',${randomUUID()})`;
  const invoke=async()=>inspectLearningCandidateReadiness({connectionString:fixture.runtimeUrl,signal,
    organizationId,candidateId,timeoutMs:10_000});
  const missing=await invoke();
  assert.equal(missing.status,'Failed');assert.equal(missing.errorCode,'PRECONDITION_FAILED');
  assert.deepEqual(missing.candidates[0]!.stopReasons,['PROFILE_MISSING','EVALUATION_MISSING','GATE_MISSING']);

  const profile={profileRef:ref('abh.evaluation-profile',profileId),resourceOrganizationId:organizationId,
    assetKind:'model.prompt',risk:'learning.low'};
  await fixture.admin`INSERT INTO core.evaluation_profiles
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,asset_kind,risk,approved_at)
    VALUES (${organizationId},${profileId},${workspaceId},${actorId},${actorId},ARRAY['abh.learning.evaluate'],
      ${JSON.stringify(profile)}::text::jsonb,'model.prompt','learning.low',clock_timestamp())`;
  const run={runRef:ref('abh.evaluation-run',runId),resourceOrganizationId:organizationId,
    candidateRef:candidate.candidateRef,profileRef:profile.profileRef,
    retryOfRef:ref('abh.evaluation-run',randomUUID())};
  await fixture.admin`INSERT INTO core.evaluation_runs
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,candidate_id,profile_id,status,receipt_id,expires_at)
    VALUES (${organizationId},${runId},${workspaceId},${actorId},${actorId},ARRAY['abh.learning.evaluate'],
      ${JSON.stringify(run)}::text::jsonb,${candidateId},${profileId},'Queued',${randomUUID()},clock_timestamp()+interval '1 hour')`;
  const queued=await invoke();
  assert.deepEqual(queued.candidates[0]!.stopReasons,['EVALUATION_UNSETTLED','GATE_MISSING']);

  await fixture.admin`UPDATE core.evaluation_runs SET status='Completed',version=2 WHERE id=${runId}`;
  const gate={gateRef:ref('abh.learning-gate',gateId),resourceOrganizationId:organizationId,
    candidateRef:candidate.candidateRef,profileRef:profile.profileRef,verdict:'Pass'};
  await fixture.admin`INSERT INTO core.learning_gates
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,candidate_id,profile_id,verdict,receipt_id)
    VALUES (${organizationId},${gateId},${workspaceId},${actorId},${actorId},ARRAY['abh.learning.gate'],
      ${JSON.stringify(gate)}::text::jsonb,${candidateId},${profileId},'Pass',${randomUUID()})`;
  const unreleased=await invoke();
  assert.deepEqual(unreleased.candidates[0]!.stopReasons,['RELEASE_NOT_LINKED']);

  const release={releaseRef:ref('abh.release',releaseId),resourceOrganizationId:organizationId,
    assets:[{behaviorSlot:'behavior.primary',capabilityExactRefs:[{type:'abh.capability',id:randomUUID(),version:1}]}],
    gateRefs:[gate.gateRef],compatibilityRef:ref('abh.artifact'),status:'Draft'};
  await fixture.admin`INSERT INTO release.releases
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,status)
    VALUES (${organizationId},${releaseId},${workspaceId},${actorId},${actorId},ARRAY['abh.learning.gate'],
      ${JSON.stringify(release)}::text::jsonb,'Draft')`;
  const ready=await invoke();
  assert.equal(ready.status,'Passed');assert.equal(ready.errorCode,null);assert.equal(ready.violationCount,0);
  assert.equal(ready.candidates[0]!.profileRef?.id,profileId);
  assert.deepEqual(ready.candidates[0]!.evaluationRunRefs,[run.runRef]);
  assert.equal(ready.candidates[0]!.gateRef?.id,gateId);
  assert.deepEqual(ready.candidates[0]!.releaseRefs,[release.releaseRef]);
  assert.equal(validateContract('CliDoctorLearningResult',ready).success,true);

  await fixture.admin`INSERT INTO core.learning_withdrawals
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,purpose_name,command_id)
    VALUES (${organizationId},${randomUUID()},${workspaceId},${actorId},${actorId},ARRAY['abh.learning.gate'],
      ${JSON.stringify({purposeName:'abh.learning.gate',withdrawnAt:new Date().toISOString()})}::text::jsonb,
      'abh.learning.gate',${randomUUID()})`;
  const withdrawn=await invoke();
  assert.deepEqual(withdrawn.candidates[0]!.withdrawnPurposes,['abh.learning.gate']);
  assert.deepEqual(withdrawn.candidates[0]!.stopReasons,['PURPOSE_WITHDRAWN']);
  await poolCleanup(fixture.runtimeUrl);
});

async function poolCleanup(url:string){const pool=postgres(url,{max:1});await pool`SELECT 1`;await pool.end();}
