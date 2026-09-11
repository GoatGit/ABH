import { randomUUID } from 'node:crypto';
import type { DecisionEffectIntentRecord, EntityRef, RequestCompletionEvidence } from '@abh/contracts';
import { canonicalJson } from '@abh/contracts/digest';
import type { TenantTransaction } from '../data/uow.ts';
import { appendChange, contract, type CommandIdentity } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { DecisionOwner } from './decisions.ts';

export interface DecisionEffectPlan {
  effectKey: string;
  targetOwner: 'Control' | 'Domain';
  targetRef: EntityRef;
}

/** Durable pending intent only. Approval is never an Applied receipt or an execution authorization. */
export async function createDecisionEffectIntents(tx: TenantTransaction, command: CommandIdentity, completion: RequestCompletionEvidence, plans: readonly DecisionEffectPlan[]): Promise<DecisionEffectIntentRecord[]> {
  contract('RequestCompletionEvidence', completion);
  if (command.type !== 'abh.decisions.submit' || plans.length < 1 || plans.length > 100 || new Set(plans.map(p => p.effectKey)).size !== plans.length) throw new CoreError('INVALID_ARGUMENT');
  const c = tx.context.tenant, sql = tx.owner('HumanGateway');
  const request = await new DecisionOwner().getRequest(tx, completion.requestRef.id);
  const rows = await sql`SELECT record FROM human.completion_evidence WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${completion.completionEvidenceRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if (!rows[0] || canonicalJson(rows[0].record) !== canonicalJson(completion) || request.status !== 'Closed' || canonicalJson(request.requestRef) !== canonicalJson(completion.requestRef) || request.routeRevision !== completion.routeRevision) throw new CoreError('DECISION_STALE');
  const events = await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE resource_organization_id=${c.resourceOrganizationId} AND aggregate_type='abh.request-completion-evidence' AND aggregate_id=${completion.completionEvidenceRef.id} AND record->>'causationId'=${command.commandId}`;
  if (events.length !== 1) throw new CoreError('PRECONDITION_FAILED');
  const [source] = await sql`SELECT workspace_id,purpose_names FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${request.requestRef.id}`;
  const [clock] = await sql`SELECT clock_timestamp() AS now`;
  const records: DecisionEffectIntentRecord[] = [];
  for (const plan of plans) {
    if (canonicalJson(plan.targetRef) !== canonicalJson(completion.subjectRef)) throw new CoreError('FORBIDDEN');
    const record = contract('DecisionEffectIntentRecord', {
      effectRef: { type: 'abh.decision-effect', id: randomUUID(), version: 1 }, resourceOrganizationId: c.resourceOrganizationId,
      requestRef: completion.requestRef, routeRevision: completion.routeRevision, effectKey: plan.effectKey,
      decisionRefs: completion.decisionRefs, completionEvidenceRef: completion.completionEvidenceRef,
      targetOwner: plan.targetOwner, targetRef: plan.targetRef, commandRef: { type: 'abh.command', id: randomUUID(), version: 1 },
      originatingCommandRef: { type: 'abh.command', id: command.commandId, version: 1 }, status: 'Pending', recordedAt: clock!.now.toISOString(),
    });
    await sql`INSERT INTO human.decision_effects(resource_organization_id,id,workspace_id,purpose_names,request_id,route_revision,effect_key,originating_command_id,record)
      VALUES (${c.resourceOrganizationId},${record.effectRef.id},${source!.workspace_id},${source!.purpose_names},${request.requestRef.id},${request.routeRevision},${record.effectKey},${command.commandId},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx, { command, target: record.effectRef, eventType: 'abh.decision-effect.created', changedFields: ['status'], relatedRefs: [record.completionEvidenceRef, record.targetRef, record.commandRef] });
    records.push(record);
  }
  return records;
}

/** Called after current command replay admission; returns the original command's stable tracking set. */
export async function decisionEffectIntentsForCommand(tx: TenantTransaction, commandId: string): Promise<DecisionEffectIntentRecord[]> {
  contract('UUID', commandId);
  const c = tx.context.tenant;
  const rows = await tx.owner('HumanGateway')`SELECT record,id,request_id,route_revision,effect_key FROM human.decision_effects WHERE resource_organization_id=${c.resourceOrganizationId} AND originating_command_id=${commandId}
    AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND ${c.purposeOfUse}=ANY(purpose_names) ORDER BY id`;
  return rows.map(row => {
    const record = contract('DecisionEffectIntentRecord', row.record);
    if (record.resourceOrganizationId !== c.resourceOrganizationId || record.effectRef.id !== row.id || record.requestRef.id !== row.request_id || record.routeRevision !== Number(row.route_revision) || record.effectKey !== row.effect_key || record.originatingCommandRef.id !== commandId) throw new CoreError('INTERNAL_ERROR');
    return record;
  });
}
