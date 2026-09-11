import { canonicalJson, digestBytes } from '@abh/contracts/digest';
import type { ArtifactRecord, Digest, EntityRef, StoreInlineArtifactPayload } from '@abh/contracts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import type { TenantTransaction } from '../data/uow.ts';
import { CoreError } from '../internal/errors.ts';

export interface AgentCheckpointEntityRef {
  readonly type: string;
  readonly id: string;
  readonly version: number;
}

export interface PersistedAgentCheckpoint {
  readonly invocationRef: AgentCheckpointEntityRef;
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  readonly definitionRef: AgentCheckpointEntityRef;
  readonly contextDigest: string;
  readonly lastEventSequence: number;
  readonly usageTokens: number;
  readonly turns: number;
  readonly transcript: readonly unknown[];
  readonly toolReceiptRefs: readonly AgentCheckpointEntityRef[];
  readonly unresolvedToolReceiptRefs: readonly AgentCheckpointEntityRef[];
  readonly toolCallCounts: Readonly<Record<string, number>>;
}

interface StoredCheckpointDocument {
  readonly formatVersion: 'abh.agent-checkpoint.v1';
  readonly checkpoint: PersistedAgentCheckpoint;
}

interface StoredResumePermit {
  readonly formatVersion: 'abh.agent-resume-permit.v1';
  readonly checkpointRef: AgentCheckpointEntityRef;
  readonly checkpointDigest: Digest;
  readonly invocationRef: AgentCheckpointEntityRef;
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  readonly definitionRef: AgentCheckpointEntityRef;
  readonly authorizedContextRef: AgentCheckpointEntityRef;
  readonly contextDigest: string;
  readonly expiresAt: string;
}

export interface AgentCheckpointRetention {
  readonly dataClass: string;
  readonly purposeNames: readonly string[];
  readonly region: string;
  readonly retentionPolicyRef: AgentCheckpointEntityRef;
}

export interface AgentCheckpointStorageInput {
  readonly ownerRef: AgentCheckpointEntityRef;
  readonly checkpoint: PersistedAgentCheckpoint;
  readonly retention: AgentCheckpointRetention;
}

export interface AgentResumePermitInput {
  readonly ownerRef: AgentCheckpointEntityRef;
  readonly checkpointRef: AgentCheckpointEntityRef;
  readonly checkpointDigest: Digest;
  readonly invocationRef: AgentCheckpointEntityRef;
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  readonly definitionRef: AgentCheckpointEntityRef;
  readonly authorizedContextRef: AgentCheckpointEntityRef;
  readonly contextDigest: string;
  readonly retention: AgentCheckpointRetention;
  readonly expiresAt: Date;
}

export interface AgentCheckpointGovernanceChecks {
  fenceRefs(tx: TenantTransaction, input: StoreInlineArtifactPayload): Promise<EntityRef[]>;
  admit(tx: TenantTransaction, input: StoreInlineArtifactPayload): Promise<void>;
  references(tx: TenantTransaction, refs: readonly EntityRef[]): Promise<void>;
  authorizeCheckpoint(record: ArtifactRecord): Promise<void>;
  authorizePermit(record: ArtifactRecord): Promise<void>;
  admitResume(records: { readonly checkpoint: ArtifactRecord; readonly permit: ArtifactRecord }): Promise<void>;
}

export interface AgentCheckpointResumeRequest {
  readonly checkpointRef: AgentCheckpointEntityRef;
  readonly resumePermitRef: AgentCheckpointEntityRef;
  readonly authorizedContextRef: AgentCheckpointEntityRef;
}

export interface LoadedAgentCheckpointResume {
  readonly checkpointRef: AgentCheckpointEntityRef;
  readonly permitRef: AgentCheckpointEntityRef;
  readonly checkpoint: PersistedAgentCheckpoint;
  readonly checkpointDigest: Digest;
  readonly permit: StoredResumePermit;
}

export class AgentCheckpointOwner {
  readonly #artifacts = new InlineArtifactOwner();

  async store(tx: TenantTransaction, command: CommandIdentity, input: AgentCheckpointStorageInput,
    checks: AgentCheckpointGovernanceChecks): Promise<{ checkpointRef: EntityRef & { type: 'abh.artifact' }; checkpointDigest: Digest }> {
    const document = normalizeCheckpoint(input.checkpoint), payload = checkpointPayload(input.ownerRef, document, input.retention);
    await assertCommand(command, payload);
    const frozen = structuredClone(payload), governance = {...checks};
    const result = await executeCommand(tx, command, async () => {
      await governance.fenceRefs(tx, structuredClone(frozen));
      await this.#artifacts.lockSources(tx, frozen.sourceRefs);
      await governance.admit(tx, structuredClone(frozen));
      await governance.references(tx, structuredClone([frozen.ownerRef, frozen.retentionPolicyRef, ...frozen.sourceRefs]));
    }, async () => (await this.#artifacts.store(tx, command, frozen, async () => {})).artifactRef);
    if (result.receipt.resultRef.type !== 'abh.artifact' || result.receipt.resultRef.version !== 2) throw new CoreError('INTERNAL_ERROR');
    return { checkpointRef: result.receipt.resultRef as EntityRef & { type: 'abh.artifact' }, checkpointDigest: await digestCheckpointDocument(document) };
  }

  async issueResumePermit(tx: TenantTransaction, command: CommandIdentity, input: AgentResumePermitInput,
    checks: AgentCheckpointGovernanceChecks): Promise<EntityRef & { type: 'abh.artifact' }> {
    const permit = normalizePermit(input), payload = resumePermitPayload(input.ownerRef, permit, input.retention, input.checkpointRef);
    await assertCommand(command, payload);
    const frozen = structuredClone(payload), governance = {...checks};
    const result = await executeCommand(tx, command, async () => {
      await governance.fenceRefs(tx, structuredClone(frozen));
      await this.#artifacts.lockSources(tx, frozen.sourceRefs);
      await governance.admit(tx, structuredClone(frozen));
      await governance.references(tx, structuredClone([frozen.ownerRef, frozen.retentionPolicyRef, ...frozen.sourceRefs]));
    }, async () => (await this.#artifacts.store(tx, command, frozen, async () => {})).artifactRef);
    if (result.receipt.resultRef.type !== 'abh.artifact' || result.receipt.resultRef.version !== 2) throw new CoreError('INTERNAL_ERROR');
    return result.receipt.resultRef as EntityRef & { type: 'abh.artifact' };
  }

  async loadResume(tx: TenantTransaction, request: AgentCheckpointResumeRequest,
    checks: AgentCheckpointGovernanceChecks): Promise<LoadedAgentCheckpointResume> {
    const checkpointRef = normalizeRef(request.checkpointRef, 'abh.artifact');
    const permitRef = normalizeRef(request.resumePermitRef, 'abh.artifact');
    const authorizedContextRef = normalizeRef(request.authorizedContextRef, 'abh.authorized-context');
    const governance = {...checks};
    await this.#artifacts.lockSources(tx, [checkpointRef, permitRef]);
    const permitRead = await this.#artifacts.read(tx, permitRef, record => governance.authorizePermit(record));
    const permitRecord = permitRead.record, permit = parsePermit(new TextDecoder().decode(permitRead.bytes));
    if (!sameRef(permitRecord.ownerRef, permit.invocationRef)) throw new CoreError('PRECONDITION_FAILED');
    if (!sameRef(permitRecord.sourceRefs[0] ?? { type: '', id: '', version: -1 }, permit.checkpointRef) || permitRecord.sourceRefs.length !== 1) throw new CoreError('INVALID_ARGUMENT');
    if (!sameRef(permit.checkpointRef, checkpointRef) || !sameRef(permit.authorizedContextRef, authorizedContextRef)) throw new CoreError('PRECONDITION_FAILED');
    if (Date.parse(permit.expiresAt) <= Date.now()) throw new CoreError('PRECONDITION_FAILED');
    const checkpointRead = await this.#artifacts.read(tx, checkpointRef, record => governance.authorizeCheckpoint(record));
    const checkpointRecord = checkpointRead.record, document = parseCheckpoint(new TextDecoder().decode(checkpointRead.bytes));
    const checkpointDigest = await digestCheckpointDocument(document.checkpoint);
    if (checkpointDigest !== permit.checkpointDigest || !sameRef(document.checkpoint.invocationRef, permit.invocationRef)
      || document.checkpoint.runtimeName !== permit.runtimeName || document.checkpoint.runtimeVersion !== permit.runtimeVersion
      || document.checkpoint.definitionRef.type !== permit.definitionRef.type || document.checkpoint.definitionRef.id !== permit.definitionRef.id
      || document.checkpoint.definitionRef.version !== permit.definitionRef.version
      || document.checkpoint.contextDigest !== permit.contextDigest) throw new CoreError('PRECONDITION_FAILED');
    if (!sameRef(checkpointRecord.ownerRef, document.checkpoint.invocationRef)
      || !sameArrays(checkpointRecord.sourceRefs, document.checkpoint.toolReceiptRefs)) throw new CoreError('PRECONDITION_FAILED');
    await governance.admitResume({ checkpoint: structuredClone(checkpointRecord), permit: structuredClone(permitRecord) });
    tx.assertActive();
    return { checkpointRef: { ...checkpointRef }, permitRef: { ...permitRef }, checkpoint: structuredClone(document.checkpoint),
      checkpointDigest, permit: structuredClone(permit) };
  }

}

export async function prepareCheckpointStorage(input: AgentCheckpointStorageInput): Promise<{
  payload: StoreInlineArtifactPayload; checkpoint: PersistedAgentCheckpoint; checkpointDigest: Digest;
}> {
  const checkpoint = normalizeCheckpoint(input.checkpoint), payload = checkpointPayload(input.ownerRef, checkpoint, input.retention);
  return { payload, checkpoint, checkpointDigest: await digestCheckpointDocument(checkpoint) };
}

export function prepareResumePermit(input: Omit<AgentResumePermitInput, 'checkpointRef' | 'checkpointDigest'>,
  checkpointRef: AgentCheckpointEntityRef, checkpointDigest: Digest): { payload: StoreInlineArtifactPayload; permit: StoredResumePermit } {
  const permit = normalizePermit({ ...input, checkpointRef, checkpointDigest });
  return { payload: resumePermitPayload(input.ownerRef, permit, input.retention, checkpointRef), permit };
}

async function assertCommand(command: CommandIdentity, payload: StoreInlineArtifactPayload): Promise<void> {
  if (command.type !== 'abh.artifacts.store-inline' || command.digest !== await inputDigest(payload)) throw new CoreError('INVALID_ARGUMENT');
}

function normalizeCheckpoint(value: PersistedAgentCheckpoint): PersistedAgentCheckpoint {
  if (!isPlainObject(value)) throw new CoreError('INVALID_ARGUMENT');
  const invocationRef = normalizeRef(value.invocationRef, 'abh.invocation');
  const definitionRef = normalizeRef(value.definitionRef);
  const toolReceiptRefs = normalizeRefs(value.toolReceiptRefs, 100);
  const unresolvedToolReceiptRefs = normalizeRefs(value.unresolvedToolReceiptRefs, 100);
  const resolvedIds = new Set(toolReceiptRefs.map(ref => ref.id));
  if (unresolvedToolReceiptRefs.length > 0) throw new CoreError('PRECONDITION_FAILED');
  if (unresolvedToolReceiptRefs.some(ref => resolvedIds.has(ref.id))) throw new CoreError('INVALID_ARGUMENT');
  if (!Number.isSafeInteger(value.lastEventSequence) || value.lastEventSequence < 0 || value.lastEventSequence > Number.MAX_SAFE_INTEGER
    || !Number.isSafeInteger(value.usageTokens) || value.usageTokens < 0 || !Number.isSafeInteger(value.turns) || value.turns < 0) throw new CoreError('INVALID_ARGUMENT');
  if (!Array.isArray(value.transcript) || value.transcript.length < 1 || value.transcript.length > 200) throw new CoreError('INVALID_ARGUMENT');
  for (const message of value.transcript) if (!isJson(value.transcript) || !isPlainObject(message)) throw new CoreError('INVALID_ARGUMENT');
  if (!isPlainObject(value.toolCallCounts)) throw new CoreError('INVALID_ARGUMENT');
  const keys = Object.keys(value.toolCallCounts);
  if (keys.length > 100 || keys.some(key => !key || key.length > 128 || !Number.isSafeInteger(value.toolCallCounts[key]) || value.toolCallCounts[key]! < 0)) throw new CoreError('INVALID_ARGUMENT');
  return { invocationRef, runtimeName: boundedName(value.runtimeName), runtimeVersion: boundedName(value.runtimeVersion),
    definitionRef, contextDigest: contract('Digest', value.contextDigest), lastEventSequence: value.lastEventSequence,
    usageTokens: value.usageTokens, turns: value.turns, transcript: structuredClone(value.transcript),
    toolReceiptRefs, unresolvedToolReceiptRefs, toolCallCounts: structuredClone(value.toolCallCounts) };
}

function normalizePermit(value: AgentResumePermitInput): StoredResumePermit {
  if (!isPlainObject(value) || !(value.expiresAt instanceof Date) || Number.isNaN(value.expiresAt.getTime())) throw new CoreError('INVALID_ARGUMENT');
  if (value.expiresAt.getTime() <= Date.now()) throw new CoreError('PRECONDITION_FAILED');
  return { formatVersion: 'abh.agent-resume-permit.v1', checkpointRef: normalizeRef(value.checkpointRef, 'abh.artifact'),
    checkpointDigest: contract('Digest', value.checkpointDigest), invocationRef: normalizeRef(value.invocationRef, 'abh.invocation'),
    runtimeName: boundedName(value.runtimeName), runtimeVersion: boundedName(value.runtimeVersion),
    definitionRef: normalizeRef(value.definitionRef), authorizedContextRef: normalizeRef(value.authorizedContextRef, 'abh.authorized-context'),
    contextDigest: contract('Digest', value.contextDigest), expiresAt: value.expiresAt.toISOString() };
}

function parseCheckpoint(text: string): StoredCheckpointDocument {
  if (!isJson(text)) throw new CoreError('INVALID_ARGUMENT');
  let value: unknown; try { value = JSON.parse(text); } catch { throw new CoreError('INVALID_ARGUMENT'); }
  if (!isPlainObject(value) || value.formatVersion !== 'abh.agent-checkpoint.v1' || canonicalJson(value) !== text) throw new CoreError('INVALID_ARGUMENT');
  return { formatVersion: 'abh.agent-checkpoint.v1', checkpoint: normalizeCheckpoint(value.checkpoint as PersistedAgentCheckpoint) };
}

function parsePermit(text: string): StoredResumePermit {
  if (!isJson(text)) throw new CoreError('INVALID_ARGUMENT');
  let value: unknown; try { value = JSON.parse(text); } catch { throw new CoreError('INVALID_ARGUMENT'); }
  if (!isPlainObject(value) || value.formatVersion !== 'abh.agent-resume-permit.v1' || canonicalJson(value) !== text) throw new CoreError('INVALID_ARGUMENT');
  const expiresAt = new Date(String(value.expiresAt));
  if (Number.isNaN(expiresAt.getTime())) throw new CoreError('INVALID_ARGUMENT');
  return { formatVersion: 'abh.agent-resume-permit.v1', checkpointRef: normalizeRef(value.checkpointRef, 'abh.artifact'),
    checkpointDigest: contract('Digest', value.checkpointDigest), invocationRef: normalizeRef(value.invocationRef, 'abh.invocation'),
    runtimeName: boundedName(value.runtimeName), runtimeVersion: boundedName(value.runtimeVersion),
    definitionRef: normalizeRef(value.definitionRef), authorizedContextRef: normalizeRef(value.authorizedContextRef, 'abh.authorized-context'),
    contextDigest: contract('Digest', value.contextDigest), expiresAt: expiresAt.toISOString() };
}

async function digestCheckpointDocument(checkpoint: PersistedAgentCheckpoint): Promise<Digest> {
  return digestBytes(digestCheckpointSync(checkpoint));
}

function digestCheckpointSync(checkpoint: PersistedAgentCheckpoint): Uint8Array {
  return new TextEncoder().encode(canonicalJson(checkpoint));
}

function normalizeRefs(value: unknown, limit: number): AgentCheckpointEntityRef[] {
  if (!Array.isArray(value) || value.length > limit) throw new CoreError('INVALID_ARGUMENT');
  return value.map(ref => normalizeRef(ref, 'abh.artifact'));
}

function normalizeRef(value: unknown, type?: string): AgentCheckpointEntityRef {
  const ref = contract('EntityRef', value);
  if (type && ref.type !== type) throw new CoreError('INVALID_ARGUMENT');
  return { ...ref };
}

function boundedName(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || /\s/u.test(value)) throw new CoreError('INVALID_ARGUMENT');
  return value;
}

function sameRef(left: AgentCheckpointEntityRef, right: AgentCheckpointEntityRef): boolean {
  return left.type === right.type && left.id === right.id && left.version === right.version;
}

function sameArrays(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && canonicalJson(left) === canonicalJson(right);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJson(value: unknown): boolean {
  try { JSON.parse(typeof value === 'string' ? value : canonicalJson(value)); return true; } catch { return false; }
}

function checkpointPayload(ownerRef: AgentCheckpointEntityRef, checkpoint: PersistedAgentCheckpoint,
  retention: AgentCheckpointRetention): StoreInlineArtifactPayload {
  const document: StoredCheckpointDocument = { formatVersion: 'abh.agent-checkpoint.v1', checkpoint };
  return contract('StoreInlineArtifactPayload', { ownerRef, mediaType: 'application/json', dataClass: retention.dataClass,
    purposeNames: retention.purposeNames, sourceRefs: checkpoint.toolReceiptRefs, region: retention.region,
    retentionPolicyRef: retention.retentionPolicyRef, content: canonicalJson(document) });
}

function resumePermitPayload(ownerRef: AgentCheckpointEntityRef, permit: StoredResumePermit, retention: AgentCheckpointRetention,
  checkpointRef: AgentCheckpointEntityRef): StoreInlineArtifactPayload {
  return contract('StoreInlineArtifactPayload', { ownerRef, mediaType: 'application/json', dataClass: retention.dataClass,
    purposeNames: retention.purposeNames, sourceRefs: [checkpointRef], region: retention.region,
    retentionPolicyRef: retention.retentionPolicyRef, content: canonicalJson(permit) });
}
