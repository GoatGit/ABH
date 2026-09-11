import { randomUUID } from 'node:crypto';
import { ActionAuthorizationRequestOwner } from './request-authorization.ts';
import { lifecyclePurposes } from '../data/purposes.ts';
import type { EntityRef, ProposeActionPayload } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { ActionOwner, type ActionDefinition, type ActionPreparationChecks } from './actions.ts';

export interface ActionProposalChecks {
  /** All current source/definition fences, acquired before aggregate locks. */
  fenceRefs(tx: TenantTransaction, payload: ProposeActionPayload): Promise<EntityRef[]>;
  /** Current proposer, target/source versions, evidence visibility and policy, including receipt replay. */
  admit(tx: TenantTransaction, payload: ProposeActionPayload): Promise<void>;
  /** Trusted installed definition; request fields cannot choose execution Service, limits or policy. */
  definition(tx: TenantTransaction, payload: ProposeActionPayload): Promise<ActionDefinition>;
  artifact: ActionPreparationChecks['artifact'];
  proposal: ActionPreparationChecks['proposal'];
}

export interface AutomaticProposalAuthorization {
  grantRefs: readonly EntityRef[];
  purposeNames: readonly string[];
  /** Current automatic-request governance; collect its fences before proposal creation. */
  fenceRefs: ActionProposalChecks['fenceRefs'];
  admit: ActionProposalChecks['admit'];
}

/** Public proposal composition. Acceptance creates intent only, without authority, reservation or dispatch. */
export async function proposeAction(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  organizationId: string, payload: ProposeActionPayload, grantRefs: readonly EntityRef[], checks: ActionProposalChecks, automatic?: AutomaticProposalAuthorization) {
  contract('UUID', organizationId); contract('ProposeActionPayload', payload);
  const input = structuredClone(payload), grants = structuredClone([...grantRefs]), identity = { ...command };
  if (identity.type !== 'abh.actions.propose' || identity.digest !== await inputDigest({ organizationId, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  if (organizationId !== context.tenant.resourceOrganizationId) throw new CoreError('FORBIDDEN');
  const progress = automatic && { ...automatic, grantRefs: structuredClone([...automatic.grantRefs]), purposeNames: lifecyclePurposes(automatic.purposeNames, context.tenant.purposeOfUse) };
  return database.transaction(context, options, async tx => {
    const owner = new ActionOwner(), c = tx.context.tenant, scope = { type: 'abh.organization', id: organizationId, version: 1 };
    const result = await executeCommand(tx, identity, async () => {
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...structuredClone(await checks.fenceRefs(tx, structuredClone(input))), ...(progress ? [...progress.grantRefs, ...structuredClone(await progress.fenceRefs(tx, structuredClone(input)))] : [])]);
      await assertCurrentGrants(tx, { objectRef: scope, scopeRefs: [scope], action: identity.type }, grants);
      await checks.admit(tx, structuredClone(input));
      if (progress) {
        const accepted = await assertCurrentGrants(tx, { objectRef: { type: 'abh.action', id: randomUUID(), version: 1 }, scopeRefs: [scope], action: 'abh.actions.request-authorization' }, progress.grantRefs);
        if (accepted.some(grant => !grant.scopeRefs.some(ref => ref.type === scope.type && ref.id === scope.id))) throw new CoreError('FORBIDDEN');
        await progress.admit(tx, structuredClone(input));
      }
      // Even replay must retain current access to the actual persisted input, not merely a caller-supplied Ref.
      await new InlineArtifactOwner().read(tx, input.payloadRef, artifact => checks.artifact(tx, structuredClone(artifact)));
    }, async () => {
      const definition = structuredClone(await checks.definition(tx, structuredClone(input)));
      const created = await owner.propose(tx, identity, input, definition, {
        lock: async () => {}, artifact: (tx, artifact) => checks.artifact(tx, structuredClone(artifact)),
        proposal: async (tx, payload, definition) => structuredClone(await checks.proposal(tx, structuredClone(payload), structuredClone(definition))),
      });
      if (progress) await new ActionAuthorizationRequestOwner().accept(tx, identity, created.actionRef, {}, progress.purposeNames);
      return created.actionRef;
    });
    const action = await owner.get(tx, result.receipt.resultRef.id);
    if (result.receipt.resultRef.type !== 'abh.action' || result.receipt.resultRef.version !== 1 || action.sourceCommandRef.id !== result.receipt.commandRef.id) throw new CoreError('INTERNAL_ERROR');
    if (progress) {
      const rows = await tx.owner('ActionEngine')`SELECT id FROM execution.authorization_requests WHERE resource_organization_id=${c.resourceOrganizationId} AND command_id=${result.receipt.commandRef.id} AND action_id=${action.actionRef.id}`;
      if (rows.length !== 1) throw new CoreError('PRECONDITION_FAILED');
      const saved = await new ActionAuthorizationRequestOwner().get(tx, { type: 'abh.action-authorization-request', id: rows[0]!.id, version: 1 });
      if (saved.sourceCommandRef.id !== result.receipt.commandRef.id || saved.actionRef.version !== 1) throw new CoreError('INTERNAL_ERROR');
    }
    // Later Action transitions do not rewrite the original accepted response.
    return { actionRef: result.receipt.resultRef, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
