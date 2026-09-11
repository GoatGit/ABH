import { ensureRequestedResponsibility, requestedResponsibilityProgress, type RequestedResponsibilityPolicy } from './requested-responsibility.ts';
import { waitRequestedResponsibility } from './requested-wait.ts';
import type { DecisionEligibility } from '../human/decisions.ts';
import { setTimeout as delay } from 'node:timers/promises';
import type { EntityRef, OperationPlan, ValidateActionPayload } from '@abh/contracts';
import type { Database, TransactionOptions } from '../data/uow.ts';
import { requestVerifiedContext, type ContextSource } from '../identity/context-source.ts';
import { boundedCallback } from '../internal/bounded-callback.ts';
import { CoreError } from '../internal/errors.ts';
import { discoverAuthorizationRequests, type AuthorizationDiscoveryChecks, type AuthorizationRecoveryCandidate } from './authorization-discovery.ts';
import { validateRequestedAction, pinRequestedAction, type RequestedPreparationChecks } from './requested-preparation.ts';
import type { ActionValidationChecks } from './validate-action.ts';
import type { ActionPinChecks } from './pin-action.ts';
import { compileRequestedAction } from './requested-compilation.ts';
import { ActionCompilerHost } from './compiler.ts';
import type { ActionCompilationChecks } from './compile-action.ts';
import type { PlanRegistrationChecks } from './register-plan.ts';
import { authorizeRequestedAction, type RequestedAuthorizationAdmission } from './requested-authorization.ts';
import { ActionAuthorizationResolver } from '../control/snapshots.ts';
import type { PreparedActionAuthorizationChecks } from './authorize-action.ts';

export interface AuthorizationWorkerOptions {
  signal: AbortSignal;
  context: ContextSource;
  readGrants: readonly EntityRef[];
  discovery: AuthorizationDiscoveryChecks;
  requestChecks: RequestedPreparationChecks;
  validation: {
    /** Trusted deterministic evidence selection; reuse the same payload for an interrupted stage. */
    payload(candidate: AuthorizationRecoveryCandidate, options: TransactionOptions): Promise<ValidateActionPayload>;
    grants: readonly EntityRef[];
    checks: ActionValidationChecks;
  };
  pin: { grants: readonly EntityRef[]; checks: ActionPinChecks };
  compilation: {
    compiler: OperationPlan['compilerRef']; host: ActionCompilerHost; grants: readonly EntityRef[];
    checks: ActionCompilationChecks; registration: PlanRegistrationChecks;
  };
  /** Install only with actual execution governance. Missing approval/authority remains an error, not success. */
  authorization?: { context: ContextSource; resolver: ActionAuthorizationResolver; checks: PreparedActionAuthorizationChecks; admission: RequestedAuthorizationAdmission };
  /** Every discovered request requires responsibility. Without a policy, the route must already exist. */
  responsibility?: {
    effectKey: string;
    /** Explicit trusted first-route policy; absence never allows a missing route to bypass approval. */
    policy?: RequestedResponsibilityPolicy;
    grants: readonly EntityRef[];
    eligibility: DecisionEligibility;
    delivery: { context: ContextSource; grantRef: EntityRef };
  };
  pageSize?: number;
  intervalMs?: number;
  transactionTimeoutMs?: number;
  onPage?(result: { scanned: number; advanced: number; authorizationReady: number; responsibilityWaiting: number; responsibilityClosed: number }, options: TransactionOptions): Promise<void>;
}

/** Recovery sweeps drive actual Owners. Durable Action/Plan/Command facts, not in-memory cursor, determine progress. */
export async function runAuthorizationWorker(database: Database, input: AuthorizationWorkerOptions): Promise<void> {
  const pageSize = input.pageSize??100, interval = input.intervalMs??1000, timeout = input.transactionTimeoutMs??10000;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(interval) || interval < 1 || interval > 60000
    || !Number.isInteger(timeout) || timeout < 1 || timeout > 30000 || !(input.compilation.host instanceof ActionCompilerHost)
    || input.authorization && !(input.authorization.resolver instanceof ActionAuthorizationResolver)) throw new CoreError('INVALID_ARGUMENT');
  const reads = structuredClone([...input.readGrants]), validationGrants = structuredClone([...input.validation.grants]);
  const pinGrants = structuredClone([...input.pin.grants]), compileGrants = structuredClone([...input.compilation.grants]), compiler = structuredClone(input.compilation.compiler);
  const responsibility = input.responsibility && { ...input.responsibility, grants: structuredClone([...input.responsibility.grants]), delivery: { ...input.responsibility.delivery, grantRef: structuredClone(input.responsibility.delivery.grantRef) } };
  const options = (): TransactionOptions => ({ deadline: Date.now()+timeout, signal: input.signal });
  let cursor: string | undefined, tenant: string | undefined;
  const context = async (source: ContextSource, purpose: 'abh.action.prepare' | 'abh.action.execute') => {
    const current = await requestVerifiedContext(source, options()), c = current.tenant;
    if (c.actor.type !== 'Service' || c.purposeOfUse !== purpose) throw new CoreError('PURPOSE_DENIED');
    const key = JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
    if (tenant !== undefined && tenant !== key) throw new CoreError('FORBIDDEN');
    tenant = key; return current;
  };
  while (!input.signal.aborted) {
    try {
      const page = await discoverAuthorizationRequests(database, await context(input.context,'abh.action.prepare'), options(), pageSize, cursor, reads, input.discovery);
      let advanced = 0, authorizationReady = 0, responsibilityWaiting = 0, responsibilityClosed = 0;
      for (const candidate of page.candidates) {
        if (input.signal.aborted) return;
        try {
          const request = candidate.request.requestRef, action = candidate.action.actionRef;
          if (candidate.stage === 'Authorize') {
            if (responsibility) {
              const rule = responsibility, preparation = await context(input.context,'abh.action.prepare');
              if (rule.policy) await ensureRequestedResponsibility(database, preparation, options(), request, action, rule.policy, rule.grants, rule.eligibility, input.requestChecks);
              const progress = await requestedResponsibilityProgress(database, preparation, options(), request, rule.effectKey, rule.grants, rule.eligibility, input.requestChecks);
              if (progress.status === 'AwaitingCompletion') {
                await waitRequestedResponsibility(database, preparation, options(), request, rule.grants, rule.eligibility, input.requestChecks, rule.delivery);
                responsibilityWaiting++; continue;
              }
              if (progress.status === 'AwaitingEffect') { responsibilityWaiting++; continue; }
              if (progress.status === 'ClosedWithoutApproval') { responsibilityClosed++; continue; }
            }
            if (!input.authorization) { authorizationReady++; continue; }
            const installation = input.authorization!;
            await authorizeRequestedAction(database, await context(installation.context,'abh.action.execute'), options(), request, action,
              installation.resolver, installation.checks, installation.admission);
          } else {
            const current = await context(input.context,'abh.action.prepare');
            if (candidate.stage === 'Validate') {
              const payload = await boundedCallback(options => input.validation.payload(structuredClone(candidate), options), options());
              await validateRequestedAction(database, current, options(), request, action, payload, validationGrants, input.validation.checks, input.requestChecks);
            } else if (candidate.stage === 'Pin') {
              await pinRequestedAction(database, current, options(), request, action, { preparationAuthorityRefs: pinGrants }, input.pin.checks, input.requestChecks);
            } else {
              await compileRequestedAction(database, current, options(), request, compiler, input.compilation.host, compileGrants,
                input.compilation.checks, input.compilation.registration, input.requestChecks);
            }
          }
          advanced++;
        } catch (error) {
          // Only an actual Owner version race is eligible for rediscovery. Authority/policy failures stay visible.
          if (!(error instanceof CoreError) || error.code !== 'VERSION_CONFLICT') throw error;
        }
      }
      cursor = page.next;
      if (input.onPage) await boundedCallback(options => input.onPage!({ scanned: page.scanned, advanced, authorizationReady, responsibilityWaiting, responsibilityClosed }, options), options());
      if (input.signal.aborted) return;
      await delay(interval, undefined, { signal: input.signal });
    } catch (error) { if (input.signal.aborted) return; throw error; }
  }
}
