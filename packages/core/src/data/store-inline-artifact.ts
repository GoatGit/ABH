import type { EntityRef, StoreInlineArtifactPayload } from '@abh/contracts';
import type { Database, TenantTransaction, TransactionOptions } from './uow.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from './journal.ts';
import { InlineArtifactOwner } from './artifacts.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';

export interface InlineArtifactStorageChecks {
  fenceRefs(tx: TenantTransaction, input: StoreInlineArtifactPayload): Promise<EntityRef[]>;
  /** Current ownership, registered purposes/data class, region, retention and content policy, also on replay. */
  admit(tx: TenantTransaction, input: StoreInlineArtifactPayload): Promise<void>;
  /** Current visibility and validity of owner/retention/source references. */
  references(tx: TenantTransaction, refs: readonly EntityRef[]): Promise<void>;
}

/** Bounded preparation input storage. Large/binary objects still require the separate staged ObjectStore path. */
export async function storeInlineArtifact(database: Database, context: VerifiedContext, options: TransactionOptions,
  command: CommandIdentity, organizationId: string, payload: StoreInlineArtifactPayload,
  grantRefs: readonly EntityRef[], checks: InlineArtifactStorageChecks) {
  contract('UUID', organizationId);
  const input = structuredClone(contract('StoreInlineArtifactPayload', payload)), identity = { ...command }, grants = structuredClone([...grantRefs]);
  if (identity.type !== 'abh.artifacts.store-inline' || identity.digest !== await inputDigest({ organizationId, payload: input })) throw new CoreError('INVALID_ARGUMENT');
  if (organizationId !== context.tenant.resourceOrganizationId) throw new CoreError('FORBIDDEN');
  if (!['Human', 'Service'].includes(context.tenant.actor.type) || context.tenant.purposeOfUse !== 'abh.action.prepare') throw new CoreError('PURPOSE_DENIED');
  return database.transaction(context, options, async tx => {
    const c = tx.context.tenant, scope = { type: 'abh.organization', id: organizationId, version: 1 };
    const result = await executeCommand(tx, identity, async () => {
      await lockFences(tx, [scope, { type: 'abh.principal', id: c.actor.id, version: 1 }, ...grants, ...structuredClone(await checks.fenceRefs(tx, structuredClone(input)))]);
      await assertCurrentGrants(tx, { objectRef: scope, scopeRefs: [scope], action: identity.type }, grants);
      await checks.admit(tx, structuredClone(input));
      await checks.references(tx, structuredClone([input.ownerRef, input.retentionPolicyRef, ...input.sourceRefs]));
    }, async () => (await new InlineArtifactOwner().store(tx, identity, input, async () => {})).artifactRef);
    if (result.receipt.resultRef.type !== 'abh.artifact' || result.receipt.resultRef.version !== 2) throw new CoreError('INTERNAL_ERROR');
    // Return the original acceptance fact even after tombstoning; replay cannot republish or authorize a body read.
    return { artifactRef: result.receipt.resultRef, commandId: result.receipt.commandRef.id, replayed: result.replayed };
  });
}
