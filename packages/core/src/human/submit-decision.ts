import type { DecisionRecord, EntityRef, RequestCompletionEvidence, ResponsibilityRequestRecord, SubmitDecisionPayload } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { DecisionOwner, type DecisionEligibility } from './decisions.ts';
import { createDecisionEffectIntents, decisionEffectIntentsForCommand, type DecisionEffectPlan } from './effect-intents.ts';

export interface DecisionSubmissionChecks {
  fenceRefs(tx: TenantTransaction, request: ResponsibilityRequestRecord): Promise<EntityRef[]>;
  /** Current source/evidence visibility, MFA, duties and qualification, including historical replay. */
  admit(tx: TenantTransaction, decision: DecisionRecord, request: ResponsibilityRequestRecord, submission: SubmitDecisionPayload): Promise<void>;
  eligibility: DecisionEligibility;
  /** Frozen installation policy must describe every required effect. Empty final-completion plans are refused. */
  effects(tx: TenantTransaction, completion: RequestCompletionEvidence): Promise<readonly DecisionEffectPlan[]>;
}

export async function submitDecision(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  decisionRef: EntityRef, submission: SubmitDecisionPayload, grantRefs: readonly EntityRef[], checks: DecisionSubmissionChecks) {
  contract('DecisionRef', decisionRef); contract('SubmitDecisionPayload', submission);
  if (command.type !== 'abh.decisions.submit' || command.digest !== await inputDigest({ decisionRef, submission })) throw new CoreError('INVALID_ARGUMENT');
  const reference = { ...decisionRef }, input = structuredClone(submission), grants = structuredClone([...grantRefs]);
  return database.transaction(context, options, async tx => {
    const owner = new DecisionOwner(), c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const result = await executeCommand(tx, command, async () => {
      const decision = await owner.getDecision(tx, reference.id), request = await owner.getRequest(tx, decision.package.requestRef.id);
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...await checks.fenceRefs(tx, request)]);
      if (c.actor.type !== 'Human') throw new CoreError('DECIDER_NOT_ELIGIBLE');
      await assertCurrentGrants(tx, { objectRef: reference, scopeRefs: [scope], action: command.type }, grants);
      await owner.assertCurrentSubmitter(tx, decision, request);
      await checks.admit(tx, decision, request, input);
    }, async () => {
      const outcome = await owner.submit(tx, command, reference, input, {
        ...checks.eligibility,
        submit: async (...args) => {
          const accepted = await checks.eligibility.submit(...args);
          // Domain qualification may narrow the independently verified grants, never invent proof refs.
          if (!accepted.length || accepted.some(ref => !grants.some(grant => grant.type === ref.type && grant.id === ref.id && grant.version === ref.version))) throw new CoreError('AUTHORITY_REQUIRED');
          return accepted;
        },
      });
      if (outcome.completion) await createDecisionEffectIntents(tx, command, outcome.completion, await checks.effects(tx, outcome.completion));
      return outcome.decision.decisionRef;
    });
    const decision = await owner.getDecision(tx, reference.id);
    if (result.receipt.resultRef.type !== 'abh.decision' || result.receipt.resultRef.id !== reference.id || result.receipt.resultRef.version !== decision.decisionRef.version || decision.status !== input.response || decision.respondedBy?.id !== c.actor.id) throw new CoreError('INTERNAL_ERROR');
    const effects = await decisionEffectIntentsForCommand(tx, result.receipt.commandRef.id);
    return { decisionRef: decision.decisionRef, commandId: result.receipt.commandRef.id, status: input.response, effectTrackingRefs: effects.map(effect => effect.effectRef), replayed: result.replayed };
  });
}
