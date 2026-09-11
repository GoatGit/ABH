import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { EntityRef } from '@abh/contracts';
import { inputDigest, type CommandIdentity } from '../src/data/journal.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import { AgentCheckpointOwner, prepareCheckpointStorage, prepareResumePermit,
  type AgentCheckpointGovernanceChecks, type PersistedAgentCheckpoint } from '../src/agent/checkpoint.ts';
import { context, createDatabaseFixture, options } from './database-fixture.ts';

const ref = <T extends string>(type: T, id = randomUUID(), version = 1) => ({ type, id, version });
const checks: AgentCheckpointGovernanceChecks = {
  fenceRefs: async () => [],
  admit: async () => {},
  references: async () => {},
  authorizeCheckpoint: async () => {},
  authorizePermit: async () => {},
  admitResume: async () => {},
};
const checkpoint = (): PersistedAgentCheckpoint => ({
  invocationRef: ref('abh.invocation'), runtimeName: 'pi-agent', runtimeVersion: '0.85.1',
  definitionRef: ref('abh.agent-definition'), contextDigest: 'sha256:' + '1'.repeat(64), lastEventSequence: 12,
  usageTokens: 140, turns: 3, transcript: [{ role: 'assistant', content: 'tool result observed' }],
  toolReceiptRefs: [ref('abh.artifact')], unresolvedToolReceiptRefs: [], toolCallCounts: { search: 1 },
});
const command = async (payload: unknown): Promise<CommandIdentity> => ({
  type: 'abh.artifacts.store-inline', commandId: randomUUID(), idempotencyKey: randomUUID(), digest: await inputDigest(payload),
});

test('governed agent checkpoints persist and load only through a matching resume permit', { timeout: 120_000 }, async t => {
  const f = await createDatabaseFixture(); t.after(() => f.close());
  const initial = context(), c = deriveVerifiedContext({ ...initial.request, purposeOfUse: 'abh.action.prepare' });
  const db = f.database, owner = new AgentCheckpointOwner();
  const retention = { dataClass: 'abh.data.internal', purposeNames: ['abh.action.prepare'], region: 'local', retentionPolicyRef: ref('abh.retention-policy') };
  const value = checkpoint();
  const invocation = value.invocationRef;
  const prepared = await prepareCheckpointStorage({ ownerRef: invocation, checkpoint: value, retention });
  const storeCommand = await command(prepared.payload);
  let checkpointRef!: EntityRef & { type: 'abh.artifact' };
  await db.transaction(c, options(), tx => owner.store(tx, storeCommand, { ownerRef: invocation, checkpoint: value, retention }, checks)
    .then(result => { checkpointRef = result.checkpointRef; }));

  await t.test('checkpoint is available with source and integrity bindings', async () => {
    const rows = await db.transaction(c, options(), tx => tx.owner('ArtifactStore')`
      SELECT status,record FROM data.artifacts WHERE id=${checkpointRef.id}`);
    assert.equal(rows[0]!.status, 'Available');
    assert.deepEqual(rows[0]!.record.sourceRefs, value.toolReceiptRefs);
    const events = await db.transaction(c, options(), tx => tx.owner('DurableExecution')`
      SELECT record FROM data.outbox WHERE aggregate_id=${checkpointRef.id} ORDER BY aggregate_version`);
    assert.deepEqual(events.map(event => event.record.type), ['abh.artifact.created', 'abh.artifact.publish']);
  });

  const authorizedContextRef = ref('abh.authorized-context');
  const permitInput = { ownerRef: invocation, invocationRef: invocation, runtimeName: value.runtimeName,
    runtimeVersion: value.runtimeVersion, definitionRef: value.definitionRef, authorizedContextRef,
    contextDigest: value.contextDigest, retention, expiresAt: new Date(Date.now() + 60_000) };
  const permitPrepared = prepareResumePermit(permitInput, checkpointRef, prepared.checkpointDigest);
  const permitCommand = await command(permitPrepared.payload);
  let permitRef!: EntityRef & { type: 'abh.artifact' };
  await db.transaction(c, options(), tx => owner.issueResumePermit(tx, permitCommand, { ...permitInput, checkpointRef, checkpointDigest: prepared.checkpointDigest }, checks)
    .then(result => { permitRef = result; }));

  await t.test('matching permit and checkpoint round trip in one locked read', async () => {
    const loaded = await db.transaction(c, options(), tx => owner.loadResume(tx, { checkpointRef, resumePermitRef: permitRef, authorizedContextRef }, checks));
    assert.deepEqual(loaded.checkpoint, value);
    assert.equal(loaded.checkpointDigest, prepared.checkpointDigest);
    assert.equal(loaded.permit.checkpointRef.id, checkpointRef.id);
  });

  await t.test('wrong authorized context, checkpoint, invocation, definition and digest fail closed', async () => {
    await assert.rejects(db.transaction(c, options(), tx => owner.loadResume(tx, {
      checkpointRef, resumePermitRef: permitRef, authorizedContextRef: ref('abh.authorized-context'),
    }, checks)), { code: 'PRECONDITION_FAILED' } as { code: string });
    await assert.rejects(db.transaction(c, options(), tx => owner.loadResume(tx, {
      checkpointRef: ref('abh.artifact'), resumePermitRef: permitRef, authorizedContextRef,
    }, checks)), { code: 'PRECONDITION_FAILED' } as { code: string });

    const wrong = { ...permitInput, invocationRef: ref('abh.invocation'), definitionRef: ref('abh.agent-definition'),
      contextDigest: 'sha256:' + '2'.repeat(64) };
    for (const patch of [{ invocationRef: wrong.invocationRef }, { definitionRef: wrong.definitionRef }, { contextDigest: wrong.contextDigest }]) {
      const input = { ...permitInput, ...patch };
      const payload = prepareResumePermit(input, checkpointRef, prepared.checkpointDigest).payload;
      const badPermit = await db.transaction(c, options(), async tx => owner.issueResumePermit(tx, await command(payload),
        { ...input, checkpointRef, checkpointDigest: prepared.checkpointDigest }, checks));
      await assert.rejects(db.transaction(c, options(), tx => owner.loadResume(tx, {
        checkpointRef, resumePermitRef: badPermit, authorizedContextRef,
      }, checks)), { code: 'PRECONDITION_FAILED' } as { code: string });
    }
  });

  await t.test('corrupted checkpoint bytes fail the artifact integrity gate', async () => {
    await db.transaction(c, options(), tx => tx.owner('ArtifactStore')`
      UPDATE data.artifacts SET inline_body=${new TextEncoder().encode('{}')} WHERE id=${checkpointRef.id}`);
    await assert.rejects(db.transaction(c, options(), tx => owner.loadResume(tx, { checkpointRef, resumePermitRef: permitRef, authorizedContextRef }, checks)),
      { code: 'INTERNAL_ERROR' } as { code: string });
  });

  await t.test('expired permits, unresolved receipts and tenant isolation are rejected', async () => {
    const expired = new Date(Date.now() - 1);
    await assert.rejects(async () => {
      const payload = prepareResumePermit({ ...permitInput, expiresAt: expired }, checkpointRef, prepared.checkpointDigest).payload;
      await db.transaction(c, options(), async tx => owner.issueResumePermit(tx, await command(payload),
        { ...permitInput, expiresAt: expired, checkpointRef, checkpointDigest: prepared.checkpointDigest }, checks));
    },
      { code: 'PRECONDITION_FAILED' } as { code: string });
    await assert.rejects(db.transaction(c, options(), async tx => owner.store(tx, await command((await prepareCheckpointStorage({
      ownerRef: invocation, checkpoint: { ...value, unresolvedToolReceiptRefs: [ref('abh.artifact')] }, retention,
    })).payload), { ownerRef: invocation, checkpoint: { ...value, unresolvedToolReceiptRefs: [ref('abh.artifact')] }, retention }, checks)),
      { code: 'PRECONDITION_FAILED' } as { code: string });
    const other = context(), otherC = deriveVerifiedContext({ ...other.request, purposeOfUse: 'abh.action.prepare' });
    await assert.rejects(db.transaction(otherC, options(), tx => owner.loadResume(tx, { checkpointRef, resumePermitRef: permitRef, authorizedContextRef }, checks)),
      { code: 'RESOURCE_NOT_FOUND' } as { code: string });
  });
});
