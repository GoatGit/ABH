import type { ActionRecord, EntityRef, RequestAuthorizationPayload } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { currentIdentity } from '../identity/owner.ts';
import { ActionAuthorizationResolver, type SnapshotSourceChecks } from '../control/snapshots.ts';
import { inspectActionExecutionSource } from '../control/execution-source.ts';
import { approvalFenceRefs } from '../human/approval-proof.ts';
import { ActionOwner } from './actions.ts';
import { OperationOwner } from './operations.ts';
import { sameRef } from './shared.ts';

export interface PreparedActionAuthorizationChecks extends SnapshotSourceChecks {
  /** Current installed execution admission, including replay. Not Human request authorization. */
  admit(tx: TenantTransaction, action: ActionRecord): Promise<void>;
}

/** Executes T1 for an already validated/pinned/planned Action under its current configured Service. */
export async function authorizePreparedAction(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  actionRef: EntityRef, payload: RequestAuthorizationPayload, resolver: ActionAuthorizationResolver, checks: PreparedActionAuthorizationChecks) {
  contract('ActionRef', actionRef); contract('RequestAuthorizationPayload', payload);
  const reference = { ...actionRef }, input = structuredClone(payload), identity = { ...command };
  if (identity.type !== 'abh.actions.request-authorization' || identity.digest !== await inputDigest({ actionRef: reference, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  if (!(resolver instanceof ActionAuthorizationResolver)) throw new CoreError('INVALID_ARGUMENT');
  if (input.authorityRefs && input.authorityRefs.length !== 1) throw new CoreError('EXECUTION_AUTHORITY_AMBIGUOUS');
  if (context.tenant.actor.type !== 'Service' || context.tenant.purposeOfUse !== 'abh.action.execute') throw new CoreError('PURPOSE_DENIED');
  const sources: SnapshotSourceChecks = {
    fenceRefs: async (tx, action, intent, plan) => structuredClone(await checks.fenceRefs(tx, structuredClone(action), structuredClone(intent), structuredClone(plan))),
    sources: async (tx, value) => structuredClone(await checks.sources(tx, structuredClone(value))),
    artifact: (tx, artifact) => checks.artifact(tx, structuredClone(artifact)),
    obligations: (tx, refs) => checks.obligations(tx, structuredClone(refs)),
  };
  return database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), c = tx.context.tenant;
    const result = await executeCommand(tx, identity, async () => {
      const action = await actions.get(tx, reference.id), intent = await actions.getIntent(tx, reference.id), plan = await new OperationOwner().getPlan(tx, reference.id);
      if (action.executionPrincipalRef.id !== c.actor.id) throw new CoreError('FORBIDDEN');
      if (!plan || !action.planRef || !sameRef(plan.planRef, action.planRef)) throw new CoreError('PRECONDITION_FAILED');
      const extra = structuredClone(await checks.fenceRefs(tx, structuredClone(action), structuredClone(intent), structuredClone(plan)));
      // Same complete source set as the Resolver, so replay cannot acquire a later out-of-order fence.
      await inspectActionExecutionSource(tx, action, input.authorityRefs?.[0], async authority => {
        if (authority.binding.kind !== 'Action' || authority.stopConditions.length) throw new CoreError('AUTHORITY_REQUIRED');
        return [...extra, ...plan.nodes.map(node => node.connectionRef), authority.resourceEnvelopeRef, ...authority.purposeRefs,
          ...await approvalFenceRefs(tx, authority.issuanceEvidenceRef)];
      });
      const current = await currentIdentity(tx);
      if (current.scopeEpoch !== c.scopeEpoch || !sameRef(current.principal.principalRef, action.executionPrincipalRef)) throw new CoreError('EPOCH_REVOKED');
      await checks.admit(tx, structuredClone(action));
    }, async () => (await actions.authorize(tx, identity, reference,
      tx => resolver.authorizeOneShot(tx, identity, reference, sources, input.authorityRefs?.[0]))).actionRef);
    if (result.receipt.resultRef.type !== 'abh.action' || result.receipt.resultRef.id !== reference.id || result.receipt.resultRef.version !== reference.version + 1) throw new CoreError('INTERNAL_ERROR');
    return { actionRef: result.receipt.resultRef, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
