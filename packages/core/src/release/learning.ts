import type {
  ConfigureLearningCandidateReleaseCommand, ConfigureLearningReleasePayload, EntityRef,
  EvaluationGateArtifactRecord, EvaluationProfileRecord, LearningCandidateRecord,
  StaticAssignmentRecord,
} from '@abh/contracts';
import { digestCommandIntent, digestContract } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { contract, executeCommand } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { requireVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { sameRef } from '../execution/shared.ts';
import type { CommandIdentity } from '../data/journal.ts';
import { StaticReleaseOwner } from './static.ts';

const learningWithdrawalPurposes = ['abh.learning.capture', 'abh.learning.evaluate', 'abh.learning.gate'];

async function requireWithdrawalsAvailable(tx:TenantTransaction):Promise<void> {
  const rows = await tx.owner('LearningController')`SELECT 1 FROM core.learning_withdrawals
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId}
      AND purpose_name=ANY(${learningWithdrawalPurposes}::text[]) LIMIT 1`;
  if (rows.length > 0) throw new CoreError('LEARNING_PURPOSE_DENIED');
}

async function readCandidate(tx:TenantTransaction, ref:EntityRef):Promise<LearningCandidateRecord> {
  const c = tx.context.tenant;
  const [row] = await tx.owner('LearningController')`SELECT record,version,status FROM core.learning_candidates
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND version=${ref.version}
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid)`;
  if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
  const record = contract('LearningCandidateRecord', row.record);
  if (!sameRef(record.candidateRef, ref) || record.candidateRef.version !== Number(row.version)
    || record.resourceOrganizationId !== c.resourceOrganizationId || row.status !== record.status
    || await digestContract('LearningCandidateRecord', record) !== record.digest) throw new CoreError('INTERNAL_ERROR');
  return record;
}

async function readGate(tx:TenantTransaction, ref:EntityRef):Promise<EvaluationGateArtifactRecord> {
  const c = tx.context.tenant;
  const [row] = await tx.owner('LearningController')`SELECT record,version,verdict FROM core.learning_gates
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND version=${ref.version}
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid)`;
  if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
  const record = contract('EvaluationGateArtifactRecord', row.record);
  if (!sameRef(record.gateRef, ref) || record.gateRef.version !== Number(row.version)
    || record.resourceOrganizationId !== c.resourceOrganizationId || row.verdict !== record.verdict
    || await digestContract('EvaluationGateArtifactRecord', record) !== record.digest) throw new CoreError('INTERNAL_ERROR');
  return record;
}

async function readProfile(tx:TenantTransaction, ref:EntityRef):Promise<EvaluationProfileRecord> {
  const c = tx.context.tenant;
  const [row] = await tx.owner('LearningController')`SELECT record,version FROM core.evaluation_profiles
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND version=${ref.version}
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid)`;
  if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
  const record = contract('EvaluationProfileRecord', row.record);
  if (!sameRef(record.profileRef, ref) || record.profileRef.version !== Number(row.version)
    || record.resourceOrganizationId !== c.resourceOrganizationId
    || await digestContract('EvaluationProfileRecord', record) !== record.digest) throw new CoreError('RESOURCE_NOT_FOUND');
  return record;
}

async function validateLearningEvidence(tx:TenantTransaction,
  input:ConfigureLearningReleasePayload):Promise<{candidate:LearningCandidateRecord; gate:EvaluationGateArtifactRecord}> {
  const c = tx.context.tenant;
  await requireWithdrawalsAvailable(tx);
  const candidate = await readCandidate(tx, input.candidateRef);
  if (candidate.status !== 'Draft') throw new CoreError('PRECONDITION_FAILED');
  const gate = await readGate(tx, input.gateRef);
  if (gate.verdict !== 'Pass' || !sameRef(gate.candidateRef, candidate.candidateRef)) throw new CoreError('PRECONDITION_FAILED');
  const profile = await readProfile(tx, gate.profileRef);
  const releaseAuthority = { type: c.actor.type, id: c.actor.id } as const;
  if (releaseAuthority.id === candidate.producer.id || releaseAuthority.id === profile.evaluatorRef.id
    || releaseAuthority.id === gate.signedBy.id) throw new CoreError('LEARNING_PURPOSE_DENIED');

  const release = input.release, assignment = input.assignment;
  if (!release.gateRefs.some(ref => sameRef(ref, gate.gateRef))
    || !sameRef(assignment.releaseRef, release.releaseRef)) throw new CoreError('PRECONDITION_FAILED');
  return { candidate, gate };
}

async function persistedGateAssignment(tx:TenantTransaction, gateRef:EntityRef,
  input:ConfigureLearningReleasePayload):Promise<StaticAssignmentRecord | undefined> {
  const c = tx.context.tenant, sql = tx.owner('CapabilityRelease');
  const releases = await sql`SELECT id,record,version,status FROM release.releases
    WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
      AND record->'gateRefs' @> ${JSON.stringify([gateRef])}::jsonb`;
  const foreignRelease = releases.find(row => row.id !== input.release.releaseRef.id);
  if (foreignRelease) throw new CoreError('PRECONDITION_FAILED');
  if (!releases[0]) return undefined;
  const release = contract('ReleaseRecord', releases[0].record);
  if (releases[0].id !== input.release.releaseRef.id || release.releaseRef.version !== Number(releases[0].version)
    || releases[0].status !== 'Ready' || release.status !== 'Ready'
    || !release.gateRefs.some(ref => sameRef(ref, gateRef))) throw new CoreError('INTERNAL_ERROR');
  const [assignment] = await sql`SELECT record,version,status,selectable,execution_allowed FROM release.assignments
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.assignment.assignmentRef.id}
      AND deleted_at IS NULL AND release_id=${release.releaseRef.id}`;
  if (!assignment) throw new CoreError('INTERNAL_ERROR');
  const record = contract('StaticAssignmentRecord', assignment.record);
  if (!sameRef(record.assignmentRef, input.assignment.assignmentRef)
    || record.assignmentRef.version !== Number(assignment.version) || assignment.status !== record.status
    || assignment.selectable !== record.selectable || assignment.execution_allowed !== record.executionAllowed
    || !sameRef(record.releaseRef, release.releaseRef)) throw new CoreError('INTERNAL_ERROR');
  return record;
}

export class LearningReleaseController {
  async configure(tx:TenantTransaction, command:CommandIdentity,
    input:ConfigureLearningReleasePayload):Promise<EntityRef> {
    const { gate } = await validateLearningEvidence(tx, input);
    await lockFences(tx, [{ type: 'abh.organization', id: tx.context.tenant.resourceOrganizationId, version: 1 }]);
    const existing = await persistedGateAssignment(tx, gate.gateRef, input);
    if (existing) return existing.assignmentRef;
    return await new StaticReleaseOwner().configure(tx, command, {
      release: input.release, assignment: input.assignment,
      ...(input.purposeNames ? { purposeNames: input.purposeNames } : {}),
    });
  }

  async getAssignment(tx:TenantTransaction, ref:EntityRef):Promise<StaticAssignmentRecord> {
    const c = tx.context.tenant;
    const [row] = await tx.owner('CapabilityRelease')`SELECT record,version,status,selectable,execution_allowed
      FROM release.assignments WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid)`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    const record = contract('StaticAssignmentRecord', row.record);
    if (!sameRef(record.assignmentRef, ref) || record.assignmentRef.version !== Number(row.version)
      || row.status !== record.status || row.selectable !== record.selectable
      || row.execution_allowed !== record.executionAllowed) throw new CoreError('INTERNAL_ERROR');
    return record;
  }
}

export async function configureLearningCandidateRelease(database:Database, context:VerifiedContext,
  options:TransactionOptions, supplied:ConfigureLearningCandidateReleaseCommand,
  grants:readonly EntityRef[]):Promise<StaticAssignmentRecord> {
  requireVerifiedContext(context);
  const input = contract('ConfigureLearningCandidateReleaseCommand', structuredClone(supplied));
  const refs = structuredClone([...grants]);
  if (input.type !== 'abh.releases.configure-learning-candidate' || input.target.type !== 'abh.release'
    || input.target.id !== input.payload.release.releaseRef.id
    || input.payload.candidateRef.type !== 'abh.learning-candidate'
    || input.payload.gateRef.type !== 'abh.learning-gate') throw new CoreError('INVALID_ARGUMENT');
  const command = {
    type: input.type, commandId: input.commandId, idempotencyKey: input.idempotencyKey,
    digest: await digestCommandIntent(input),
  };
  const controller = new LearningReleaseController();
	 const result = await database.transaction(context, options, async tx => await executeCommand(tx, command, async () => {
	   const organization = { type: 'abh.organization' as const, id: tx.context.tenant.resourceOrganizationId, version: 1 };
	   await assertCurrentGrants(tx, { objectRef: input.payload.release.releaseRef, scopeRefs: [organization],
	     action: 'abh.releases.configure-learning-candidate' }, refs);
	   await requireWithdrawalsAvailable(tx);
  }, async () => await controller.configure(tx, command, input.payload)));
  const assignmentRef = { type: 'abh.assignment' as const, id: result.receipt.resultRef.id, version: result.receipt.resultRef.version };
  return await database.transaction(context, options, async tx => await controller.getAssignment(tx, assignmentRef));
}
