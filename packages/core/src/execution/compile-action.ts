import type { EntityRef, OperationPlan } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract } from '../data/journal.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { CoreError } from '../internal/errors.ts';
import { StaticReleaseOwner } from '../release/static.ts';
import { ActionOwner, type ActionPreparationChecks } from './actions.ts';
import { ActionCompilerHost, type ActionCompileInput } from './compiler.ts';
import { lockAction, sameRef } from './shared.ts';

export interface ActionCompilationChecks {
  fenceRefs(tx: TenantTransaction, input: ActionCompileInput): Promise<EntityRef[]>;
  /** Current installed compiler/source read admission. A valid PinSet alone grants no access. */
  admit(tx: TenantTransaction, input: ActionCompileInput): Promise<void>;
  artifact: ActionPreparationChecks['artifact'];
}

/** Loads authorized persisted inputs, then compiles outside the transaction. No plan registration or T1. */
export async function compilePreparedAction(database: Database, context: VerifiedContext, options: TransactionOptions,
  actionRef: EntityRef, compiler: OperationPlan['compilerRef'], host: ActionCompilerHost,
  grantRefs: readonly EntityRef[], checks: ActionCompilationChecks): Promise<OperationPlan> {
  const reference = structuredClone(contract('ActionRef', actionRef)), selected = structuredClone(contract('CapabilityRef', compiler));
  const grants = structuredClone([...grantRefs]);
  if (!(host instanceof ActionCompilerHost) || selected.kind !== 'Compiler') throw new CoreError('INVALID_ARGUMENT');
  const load = () => database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), releases = new StaticReleaseOwner(), c = tx.context.tenant;
    const scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const action = await actions.get(tx, reference.id), intent = await actions.getIntent(tx, reference.id), pins = await releases.getPinSet(tx, reference);
    if (!sameRef(action.actionRef, reference)) throw new CoreError('VERSION_CONFLICT');
    if (action.position.lifecycle !== 'Validated' || action.planRef) throw new CoreError('PRECONDITION_FAILED');
    if (!pins || !action.pinSetRef || !sameRef(action.pinSetRef, pins.pinSetRef)) throw new CoreError('PIN_INPUT_CONFLICT');
    const input = { action, intent, pins };
    await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants,
      ...structuredClone(await checks.fenceRefs(tx, structuredClone(input)))]);
    await assertCurrentGrants(tx, { objectRef: reference, scopeRefs: [scope], action: 'abh.actions.register-plan' }, grants);
    // Action must precede Deployment when admission resolves an installed Pack.
    await lockAction(tx, reference.id);
    if (!sameRef((await actions.get(tx, reference.id)).actionRef, reference)) throw new CoreError('VERSION_CONFLICT');
    await checks.admit(tx, structuredClone(input));
    await releases.revalidate(tx, pins, actions.preparationRequest(tx, intent, grants));
    const [clock] = await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    if (Date.parse(intent.expiresAt) <= clock!.now.getTime()) throw new CoreError('PRECONDITION_FAILED');
    const artifact = await new InlineArtifactOwner().read(tx, action.payloadArtifactRef, record => checks.artifact(tx, structuredClone(record)));
    if (artifact.record.contentDigest !== action.payloadDigest) throw new CoreError('ACTION_DOMAIN_INVALID');
    return input;
  });
  const input = await load();
  const plan = await host.compile(input, { ...selected, kind: 'Compiler' }, options);
  // A long compilation must not return success after revocation/cancellation observed here.
  // Registration still independently fences and revalidates, closing the remaining race.
  const current = await load();
  if (current.intent.digest !== input.intent.digest || current.pins.digest !== input.pins.digest) throw new CoreError('PIN_INPUT_CONFLICT');
  return plan;
}
