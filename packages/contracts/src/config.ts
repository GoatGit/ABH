import { configurationMetadata } from '../generated/config-metadata.ts';
import type { ResolvedDevelopmentConfig } from '../generated/types.ts';
import { validateContract, type ValidationResult } from './schema.ts';

export { configurationMetadata };

/** Explicit default resolution after strict validation; never reads process.env or resolves secrets. */
export function resolveDevelopmentConfig(input: unknown): ValidationResult<ResolvedDevelopmentConfig> {
  const checked = validateContract('DevelopmentConfig', input);
  if (!checked.success) return checked;
  const resolved = structuredClone(checked.data) as unknown as Record<string, unknown>;
  for (const [path, metadata] of Object.entries(configurationMetadata)) {
    if (!('default' in metadata)) continue;
    const keys = path.slice(1).split('/');
    const leaf = keys.pop()!;
    let parent = resolved;
    for (const key of keys) {
      if (!Object.hasOwn(parent, key)) parent[key] = {};
      parent = parent[key] as Record<string, unknown>;
    }
    if (!Object.hasOwn(parent, leaf)) parent[leaf] = metadata.default;
  }
  return validateContract('ResolvedDevelopmentConfig', resolved);
}

/** Lists only explicitly referenced environment keys. Values and arbitrary env overrides stay outside the contract package. */
export function requiredEnvironmentReferences(input: unknown): ValidationResult<readonly { path: string; name: string }[]> {
  const checked = resolveDevelopmentConfig(input);
  if (!checked.success) return checked;
  const references: { path: string; name: string }[] = [];
  for (const [path, metadata] of Object.entries(configurationMetadata)) {
    if (metadata.sensitivity !== 'Reference') continue;
    let value: unknown = checked.data;
    for (const key of path.slice(1).split('/')) value = (value as Record<string, unknown>)[key];
    references.push({ path, name: (value as string).slice('env:'.length) });
  }
  return { success: true, data: references };
}
