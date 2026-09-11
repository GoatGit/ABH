import type { ActionRecord, EntityRef, ValidateActionPayload } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { CoreError } from '../internal/errors.ts';
import { ActionOwner, type ActionPreparationChecks } from './actions.ts';

export interface ActionValidationChecks {
  fenceRefs(tx: TenantTransaction, action: ActionRecord, evidence: EntityRef): Promise<EntityRef[]>;
  /** Current source/evidence ownership, semantic versions and validator admission, including replay. */
  admit(tx: TenantTransaction, action: ActionRecord, evidence: EntityRef): Promise<void>;
  artifact: ActionPreparationChecks['artifact'];
  domain: ActionPreparationChecks['domain'];
}

/** Internal preparation command; no HTTP route. A supplied evidence Ref alone never validates an Action. */
export async function validateAction(database: Database, context: VerifiedContext, options: TransactionOptions, command: CommandIdentity,
  actionRef: EntityRef, payload: ValidateActionPayload, grantRefs: readonly EntityRef[], checks: ActionValidationChecks) {
  contract('ActionRef', actionRef); contract('ValidateActionPayload', payload);
  const reference = { ...actionRef }, input = structuredClone(payload), identity = { ...command }, grants = structuredClone([...grantRefs]);
  if (identity.type !== 'abh.actions.validate' || identity.digest !== await inputDigest({ actionRef: reference, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  return database.transaction(context, options, async tx => {
    const actions = new ActionOwner(), c = tx.context.tenant, scope = { type: 'abh.organization', id: c.resourceOrganizationId, version: 1 };
    const result = await executeCommand(tx, identity, async () => {
      const action = await actions.get(tx, reference.id);
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants,
        ...structuredClone(await checks.fenceRefs(tx, structuredClone(action), structuredClone(input.domainValidationRef)))]);
      await assertCurrentGrants(tx, { objectRef: reference, scopeRefs: [scope], action: identity.type }, grants);
      await checks.admit(tx, structuredClone(action), structuredClone(input.domainValidationRef));
      const artifact = await new InlineArtifactOwner().read(tx, action.payloadArtifactRef, record => checks.artifact(tx, structuredClone(record)));
      if (artifact.record.contentDigest !== action.payloadDigest) throw new CoreError('ACTION_DOMAIN_INVALID');
    }, async () => (await actions.validate(tx, identity, reference, input.domainValidationRef, {
      lock: async () => {}, artifact: (tx, record) => checks.artifact(tx, structuredClone(record)),
      domain: (tx, action, intent, evidence) => checks.domain(tx, structuredClone(action), structuredClone(intent), structuredClone(evidence)),
    })).actionRef);
    if (result.receipt.resultRef.type !== 'abh.action' || result.receipt.resultRef.id !== reference.id || result.receipt.resultRef.version !== reference.version + 1) throw new CoreError('INTERNAL_ERROR');
    return { actionRef: result.receipt.resultRef, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
