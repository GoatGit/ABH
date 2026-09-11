import type { ActionRecord, EntityRef, PinActionPayload, PinSet } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { CoreError } from '../internal/errors.ts';
import { StaticReleaseOwner } from '../release/static.ts';
import { ActionOwner, type ActionPreparationChecks } from './actions.ts';
import { lockAction, sameRef } from './shared.ts';

export interface ActionPinChecks {
  fenceRefs(tx: TenantTransaction, action: ActionRecord): Promise<EntityRef[]>;
  /** Current source and installed capability-read/preparation policy, including replay. */
  admit(tx: TenantTransaction, action: ActionRecord): Promise<void>;
  artifact: ActionPreparationChecks['artifact'];
  /** Installed capability admission for the actual persisted selection, inside the
   * Pin command transaction. Declare all its Control scopes in fenceRefs. */
  selected?(tx: TenantTransaction, action: ActionRecord, pins: PinSet): Promise<void>;
}
/** Internal first-party Grant-backed preparation. Pinning never grants execution or reserves budget. */
export async function pinAction(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  actionRef: EntityRef, payload: PinActionPayload, checks: ActionPinChecks) {
  contract('ActionRef', actionRef); contract('PinActionPayload', payload);
  checks = {fenceRefs: checks.fenceRefs.bind(checks), admit: checks.admit.bind(checks), artifact: checks.artifact.bind(checks),
    ...(checks.selected ? {selected: checks.selected.bind(checks)} : {})};
  const reference = { ...actionRef }, input = structuredClone(payload), identity = { ...command };
  if (identity.type !== 'abh.actions.pin' || identity.digest !== await inputDigest({ actionRef: reference, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  // This composition accepts actual current preparation Grants, never invented execution evidence.
  if (input.preparationAuthorityRefs.some(ref => ref.type !== 'abh.grant')) throw new CoreError('AUTHORITY_REQUIRED');
  return database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), releases = new StaticReleaseOwner(), c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const result = await executeCommand(tx, identity, async () => {
      const action = await actions.get(tx, reference.id), intent = await actions.getIntent(tx, reference.id);
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...input.preparationAuthorityRefs,
        ...structuredClone(await checks.fenceRefs(tx, structuredClone(action)))]);
      await assertCurrentGrants(tx, { objectRef: reference, scopeRefs: [scope], action: identity.type }, input.preparationAuthorityRefs);
      // Capability admission may lock Deployment; Action must be locked first.
      await lockAction(tx, reference.id);
      if (!sameRef((await actions.get(tx, reference.id)).actionRef, action.actionRef)) throw new CoreError('VERSION_CONFLICT');
      await checks.admit(tx, structuredClone(action));
      const artifact = await new InlineArtifactOwner().read(tx, action.payloadArtifactRef, record => checks.artifact(tx, structuredClone(record)));
      if (artifact.record.contentDigest !== action.payloadDigest) throw new CoreError('ACTION_DOMAIN_INVALID');
      const pins = await releases.getPinSet(tx, action.actionRef);
      if (pins) {
        await releases.revalidate(tx, pins, actions.preparationRequest(tx, intent, input.preparationAuthorityRefs));
        await checks.selected?.(tx, structuredClone(action), structuredClone(pins));
      }
    }, async () => {
      // Original Command replay is handled above. A new command must not revive a terminal preparation.
      await lockAction(tx, reference.id);
      if ((await actions.get(tx, reference.id)).position.lifecycle !== 'Validated') throw new CoreError('PRECONDITION_FAILED');
      const pinned = await actions.pin(tx, identity, reference, input.preparationAuthorityRefs, {
        lock: async () => {}, artifact: (tx, record) => checks.artifact(tx, structuredClone(record)),
      });
      const pins = await releases.getPinSet(tx, pinned.actionRef);
      if (!pins) throw new CoreError('PIN_INPUT_CONFLICT');
      await checks.selected?.(tx, structuredClone(pinned), structuredClone(pins));
      return pinned.actionRef;
    });
    const action = await actions.get(tx, reference.id), pins = await releases.getPinSet(tx, action.actionRef);
    if (result.receipt.resultRef.type !== 'abh.action' || result.receipt.resultRef.id !== reference.id || !pins || action.pinSetRef?.id !== pins.pinSetRef.id) throw new CoreError('INTERNAL_ERROR');
    return { actionRef: result.receipt.resultRef, pinSetRef: pins.pinSetRef, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
