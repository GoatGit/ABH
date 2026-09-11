import { randomUUID } from 'node:crypto';
import type { ActionAuthorizationRequestRecord, ActionRecord, EntityRef } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, inputDigest } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { sameRef } from './shared.ts';
import { ActionAuthorizationRequestOwner } from './request-authorization.ts';
import { authorizePreparedAction, type PreparedActionAuthorizationChecks } from './authorize-action.ts';
import { ActionAuthorizationResolver } from '../control/snapshots.ts';

export interface RequestedAuthorizationAdmission {
  fenceRefs(tx: TenantTransaction, request: ActionAuthorizationRequestRecord, action: ActionRecord): Promise<EntityRef[]>;
  /** Current permission to act on the saved request. Must not impersonate its original caller. */
  admit(tx: TenantTransaction, request: ActionAuthorizationRequestRecord, action: ActionRecord): Promise<void>;
}

/** Request-bound finite T1. Replay requires the original pre-T1 Action version; no new authorization round is inferred. */
export async function authorizeRequestedAction(database: Database, context: VerifiedContext, options: TransactionOptions,
  requestRef: EntityRef, actionRef: EntityRef, resolver: ActionAuthorizationResolver,
  checks: PreparedActionAuthorizationChecks, admission: RequestedAuthorizationAdmission) {
  const reference = structuredClone(contract('EntityRef', requestRef)), target = structuredClone(contract('ActionRef', actionRef));
  if (reference.type !== 'abh.action-authorization-request' || reference.version !== 1) throw new CoreError('INVALID_ARGUMENT');
  if (context.tenant.actor.type !== 'Service' || context.tenant.purposeOfUse !== 'abh.action.execute') throw new CoreError('PURPOSE_DENIED');
  const read = async (tx: TenantTransaction, action?: ActionRecord) => {
    const request = await new ActionAuthorizationRequestOwner().get(tx, reference);
    if (request.actionRef.id !== target.id || request.actionRef.version > target.version || request.executionPrincipalRef.id !== tx.context.tenant.actor.id
      || action && (action.actionRef.id !== target.id || !sameRef(action.executionPrincipalRef, request.executionPrincipalRef))) throw new CoreError('FORBIDDEN');
    return request;
  };
  // Only persisted assertion data is used. It is never a substitute for Resolver selection/current proof.
  const saved = await database.transaction(context, options, tx => read(tx));
  const payload = structuredClone(saved.payload);
  const command = { type: 'abh.actions.request-authorization', commandId: randomUUID(),
    idempotencyKey: `authorization/${reference.id}/${target.version}/authorize`, digest: await inputDigest({ actionRef: target, payload }) };
  return authorizePreparedAction(database, context, options, command, target, payload, resolver, {
    fenceRefs: async (tx, action, intent, plan) => {
      const request = await read(tx, action);
      if (request.digest !== saved.digest) throw new CoreError('IDEMPOTENCY_CONFLICT');
      return [...structuredClone(await admission.fenceRefs(tx, structuredClone(request), structuredClone(action))),
        ...structuredClone(await checks.fenceRefs(tx, structuredClone(action), intent, plan))];
    },
    admit: async (tx, action) => {
      const request = await read(tx, action);
      if (request.digest !== saved.digest) throw new CoreError('IDEMPOTENCY_CONFLICT');
      await admission.admit(tx, structuredClone(request), structuredClone(action));
      await checks.admit(tx, structuredClone(action));
    },
    sources: (tx, source) => checks.sources(tx, source),
    artifact: (tx, artifact) => checks.artifact(tx, artifact),
    obligations: (tx, refs) => checks.obligations(tx, refs),
  });
}
