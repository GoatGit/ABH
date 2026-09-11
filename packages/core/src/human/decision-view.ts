import type { DecisionRecord, DecisionView, EntityRef } from '@abh/contracts';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { lockFences } from '../control/fences.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { CoreError } from '../internal/errors.ts';
import { DecisionInboxOwner } from './inbox.ts';
import { DecisionOwner } from './decisions.ts';
import { queryDecisionEffects, type DecisionEffectQueryAdmission } from './effect-query.ts';

export type DecisionViewAction = 'abh.decisions.submit' | 'abh.decisions.withdraw';
export interface DecisionViewAdmission extends DecisionEffectQueryAdmission {
  /** Declare all query/source/policy fences before the first object read. */
  fenceRefs(tx: TenantTransaction): Promise<EntityRef[]>;
  /** Current command-specific source/MFA/duties preconditions; returning true does not bypass its Grant. */
  canAct(tx: TenantTransaction, decision: DecisionRecord, action: DecisionViewAction): Promise<boolean>;
}

/** Permission-filtered public DTO only. Query metadata must come from the actual query host. */
export async function readDecisionView(tx: TenantTransaction, id: string, readGrants: readonly EntityRef[],
  actionGrants: Partial<Record<DecisionViewAction, readonly EntityRef[]>>, admission: DecisionViewAdmission): Promise<DecisionView> {
  contract('UUID', id);
  const c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
  const actions = ['abh.decisions.submit', 'abh.decisions.withdraw'] as const;
  await lockDecisionViewPage(tx, readGrants, actionGrants, admission);
  const decision = await new DecisionInboxOwner().get(tx, id, readGrants, admission);
  const effectSummaries = await queryDecisionEffects(tx, id, readGrants, admission);
  const availableActions: DecisionViewAction[] = [];
  if (decision.status === 'Pending') for (const action of actions) {
    const grants = actionGrants[action];
    if (!grants?.length) continue;
    try {
      await assertCurrentGrants(tx, { objectRef: decision.decisionRef, scopeRefs: [scope], action }, grants);
      if (await admission.canAct(tx, decision, action)) {
        if (action === 'abh.decisions.submit') await new DecisionOwner().assertSubmissionReady(tx, decision);
        availableActions.push(action);
      }
    } catch (error) {
      // A denied optional command hides its button; query/data errors still fail the read.
      if (!(error instanceof CoreError) || !['AUTHORITY_REQUIRED', 'FORBIDDEN', 'EPOCH_REVOKED', 'DECIDER_NOT_ELIGIBLE', 'DECISION_STALE', 'PRECONDITION_FAILED'].includes(error.code)) throw error;
    }
  }
  return contract('DecisionView', { decisionRef: decision.decisionRef, package: decision.package, status: decision.status, effectSummaries, availableActions });
}

/** Declare the complete page's fence set before any per-object query admission. */
export async function lockDecisionViewPage(tx: TenantTransaction, readGrants: readonly EntityRef[], actionGrants: Partial<Record<DecisionViewAction, readonly EntityRef[]>>, admission: DecisionViewAdmission): Promise<void> {
  const c = tx.context.tenant;
  await lockFences(tx, [{ type: 'abh.organization', id: c.resourceOrganizationId, version: 1 }, { type: 'abh.principal', id: c.actor.id, version: 1 },
    ...readGrants, ...Object.values(actionGrants).flatMap(refs => [...refs]), ...await admission.fenceRefs(tx)]);
}
