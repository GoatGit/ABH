import type { ActionIntentRecord, ActionRecord, OperationPlan, PinSet } from '@abh/contracts';
import { canonicalJson, digestContract, digestRequiredSlots } from '@abh/contracts/digest';
import type { TransactionOptions } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import { boundedCallback } from '../internal/bounded-callback.ts';
import { sameRef } from './shared.ts';

export interface ActionCompileInput { action: ActionRecord; intent: ActionIntentRecord; pins: PinSet }
export interface InstalledActionCompiler {
  capability: OperationPlan['compilerRef'];
  /** Trusted read-only compilation. No transaction/credentials/dispatch capability is supplied by this host. */
  compile(input: ActionCompileInput, options: TransactionOptions): Promise<OperationPlan>;
}

/** Exact pinned compiler invocation only; its output remains a candidate for current Owner registration. */
export class ActionCompilerHost {
  readonly #compilers: ReadonlyMap<string, InstalledActionCompiler>;
  constructor(installations: readonly InstalledActionCompiler[]) {
    if (!installations.length || installations.length > 100) throw new CoreError('INVALID_ARGUMENT');
    const compilers = new Map<string, InstalledActionCompiler>();
    for (const installation of installations) {
      const capability = structuredClone(contract('CapabilityRef', installation.capability));
      if (capability.kind !== 'Compiler' || typeof installation.compile !== 'function') throw new CoreError('INVALID_ARGUMENT');
      const key = canonicalJson(capability);
      if (compilers.has(key)) throw new CoreError('INVALID_ARGUMENT');
      compilers.set(key, { capability: { ...capability, kind: 'Compiler' }, compile: installation.compile.bind(installation) });
    }
    this.#compilers = compilers;
  }
  async compile(input: ActionCompileInput, compiler: OperationPlan['compilerRef'], options: TransactionOptions): Promise<OperationPlan> {
    const snapshot = structuredClone(input), selected = structuredClone(compiler);
    const action = contract('ActionRecord', snapshot.action), intent = contract('ActionIntentRecord', snapshot.intent), pins = contract('PinSet', snapshot.pins);
    const capabilities = pins.pins.flatMap(pin => pin.capabilityExactRefs).map(ref => canonicalJson(ref));
    const installation = this.#compilers.get(canonicalJson(selected));
    if (!installation || !capabilities.includes(canonicalJson(selected))) throw new CoreError('PIN_INPUT_CONFLICT');
    if (action.position.lifecycle !== 'Validated' || action.planRef || !action.pinSetRef || !sameRef(action.pinSetRef, pins.pinSetRef)
      || pins.subjectRef.type !== 'abh.action' || pins.subjectRef.id !== action.actionRef.id || intent.actionRef.id !== action.actionRef.id
      || intent.resourceOrganizationId !== action.resourceOrganizationId || pins.resourceOrganizationId !== action.resourceOrganizationId
      || intent.payloadDigest !== action.payloadDigest || pins.subjectInputDigest !== intent.digest
      || pins.requiredSlotsDigest !== await digestRequiredSlots(intent.requiredBehaviorSlots)
      || await digestContract('ActionIntentRecord', intent) !== intent.digest || await digestContract('PinSet', pins) !== pins.digest) throw new CoreError('PIN_INPUT_CONFLICT');
    const output = await boundedCallback(async bounded => structuredClone(await installation.compile(structuredClone(snapshot), bounded)), options);
    const plan = contract('OperationPlan', output);
    if (!sameRef(plan.actionRef, action.actionRef) || plan.planVersion !== 1 || plan.planRef.version !== 1
      || !sameRef(plan.pinSetRef, pins.pinSetRef) || plan.pinSetDigest !== pins.digest || plan.validatedAgainstPayloadDigest !== action.payloadDigest
      || canonicalJson(plan.compilerRef) !== canonicalJson(selected) || plan.connectorRefs.some(ref => !capabilities.includes(canonicalJson(ref)))
      || !sameRef(plan.completionPolicyRef, action.completionPolicyRef) || await digestContract('OperationPlan', plan) !== plan.digest) throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    return plan;
  }
}
