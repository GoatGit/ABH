import type { EntityRef } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { contract, type CommandIdentity } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import type { ProposeSafetyStopPayload } from '@abh/contracts';
import { proposeAction, type ActionProposalChecks } from './propose-action.ts';
import type { VerifiedContext } from '../internal/context.ts';

const sameRef = (left: EntityRef, right: EntityRef) => left.type === right.type && left.id === right.id;

async function assertCandidate(tx: TenantTransaction, payload: ProposeSafetyStopPayload): Promise<void> {
  const c = tx.context.tenant;
  const { fenceRef, fencingToken, unresolvedOperationRef } = payload;
  const rows = await tx.owner('OperationController')`SELECT id,record,version,fencing_token,unresolved_operation_id
    FROM execution.resource_fences WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${fenceRef.id}
    AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
    AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid) FOR UPDATE`;
  const row = rows[0];
  if (!row || Number(row.version) !== fenceRef.version || Number(row.fencing_token) !== fencingToken
    || row.unresolved_operation_id !== unresolvedOperationRef.id) throw new CoreError('PRECONDITION_FAILED');
  const current = contract('ResourceFenceRecord', row.record);
  if (current.fenceRef.id !== fenceRef.id || current.fenceRef.version !== fenceRef.version || current.resourceOrganizationId !== c.resourceOrganizationId
    || current.fencingToken !== fencingToken || !current.unresolvedOperationRef || !sameRef(current.unresolvedOperationRef, unresolvedOperationRef)
    || current.blockedByReportRef || current.safetyStopOperationRef) throw new CoreError('PRECONDITION_FAILED');
  if (!payload.proposal.targetRefs.some(ref => sameRef(ref, fenceRef))
    || !payload.proposal.targetRefs.some(ref => sameRef(ref, unresolvedOperationRef))) throw new CoreError('PRECONDITION_FAILED');
}

export function safetyStopProposalChecks(checks: ActionProposalChecks): ActionProposalChecks {
  return {
    ...checks,
    fenceRefs: async (tx, payload) => {
      return structuredClone(await checks.fenceRefs(tx, payload));
    },
    admit: async (tx, payload) => {
      await checks.admit(tx, payload);
      if ('proposal' in payload) await assertCandidate(tx, payload);
    },
    definition: async (tx, payload) => {
      const definition = structuredClone(await checks.definition(tx, payload));
      if (definition.safetyStop !== true || !definition.purposeNames.includes('abh.action.safety-stop')) throw new CoreError('PURPOSE_DENIED');
      return definition;
    },
  };
}

export function startSafetyStopAction(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  organizationId: string, payload: ProposeSafetyStopPayload, grantRefs: readonly EntityRef[], checks: ActionProposalChecks) {
  return proposeAction(database, context, options, command, organizationId, payload, grantRefs, safetyStopProposalChecks(checks));
}
