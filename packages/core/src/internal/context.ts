import type { RequestContext } from '@abh/contracts';
import { validateContract } from '@abh/contracts/schema';
import { CoreError } from './errors.ts';

export type TenantContext = Readonly<Pick<RequestContext,
  'requestId' | 'actor' | 'actingOrganizationId' | 'resourceOrganizationId' | 'workspaceId' |
  'purposeOfUse' | 'sessionEpoch' | 'scopeEpoch' | 'contextExpiresAt'>>;

// Kept inside core: callers cannot authenticate by providing a JSON-shaped Context.
const issued = new WeakSet<object>();
export interface VerifiedContext {
  readonly tenant: TenantContext;
  readonly request: Readonly<RequestContext>;
}

/** Called only by trusted Ingress after authentication and current identity/scope verification. */
export function deriveVerifiedContext(input: RequestContext): VerifiedContext {
  if (!validateContract('RequestContext', input).success || Date.parse(input.contextExpiresAt) <= Date.now() || Date.parse(input.receivedAt) > Date.now()) throw new CoreError('UNAUTHENTICATED');
  const request = freeze(structuredClone(input));
  const tenant: TenantContext = Object.freeze({
    requestId: request.requestId, actor: request.actor,
    actingOrganizationId: request.actingOrganizationId, resourceOrganizationId: request.resourceOrganizationId,
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    purposeOfUse: request.purposeOfUse, sessionEpoch: request.sessionEpoch, scopeEpoch: request.scopeEpoch,
    contextExpiresAt: request.contextExpiresAt,
  });
  const result = Object.freeze({ tenant, request });
  issued.add(result);
  return result;
}

export function requireVerifiedContext(context: VerifiedContext): void {
  if (!context || !issued.has(context)) throw new CoreError('TENANT_CONTEXT_REQUIRED');
  if (Date.parse(context.tenant.contextExpiresAt) <= Date.now()) throw new CoreError('UNAUTHENTICATED');
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
