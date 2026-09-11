import type { ErrorCode } from '@abh/contracts/errors';

/** Internal diagnostics must never contain raw SQL, connection strings, or row content. */
export class CoreError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.name = 'CoreError';
    this.code = code;
  }
}
