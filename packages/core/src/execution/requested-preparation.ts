import { randomUUID } from 'node:crypto';
import type { ActionAuthorizationRequestRecord, ActionRecord, EntityRef, PinActionPayload, ValidateActionPayload } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, inputDigest } from '../data/journal.ts';
import { currentIdentity } from '../identity/owner.ts';
import { CoreError } from '../internal/errors.ts';
import { ActionAuthorizationRequestOwner } from './request-authorization.ts';
import { validateAction, type ActionValidationChecks } from './validate-action.ts';
import { pinAction, type ActionPinChecks } from './pin-action.ts';
import { sameRef } from './shared.ts';

export interface RequestedPreparationChecks {
  fenceRefs(tx: TenantTransaction, request: ActionAuthorizationRequestRecord, action: ActionRecord): Promise<EntityRef[]>;
  /** Current permission to progress this persisted request; caller identity is evidence, never Worker authority. */
  admit(tx: TenantTransaction, request: ActionAuthorizationRequestRecord, action: ActionRecord): Promise<void>;
}

/** Shared internal request binding for preparation-stage composition. */
export function preparationBinding(context: VerifiedContext, requestRef: EntityRef, actionRef: EntityRef, checks: RequestedPreparationChecks) {
  const request = structuredClone(contract('EntityRef', requestRef)), target = structuredClone(contract('ActionRef', actionRef));
  if (request.type !== 'abh.action-authorization-request' || request.version !== 1) throw new CoreError('INVALID_ARGUMENT');
  if (context.tenant.actor.type !== 'Service') throw new CoreError('FORBIDDEN');
  if (context.tenant.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
  const read = async (tx: TenantTransaction, action: ActionRecord) => {
    const record = await new ActionAuthorizationRequestOwner().get(tx, request);
    if (record.actionRef.id !== target.id || record.actionRef.version > target.version || action.actionRef.id !== target.id
      || !sameRef(record.executionPrincipalRef, action.executionPrincipalRef) || action.executionPrincipalRef.id !== tx.context.tenant.actor.id) throw new CoreError('FORBIDDEN');
    if (target.version > action.actionRef.version) throw new CoreError('VERSION_CONFLICT');
    return record;
  };
  return {
    target,
    key: `authorization/${request.id}/${target.version}`,
    fences: async (tx: TenantTransaction, action: ActionRecord) => structuredClone(await checks.fenceRefs(tx, await read(tx, action), structuredClone(action))),
    admit: async (tx: TenantTransaction, action: ActionRecord) => {
      const record = await read(tx, action), identity = await currentIdentity(tx);
      if (!sameRef(identity.principal.principalRef, record.executionPrincipalRef)) throw new CoreError('EPOCH_REVOKED');
      await checks.admit(tx, structuredClone(record), structuredClone(action));
    },
  };
}

/** Replay uses the original Action version and evidence; changed input fails closed under the stable stage key. */
export async function validateRequestedAction(database: Database, context: VerifiedContext, options: TransactionOptions,
  requestRef: EntityRef, actionRef: EntityRef, payload: ValidateActionPayload, grantRefs: readonly EntityRef[],
  checks: ActionValidationChecks, requestChecks: RequestedPreparationChecks) {
  const binding = preparationBinding(context, requestRef, actionRef, requestChecks), input = structuredClone(contract('ValidateActionPayload', payload));
  const grants = structuredClone([...grantRefs]);
  const command = { type: 'abh.actions.validate', commandId: randomUUID(), idempotencyKey: `${binding.key}/validate`,
    digest: await inputDigest({ actionRef: binding.target, payload: input }) };
  return validateAction(database, context, options, command, binding.target, input, grants, {
    fenceRefs: async (tx, action, evidence) => [...await binding.fences(tx, action), ...structuredClone(await checks.fenceRefs(tx, structuredClone(action), evidence))],
    admit: async (tx, action, evidence) => { await binding.admit(tx, action); await checks.admit(tx, structuredClone(action), evidence); },
    artifact: (tx, artifact) => checks.artifact(tx, artifact),
    domain: (tx, action, intent, evidence) => checks.domain(tx, action, intent, evidence),
  });
}

/** Atomically binds the original Release PinSet using current preparation Grants and a stable request-stage key. */
export async function pinRequestedAction(database: Database, context: VerifiedContext, options: TransactionOptions,
  requestRef: EntityRef, actionRef: EntityRef, payload: PinActionPayload, checks: ActionPinChecks, requestChecks: RequestedPreparationChecks) {
  const binding = preparationBinding(context, requestRef, actionRef, requestChecks), input = structuredClone(contract('PinActionPayload', payload));
  const command = { type: 'abh.actions.pin', commandId: randomUUID(), idempotencyKey: `${binding.key}/pin`,
    digest: await inputDigest({ actionRef: binding.target, payload: input }) };
  const selected = checks.selected?.bind(checks);
  return pinAction(database, context, options, command, binding.target, input, {
    fenceRefs: async (tx, action) => [...await binding.fences(tx, action), ...structuredClone(await checks.fenceRefs(tx, structuredClone(action)))],
    admit: async (tx, action) => { await binding.admit(tx, action); await checks.admit(tx, structuredClone(action)); },
    artifact: (tx, artifact) => checks.artifact(tx, artifact),
    ...(selected ? {selected} : {}),
  });
}
