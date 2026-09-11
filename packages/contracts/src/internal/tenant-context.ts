import { validateTenantContext as compiled } from '../../generated/internal/tenant-validator.js';
import type { TenantContext } from '../../generated/internal/types.ts';
import { inspectTenantRelationship } from '../relationships.ts';
import type { ValidationResult } from '../schema.ts';

/** Internal schema checking only. Ingress/UoW will authenticate and derive this context. */
export function validateTenantContext(value: unknown): ValidationResult<TenantContext> {
  if (!compiled(value)) return { success: false, code: 'INVALID_ARGUMENT', issues: [] };
  const data = value as TenantContext;
  const issues = inspectTenantRelationship(data);
  return issues.length ? { success: false, code: 'INVALID_ARGUMENT', issues } : { success: true, data };
}
