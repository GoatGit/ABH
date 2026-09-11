import { setTimeout as delay } from 'node:timers/promises';
import type { EntityRef } from '@abh/contracts';
import type { Database, TransactionOptions } from '../data/uow.ts';
import { boundedCallback } from '../internal/bounded-callback.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { requestVerifiedContext, type ContextSource } from '../identity/context-source.ts';
import { CoreError } from '../internal/errors.ts';
import { applyControlDecisionEffect, getControlDecisionEffectInput, getDecisionEffectIntent, type ControlDecisionEffectChecks } from './apply-control-effect.ts';

export interface ControlEffectWorkerOptions {
  context: ContextSource;
  signal: AbortSignal;
  grantRefs: readonly EntityRef[];
  checks: ControlDecisionEffectChecks;
  pageSize?: number;
  intervalMs?: number;
  onPage?(result: { scanned: number; applied: number; replayed: number }, options: TransactionOptions): Promise<void>;
}

/** Recover prepared Control effects only. Frozen input and stable command identity survive process loss. */
export async function runControlEffectWorker(database: Database, input: ControlEffectWorkerOptions): Promise<void> {
  const size = input.pageSize ?? 100, interval = input.intervalMs ?? 1000;
  if (!Number.isInteger(size) || size < 1 || size > 100 || !Number.isInteger(interval) || interval < 1 || interval > 60_000) throw new CoreError('INVALID_ARGUMENT');
  const grants = structuredClone([...input.grantRefs]);
  let binding: string | undefined, cursor: string | undefined;
  const options = () => ({ deadline: Date.now() + 10_000, signal: input.signal });
  const current = async () => {
    const context = await requestVerifiedContext(request => input.context(request), options()), c = context.tenant;
    if (c.actor.type !== 'Service' || c.purposeOfUse !== 'abh.action.prepare') throw new CoreError('FORBIDDEN');
    const key = JSON.stringify([c.resourceOrganizationId, c.actingOrganizationId, c.workspaceId ?? null, c.actor.id, c.purposeOfUse]);
    if (binding !== undefined && binding !== key) throw new CoreError('FORBIDDEN');
    binding = key; return context;
  };
  while (!input.signal.aborted) {
    try {
      const page = await database.transaction(await current(), options(), async tx => {
        const c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
        // Empty-page scans also require actual current management admission. The selector grants no new object.
        await assertCurrentGrants(tx, { objectRef: { type: 'abh.execution-authority', id: c.resourceOrganizationId, version: 1 }, scopeRefs: [scope], action: 'abh.execution-authority.create' }, grants);
        const rows = await tx.owner('HumanGateway')`SELECT e.id,e.version FROM human.decision_effects e
          JOIN human.control_effect_inputs p ON p.resource_organization_id=e.resource_organization_id AND p.effect_id=e.id
          WHERE e.resource_organization_id=${c.resourceOrganizationId} AND e.deleted_at IS NULL AND p.deleted_at IS NULL
            AND (e.workspace_id IS NULL OR e.workspace_id=${c.workspaceId??null}::uuid) AND (p.workspace_id IS NULL OR p.workspace_id=${c.workspaceId??null}::uuid)
            AND ${c.purposeOfUse}=ANY(e.purpose_names) AND ${c.purposeOfUse}=ANY(p.purpose_names)
            AND e.record->>'targetOwner'='Control' AND p.record->'authority'->'issuedBy'->>'id'=${c.actor.id}
            AND (${cursor??null}::uuid IS NULL OR e.id>${cursor??null}::uuid)
            AND NOT EXISTS(SELECT 1 FROM human.decision_effect_receipts r WHERE r.resource_organization_id=e.resource_organization_id AND r.effect_id=e.id)
          ORDER BY e.id LIMIT ${size}`;
        return rows.map(row => ({ type: 'abh.decision-effect', id: String(row.id), version: Number(row.version) }));
      });
      let applied = 0, replayed = 0;
      for (const ref of page) {
        if (input.signal.aborted) return;
        const payload = await database.transaction(await current(), options(), async tx => {
          const intent = await getDecisionEffectIntent(tx, ref), c = tx.context.tenant;
          const scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
          await assertCurrentGrants(tx, { objectRef: { type: 'abh.execution-authority', id: intent.commandRef.id, version: 1 }, scopeRefs: [scope], action: 'abh.execution-authority.create' }, grants);
          await input.checks.admit(tx, intent);
          const payload = await getControlDecisionEffectInput(tx, ref);
          if (!payload) throw new CoreError('PRECONDITION_FAILED');
          return payload;
        });
        const result = await applyControlDecisionEffect(database, await current(), options(), ref, payload, grants, input.checks);
        if (result.replayed) replayed++; else applied++;
      }
      if (input.signal.aborted) return;
      if (input.onPage) await boundedCallback(options => input.onPage!({ scanned: page.length, applied, replayed }, options), options());
      cursor = page.length === size ? page.at(-1)!.id : undefined;
      await delay(interval, undefined, { signal: input.signal });
    } catch (error) { if (input.signal.aborted) return; throw error; }
  }
}
