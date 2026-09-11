import type { ActionRecord, ActionQueryResponse, ActionView, EntityRef } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, inputDigest } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { readAuthorizationSnapshot } from '../control/snapshots.ts';
import { DecisionOwner } from '../human/decisions.ts';
import { ActionOwner } from './actions.ts';
import { OperationOwner } from './operations.ts';
import { ResourceFenceOwner } from './resource-fences.ts';
import { ReconciliationOwner } from './reconciliations.ts';
import { lockAction, sameRef } from './shared.ts';

export type ActionViewAction = 'abh.actions.cancel' | 'abh.actions.request-authorization';
export interface ActionViewAdmission {
  fenceRefs(tx: TenantTransaction, id: string): Promise<EntityRef[]>;
  /** Current object-level visibility, target/source policy, MFA and duties. */
  canRead(tx: TenantTransaction, action: ActionRecord): Promise<boolean>;
  /** Related references and their summary facts require independent visibility. */
  canReadRelated(tx: TenantTransaction, action: ActionRecord, ref: EntityRef): Promise<boolean>;
  /** Current command preconditions; a true result never substitutes for its own Grant. */
  canAct(tx: TenantTransaction, action: ActionRecord, command: ActionViewAction): Promise<boolean>;
}

export async function getActionQuery(database: Database, context: VerifiedContext, options: TransactionOptions, id: string,
  readGrants: readonly EntityRef[], actionGrants: Partial<Record<ActionViewAction, readonly EntityRef[]>>, admission: ActionViewAdmission): Promise<ActionQueryResponse> {
  contract('UUID', id);
  const reads = structuredClone([...readGrants]), commands = structuredClone(actionGrants);
  return database.transaction(context, options, tx => readActionQuery(tx, id, reads, commands, admission));
}

/** Internal page composition reuses a complete pre-acquired fence/parent lock set. */
export async function readActionQuery(tx: TenantTransaction, id: string, reads: readonly EntityRef[],
  commands: Partial<Record<ActionViewAction, readonly EntityRef[]>>, admission: ActionViewAdmission, pageLocked = false): Promise<ActionQueryResponse> {
    const c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    try {
      if (!pageLocked) await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...reads,
        ...Object.values(commands).flatMap(refs => [...refs]), ...await admission.fenceRefs(tx, id)]);
      await assertCurrentGrants(tx, { objectRef: { type: 'abh.action', id, version: 1 }, scopeRefs: [scope], action: 'abh.actions.read' }, reads);
    } catch (error) {
      if (error instanceof CoreError && ['FORBIDDEN', 'AUTHORITY_REQUIRED', 'EPOCH_REVOKED'].includes(error.code)) throw new CoreError('RESOURCE_NOT_FOUND');
      throw error;
    }
    // Every Operation transition participates in this parent lock; no partial child version vector is returned.
    await lockAction(tx, id);
    const action = await new ActionOwner().get(tx, id);
    const allowed = async (check: () => Promise<boolean>) => {
      try { return await check(); } catch (error) {
        if (error instanceof CoreError && ['FORBIDDEN', 'AUTHORITY_REQUIRED', 'EPOCH_REVOKED'].includes(error.code)) return false;
        throw error;
      }
    };
    if (!await allowed(() => admission.canRead(tx, structuredClone(action)))) throw new CoreError('RESOURCE_NOT_FOUND');
    const visible = (ref: EntityRef) => allowed(() => admission.canReadRelated(tx, structuredClone(action), structuredClone(ref)));
    const authorizationSummary: ActionView['authorizationSummary'] = {};
    if (action.executionAuthorityRef && await visible(action.executionAuthorityRef)) authorizationSummary.authorityRef = action.executionAuthorityRef;
    if (action.authorizationSnapshotRef && await visible(action.authorizationSnapshotRef)) {
      const snapshot = await readAuthorizationSnapshot(tx, action.authorizationSnapshotRef);
      if (snapshot.actionRef.id !== id || snapshot.payloadDigest !== action.payloadDigest || !action.planRef || !sameRef(snapshot.planRef, action.planRef) || !action.pinSetRef || !sameRef(snapshot.pinSetRef, action.pinSetRef) || !action.executionAuthorityRef || !sameRef(snapshot.authorityRef, action.executionAuthorityRef)) throw new CoreError('INTERNAL_ERROR');
      authorizationSummary.snapshotRef = action.authorizationSnapshotRef;
      authorizationSummary.expiresAt = snapshot.validUntil;
    }
    const operations = new OperationOwner(), children = await operations.list(tx, id);
    if (children.length > 1000) throw new CoreError('INTERNAL_ERROR');
    const operationSummary: ActionView['operationSummary'] = [], unresolved = new Map<string, EntityRef>();
    const add = (ref: EntityRef) => unresolved.set(`${ref.type}/${ref.id}`, ref);
    for (const child of children) if (await visible(child.operationRef)) {
      operationSummary.push({ operationRef: child.operationRef, position: child.position });
      if (child.position.outcome === 'Unknown') add(child.operationRef);
    }
    // Current authorization/exception responsibility records, not delayed Wait notification state.
    const requestRows = await tx.owner('HumanGateway')`SELECT id FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId ?? null}::uuid)
      AND status IN ('Open','Unresolved') AND ((record->'subjectRef'->>'type'='abh.action' AND record->'subjectRef'->>'id'=${id})
        OR (record->'subjectRef'->>'type'='abh.operation' AND record->'subjectRef'->>'id'=ANY(${children.map(child => child.operationRef.id)}::text[]))) ORDER BY id LIMIT 1001`;
    if (requestRows.length > 1000) throw new CoreError('INTERNAL_ERROR');
    const authorizationRequests: EntityRef[] = [];
    for (const row of requestRows) {
      const request = await new DecisionOwner().getRequest(tx, row.id);
      if (request.requestRef.id !== row.id || request.resourceOrganizationId !== c.resourceOrganizationId) throw new CoreError('INTERNAL_ERROR');
      if (!await visible(request.requestRef)) continue;
      add(request.requestRef);
      if (request.kind === 'Authorization' && request.subjectRef.type === 'abh.action' && request.subjectRef.id === id && request.proposalDigest === action.payloadDigest) authorizationRequests.push(request.requestRef);
    }
    if (authorizationRequests.length === 1) authorizationSummary.requestRef = { ...authorizationRequests[0]!, type: 'abh.responsibility-request' };
    // Technical freezes remain unresolved even after the human responsibility was closed.
    const plan = await operations.getPlan(tx, id);
    if (plan && (!action.planRef || !sameRef(action.planRef, plan.planRef) || children.some(child => !sameRef(child.planRef, plan.planRef)))) throw new CoreError('INTERNAL_ERROR');
    if (plan) for (const node of plan.nodes) {
      const fence = await new ResourceFenceOwner().read(tx, node);
      if (!fence || !await visible(fence.fenceRef)) continue;
      let relevant = !!fence.unresolvedOperationRef && children.some(child => child.operationRef.id === fence.unresolvedOperationRef!.id);
      if (fence.blockedByReportRef && await visible(fence.blockedByReportRef)) {
        const report = await new ReconciliationOwner().get(tx, fence.blockedByReportRef);
        relevant ||= children.some(child => child.operationRef.id === report.operationRef.id);
      }
      if (relevant) add(fence.fenceRef);
    }
    const availableActions: ActionViewAction[] = [];
    for (const command of ['abh.actions.cancel', 'abh.actions.request-authorization'] as const) {
      const allowedState = command === 'abh.actions.cancel' ? ['Proposed', 'Validated', 'Authorized', 'Executing', 'Reconciling'] : ['Proposed', 'Validated'];
      if (!allowedState.includes(action.position.lifecycle) || !commands[command]?.length) continue;
      try {
        await assertCurrentGrants(tx, { objectRef: action.actionRef, scopeRefs: [scope], action: command }, commands[command]!);
        if (await admission.canAct(tx, structuredClone(action), command)) availableActions.push(command);
      } catch (error) {
        if (!(error instanceof CoreError) || !['AUTHORITY_REQUIRED', 'FORBIDDEN', 'EPOCH_REVOKED', 'PRECONDITION_FAILED'].includes(error.code)) throw error;
      }
    }
    if (unresolved.size > 1000) throw new CoreError('INTERNAL_ERROR');
    const data = contract('ActionView', { actionRef: action.actionRef, actionType: action.actionType, position: action.position,
      authorizationSummary, operationSummary, unresolvedRefs: [...unresolved.values()], availableActions });
    const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    return contract('ActionQueryResponse', { success: true, data, meta: { asOf: clock!.now.toISOString(), stale: false,
      watermark: `action-source/${await inputDigest({ organizationId: c.resourceOrganizationId, workspaceId: c.workspaceId ?? null, principalId: c.actor.id, purpose: c.purposeOfUse, data })}` } });
}
