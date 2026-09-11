import { errorRegistry } from '../generated/error-registry.ts';
import type { ErrorResponse } from '../generated/types.ts';

export { errorRegistry };
export type ErrorCode = keyof typeof errorRegistry;

/** Stable public message; never expose provider error text, secrets or stack traces. */
export function createErrorResponse(code: ErrorCode, correlationId: string, safeToRetry = false): ErrorResponse {
  const entry = Object.hasOwn(errorRegistry, code) ? errorRegistry[code] : errorRegistry.INTERNAL_ERROR;
  return {
    success: false,
    error: {
      code: entry.code,
      category: entry.category,
      message: 'The request could not be completed.',
      retryable: entry.retryable && safeToRetry,
      correlationId,
    },
  } as ErrorResponse;
}
