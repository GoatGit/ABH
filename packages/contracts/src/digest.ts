import canonicalize from 'canonicalize';
import { digestPolicies } from '../generated/digest-policies.ts';
import { protocolRegistry } from '../generated/protocol-registry.ts';
import { validateContract, type SchemaName } from './schema.ts';
import { matches, shapes, type Shape } from './shape.ts';
import type { CommandEnvelope, Digest, PinSet, ResolveAndPinRequest } from '../generated/types.ts';

export { digestPolicies };
export type DigestSchemaName = keyof typeof digestPolicies;

export class ContractDigestError extends Error {
  readonly code: 'INVALID_ARGUMENT' | 'PIN_INPUT_CONFLICT';
  constructor(code: 'INVALID_ARGUMENT' | 'PIN_INPUT_CONFLICT' = 'INVALID_ARGUMENT') {
    super(code === 'PIN_INPUT_CONFLICT' ? 'Pinned subject inputs conflict.' : 'Value cannot be digested under the registered contract.');
    this.name = 'ContractDigestError';
    this.code = code;
  }
}

/** Accept JSON data only. Reject values JCS libraries may omit or coerce, before any getter/toJSON executes. */
function assertJson(value: unknown): void {
  const ancestors = new Set<object>();
  let remaining = 100_000;
  let characters = 0;
  const visit = (input: unknown, depth: number): void => {
    if (--remaining < 0 || depth > 64) throw new ContractDigestError();
    if (input === null || typeof input === 'boolean') return;
    if (typeof input === 'number' && Number.isFinite(input)) return;
    if (typeof input === 'string') {
      characters += input.length;
      if (characters > 1_048_576) throw new ContractDigestError();
      return;
    }
    if (typeof input !== 'object') throw new ContractDigestError();
    const prototype = Object.getPrototypeOf(input);
    if (ancestors.has(input) || (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null)) throw new ContractDigestError();
    ancestors.add(input);
    const keys = Reflect.ownKeys(input);
    if (Array.isArray(input) && (prototype !== Array.prototype || keys.length !== input.length + 1)) throw new ContractDigestError();
    for (const key of keys) {
      if (Array.isArray(input) && key === 'length') continue;
      if (typeof key !== 'string') throw new ContractDigestError();
      if (Array.isArray(input) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) throw new ContractDigestError();
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new ContractDigestError();
      visit(key, depth + 1);
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(input);
  };
  visit(value, 0);
}

/** RFC 8785, UTF-16 key order, IEEE-754 number serialization, no Unicode normalization. */
export function canonicalJson(value: unknown): string {
  try {
    assertJson(value);
    const result = canonicalize(value);
    if (result === undefined || new TextEncoder().encode(result).byteLength > 1_048_576) throw new ContractDigestError();
    return result;
  } catch {
    throw new ContractDigestError();
  }
}

export async function digestBytes(bytes: Uint8Array): Promise<Digest> {
  const result = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return `sha256:${Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, '0')).join('')}`;
}

const hashJson = (value: unknown) => digestBytes(new TextEncoder().encode(canonicalJson(value)));

function normalize(shape: Shape, value: unknown): unknown {
  if (!matches(shape, value)) return value;
  let result = value;
  if (shape.ref) result = normalize(shapes[shape.ref]!, result);
  if (shape.items && Array.isArray(result)) {
    result = result.map(item => normalize(shape.items!, item));
    if (shape.set) {
      const keyed = (result as unknown[]).map(item => ({ key: canonicalize(item)!, item }));
      keyed.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      result = keyed.map(({ item }) => item);
    }
  }
  if (shape.properties && result !== null && typeof result === 'object' && !Array.isArray(result)) {
    const input = result as Record<string, unknown>;
    result = Object.fromEntries(Object.entries(input).map(([key, item]) => [key, shape.properties![key] ? normalize(shape.properties![key]!, item) : item]));
  }
  for (const branch of shape.branches ?? []) result = normalize(branch, result);
  return result;
}

/** Schema-declared semantic fields only; set order is normalized, ordinary array order is retained. */
export async function digestContract(name: DigestSchemaName, value: unknown): Promise<Digest> {
  // Preflight precedes Ajv so invalid objects cannot execute getters during validation.
  canonicalJson(value);
  if (!Object.hasOwn(digestPolicies, name) || !validateContract(name, value).success) throw new ContractDigestError();
  const normalized = normalize(shapes[name]!, value) as Record<string, unknown>;
  const payload = Object.fromEntries(digestPolicies[name].filter(field => Object.hasOwn(normalized, field)).map(field => [field, normalized[field]]));
  return hashJson(payload);
}

export async function digestCommandIntent(command: CommandEnvelope): Promise<Digest> {
  canonicalJson(command);
  if (!validateContract('CommandEnvelope', command).success) throw new ContractDigestError();
  const definition = protocolRegistry.commands.find(entry => entry.type === command.type)!;
  return digestContract(`${definition.name}Command`, command);
}

export async function digestRequiredSlots(slots: readonly string[]): Promise<Digest> {
  canonicalJson(slots);
  if (!slots.length || slots.length > 32 || new Set(slots).size !== slots.length || slots.some(slot => !validateContract('RegisteredName', slot).success)) throw new ContractDigestError();
  return hashJson([...slots].sort());
}

/** Pure recovery input check. It neither reads persisted facts nor repins a subject. */
export async function checkPinInput(existing: PinSet, request: ResolveAndPinRequest): Promise<void> {
  for (const [name, value] of [['PinSet', existing], ['ResolveAndPinRequest', request]] as const) {
    canonicalJson(value);
    if (!validateContract(name as SchemaName, value).success) throw new ContractDigestError();
  }
  if (existing.subjectRef.type !== request.subjectRef.type || existing.subjectRef.id !== request.subjectRef.id ||
      existing.subjectInputDigest !== request.subjectInputDigest || existing.requiredSlotsDigest !== await digestRequiredSlots(request.requiredBehaviorSlots) ||
      existing.requiredSlotsDigest !== await digestRequiredSlots(existing.pins.map(pin => pin.behaviorSlot))) {
    throw new ContractDigestError('PIN_INPUT_CONFLICT');
  }
}

/** Declared raw-file metadata shared by Pack builders and loaders. */
export interface PackDigestEntry {
  ref: string;
  digest: Digest;
  mediaType: string;
  sizeBytes: number;
}
export interface PackIntegrityDigests {
  manifestDigest: Digest;
  artifactSetDigest: Digest;
  packageDigest: Digest;
  /** Exact UTF-8 text to pass to Cosign sign-blob/verify-blob, not a second hash. */
  signaturePayload: string;
}

/** V1 Pack digest algorithm. Metadata hashing does not verify file bytes, signatures, trust or a complete Manifest schema. */
export async function digestPackManifest(manifest: unknown): Promise<PackIntegrityDigests> {
  // Validate inert JSON and snapshot before awaiting any hashing operation.
  const value: unknown = JSON.parse(canonicalJson(manifest));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractDigestError();
  const record = value as Record<string, unknown>;
  const entries: (PackDigestEntry & {kind: 'artifact' | 'migration'})[] = [];
  const paths = new Set<string>();
  for (const [field, kind] of [['artifacts', 'artifact'], ['migrations', 'migration']] as const) {
    const list = record[field];
    if (!Array.isArray(list) || list.length > 10000) throw new ContractDigestError();
    for (const candidate of list) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new ContractDigestError();
      const {ref, digest, mediaType, sizeBytes} = candidate as Record<string, unknown>;
      // Portable paths prevent case/Unicode aliases and archive traversal. Full archive validation belongs to the Loader.
      if (typeof ref !== 'string' || ref.length > 1024 || ref.normalize('NFC') !== ref || /[\\:\u0000-\u0020\u007f]/u.test(ref)
        || ref.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.'))
        || paths.has(ref.toLowerCase()) || typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)
        || typeof mediaType !== 'string' || !mediaType.length || mediaType.length > 256
        || !Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 0) throw new ContractDigestError();
      paths.add(ref.toLowerCase());
      entries.push({kind, ref, digest: digest as Digest, mediaType, sizeBytes: sizeBytes as number});
    }
  }
  // UTF-8 ref order differs from JCS UTF-16 object-key order for non-BMP characters.
  const encoder = new TextEncoder();
  entries.sort((a, b) => {
    const left = encoder.encode(a.ref), right = encoder.encode(b.ref);
    for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
    return left.length - right.length;
  });
  delete record.integrity;
  const manifestDigest = await hashJson(record);
  const artifactSetDigest = await hashJson(entries);
  const signaturePayload = canonicalJson(['abh-pack-v1', manifestDigest.slice(7), artifactSetDigest.slice(7)]);
  return {manifestDigest, artifactSetDigest, packageDigest: await digestBytes(new TextEncoder().encode(signaturePayload)), signaturePayload};
}
