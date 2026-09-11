import * as compiled from '../generated/validators.js';
import { schemaIds } from '../generated/schema-ids.ts';
import type { SchemaTypes } from '../generated/schema-types.ts';
import { inspectRelationships } from './relationships.ts';

export { schemaIds };
export type { SchemaTypes };
export type SchemaName = keyof SchemaTypes;
export type ValidationIssue = Readonly<{ path: string; keyword: string; message: string }>;
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; code: 'INVALID_ARGUMENT' | 'SCHEMA_UNSUPPORTED'; issues: readonly ValidationIssue[] };

type CompiledValidator = ((value: unknown) => boolean) & {
  errors?: readonly { instancePath: string; keyword: string }[] | null;
};
const validators = compiled as unknown as Record<string, CompiledValidator>;

/** Validates representation and local relationships, never database facts or permission. */
export function validateContract<N extends SchemaName>(name: N, value: unknown): ValidationResult<SchemaTypes[N]> {
  if (!Object.hasOwn(schemaIds, name)) {
    return { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] };
  }
  const validator = validators[`validate${name}`]!;
  if (!validator(value)) {
    return {
      success: false,
      code: 'INVALID_ARGUMENT',
      // Ajv params/data are deliberately excluded: they can contain caller input.
      issues: (validator.errors ?? []).map(error => ({
        path: error.instancePath,
        keyword: error.keyword,
        message: 'Value does not satisfy the registered contract.',
      })),
    };
  }
  const issues = inspectRelationships(name, value);
  return issues.length ? { success: false, code: 'INVALID_ARGUMENT', issues } : { success: true, data: value as SchemaTypes[N] };
}
