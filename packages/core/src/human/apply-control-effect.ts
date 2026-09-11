import type { DecisionEffectIntentRecord, DecisionEffectReceiptRecord, EntityRef, IssueExecutionAuthorityPayload } from '@abh/contracts';
import { canonicalJson } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { appendChange, contract, executeCommand, inputDigest } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { ExecutionAuthorityOwner, type AuthorityEffectChecks } from '../control/authority.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';

export interface ControlDecisionEffectChecks {
  /** Include every control/source fence before any aggregate lock. */
  fenceRefs(tx: TenantTransaction, intent: DecisionEffectIntentRecord, input: IssueExecutionAuthorityPayload): Promise<EntityRef[]>;
  /** Current management rights and evidence visibility, including historical receipt replay. */
  admit(tx: TenantTransaction, intent: DecisionEffectIntentRecord): Promise<void>;
  authority: AuthorityEffectChecks;
}
const same = (a: EntityRef, b: EntityRef) => a.type === b.type && a.id === b.id && a.version === b.version;

function assertBinding(intent: DecisionEffectIntentRecord, payload: IssueExecutionAuthorityPayload, context: VerifiedContext): void {
  const c = context.tenant;
  if (intent.targetOwner !== 'Control' || payload.authority.effectKey !== intent.effectKey || !same(payload.authority.issuanceEvidenceRef, intent.completionEvidenceRef)
    || payload.authority.binding.kind !== 'Action' || !same(payload.authority.binding.actionRef, intent.targetRef)
    || payload.authority.issuedBy.id !== c.actor.id || payload.authority.issuedBy.type !== c.actor.type) throw new CoreError('FORBIDDEN');
}

async function admitControlEffect(tx: TenantTransaction, intent: DecisionEffectIntentRecord, payload: IssueExecutionAuthorityPayload, grants: readonly EntityRef[], checks: ControlDecisionEffectChecks): Promise<void> {
  const c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
  await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...await checks.fenceRefs(tx, intent, payload)]);
  await assertCurrentGrants(tx, { objectRef: payload.authority.authorityRef, scopeRefs: [scope], action: 'abh.execution-authority.create' }, grants);
  await checks.admit(tx, intent);
}

/** Freeze once before execution. A failed application must not change IDs, scope or expiry on retry. */
export async function prepareControlDecisionEffect(database: Database, context: VerifiedContext, options: TransactionOptions,
  effectRef: EntityRef, input: IssueExecutionAuthorityPayload, managementGrantRefs: readonly EntityRef[], checks: ControlDecisionEffectChecks): Promise<IssueExecutionAuthorityPayload> {
  contract('DecisionEffectRef', effectRef); contract('IssueExecutionAuthorityPayload', input);
  const ref = { ...effectRef }, payload = structuredClone(input), grants = structuredClone([...managementGrantRefs]);
  return database.transaction(context, options, async tx => {
    const intent = await getDecisionEffectIntent(tx, ref), c = tx.context.tenant, sql = tx.owner('HumanGateway');
    assertBinding(intent, payload, context);
    const key = `${c.resourceOrganizationId}/control-effect-input/${ref.id}`;
    await tx.lock(0, key, () => sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    await admitControlEffect(tx, intent, payload, grants, checks);
    const existing = await getControlDecisionEffectInput(tx, ref);
    if (existing) {
      if (canonicalJson(existing) !== canonicalJson(payload)) throw new CoreError('IDEMPOTENCY_CONFLICT');
      return existing;
    }
    const [source] = await sql`SELECT workspace_id,purpose_names FROM human.decision_effects WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}`;
    await sql`INSERT INTO human.control_effect_inputs(resource_organization_id,id,workspace_id,purpose_names,effect_id,record)
      VALUES (${c.resourceOrganizationId},${intent.commandRef.id},${source!.workspace_id},${source!.purpose_names},${ref.id},${JSON.stringify(payload)}::text::jsonb)`;
    return payload;
  });
}

/** Internal read after current admission; a frozen proposal is not permission to execute. */
export async function getControlDecisionEffectInput(tx: TenantTransaction, ref: EntityRef): Promise<IssueExecutionAuthorityPayload | undefined> {
  const intent = await getDecisionEffectIntent(tx, ref), c = tx.context.tenant;
  const rows = await tx.owner('HumanGateway')`SELECT id,record FROM human.control_effect_inputs WHERE resource_organization_id=${c.resourceOrganizationId} AND effect_id=${ref.id}
    AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if (!rows[0]) return undefined;
  if (rows[0].id !== intent.commandRef.id) throw new CoreError('INTERNAL_ERROR');
  return contract('IssueExecutionAuthorityPayload', rows[0].record);
}

export async function getDecisionEffectIntent(tx: TenantTransaction, ref: EntityRef): Promise<DecisionEffectIntentRecord> {
  contract('DecisionEffectRef', ref);
  const c = tx.context.tenant;
  const rows = await tx.owner('HumanGateway')`SELECT record,version,request_id,route_revision,effect_key,originating_command_id FROM human.decision_effects
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if (!rows[0]) throw new CoreError('RESOURCE_NOT_FOUND');
  const row = rows[0], record = contract('DecisionEffectIntentRecord', row.record);
  if (!same(record.effectRef, ref)) throw new CoreError('VERSION_CONFLICT');
  if (record.effectRef.version !== Number(row.version) || record.resourceOrganizationId !== c.resourceOrganizationId || record.requestRef.id !== row.request_id || record.routeRevision !== Number(row.route_revision) || record.effectKey !== row.effect_key || record.originatingCommandRef.id !== row.originating_command_id) throw new CoreError('INTERNAL_ERROR');
  return record;
}

/** Current authorization is required by callers; this is an immutable historical fact, not current authority. */
export async function getDecisionEffectReceipt(tx: TenantTransaction, ref: EntityRef): Promise<DecisionEffectReceiptRecord | undefined> {
  const intent = await getDecisionEffectIntent(tx, ref), c = tx.context.tenant;
  const rows = await tx.owner('HumanGateway')`SELECT record,id FROM human.decision_effect_receipts WHERE resource_organization_id=${c.resourceOrganizationId} AND effect_id=${ref.id} AND deleted_at IS NULL
    AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if (!rows[0]) return undefined;
  const result = contract('DecisionEffectReceiptRecord', rows[0].record);
  if (result.resourceOrganizationId !== c.resourceOrganizationId || result.receiptRef.id !== rows[0].id || !same(result.receiptRef, intent.commandRef) || !same(result.effectRef, intent.effectRef) || !same(result.requestRef, intent.requestRef) || !same(result.completionEvidenceRef, intent.completionEvidenceRef)) throw new CoreError('INTERNAL_ERROR');
  const commands = await tx.owner('CommandIngress')`SELECT record FROM data.command_receipts WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${result.receiptRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if (!commands[0]) throw new CoreError('INTERNAL_ERROR');
  const committed = contract('CommandReceipt', commands[0].record);
  if (committed.commandType !== 'abh.execution-authority.issue-effect' || !same(committed.commandRef, result.receiptRef) || !same(committed.resultRef, result.authorityRef) || committed.inputDigest !== result.inputDigest) throw new CoreError('INTERNAL_ERROR');
  return result;
}

/** Control's grant + authority + receipt + Outbox commit atomically in the authoritative database. */
export async function applyControlDecisionEffect(database: Database, context: VerifiedContext, options: TransactionOptions,
  effectRef: EntityRef, input: IssueExecutionAuthorityPayload, managementGrantRefs: readonly EntityRef[], checks: ControlDecisionEffectChecks) {
  contract('DecisionEffectRef', effectRef); contract('IssueExecutionAuthorityPayload', input);
  const ref = { ...effectRef }, payload = structuredClone(input), grants = structuredClone([...managementGrantRefs]);
  const digest = await inputDigest({ effectRef: ref, input: payload });
  return database.transaction(context, options, async tx => {
    const intent = await getDecisionEffectIntent(tx, ref), c = tx.context.tenant;
    assertBinding(intent, payload, context);
    const command = { type: 'abh.execution-authority.issue-effect', commandId: intent.commandRef.id, idempotencyKey: `decision-effect/${intent.effectRef.id}`, digest };
    const result = await executeCommand(tx, command, async () => {
      await admitControlEffect(tx, intent, payload, grants, checks);
      const frozen = await getControlDecisionEffectInput(tx, ref);
      if (!frozen) throw new CoreError('PRECONDITION_FAILED');
      if (canonicalJson(frozen) !== canonicalJson(payload)) throw new CoreError('IDEMPOTENCY_CONFLICT');
    }, async () => {
      const authority = await new ExecutionAuthorityOwner().issueEffect(tx, command, payload, checks.authority);
      // An old partial/historical issuance cannot be upgraded into a successful new effect receipt.
      if (canonicalJson(authority) !== canonicalJson(payload.authority) || authority.status !== 'Active') throw new CoreError('PRECONDITION_FAILED');
      const actual = await new ExecutionAuthorityOwner().get(tx, authority.authorityRef.id);
      const [grant] = await tx.owner('Control')`SELECT record,status,version,workspace_id FROM control.grants WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${payload.serviceGrant.grantRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
      if (canonicalJson(actual) !== canonicalJson(authority) || !grant || grant.status !== 'Active' || Number(grant.version) !== payload.serviceGrant.grantRef.version || canonicalJson(grant.record) !== canonicalJson(payload.serviceGrant)) throw new CoreError('PRECONDITION_FAILED');
      for (const target of [authority.authorityRef, payload.serviceGrant.grantRef]) {
        const events = await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE resource_organization_id=${c.resourceOrganizationId} AND aggregate_type=${target.type} AND aggregate_id=${target.id} AND aggregate_version=${target.version} AND record->>'causationId'=${command.commandId}`;
        if (events.length !== 1) throw new CoreError('PRECONDITION_FAILED');
      }
      const [source] = await tx.owner('HumanGateway')`SELECT workspace_id,purpose_names FROM human.decision_effects WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${intent.effectRef.id}`;
      if (grant.workspace_id !== source!.workspace_id) throw new CoreError('INTERNAL_ERROR');
      const [clock] = await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
      const receipt = contract('DecisionEffectReceiptRecord', {
        receiptRef: intent.commandRef, resourceOrganizationId: c.resourceOrganizationId, effectRef: intent.effectRef,
        requestRef: intent.requestRef, completionEvidenceRef: intent.completionEvidenceRef, authorityRef: authority.authorityRef,
        grantRefs: authority.grantRefs, inputDigest: digest, status: 'Applied', appliedAt: clock!.now.toISOString(),
      });
      await tx.owner('HumanGateway')`INSERT INTO human.decision_effect_receipts(resource_organization_id,id,workspace_id,purpose_names,effect_id,record)
        VALUES (${c.resourceOrganizationId},${receipt.receiptRef.id},${source!.workspace_id},${source!.purpose_names},${intent.effectRef.id},${JSON.stringify(receipt)}::text::jsonb)`;
      await appendChange(tx, { command, target: { ...intent.effectRef, version: intent.effectRef.version + 1 }, eventType: 'abh.decision-effect.applied', changedFields: ['status', 'receiptRef'], relatedRefs: [receipt.receiptRef, authority.authorityRef, ...authority.grantRefs] });
      return authority.authorityRef;
    });
    const receipt = await getDecisionEffectReceipt(tx, ref);
    if (!receipt || !same(result.receipt.resultRef, receipt.authorityRef) || result.receipt.commandRef.id !== receipt.receiptRef.id || receipt.inputDigest !== digest) throw new CoreError('INTERNAL_ERROR');
    return { receipt, replayed: result.replayed };
  });
}
