import type { DecisionEffectIntentRecord, DecisionEffectSummary, DecisionRecord, EntityRef } from '@abh/contracts';
import { canonicalJson } from '@abh/contracts/digest';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { DecisionInboxOwner, type DecisionInboxAdmission } from './inbox.ts';
import { getDecisionEffectIntent, getDecisionEffectReceipt } from './apply-control-effect.ts';

export interface DecisionEffectQueryAdmission extends DecisionInboxAdmission {
  /** Verify current visibility of the effect evidence and receipt before exposing any tracking reference. */
  canReadEffect(tx: TenantTransaction, decision: DecisionRecord, intent: DecisionEffectIntentRecord, receiptRef?: EntityRef): Promise<boolean>;
}
const same = (a: EntityRef, b: EntityRef) => a.type === b.type && a.id === b.id && a.version === b.version;

/** Current Decision read admission plus authoritative historical effect facts; never execution permission. */
export async function queryDecisionEffects(tx: TenantTransaction, decisionId: string, grantRefs: readonly EntityRef[], admission: DecisionEffectQueryAdmission): Promise<DecisionEffectSummary[]> {
  const decision = await new DecisionInboxOwner().get(tx, decisionId, grantRefs, admission), c = tx.context.tenant;
  const rows = await tx.owner('HumanGateway')`SELECT id,version,EXISTS(SELECT 1 FROM human.decision_effect_receipts r
    WHERE r.resource_organization_id=human.decision_effects.resource_organization_id AND r.effect_id=human.decision_effects.id) AS has_receipt FROM human.decision_effects
    WHERE resource_organization_id=${c.resourceOrganizationId} AND request_id=${decision.package.requestRef.id} AND route_revision=${decision.package.routeRevision}
      AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND ${c.purposeOfUse}=ANY(purpose_names)
      AND record->'decisionRefs' @> ${JSON.stringify([decision.decisionRef])}::text::jsonb
    ORDER BY id LIMIT 101`;
  if (rows.length > 100) throw new CoreError('INTERNAL_ERROR');
  const summaries: DecisionEffectSummary[] = [];
  for (const row of rows) {
    const intent = await getDecisionEffectIntent(tx, { type: 'abh.decision-effect', id: row.id, version: Number(row.version) });
    if (!intent.decisionRefs.some(ref => same(ref, decision.decisionRef)) || !same(intent.targetRef, decision.package.subjectRef)
      || intent.requestRef.id !== decision.package.requestRef.id || intent.routeRevision !== decision.package.routeRevision || decision.status !== 'Approved') throw new CoreError('INTERNAL_ERROR');
    const proofs = await tx.owner('HumanGateway')`SELECT record FROM human.completion_evidence WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${intent.completionEvidenceRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if (!proofs[0]) throw new CoreError('RESOURCE_NOT_FOUND');
    const proof = contract('RequestCompletionEvidence', proofs[0].record);
    if (!same(proof.completionEvidenceRef, intent.completionEvidenceRef) || !same(proof.requestRef, intent.requestRef) || !same(proof.subjectRef, intent.targetRef)
      || proof.resourceOrganizationId !== c.resourceOrganizationId || proof.routeRevision !== intent.routeRevision || proof.proposalDigest !== decision.package.proposalDigest
      || canonicalJson(proof.decisionRefs) !== canonicalJson(intent.decisionRefs)) throw new CoreError('INTERNAL_ERROR');
    const receipt = await getDecisionEffectReceipt(tx, intent.effectRef);
    // An inaccessible receipt must not turn an applied historical fact into a pending claim.
    if (!receipt && row.has_receipt) continue;
    if (!await admission.canReadEffect(tx, decision, intent, receipt?.receiptRef)) continue;
    summaries.push(contract('DecisionEffectSummary', {
      effectRef: intent.effectRef,
      status: receipt ? 'Applied' : 'Pending',
      ...(receipt ? { receiptRef: receipt.receiptRef } : {}),
    }));
  }
  return summaries;
}
