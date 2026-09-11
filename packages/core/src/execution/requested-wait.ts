import { randomUUID } from 'node:crypto';
import type { EntityRef } from '@abh/contracts';
import type { Database, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { requestVerifiedContext, type ContextSource } from '../identity/context-source.ts';
import { DurableWaitPort, WaitContextDirectory } from '../durable/wait-port.ts';
import { ActionApprovalWaitOwner } from './approval-waits.ts';
import { recoverRequestedResponsibility } from './requested-responsibility.ts';
import type { DecisionEligibility } from '../human/decisions.ts';
import type { RequestedPreparationChecks } from './requested-preparation.ts';

/** Recover opening facts, then register the real Action-owned Wait under a fresh current delivery Service. */
export async function waitRequestedResponsibility(database: Database, context: VerifiedContext, options: TransactionOptions,
  authorizationRequestRef: EntityRef, openingGrants: readonly EntityRef[], eligibility: DecisionEligibility, checks: RequestedPreparationChecks,
  delivery: { context: ContextSource; grantRef: EntityRef }) {
  const grant = structuredClone(delivery.grantRef);
  const recovered = await recoverRequestedResponsibility(database, context, options, authorizationRequestRef, openingGrants, eligibility, checks);
  const current = await requestVerifiedContext(delivery.context, options), caller = context.tenant, worker = current.tenant;
  if (worker.actor.type !== 'Service' || worker.purposeOfUse !== 'abh.runtime.deliver'
    || worker.actor.id !== caller.actor.id || worker.resourceOrganizationId !== caller.resourceOrganizationId
    || worker.actingOrganizationId !== caller.actingOrganizationId || worker.workspaceId !== caller.workspaceId) throw new CoreError('FORBIDDEN');
  const directory = new WaitContextDirectory(), reference = directory.register(current, [grant]);
  try {
    const port = new DurableWaitPort(database, directory, new ActionApprovalWaitOwner().install(grant));
    const result = await port.scheduleWakeup({
      context: { callId: randomUUID(), requestContextRef: reference, deadline: new Date(options.deadline).toISOString(),
        target: { objectRef: recovered.waitSource.ownerRef, scopeRefs: [{ type: 'abh.organization', id: worker.resourceOrganizationId, version: 1 }], action: 'abh.runtime.schedule-wakeup' } },
      ownerRef: recovered.waitSource.ownerRef, causeRef: recovered.waitSource.causeRef,
      waitKey: `authorization/${authorizationRequestRef.id}/approval`, dueAt: recovered.waitSource.dueAt,
    }, { signal: options.signal });
    if (result.status === 'Completed') return { ...recovered, waitRef: result.data.waitRef };
    if (result.status === 'Rejected') throw new CoreError(result.error.error.code);
    throw new CoreError('DEPENDENCY_TIMEOUT');
  } finally { directory.revoke(reference); }
}
