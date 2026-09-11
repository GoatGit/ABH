import type { DecisionQueryResponse, DecisionInboxResponse, EntityRef } from '@abh/contracts';
import type { Database, TransactionOptions } from '../data/uow.ts';
import { contract, inputDigest } from '../data/journal.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { lockDecisionViewPage, readDecisionView, type DecisionViewAction, type DecisionViewAdmission } from './decision-view.ts';
import { DecisionOwner } from './decisions.ts';
import { DecisionInboxOwner, type DecisionInboxFilter } from './inbox.ts';
import { assertCurrentGrants } from '../control/grants.ts';

/** Each page is a fresh authorized Strong read, not a snapshot spanning multiple HTTP requests. */
export async function listDecisionQuery(database: Database, context: VerifiedContext, options: TransactionOptions, filter: DecisionInboxFilter,
  readGrants: readonly EntityRef[], actionGrants: Partial<Record<DecisionViewAction, readonly EntityRef[]>>, admission: DecisionViewAdmission): Promise<DecisionInboxResponse> {
  const reads = structuredClone([...readGrants]), actions = structuredClone(actionGrants), input = { ...filter };
  return database.transaction(context, options, async tx => {
    await lockDecisionViewPage(tx, reads, actions, admission);
    const c = tx.context.tenant;
    await assertCurrentGrants(tx, { objectRef: { type: 'abh.decision', id: c.resourceOrganizationId, version: 1 },
      scopeRefs: [{ type: 'abh.organization', id: c.resourceOrganizationId, version: 1 }], action: 'abh.decisions.read' }, reads);
    const page = await new DecisionInboxOwner().list(tx, input, reads, admission);
    const data = [];
    for (const decision of page.decisions) data.push(await readDecisionView(tx, decision.decisionRef.id, reads, actions, admission));
    const [clock] = await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    const watermark = `decision-page/${await inputDigest({ organizationId: context.tenant.resourceOrganizationId,
      workspaceId: context.tenant.workspaceId ?? null, principalId: context.tenant.actor.id, purpose: context.tenant.purposeOfUse,
      filter: input, data, nextCursor: page.nextCursor ?? null })}`;
    return contract('DecisionInboxResponse', { success: true, data, meta: { asOf: clock!.now.toISOString(), watermark, stale: false,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) } });
  });
}

/** Object-local Strong source watermark. Not a projection cursor, event position or retention permission. */
export async function getDecisionQuery(database: Database, context: VerifiedContext, options: TransactionOptions, id: string,
  readGrants: readonly EntityRef[], actionGrants: Partial<Record<DecisionViewAction, readonly EntityRef[]>>, admission: DecisionViewAdmission): Promise<DecisionQueryResponse> {
  contract('UUID', id);
  const reads = structuredClone([...readGrants]), actions = structuredClone(actionGrants);
  return database.transaction(context, options, async tx => {
    // The view acquires the organization/source fences shared with Decision and Effect mutations.
    const data = await readDecisionView(tx, id, reads, actions, admission);
    const request = await new DecisionOwner().getRequest(tx, data.package.requestRef.id);
    const [clock] = await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    const watermark = `decision-source/${await inputDigest({
      organizationId: context.tenant.resourceOrganizationId, workspaceId: context.tenant.workspaceId ?? null,
      principalId: context.tenant.actor.id, purpose: context.tenant.purposeOfUse,
      requestRef: request.requestRef, routeRevision: request.routeRevision, view: data,
    })}`;
    return contract('DecisionQueryResponse', { success: true, data, meta: { asOf: clock!.now.toISOString(), watermark, stale: false } });
  });
}
