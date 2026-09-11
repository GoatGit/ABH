export type * from '../generated/ports.ts';
export { portMethods, portCommonErrors } from '../generated/port-registry.ts';
import { portMethods, portCommonErrors } from '../generated/port-registry.ts';
import { validateContract, type SchemaTypes, type ValidationResult } from './schema.ts';

export type PortMethod = keyof typeof portMethods;
export type PortRequest<M extends PortMethod> = SchemaTypes[(typeof portMethods)[M]['request']];
export type PortResult<M extends PortMethod> = SchemaTypes[(typeof portMethods)[M]['result']];

export function validatePortRequest<M extends PortMethod>(method: M, value: unknown): ValidationResult<PortRequest<M>> {
  if (!Object.hasOwn(portMethods, method)) return { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] };
  const definition = portMethods[method];
  const checked = validateContract(definition.request, value);
  if (!checked.success) return checked;
  if ('permission' in definition && 'context' in checked.data) {
    const target = checked.data.context.target;
    if (target.action !== definition.permission || !(definition.targetTypes as readonly string[]).includes(target.objectRef.type)) {
      return { success: false, code: 'INVALID_ARGUMENT', issues: [{ path: '/context/target', keyword: 'port', message: 'Target does not match the registered Port permission and object types.' }] };
    }
  }
  return checked as ValidationResult<PortRequest<M>>;
}

export function validatePortResult<M extends PortMethod>(method: M, value: unknown): ValidationResult<PortResult<M>> {
  if (!Object.hasOwn(portMethods, method)) return { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] };
  const definition = portMethods[method];
  const result = validateContract(definition.result, value);
  if (!result.success) return result;
  const output = result.data;
  if (output.status === 'Rejected' &&
    (!new Set<string>([...portCommonErrors, ...definition.errors]).has(output.error.error.code) ||
     (definition.effect === 'DurableWrite' && output.error.error.retryable))) {
    return { success: false, code: 'INVALID_ARGUMENT', issues: [{ path: '/error', keyword: 'port', message: 'Error is not registered or safe for this Port method.' }] };
  }
  return result as ValidationResult<PortResult<M>>;
}
