import type { ActionAuthorizationRequestRecord, ActionRecord, EntityRef } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { currentIdentity } from '../identity/owner.ts';
import { CoreError } from '../internal/errors.ts';
import { ActionOwner } from './actions.ts';
import { ActionAuthorizationRequestOwner } from './request-authorization.ts';
import { lockAction, sameRef } from './shared.ts';

export interface AuthorizationDiscoveryChecks {
  fenceRefs(tx: TenantTransaction, request: ActionAuthorizationRequestRecord, action: ActionRecord): Promise<EntityRef[]>;
  /** Current installation-wide recovery admission, including empty pages. */
  admit(tx: TenantTransaction): Promise<void>;
  /** Current source visibility. Hidden requests still consume bounded scan slots. */
  canRead(tx: TenantTransaction, request: ActionAuthorizationRequestRecord, action: ActionRecord): Promise<boolean>;
}
export interface AuthorizationRecoveryCandidate {
  request: ActionAuthorizationRequestRecord;
  action: ActionRecord;
  stage: 'Validate' | 'Pin' | 'Compile' | 'Authorize';
}

/** Tenant-local recovery hints, not work claims or permission to run a stage. Sweep again after the final page. */
export async function discoverAuthorizationRequests(database: Database, context: VerifiedContext, options: TransactionOptions,
  limit: number, afterId: string | undefined, readGrants: readonly EntityRef[], checks: AuthorizationDiscoveryChecks
): Promise<{ candidates: AuthorizationRecoveryCandidate[]; scanned: number; next?: string }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new CoreError('INVALID_ARGUMENT');
  if (afterId !== undefined) contract('UUID', afterId);
  if (context.tenant.actor.type !== 'Service') throw new CoreError('FORBIDDEN');
  if (context.tenant.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
  const grants = structuredClone([...readGrants]);
  return database.transaction(context, options, async tx => {
    const c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const rows = await tx.owner('ActionEngine')`SELECT r.id FROM execution.authorization_requests r JOIN execution.actions a
      ON a.resource_organization_id=r.resource_organization_id AND a.id=r.action_id
      WHERE r.resource_organization_id=${c.resourceOrganizationId} AND r.deleted_at IS NULL AND a.deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(r.purpose_names) AND ${c.purposeOfUse}=ANY(a.purpose_names)
      AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)
      AND (a.workspace_id IS NULL OR a.workspace_id=${c.workspaceId??null}::uuid)
      AND a.lifecycle IN ('Proposed','Validated') AND a.record->'executionPrincipalRef'->>'id'=${c.actor.id}
      AND (${afterId??null}::uuid IS NULL OR r.id>${afterId??null}::uuid)
      ORDER BY r.id LIMIT ${limit+1}`;
    const page = rows.slice(0, limit), requests = new ActionAuthorizationRequestOwner(), actions = new ActionOwner();
    const loaded: { request: ActionAuthorizationRequestRecord; action: ActionRecord }[] = [], fences: EntityRef[] = [];
    for (const row of page) {
      const request = await requests.get(tx, { type: 'abh.action-authorization-request', id: row.id, version: 1 });
      const action = await actions.get(tx, request.actionRef.id);
      loaded.push({ request, action });
      fences.push(...structuredClone(await checks.fenceRefs(tx, structuredClone(request), structuredClone(action))));
    }
    await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...fences]);
    // Organization-wide read Grant is required for recovery discovery, even on an empty page.
    await assertCurrentGrants(tx, { objectRef: { type: 'abh.action', id: c.resourceOrganizationId, version: 1 }, scopeRefs: [scope], action: 'abh.actions.read' }, grants);
    await checks.admit(tx);
    const identity = await currentIdentity(tx);
    for (const id of [...new Set(loaded.map(value => value.action.actionRef.id))].sort()) await lockAction(tx, id);
    const candidates: AuthorizationRecoveryCandidate[] = [];
    const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    for (const { request } of loaded) {
      const action = await actions.get(tx, request.actionRef.id), intent = await actions.getIntent(tx, request.actionRef.id);
      if (!sameRef(request.executionPrincipalRef, action.executionPrincipalRef) || request.actionRef.version > action.actionRef.version) throw new CoreError('INTERNAL_ERROR');
      if (!sameRef(identity.principal.principalRef, action.executionPrincipalRef)) throw new CoreError('EPOCH_REVOKED');
      if (!['Proposed','Validated'].includes(action.position.lifecycle) || Date.parse(intent.expiresAt) <= clock!.now.getTime()) continue;
      if (!await checks.canRead(tx, structuredClone(request), structuredClone(action))) continue;
      const stage = action.position.lifecycle === 'Proposed' ? 'Validate' : !action.pinSetRef ? 'Pin' : !action.planRef ? 'Compile' : 'Authorize';
      candidates.push({ request, action, stage });
    }
    return { candidates, scanned: page.length, ...(rows.length > limit && page.length ? { next: String(page.at(-1)!.id) } : {}) };
  });
}
