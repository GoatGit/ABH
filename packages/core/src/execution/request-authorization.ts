import { randomUUID } from 'node:crypto';
import type { ActionAuthorizationRequestRecord, ActionRecord, EntityRef, RequestAuthorizationPayload } from '@abh/contracts';
import { digestContract } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { appendChange, contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { lifecyclePurposes } from '../data/purposes.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { CoreError } from '../internal/errors.ts';
import { ActionOwner } from './actions.ts';
import { lockAction, sameRef } from './shared.ts';

export interface ActionAuthorizationRequestChecks {
  /** Trusted lifecycle metadata visibility for the later preparation/authorization/delivery Services. */
  purposeNames: readonly string[];
  fenceRefs(tx: TenantTransaction, action: ActionRecord): Promise<EntityRef[]>;
  /** Current source ownership and installed request admission, also on replay. No execution authority is issued here. */
  admit(tx: TenantTransaction, action: ActionRecord): Promise<void>;
}

/** Immutable caller intent. Worker identity, current authority and current approvals must be independently resolved. */
export class ActionAuthorizationRequestOwner {
  /** Same-UoW reception for a checked request command or an explicitly admitted automatic proposal. */
  async accept(tx: TenantTransaction, identity: CommandIdentity, reference: EntityRef, input: RequestAuthorizationPayload, purposes: readonly string[]) {
    contract('ActionRef', reference); contract('RequestAuthorizationPayload', input);
    if (!['abh.actions.propose','abh.actions.request-authorization'].includes(identity.type)) throw new CoreError('INVALID_ARGUMENT');
    const c = tx.context.tenant, actions = new ActionOwner();
    if (!['Human','Service'].includes(c.actor.type) || c.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
    const allowedPurposes = lifecyclePurposes(purposes, c.purposeOfUse);
    if (input.authorityRefs && input.authorityRefs.length !== 1) throw new CoreError('EXECUTION_AUTHORITY_AMBIGUOUS');
    const inputHash = await inputDigest({ actionRef: reference, payload: input });
    await lockAction(tx, reference.id);
    const action = await actions.get(tx, reference.id), intent = await actions.getIntent(tx, reference.id);
    if (!sameRef(action.actionRef, reference)) throw new CoreError('VERSION_CONFLICT');
    if (identity.type === 'abh.actions.request-authorization' && identity.digest !== inputHash) throw new CoreError('INVALID_ARGUMENT');
    if (identity.type === 'abh.actions.propose' && (reference.version !== 1 || action.sourceCommandRef.id !== identity.commandId
      || action.proposedBy.id !== c.actor.id || action.proposedBy.type !== c.actor.type || Object.keys(input).length !== 0)) throw new CoreError('FORBIDDEN');
    if (!['Proposed', 'Validated'].includes(action.position.lifecycle)) throw new CoreError('PRECONDITION_FAILED');
    const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    if (Date.parse(intent.expiresAt) <= clock!.now.getTime()) throw new CoreError('PRECONDITION_FAILED');
    const unsigned = contract('ActionAuthorizationRequestRecord', {
      requestRef: { type: 'abh.action-authorization-request', id: randomUUID(), version: 1 }, resourceOrganizationId: c.resourceOrganizationId,
      actionRef: reference, sourceCommandRef: { type: 'abh.command', id: identity.commandId, version: 1 }, requestedBy: c.actor,
      executionPrincipalRef: action.executionPrincipalRef, payload: input, inputDigest: inputHash, acceptedAt: clock!.now.toISOString(), digest: 'sha256:'+'0'.repeat(64),
    });
    const record = contract('ActionAuthorizationRequestRecord', { ...unsigned, digest: await digestContract('ActionAuthorizationRequestRecord', unsigned) });
    await tx.owner('ActionEngine')`INSERT INTO execution.authorization_requests(resource_organization_id,id,workspace_id,purpose_names,action_id,command_id,record)
      VALUES (${c.resourceOrganizationId},${record.requestRef.id},${c.workspaceId??null},${allowedPurposes},${reference.id},${identity.commandId},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx, { command: identity, target: record.requestRef, eventType: 'abh.action-authorization-request.accepted',
      changedFields: ['actionRef','requestedBy','payload'], relatedRefs: [reference, record.executionPrincipalRef] });
    return record.requestRef;
  }
  async get(tx: TenantTransaction, requestRef: EntityRef): Promise<ActionAuthorizationRequestRecord> {
    contract('EntityRef', requestRef);
    if (requestRef.type !== 'abh.action-authorization-request' || requestRef.version !== 1) throw new CoreError('INVALID_ARGUMENT');
    const c = tx.context.tenant;
    const [row] = await tx.owner('ActionEngine')`SELECT record,version,action_id,command_id FROM execution.authorization_requests
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${requestRef.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    const record = contract('ActionAuthorizationRequestRecord', row.record);
    if (!sameRef(record.requestRef, requestRef) || Number(row.version) !== 1 || record.resourceOrganizationId !== c.resourceOrganizationId
      || record.actionRef.id !== row.action_id || record.sourceCommandRef.id !== row.command_id || record.sourceCommandRef.version !== 1
      || record.executionPrincipalRef.type !== 'abh.principal' || record.digest !== await digestContract('ActionAuthorizationRequestRecord', record)
      || record.inputDigest !== await inputDigest({ actionRef: record.actionRef, payload: record.payload })) throw new CoreError('INTERNAL_ERROR');
    return record;
  }
}

/** Internal durable reception. Does not pretend that accepting a Human request has completed Service T1. */
export async function requestActionAuthorization(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  actionRef: EntityRef, payload: RequestAuthorizationPayload, grantRefs: readonly EntityRef[], checks: ActionAuthorizationRequestChecks) {
  const reference = structuredClone(contract('ActionRef', actionRef)), input = structuredClone(contract('RequestAuthorizationPayload', payload));
  const identity = { ...command }, grants = structuredClone([...grantRefs]), purposes = lifecyclePurposes([...checks.purposeNames], context.tenant.purposeOfUse);
  if (identity.type !== 'abh.actions.request-authorization' || identity.digest !== await inputDigest({ actionRef: reference, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  if (input.authorityRefs && input.authorityRefs.length !== 1) throw new CoreError('EXECUTION_AUTHORITY_AMBIGUOUS');
  if (!['Human', 'Service'].includes(context.tenant.actor.type) || context.tenant.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
  return database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const result = await executeCommand(tx, identity, async () => {
      const action = await actions.get(tx, reference.id);
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants,
        ...structuredClone(await checks.fenceRefs(tx, structuredClone(action)))]);
      await assertCurrentGrants(tx, { objectRef: reference, scopeRefs: [scope], action: identity.type }, grants);
      await checks.admit(tx, structuredClone(action));
    }, async () => {
      return new ActionAuthorizationRequestOwner().accept(tx, identity, reference, input, purposes);
    });
    const request = await new ActionAuthorizationRequestOwner().get(tx, result.receipt.resultRef);
    if (!sameRef(request.actionRef, reference) || request.inputDigest !== identity.digest || request.sourceCommandRef.id !== result.receipt.commandRef.id) throw new CoreError('INTERNAL_ERROR');
    return { request, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
