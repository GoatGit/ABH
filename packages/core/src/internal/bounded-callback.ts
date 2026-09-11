import type { TransactionOptions } from '../data/uow.ts';
import { CoreError } from './errors.ts';

/** Host callbacks cannot indefinitely retain a worker during shutdown or after its deadline. */
export async function boundedCallback<T>(callback: (options: TransactionOptions) => Promise<T>, options: TransactionOptions): Promise<T> {
  if (!Number.isFinite(options.deadline) || options.deadline <= Date.now() || options.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
  const deadline = Math.min(options.deadline, Date.now() + 30_000);
  const stop = new AbortController(), cancel = () => stop.abort(options.signal.reason);
  options.signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => stop.abort(), Math.max(1, deadline - Date.now()));
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new CoreError('DEPENDENCY_TIMEOUT'));
    stop.signal.addEventListener('abort', onAbort, { once: true });
    if (options.signal.aborted) cancel();
  });
  try {
    const result = await Promise.race([Promise.resolve().then(() => {
      if (stop.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      return callback({ ...options, deadline, signal: stop.signal });
    }), aborted]);
    if (stop.signal.aborted || deadline <= Date.now()) throw new CoreError('DEPENDENCY_TIMEOUT');
    return result;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', cancel);
    stop.signal.removeEventListener('abort', onAbort);
  }
}
