import { readRequestControlEffect } from '../human/request-effect.ts';
import { randomUUID } from 'node:crypto';
import type { ActionAuthorizationRequestRecord, ActionIntentRecord, ActionRecord, EntityRef, OpenResponsibilityRequestPayload, OperationPlan } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, executeCommand, inputDigest } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { boundedCallback } from '../internal/bounded-callback.ts';
import { ActionAuthorizationRequestOwner } from './request-authorization.ts';
import { CoreError } from '../internal/errors.ts';
import { DecisionOwner, type DecisionEligibility } from '../human/decisions.ts';
import { ActionOwner } from './actions.ts';
import { OperationOwner } from './operations.ts';
import { preparationBinding, type RequestedPreparationChecks } from './requested-preparation.ts';
import { lockAction, sameRef } from './shared.ts';

/** Opens one governed approval route for a saved authorization request. No Decision or Authority is fabricated. */
export async function openRequestedResponsibility(database: Database, context: VerifiedContext, options: TransactionOptions,
  authorizationRequestRef: EntityRef, proposal: OpenResponsibilityRequestPayload, grantRefs: readonly EntityRef[],
  eligibility: DecisionEligibility, checks: RequestedPreparationChecks) {
  const input = structuredClone(contract('OpenResponsibilityRequestPayload', proposal)), grants = structuredClone([...grantRefs]);
  const binding = preparationBinding(context, authorizationRequestRef, input.request.subjectRef, checks);
  if (input.request.kind !== 'Authorization') throw new CoreError('INVALID_ARGUMENT');
  const command = { type: 'abh.responsibility-requests.open', commandId: randomUUID(),
    idempotencyKey: `authorization/${authorizationRequestRef.id}/responsibility`, digest: await inputDigest(input) };
  return database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), decisions = new DecisionOwner(), c = tx.context.tenant;
    const scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const result = await executeCommand(tx, command, async () => {
      const action = await actions.get(tx, binding.target.id);
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...await binding.fences(tx, action)]);
      await assertCurrentGrants(tx, { objectRef: input.request.requestRef, scopeRefs: [scope], action: command.type }, grants);
      await binding.admit(tx, action);
      await eligibility.lock(tx, structuredClone(input.request));
      if (input.request.proposalDigest !== action.payloadDigest) throw new CoreError('DECISION_STALE');
    }, async () => {
      await lockAction(tx, binding.target.id);
      const action = await actions.get(tx, binding.target.id), intent = await actions.getIntent(tx, binding.target.id);
      if (!sameRef(action.actionRef, binding.target)) throw new CoreError('VERSION_CONFLICT');
      const plan = await new OperationOwner().getPlan(tx, action.actionRef.id);
      if (action.position.lifecycle !== 'Validated' || !plan || !action.planRef || !sameRef(plan.planRef, action.planRef)) throw new CoreError('PRECONDITION_FAILED');
      const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
      if (Date.parse(intent.expiresAt) <= clock!.now.getTime() || Date.parse(input.request.expiresAt) > Date.parse(intent.expiresAt)) throw new CoreError('DECISION_STALE');
      return (await decisions.open(tx, command, input, {
        lock: async () => {},
        candidate: (tx, assignment, request) => eligibility.candidate(tx, structuredClone(assignment), structuredClone(request)),
        submit: (tx, decision, assignment, request, submission) => eligibility.submit(tx, structuredClone(decision), structuredClone(assignment), structuredClone(request), structuredClone(submission)),
        revalidate: (tx, decision, request) => eligibility.revalidate(tx, structuredClone(decision), structuredClone(request)),
        conditions: (tx, decisions) => eligibility.conditions(tx, structuredClone(decisions)),
      })).requestRef;
    });
    const current = await decisions.getRequest(tx, result.receipt.resultRef.id);
    if (current.subjectRef.id !== binding.target.id || current.proposalDigest !== input.request.proposalDigest) throw new CoreError('INTERNAL_ERROR');
    return { waitSource: { ownerRef: input.request.subjectRef, dueAt: input.request.expiresAt, causeRef: result.receipt.resultRef }, requestRef: result.receipt.resultRef, current, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}

/** Recover the originally frozen opening proposal; current opening admission still runs before anything is returned. */
export async function recoverRequestedResponsibility(database: Database, context: VerifiedContext, options: TransactionOptions,
  authorizationRequestRef: EntityRef, grantRefs: readonly EntityRef[], eligibility: DecisionEligibility, checks: RequestedPreparationChecks) {
  const reference = structuredClone(contract('EntityRef', authorizationRequestRef));
  if (reference.type !== 'abh.action-authorization-request' || reference.version !== 1) throw new CoreError('INVALID_ARGUMENT');
  if (context.tenant.actor.type !== 'Service' || context.tenant.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
  const grants = structuredClone([...grantRefs]);
  const proposal = await database.transaction(context, options, async tx => {
    const input = await originalProposal(tx, reference);
    if (!input) throw new CoreError('RESOURCE_NOT_FOUND');
    return input;
  });
  // Uses original bytes/IDs even when routing or Decision status advanced. Never rebuilds a route from latest state.
  return openRequestedResponsibility(database, context, options, reference, proposal, grants, eligibility, checks);
}

/** Only an absent original receipt means no route; hidden/corrupt frozen inputs remain errors. */
async function originalProposal(tx: TenantTransaction, reference: EntityRef): Promise<OpenResponsibilityRequestPayload | undefined> {
  const c = tx.context.tenant;
  // Internal lookup only. A missing receipt is not an authorized negative query result.
  const [row] = await tx.owner('CommandIngress')`SELECT record,workspace_id FROM data.command_receipts
    WHERE resource_organization_id=${c.resourceOrganizationId} AND actor_principal_id=${c.actor.id}
    AND command_type='abh.responsibility-requests.open' AND idempotency_key=${`authorization/${reference.id}/responsibility`}`;
  if (!row) return undefined;
  if (row.workspace_id && row.workspace_id !== c.workspaceId) throw new CoreError('RESOURCE_NOT_FOUND');
  const receipt = contract('CommandReceipt', row.record);
  if (receipt.resultRef.type !== 'abh.responsibility-request' || receipt.resourceOrganizationId !== c.resourceOrganizationId
    || receipt.actorPrincipalId !== c.actor.id || receipt.commandType !== 'abh.responsibility-requests.open'
    || receipt.idempotencyKey !== `authorization/${reference.id}/responsibility`) throw new CoreError('INTERNAL_ERROR');
  const [frozen] = await tx.owner('HumanGateway')`SELECT record FROM human.routing_proposals
    WHERE resource_organization_id=${c.resourceOrganizationId} AND request_id=${receipt.resultRef.id} AND route_revision=1 AND deleted_at IS NULL
    AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if (!frozen) throw new CoreError('RESOURCE_NOT_FOUND');
  const input = contract('OpenResponsibilityRequestPayload', frozen.record);
  if (input.request.requestRef.id !== receipt.resultRef.id || await inputDigest(input) !== receipt.inputDigest) throw new CoreError('INTERNAL_ERROR');
  return input;
}

export interface RequestedResponsibilityInput {
  request: ActionAuthorizationRequestRecord;
  action: ActionRecord;
  intent: ActionIntentRecord;
  plan: OperationPlan;
}

/** Trusted business policy, bounded outside the transaction. Output is a proposal, never an approval. */
export type RequestedResponsibilityPolicy = (input: RequestedResponsibilityInput, options: TransactionOptions) => Promise<OpenResponsibilityRequestPayload>;

/** Recovers frozen routes before selecting a first proposal. Concurrent uncommitted proposals may be discarded. */
export async function ensureRequestedResponsibility(database: Database, context: VerifiedContext, options: TransactionOptions,
  requestRef: EntityRef, actionRef: EntityRef, policy: RequestedResponsibilityPolicy, grantRefs: readonly EntityRef[],
  eligibility: DecisionEligibility, checks: RequestedPreparationChecks) {
  const reference = structuredClone(contract('EntityRef', requestRef));
  const binding = preparationBinding(context, reference, actionRef, checks), grants = structuredClone([...grantRefs]);
  const open = (proposal: OpenResponsibilityRequestPayload) => {
    if (!sameRef(proposal.request.subjectRef, binding.target)) throw new CoreError('DECISION_STALE');
    return openRequestedResponsibility(database, context, options, reference, proposal, grants, eligibility, checks);
  };
  const existing = await database.transaction(context, options, tx => originalProposal(tx, reference));
  if (existing) return open(existing);
  const input = await database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), c = tx.context.tenant;
    const action = await actions.get(tx, binding.target.id), scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...await binding.fences(tx, action)]);
    // First-route policy reads require organization-wide opening permission, before any new request ID exists.
    const openingGrants = await assertCurrentGrants(tx, { objectRef: { type: 'abh.responsibility-request', id: randomUUID(), version: 1 }, scopeRefs: [scope], action: 'abh.responsibility-requests.open' }, grants);
    if (openingGrants.some(grant => !grant.scopeRefs.some(ref => ref.type === scope.type && ref.id === scope.id))) throw new CoreError('FORBIDDEN');
    await binding.admit(tx, action);
    await lockAction(tx, binding.target.id);
    const current = await actions.get(tx, binding.target.id), intent = await actions.getIntent(tx, binding.target.id);
    if (!sameRef(current.actionRef, binding.target)) throw new CoreError('VERSION_CONFLICT');
    const plan = await new OperationOwner().getPlan(tx, binding.target.id);
    if (current.position.lifecycle !== 'Validated' || !plan || !current.planRef || !sameRef(plan.planRef, current.planRef)) throw new CoreError('PRECONDITION_FAILED');
    const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    if (Date.parse(intent.expiresAt) <= clock!.now.getTime()) throw new CoreError('DECISION_STALE');
    return { request: await new ActionAuthorizationRequestOwner().get(tx, reference), action: current, intent, plan };
  });
  const proposal = structuredClone(contract('OpenResponsibilityRequestPayload', await boundedCallback(opts => policy(structuredClone(input), opts), options)));
  try { return await open(proposal); }
  catch (error) {
    if (!(error instanceof CoreError) || error.code !== 'IDEMPOTENCY_CONFLICT') throw error;
    const winner = await database.transaction(context, options, tx => originalProposal(tx, reference));
    if (!winner) throw error;
    // Re-enter actual admission/eligibility for the committed winner; never overwrite its frozen route.
    return open(winner);
  }
}

/** Request-bound recovery status under current opening/source admission. EffectApplied still requires fresh T1. */
export async function requestedResponsibilityProgress(database: Database, context: VerifiedContext, options: TransactionOptions,
  authorizationRequestRef: EntityRef, effectKey: string, grantRefs: readonly EntityRef[], eligibility: DecisionEligibility, checks: RequestedPreparationChecks) {
  const reference = structuredClone(contract('EntityRef', authorizationRequestRef)), grants = structuredClone([...grantRefs]);
  contract('IdempotencyKey', effectKey);
  const recovered = await recoverRequestedResponsibility(database, context, options, reference, grants, eligibility, checks);
  const binding = preparationBinding(context, reference, recovered.waitSource.ownerRef, checks);
  return database.transaction(context, options, async tx => {
    const action = await new ActionOwner().get(tx, binding.target.id), c = tx.context.tenant;
    const scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...await binding.fences(tx, action)]);
    await assertCurrentGrants(tx, { objectRef: recovered.requestRef, scopeRefs: [scope], action: 'abh.responsibility-requests.open' }, grants);
    await binding.admit(tx, action);
    return readRequestControlEffect(tx, recovered.current.requestRef, recovered.current.subjectRef, effectKey);
  });
}
