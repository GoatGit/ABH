import type { EntityRef } from '@abh/contracts';
import { canonicalJson } from '@abh/contracts/digest';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { sameRef } from '../execution/shared.ts';
import { DecisionOwner } from './decisions.ts';
import { getDecisionEffectIntent, getDecisionEffectReceipt } from './apply-control-effect.ts';

/** Internal historical readiness read after caller admission. Applied never proves current execution authority. */
export async function readRequestControlEffect(tx: TenantTransaction, requestRef: EntityRef, targetRef: EntityRef, effectKey: string) {
  contract('RequestRef', requestRef); contract('ActionRef', targetRef); contract('IdempotencyKey', effectKey);
  const request = await new DecisionOwner().getRequest(tx, requestRef.id), c = tx.context.tenant;
  if (!sameRef(request.requestRef, requestRef)) throw new CoreError('VERSION_CONFLICT');
  if (request.kind !== 'Authorization' || !sameRef(request.subjectRef, targetRef)) throw new CoreError('FORBIDDEN');
  if (request.status === 'Withdrawn') return { status: 'ClosedWithoutApproval' as const };
  if (request.status !== 'Closed') return { status: 'AwaitingCompletion' as const };
  const [proofRow] = await tx.owner('HumanGateway')`SELECT record FROM human.completion_evidence WHERE resource_organization_id=${c.resourceOrganizationId}
    AND record->'requestRef'->>'id'=${requestRef.id} AND record->>'routeRevision'=${String(request.routeRevision)} AND deleted_at IS NULL
    AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if (!proofRow) return { status: 'ClosedWithoutApproval' as const };
  const proof = contract('RequestCompletionEvidence', proofRow.record);
  if (!sameRef(proof.requestRef, requestRef) || !sameRef(proof.subjectRef, targetRef) || proof.resourceOrganizationId !== c.resourceOrganizationId
    || proof.proposalDigest !== request.proposalDigest || proof.routeRevision !== request.routeRevision) throw new CoreError('INTERNAL_ERROR');
  const rows = await tx.owner('HumanGateway')`SELECT id,version,EXISTS(SELECT 1 FROM human.decision_effect_receipts r
      WHERE r.resource_organization_id=e.resource_organization_id AND r.effect_id=e.id AND r.deleted_at IS NULL) AS has_receipt
    FROM human.decision_effects e WHERE e.resource_organization_id=${c.resourceOrganizationId} AND e.request_id=${requestRef.id}
    AND e.route_revision=${request.routeRevision} AND e.effect_key=${effectKey} AND e.deleted_at IS NULL
    AND ${c.purposeOfUse}=ANY(e.purpose_names) AND (e.workspace_id IS NULL OR e.workspace_id=${c.workspaceId??null}::uuid)`;
  if (!rows.length) return { status: 'AwaitingEffect' as const };
  if (rows.length !== 1) throw new CoreError('INTERNAL_ERROR');
  const intent = await getDecisionEffectIntent(tx, { type: 'abh.decision-effect', id: rows[0]!.id, version: Number(rows[0]!.version) });
  if (intent.targetOwner !== 'Control' || !sameRef(intent.targetRef, targetRef) || !sameRef(intent.requestRef, requestRef)
    || !sameRef(intent.completionEvidenceRef, proof.completionEvidenceRef) || canonicalJson(intent.decisionRefs) !== canonicalJson(proof.decisionRefs)) throw new CoreError('FORBIDDEN');
  const receipt = await getDecisionEffectReceipt(tx, intent.effectRef);
  if (!receipt && rows[0]!.has_receipt) throw new CoreError('RESOURCE_NOT_FOUND');
  return receipt ? { status: 'EffectApplied' as const, effectRef: intent.effectRef, receipt } : { status: 'AwaitingEffect' as const, effectRef: intent.effectRef };
}
