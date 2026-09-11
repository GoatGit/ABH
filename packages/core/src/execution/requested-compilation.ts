import { randomUUID } from 'node:crypto';
import type { EntityRef, OperationPlan } from '@abh/contracts';
import { canonicalJson } from '@abh/contracts/digest';
import type { Database, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, inputDigest } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { ActionOwner } from './actions.ts';
import { OperationOwner } from './operations.ts';
import { ActionAuthorizationRequestOwner } from './request-authorization.ts';
import { preparationBinding, type RequestedPreparationChecks } from './requested-preparation.ts';
import { ActionCompilerHost } from './compiler.ts';
import { compilePreparedAction, type ActionCompilationChecks } from './compile-action.ts';
import { registerOperationPlan, type PlanRegistrationChecks } from './register-plan.ts';

/** Compiles missing plans and recovers committed plans. Only the registered immutable plan is durable output. */
export async function compileRequestedAction(database: Database, context: VerifiedContext, options: TransactionOptions,
  requestRef: EntityRef, compiler: OperationPlan['compilerRef'], host: ActionCompilerHost, grantRefs: readonly EntityRef[],
  compilation: ActionCompilationChecks, registration: PlanRegistrationChecks, requestChecks: RequestedPreparationChecks) {
  const request = structuredClone(contract('EntityRef', requestRef)), selected = structuredClone(contract('CapabilityRef', compiler));
  if (request.type !== 'abh.action-authorization-request' || request.version !== 1 || selected.kind !== 'Compiler' || !(host instanceof ActionCompilerHost)) throw new CoreError('INVALID_ARGUMENT');
  if (context.tenant.actor.type !== 'Service') throw new CoreError('FORBIDDEN');
  if (context.tenant.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
  const grants = structuredClone([...grantRefs]);
  // Private metadata lookup only. Both return paths pass current transactional registration admission.
  const load = () => database.transaction(context, options, async tx => {
    const saved = await new ActionAuthorizationRequestOwner().get(tx, request);
    const action = await new ActionOwner().get(tx, saved.actionRef.id), plan = await new OperationOwner().getPlan(tx, saved.actionRef.id);
    return { action, plan };
  });
  const register = async (plan: OperationPlan) => {
    if (canonicalJson(plan.compilerRef) !== canonicalJson(selected)) throw new CoreError('PIN_INPUT_CONFLICT');
    const binding = preparationBinding(context, request, plan.actionRef, requestChecks);
    const payload = { pinSetRef: plan.pinSetRef, pinSetDigest: plan.pinSetDigest, planRef: plan.planRef, planDigest: plan.digest, scopeProofRef: plan.scopeProofRef };
    const command = { type: 'abh.actions.register-plan', commandId: randomUUID(), idempotencyKey: `${binding.key}/register-plan`,
      digest: await inputDigest({ actionRef: plan.actionRef, payload }) };
    return registerOperationPlan(database, context, options, command, plan.actionRef, payload, plan, grants, {
      fenceRefs: async (tx, action, candidate) => [...await binding.fences(tx, action), ...structuredClone(await registration.fenceRefs(tx, structuredClone(action), candidate))],
      admit: async (tx, action, candidate) => { await binding.admit(tx, action); await registration.admit(tx, structuredClone(action), candidate); },
      artifact: (tx, artifact) => registration.artifact(tx, artifact),
      plan: (tx, candidate, intent) => registration.plan(tx, candidate, intent),
    });
  };
  const initial = await load();
  if (initial.plan) return register(initial.plan);
  const binding = preparationBinding(context, request, initial.action.actionRef, requestChecks);
  try {
    const candidate = await compilePreparedAction(database, context, options, initial.action.actionRef, { ...selected, kind: 'Compiler' }, host, grants, {
      fenceRefs: async (tx, input) => [...await binding.fences(tx, input.action), ...structuredClone(await compilation.fenceRefs(tx, structuredClone(input)))],
      admit: async (tx, input) => { await binding.admit(tx, input.action); await compilation.admit(tx, structuredClone(input)); },
      artifact: (tx, artifact) => compilation.artifact(tx, artifact),
    });
    return await register(candidate);
  } catch (error) {
    // A concurrent worker may have committed a different candidate. Discard our uncommitted output,
    // reread the winning plan and independently revalidate it; never change a committed plan or its keys.
    if (!(error instanceof CoreError) || !['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','PRECONDITION_FAILED'].includes(error.code)) throw error;
    const current = await load();
    if (!current.plan) throw error;
    return register(current.plan);
  }
}
