import { protocolRegistry } from '../generated/protocol-registry.ts';
import type { CommandEnvelope } from '../generated/types.ts';
import { errorRegistry } from './errors.ts';
import { schemaIds, validateContract, type SchemaName, type ValidationResult } from './schema.ts';
import { canonicalJson } from './digest.ts';

export { protocolRegistry };
type CommandDefinition = (typeof protocolRegistry.commands)[number];
type PublicCommand = Extract<CommandDefinition, { visibility: 'Public' }>;
export type PublicCommandType = PublicCommand['type'];
type WithoutIngress<T> = T extends unknown ? Omit<T, 'commandId' | 'schemaVersion'> : never;
export type CommandDraft = WithoutIngress<Extract<CommandEnvelope, { type: PublicCommandType }>>;
export type HttpHeaders = Readonly<Record<string, string | readonly string[] | undefined>>;
const invalid = (): { success: false; code: 'INVALID_ARGUMENT'; issues: [] } => ({ success: false, code: 'INVALID_ARGUMENT', issues: [] });

function header(headers: HttpHeaders, name: string): string | undefined {
  const matches = Object.keys(headers).filter(key => key.toLowerCase() === name);
  if (matches.length > 1) throw new Error('Ambiguous header');
  const value = matches.length ? headers[matches[0]!] : undefined;
  if (value !== undefined && typeof value !== 'string') throw new Error('Repeated header');
  return value;
}

/** Parses transport representation only. Ingress must authenticate and assign commandId/context. */
export function parseHttpCommand(type: PublicCommandType, headers: HttpHeaders, body: unknown): ValidationResult<CommandDraft> {
  const definition = protocolRegistry.commands.find((entry): entry is PublicCommand => entry.type === type && entry.visibility === 'Public');
  if (!definition) return { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] };
  if (!validateContract(`${definition.name}HttpRequest`, body).success) return invalid();
  const input = body as Record<string, unknown>;
  try {
    const idempotencyKey = header(headers, 'idempotency-key');
    if (!validateContract('IdempotencyKey', idempotencyKey).success || (Object.hasOwn(input, 'idempotencyKey') && input.idempotencyKey !== idempotencyKey)) return invalid();
    const ifMatch = header(headers, 'if-match');
    const draft: Record<string, unknown> = { type, target: input.target, payload: input.payload, idempotencyKey };
    if (definition.mode === 'Update') {
      if (!ifMatch || !/^"[1-9][0-9]*"$/.test(ifMatch)) return invalid();
      const expectedVersion = Number(ifMatch.slice(1, -1));
      if (!validateContract('Version', expectedVersion).success || (Object.hasOwn(input, 'expectedVersion') && input.expectedVersion !== expectedVersion)) return invalid();
      draft.expectedVersion = expectedVersion;
    } else if (ifMatch !== undefined || Object.hasOwn(input, 'expectedVersion')) return invalid();
    return { success: true, data: draft as CommandDraft };
  } catch {
    return invalid();
  }
}

/** Only explicitly registered numeric query fields are converted; JSON bodies are never coerced. */
export function parseHttpQuery(type: (typeof protocolRegistry.queries)[number]['type'], query: Readonly<Record<string, string | readonly string[]>>): ValidationResult<unknown> {
  const definition = protocolRegistry.queries.find(entry => entry.type === type);
  if (!definition) return { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string' || !(definition.filters as readonly string[]).includes(key)) return invalid();
    if (key === 'limit') {
      if (!/^[1-9][0-9]*$/.test(value)) return invalid();
      result[key] = Number(value);
    } else result[key] = value;
  }
  return validateContract(`${definition.name}Query`, result);
}

/** Validate the permission-filtered DTO before serialization; callers send a sanitized 500 on failure. */
export function serializeHttpResponse(operationId: string, status: number, body: unknown):
  | { success: true; json: string }
  | { success: false; code: 'INTERNAL_ERROR'; schemaId?: string; issues?: readonly string[] } {
  const command = protocolRegistry.commands.find((entry): entry is PublicCommand => entry.name === operationId && entry.visibility === 'Public');
  const query = protocolRegistry.queries.find(entry => entry.name === operationId);
  const definition = command ?? query;
  if (!definition) return { success: false, code: 'INTERNAL_ERROR' };
  const successStatus = command?.status ?? 200;
  const schema: SchemaName = status === successStatus ? definition.response : 'ErrorResponse';
  const failed = (issues?: readonly string[]) => ({ success: false as const, code: 'INTERNAL_ERROR' as const, schemaId: schemaIds[schema], ...(issues ? { issues } : {}) });
  let json: string;
  let snapshot: unknown;
  try {
    // Serialize inert JSON once, then validate exactly the bytes to be sent.
    // This prevents inherited toJSON/getters from changing a DTO after validation.
    json = canonicalJson(body);
    snapshot = JSON.parse(json);
  } catch (error) { return failed([error instanceof Error ? error.message : String(error)]); }
  const validated = validateContract(schema, snapshot);
  if (!validated.success) return failed(validated.issues?.map(issue => `${issue.path || '/'} ${issue.message}`));
  if (schema === 'ErrorResponse') {
    const code = (snapshot as { error: { code: keyof typeof errorRegistry } }).error.code;
    if (!(new Set<string>([...protocolRegistry.commonErrors, ...definition.errors])).has(code) || errorRegistry[code].httpStatus !== status) return failed();
  }
  return { success: true, json };
}
