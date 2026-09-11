import type { ActionListResponse, ActionRecord, EntityRef, ListActionsQuery } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, inputDigest } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { lockAction } from './shared.ts';
import { ActionOwner } from './actions.ts';
import { readActionQuery, type ActionViewAction, type ActionViewAdmission } from './action-query.ts';

export type ActionListFilter = Omit<ListActionsQuery, 'cursor' | 'limit' | 'consistency'>;
export interface ActionListPosition { createdAt: string; id: string }
export interface ActionListAdmission extends ActionViewAdmission {
  listFenceRefs(tx: TenantTransaction, filter: ActionListFilter): Promise<EntityRef[]>;
  admitList(tx: TenantTransaction, filter: ActionListFilter): Promise<void>;
}
export function validateActionListPosition(position: ActionListPosition): void {
  contract('UUID', position.id); contract('Time', position.createdAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(position.createdAt)) throw new CoreError('INVALID_ARGUMENT');
}
function matches(action: ActionRecord, filter: ActionListFilter): boolean {
  return (!filter.missionId || action.missionRef?.id === filter.missionId) && (!filter.type || action.actionType === filter.type)
    && (!filter.lifecycle || action.position.lifecycle === filter.lifecycle) && (!filter.outcome || action.position.outcome === filter.outcome);
}

/** Bounded scan page; hidden rows consume scan slots, so an empty page may have a continuation. */
export async function listActionQuery(database: Database, context: VerifiedContext, options: TransactionOptions,
  filter: ActionListFilter, limit: number, after: ActionListPosition | undefined, readGrants: readonly EntityRef[],
  actionGrants: Partial<Record<ActionViewAction, readonly EntityRef[]>>, admission: ActionListAdmission): Promise<{ response: ActionListResponse; next?: ActionListPosition }> {
  contract('ListActionsQuery', { ...filter, limit });
  if (after) validateActionListPosition(after);
  const input = structuredClone(filter), position = after && { ...after }, reads = structuredClone([...readGrants]), commands = structuredClone(actionGrants);
  return database.transaction(context, options, async tx => {
    const c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    // Internal metadata discovery only. No candidate reaches the caller before current admission.
    const rows = await tx.owner('ActionEngine')`SELECT id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM execution.actions
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid)
      AND (${input.missionId ?? null}::text IS NULL OR record->'missionRef'->>'id'=${input.missionId ?? null})
      AND (${input.type ?? null}::text IS NULL OR record->>'actionType'=${input.type ?? null})
      AND (${input.lifecycle ?? null}::text IS NULL OR lifecycle=${input.lifecycle ?? null})
      AND (${input.outcome ?? null}::text IS NULL OR outcome=${input.outcome ?? null})
      AND (${position?.id ?? null}::uuid IS NULL OR (created_at,id)<(${position?.createdAt ?? null}::text::timestamptz,${position?.id ?? null}::uuid))
      ORDER BY execution.actions.created_at DESC,id DESC LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit), fences = structuredClone(await admission.listFenceRefs(tx, structuredClone(input)));
    for (const row of page) fences.push(...await admission.fenceRefs(tx, row.id));
    await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...reads, ...Object.values(commands).flatMap(refs => [...refs]), ...fences]);
    await assertCurrentGrants(tx, { objectRef: { type: 'abh.action', id: c.resourceOrganizationId, version: 1 }, scopeRefs: [scope], action: 'abh.actions.read' }, reads);
    await admission.admitList(tx, structuredClone(input));
    for (const id of page.map(row => String(row.id)).sort()) await lockAction(tx, id);
    const data: ActionListResponse['data'] = [];
    for (const row of page) {
      try {
        const action = await new ActionOwner().get(tx, row.id);
        if (!matches(action, input)) continue;
        data.push((await readActionQuery(tx, row.id, reads, commands, admission, true)).data);
      } catch (error) {
        if (!(error instanceof CoreError) || error.code !== 'RESOURCE_NOT_FOUND') throw error;
      }
    }
    const last = page.at(-1), next = rows.length > limit && last ? { createdAt: String(last.created_at), id: String(last.id) } : undefined;
    const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    const response = contract('ActionListResponse', { success: true, data, meta: { asOf: clock!.now.toISOString(), stale: false,
      watermark: `action-page/${await inputDigest({ organizationId: c.resourceOrganizationId, workspaceId: c.workspaceId ?? null, principalId: c.actor.id, purpose: c.purposeOfUse, filter: input, data, next: next ?? null })}` } });
    return { response, ...(next ? { next } : {}) };
  });
}
