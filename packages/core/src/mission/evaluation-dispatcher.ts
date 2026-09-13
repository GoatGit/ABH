import { canonicalJson } from '@abh/contracts/digest';
import type { EvaluationRunRecord, WorkLeaseRecord } from '@abh/contracts';
import { boundedCallback } from '../internal/bounded-callback.ts';

export type EvaluationDispatchOutcome = 'Accepted' | 'Unknown';

export interface EvaluationDispatchContext {
  readonly run: EvaluationRunRecord;
  readonly lease: WorkLeaseRecord;
  readonly attempt: number;
  readonly signal: AbortSignal;
}

export interface EvaluationDispatcher {
  dispatch(context: EvaluationDispatchContext): Promise<EvaluationDispatchOutcome>;
}

export interface HttpEvaluationDispatcherOptions {
  readonly endpoint: string;
  readonly headers: (signal: AbortSignal) => Promise<HeadersInit>;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

const minTimeoutMs = 100;
const maxTimeoutMs = 30_000;
const minResponseBytes = 1;
const maxResponseBytes = 262_144;

function endpointUrl(value: string): URL {
  let endpoint: URL;
  try { endpoint = new URL(value); } catch { throw new Error('Invalid evaluation dispatcher endpoint'); }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash) throw new Error('Invalid evaluation dispatcher endpoint');
  if (!endpoint.pathname.endsWith('/')) endpoint.pathname += '/';
  return new URL('dispatch', endpoint);
}

async function boundedJson(response: Response, limit: number): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Unexpected evaluation dispatcher content type');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing evaluation dispatcher response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new Error('Evaluation dispatcher response is too large');
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function acceptedOutcome(value: unknown): EvaluationDispatchOutcome {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(['outcome'])
    && (value as Record<string, unknown>).outcome === 'Accepted') return 'Accepted';
  throw new Error('Unexpected evaluation dispatcher response');
}

export function createHttpEvaluationDispatcher(
  options: HttpEvaluationDispatcherOptions,
): EvaluationDispatcher {
  const endpoint = endpointUrl(options.endpoint);
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const responseLimit = options.maxResponseBytes ?? 65_536;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < minTimeoutMs || timeoutMs > maxTimeoutMs
    || !Number.isSafeInteger(responseLimit) || responseLimit < minResponseBytes
    || responseLimit > maxResponseBytes) throw new Error('Invalid evaluation dispatcher configuration');

  return {
    async dispatch(context: EvaluationDispatchContext): Promise<EvaluationDispatchOutcome> {
      const stop = new AbortController();
      const abortUpstream = () => stop.abort(context.signal.reason);
      context.signal.addEventListener('abort', abortUpstream, { once: true });
      const timer = setTimeout(() => stop.abort(), timeoutMs);
      try {
        const suppliedHeaders = new Headers(await boundedCallback(
          callbackOptions => options.headers(callbackOptions.signal),
          { deadline: Date.now() + Math.min(timeoutMs, maxTimeoutMs), signal: stop.signal },
        ));
        for (const name of ['accept', 'content-type', 'content-length']) suppliedHeaders.delete(name);
        suppliedHeaders.set('accept', 'application/json');
        suppliedHeaders.set('content-type', 'application/json');
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: suppliedHeaders,
          body: canonicalJson({ attempt: context.attempt, evaluationRun: context.run, lease: context.lease }),
          signal: stop.signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
        });
        if (response.status !== 202) {
          void response.body?.cancel().catch(() => {});
          return 'Unknown';
        }
        return acceptedOutcome(await boundedJson(response, responseLimit));
      } catch {
        return 'Unknown';
      } finally {
        clearTimeout(timer);
        context.signal.removeEventListener('abort', abortUpstream);
      }
    },
  };
}
