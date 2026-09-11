import type { ActionRecord, EntityRef, OperationPlan, RegisterOperationPlanPayload } from '@abh/contracts';
import { digestContract } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { CoreError } from '../internal/errors.ts';
import { StaticReleaseOwner } from '../release/static.ts';
import { ActionOwner, type ActionPreparationChecks } from './actions.ts';
import { OperationOwner } from './operations.ts';
import { lockAction, sameRef } from './shared.ts';

export interface PlanRegistrationChecks {
  fenceRefs(tx: TenantTransaction, action: ActionRecord, plan: OperationPlan): Promise<EntityRef[]>;
  /** Current source/capability-read/scope-proof authority, including replay. */
  admit(tx: TenantTransaction, action: ActionRecord, plan: OperationPlan): Promise<void>;
  artifact: ActionPreparationChecks['artifact'];
  plan: ActionPreparationChecks['plan'];
}

/** Registers a trusted compiled plan, independently proving current preparation authority. No dispatch or T1. */
export async function registerOperationPlan(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  actionRef: EntityRef, payload: RegisterOperationPlanPayload, compiledPlan: OperationPlan, grantRefs: readonly EntityRef[], checks: PlanRegistrationChecks) {
  contract('ActionRef', actionRef); contract('RegisterOperationPlanPayload', payload); contract('OperationPlan', compiledPlan);
  const reference = { ...actionRef }, input = structuredClone(payload), plan = structuredClone(compiledPlan), identity = { ...command }, grants = structuredClone([...grantRefs]);
  if (identity.type !== 'abh.actions.register-plan' || identity.digest !== await inputDigest({ actionRef: reference, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  if (await digestContract('OperationPlan', plan) !== plan.digest || input.planDigest !== plan.digest || !sameRef(input.planRef, plan.planRef)
    || !sameRef(input.pinSetRef, plan.pinSetRef) || input.pinSetDigest !== plan.pinSetDigest || !sameRef(input.scopeProofRef, plan.scopeProofRef) || plan.actionRef.id !== reference.id) throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
  return database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), releases = new StaticReleaseOwner(), c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const result = await executeCommand(tx, identity, async () => {
      const action = await actions.get(tx, reference.id), intent = await actions.getIntent(tx, reference.id);
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants,
        ...structuredClone(await checks.fenceRefs(tx, structuredClone(action), structuredClone(plan)))]);
      await assertCurrentGrants(tx, { objectRef: reference, scopeRefs: [scope], action: identity.type }, grants);
      // Hold Action before admission may acquire Deployment/Pack locks. Replay
      // still checks current authority and the current Action, not its old version.
      await lockAction(tx, reference.id);
      if (!sameRef((await actions.get(tx, reference.id)).actionRef, action.actionRef)) throw new CoreError('VERSION_CONFLICT');
      await checks.admit(tx, structuredClone(action), structuredClone(plan));
      const pins = await releases.getPinSet(tx, action.actionRef);
      if (!pins || !action.pinSetRef || !sameRef(action.pinSetRef, pins.pinSetRef) || !sameRef(pins.pinSetRef, input.pinSetRef) || pins.digest !== input.pinSetDigest) throw new CoreError('PIN_INPUT_CONFLICT');
      await releases.revalidate(tx, pins, actions.preparationRequest(tx, intent, grants));
      for (const [ref, digest] of [[action.payloadArtifactRef, action.payloadDigest], ...plan.nodes.map(node => [node.payloadRef, node.payloadDigest])] as [EntityRef, string][]) {
        const artifact = await new InlineArtifactOwner().read(tx, ref, record => checks.artifact(tx, structuredClone(record)));
        if (artifact.record.contentDigest !== digest) throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
      }
    }, async () => (await actions.registerPlan(tx, identity, reference, plan, grants, {
      lock: async () => {}, artifact: (tx, record) => checks.artifact(tx, structuredClone(record)),
      plan: (tx, plan, intent) => checks.plan(tx, structuredClone(plan), structuredClone(intent)),
    })).actionRef);
    const stored = await new OperationOwner().getPlan(tx, reference.id);
    if (result.receipt.resultRef.type !== 'abh.action' || result.receipt.resultRef.id !== reference.id || !stored || !sameRef(stored.planRef, plan.planRef) || stored.digest !== plan.digest) throw new CoreError('INTERNAL_ERROR');
    return { actionRef: result.receipt.resultRef, planRef: stored.planRef, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
