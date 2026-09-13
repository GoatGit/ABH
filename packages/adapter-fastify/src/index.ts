import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { CommandEnvelope, RequestContext } from '@abh/contracts';
import { createErrorResponse, errorRegistry, type ErrorCode } from '@abh/contracts/errors';
import { parseHttpCommand, parseHttpQuery, protocolRegistry, serializeHttpResponse, type PublicCommandType } from '@abh/contracts/http';
import { validateContract } from '@abh/contracts/schema';

export type QueryType = (typeof protocolRegistry.queries)[number]['type'];
export type PublicCommand = Extract<CommandEnvelope, { type: PublicCommandType }>;
export type TransportOperation = PublicCommandType | QueryType | string;
export interface IngressIdentity {
  requestId: string;
  correlationId: string;
  receivedAt: string;
  operation: TransportOperation;
  signal: AbortSignal;
}
export interface HandlerContext {
  context: RequestContext;
  signal: AbortSignal;
}
export interface HttpBinaryRoute {
  readonly operation: TransportOperation;
  readonly contentType?: string;
  /** Route-specific decoded body bound; defaults to the app-wide bodyLimit. */
  readonly maxBytes?: number;
  /** Headers are caller-supplied transport metadata; handlers must validate them explicitly. */
  handle(input: HandlerContext & { headers: Record<string, string | string[]>; content: AsyncIterable<Uint8Array> }): Promise<unknown>;
}
export type HttpProjectionEvent =
  {kind:'reset'}|
  ({kind:'change';projectionType:string;version:number;watermark:number;cursor?:string});
export type HttpProjectionSseDropReason='slow'|'reset'|'disconnected';
export interface HttpInstallation {
  /** Verify credentials and resolve current identity/purpose. Never copy untrusted context headers. */
  authenticate(request: FastifyRequest, ingress: IngressIdentity): Promise<RequestContext>;
  /** Handlers own current authorization, replay admission, transactions and permission-filtered DTOs. */
  commands?: Partial<{ [K in PublicCommandType]: (input: HandlerContext & { command: Extract<PublicCommand, { type: K }> }) => Promise<unknown> }>;
  queries?: Partial<Record<QueryType, (input: HandlerContext & { query: unknown; id?: string }) => Promise<unknown>>>;
  /** Explicit non-contract binary transports for unbounded bodies; handlers own bounds and authorization. */
  binaryRoutes?: Record<string, HttpBinaryRoute>;
  /** Optional SSE endpoint: each notify callback emits a projection_changed event to connected clients. */
  events?: {
    subscribe(subjectType: string, subjectId: string, context: RequestContext, signal: AbortSignal,
      afterEventId?: string): AsyncIterable<HttpProjectionEvent>;
    metrics?: {
      incrementSseDrop(reason: HttpProjectionSseDropReason): void;
    };
  };
  deadlineMs?: number;
  bodyLimit?: number;
}

/** Only explicitly mapped domain failures may cross the transport boundary. */
export class HttpFailure extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super('HTTP request failed');
    this.code = Object.hasOwn(errorRegistry, code) ? code : 'INTERNAL_ERROR';
  }
}

const lifetimes = new WeakMap<FastifyInstance, { stopping: boolean; work: Set<Promise<void>>; stopped?: Promise<void> }>();

/** Stop admission synchronously; join actual authentication/Owner work, including work whose HTTP response timed out. */
export function stopHttpIngress(app: FastifyInstance, pendingListen?: Promise<unknown>): Promise<void> {
  const lifetime = lifetimes.get(app);
  if (!lifetime) throw new TypeError('HTTP app was not created by this adapter');
  if (lifetime.stopped) return lifetime.stopped;
  lifetime.stopping = true;
  lifetime.stopped = (async () => {
    // A listen already in progress may bind after an early close; join it before closing transport.
    if (pendingListen) await pendingListen.catch(() => {});
    // Wait for both branches even if transport close fails. Request failures belong to their request.
    const results = await Promise.allSettled([app.close(), Promise.all([...lifetime.work])]);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'HTTP ingress shutdown failed');
  })();
  return lifetime.stopped;
}

function headers(request: FastifyRequest): Record<string, string | string[]> {
  // Node can discard or join duplicate headers; preserve multiplicity before contract parsing.
  const result: Record<string, string | string[]> = Object.create(null);
  const raw = request.raw.rawHeaders;
  for (let i = 0; i < raw.length; i += 2) {
    const key = raw[i]!.toLowerCase();
    const value = raw[i + 1]!;
    const previous = result[key];
    result[key] = previous === undefined ? value : [...(Array.isArray(previous) ? previous : [previous]), value];
  }
  return result;
}

/** Constructs an unbound app. Listening/readiness and production identity remain the host's responsibility. */
export function createHttpApp(installation: HttpInstallation): FastifyInstance {
  if (typeof installation.authenticate !== 'function') throw new TypeError('Authentication installation required');
  const deadlineMs = installation.deadlineMs ?? 30_000;
  const bodyLimit = installation.bodyLimit ?? 1_048_576;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 60_000 || !Number.isSafeInteger(bodyLimit) || bodyLimit < 1) throw new TypeError('Invalid HTTP bounds');
  const commands = { ...installation.commands };
  const queries = { ...installation.queries };
  const binaryRoutes = { ...installation.binaryRoutes };
  const authenticate = installation.authenticate;
  const publicCommands = protocolRegistry.commands.filter(entry => entry.visibility === 'Public');
  for (const key of Object.keys(commands)) if (!publicCommands.some(entry => entry.type === key) || typeof commands[key as PublicCommandType] !== 'function') throw new TypeError('Unregistered command handler');
  for (const key of Object.keys(queries)) if (!protocolRegistry.queries.some(entry => entry.type === key) || typeof queries[key as QueryType] !== 'function') throw new TypeError('Unregistered query handler');
  const app = Fastify({ logger: false, bodyLimit, requestTimeout: deadlineMs, genReqId: () => randomUUID(), requestIdHeader: false, exposeHeadRoutes: false });
  const lifetime = { stopping: false, work: new Set<Promise<void>>() };
  const sseConnections = { users: new Map<string, number>(), organizations: new Map<string, number>() };
  lifetimes.set(app, lifetime);
  app.setErrorHandler((error, request, reply) => {
    const rawCode = error instanceof HttpFailure ? error.code : (error as { code?: unknown }).code;
    const code = typeof rawCode === 'string' && Object.hasOwn(errorRegistry, rawCode) ? rawCode as ErrorCode
      : (error as { statusCode?: number }).statusCode === 400 || (error as { statusCode?: number }).statusCode === 413 || (error as { statusCode?: number }).statusCode === 415 ? 'INVALID_ARGUMENT' : 'INTERNAL_ERROR';
    reply.code(errorRegistry[code].httpStatus).send(createErrorResponse(code, request.id));
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send(createErrorResponse('RESOURCE_NOT_FOUND', request.id)));

  for (const [path, route] of Object.entries(binaryRoutes)) {
    const contentType = route.contentType ?? 'application/octet-stream';
    const maxBytes = route.maxBytes ?? bodyLimit;
    if (!path.startsWith('/v1/') || !Number.isSafeInteger(maxBytes) || maxBytes < 1
      || Object.values(binaryRoutes).filter(candidate => (candidate.contentType ?? 'application/octet-stream') === contentType).length !== 1)
      throw new TypeError('Invalid binary transport route');
    app.addContentTypeParser(contentType, { bodyLimit: maxBytes }, (request: FastifyRequest, payload, done) => {
      if (request.headers['content-length'] === '0' || payload.readableEnded) {
        const empty = new PassThrough();
        empty.end();
        done(null, empty);
        return;
      }
      const body = new PassThrough();
      const expectedSize = Number(request.headers['content-length']);
      let size = 0, settled = false;
      const finish = (error?: Error, value?: PassThrough) => {
        if (settled) return;
        settled = true;
        if (error) { body.destroy(error); done(null, body); return; }
        value!.end();
        done(null, value!);
      };
      if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) {
        finish(Object.assign(new HttpFailure('INVALID_ARGUMENT'), { statusCode: 400 }));
        return;
      }
      if (expectedSize > maxBytes) return finish(Object.assign(new HttpFailure('LIMIT_EXCEEDED'), { statusCode: 429 }));
      payload.on('data', chunk => {
        if (settled) return;
        size += chunk.byteLength;
        if (size > maxBytes) return finish(Object.assign(new HttpFailure('LIMIT_EXCEEDED'), { statusCode: 429 }));
        body.write(chunk);
        if (size === expectedSize) finish(undefined, body);
      });
      payload.on('error', error => finish(error));
      request.raw.on('aborted', () => finish(Object.assign(new Error('request aborted'), { statusCode: 400 })));
    });
    app.post(path, async (request, reply) => {
      if (lifetime.stopping) return reply.code(500).send(createErrorResponse('INTERNAL_ERROR', request.id));
      const controller = new AbortController(), correlationId = request.id;
      const abort = () => controller.abort(new HttpFailure('CONTEXT_EXPIRED'));
      const disconnected = () => { if (!reply.raw.writableEnded) abort(); };
      request.raw.once('aborted', abort); reply.raw.once('close', disconnected);
      const timer = setTimeout(abort, deadlineMs);
      let expiryTimer: ReturnType<typeof setTimeout> | undefined, onAbort: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new HttpFailure('CONTEXT_EXPIRED'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      let completion: Promise<void> | undefined;
      try {
        const receivedAt = new Date().toISOString();
        const identity = await authenticate(request, { requestId: request.id, correlationId, receivedAt, operation: route.operation, signal: controller.signal });
        if (!validateContract('RequestContext', identity).success) throw new HttpFailure('INTERNAL_ERROR');
        const context = { ...structuredClone(identity), requestId: request.id, correlationId, receivedAt };
        const remaining = Date.parse(context.contextExpiresAt) - Date.now();
        if (remaining <= 0 || controller.signal.aborted) throw new HttpFailure('CONTEXT_EXPIRED');
        expiryTimer = setTimeout(abort, Math.min(remaining, deadlineMs));
        const body = request.body as AsyncIterable<Uint8Array> | undefined;
        if (!body || typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== 'function') throw new HttpFailure('INVALID_ARGUMENT');
        let settled!: () => void;
        completion = new Promise(resolve => { settled = resolve; });
        lifetime.work.add(completion);
        const pending = route.handle({ context, signal: controller.signal, headers: headers(request), content: body })
          .finally(settled);
        const data = await Promise.race([pending, cancelled]);
        if (!data || typeof data !== 'object') throw new HttpFailure('INTERNAL_ERROR');
        const snapshot = JSON.stringify({ success: true, data });
        const version = (data as { objectRef?: { version?: number } }).objectRef?.version;
        if (version !== undefined) reply.header('ETag', `"${version}"`);
        return reply.code(201).type('application/json').send(snapshot);
      } catch (error) {
        let code = error instanceof HttpFailure ? error.code : 'INTERNAL_ERROR';
        if (!errorRegistry[code]) code = 'INTERNAL_ERROR';
        return reply.code(errorRegistry[code].httpStatus).type('application/json')
          .send(createErrorResponse(code, correlationId));
      } finally {
        clearTimeout(timer); clearTimeout(expiryTimer);
        (request.body as { destroy?: (error?: Error) => void }).destroy?.();
        controller.signal.removeEventListener('abort', onAbort);
        request.raw.removeListener('aborted', abort); reply.raw.removeListener('close', disconnected);
      }
    });
  }

  if (installation.events) {
    const events = installation.events;
    app.get('/v1/events/:subjectType/:subjectId', async (request, reply) => {
      const { subjectType, subjectId } = request.params as { subjectType: string; subjectId: string };
      const controller = new AbortController();
      const abort = () => controller.abort(new HttpFailure('CONTEXT_EXPIRED'));
      request.raw.once('aborted', abort);
      reply.raw.once('close', abort);
      const header = request.headers['last-event-id'];
      const afterEventId = typeof header === 'string' && header.length <= 64 ? header : undefined;
      const receivedAt = new Date().toISOString();
      const identity = await authenticate(request, { requestId: request.id, correlationId: request.id, receivedAt, operation: 'abh.projections.get' as QueryType, signal: controller.signal });
      if (!validateContract('RequestContext', identity).success) return reply.code(500).send(createErrorResponse('INTERNAL_ERROR', request.id));
      const context = { ...structuredClone(identity), requestId: request.id, correlationId: request.id, receivedAt };
      const userCount = sseConnections.users.get(context.actor.id) ?? 0;
      const organizationCount = sseConnections.organizations.get(context.resourceOrganizationId) ?? 0;
      if (userCount >= 5 || organizationCount >= 50) {
        const code: ErrorCode = 'RATE_LIMITED';
        return reply.code(errorRegistry[code].httpStatus).type('application/json')
          .send(createErrorResponse(code, request.id));
      }
      sseConnections.users.set(context.actor.id, userCount + 1);
      sseConnections.organizations.set(context.resourceOrganizationId, organizationCount + 1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        const nextUserCount = (sseConnections.users.get(context.actor.id) ?? 1) - 1;
        if (nextUserCount <= 0) sseConnections.users.delete(context.actor.id);
        else sseConnections.users.set(context.actor.id, nextUserCount);
        const nextOrganizationCount = (sseConnections.organizations.get(context.resourceOrganizationId) ?? 1) - 1;
        if (nextOrganizationCount <= 0) sseConnections.organizations.delete(context.resourceOrganizationId);
        else sseConnections.organizations.set(context.resourceOrganizationId, nextOrganizationCount);
      };
      reply.raw.once('close', release);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      reply.raw.write(`retry: 5000\n\n`);
      try {
        const heartbeat = setInterval(() => {
          if (!reply.raw.writableEnded && !reply.raw.writableNeedDrain) reply.raw.write(': heartbeat\n\n');
        }, 15_000);
        let queued = 0;
        reply.raw.once('drain', () => { queued = Math.max(0, queued - 1); });
        try {
          let recordedDrop = false;
          for await (const change of events.subscribe(subjectType, subjectId, context, controller.signal, afterEventId)) {
            if (queued >= 256) {
              events.metrics?.incrementSseDrop('slow'); recordedDrop = true;
              controller.abort(new HttpFailure('CONTEXT_EXPIRED')); break;
            }
            if (change.kind === 'reset') {
              events.metrics?.incrementSseDrop('reset'); recordedDrop = true;
              reply.raw.write(`event: projection_reset\ndata: {"reason":"reset"}\n\n`);
              break;
            }
            const data = JSON.stringify({ subjectRef: { type: subjectType, id: subjectId }, projectionType: change.projectionType, version: change.version, watermark: change.watermark, occurredAt: new Date().toISOString() });
            if (change.cursor) reply.raw.write(`id: ${change.cursor}\n`);
            reply.raw.write(`event: projection_changed\ndata: ${data}\n\n`);
            queued++;
          }
          if (!recordedDrop && controller.signal.aborted && !reply.raw.writableEnded) {
            events.metrics?.incrementSseDrop('disconnected');
          }
        } finally { clearInterval(heartbeat); }
      } catch {
        events.metrics?.incrementSseDrop('disconnected');
      }
      if (!reply.raw.writableEnded) reply.raw.end();
    });
  }
  for (const definition of [...publicCommands, ...protocolRegistry.queries]) {
    const isCommand = 'visibility' in definition;
    const commandHandler = isCommand ? commands[definition.type] : undefined;
    const queryHandler = !isCommand ? queries[definition.type] : undefined;
    if (!commandHandler && !queryHandler) continue;
    app.route({ method: isCommand ? 'POST' : 'GET', url: isCommand ? `/v1/commands/${definition.type}` : definition.path.replace('{id}', ':id'), handler: async (request, reply) => {
      if (lifetime.stopping) return reply.code(500).send(createErrorResponse('INTERNAL_ERROR', request.id));
      const controller = new AbortController();
      const correlationId = request.id;
      const abort = () => controller.abort(new HttpFailure('CONTEXT_EXPIRED'));
      const disconnected = () => { if (!reply.raw.writableEnded) abort(); };
      request.raw.once('aborted', abort);
      reply.raw.once('close', disconnected);
      const timer = setTimeout(abort, deadlineMs);
      let expiryTimer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new HttpFailure('CONTEXT_EXPIRED'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        const work = async () => {
          const receivedAt = new Date().toISOString();
          const identity = await authenticate(request, { requestId: request.id, correlationId, receivedAt, operation: definition.type, signal: controller.signal });
          if (!validateContract('RequestContext', identity).success) throw new HttpFailure('INTERNAL_ERROR');
          // Take a private snapshot; ingress IDs/timestamps are always generated by the server.
          const context = { ...structuredClone(identity), requestId: request.id, correlationId, receivedAt };
          const remaining = Date.parse(context.contextExpiresAt) - Date.now();
          if (remaining <= 0 || controller.signal.aborted) throw new HttpFailure('CONTEXT_EXPIRED');
          expiryTimer = setTimeout(abort, Math.min(remaining, deadlineMs));
          if (isCommand) {
            if (Object.keys(request.query as object).length) throw new HttpFailure('INVALID_ARGUMENT');
            const parsed = parseHttpCommand(definition.type, headers(request), request.body);
            if (!parsed.success) throw new HttpFailure(parsed.code);
            const command = { ...parsed.data, commandId: randomUUID(), schemaVersion: protocolRegistry.version } as PublicCommand;
            return (commandHandler as (input: HandlerContext & { command: PublicCommand }) => Promise<unknown>)({ context, signal: controller.signal, command });
          }
          const parsed = parseHttpQuery(definition.type, request.query as Record<string, string | string[]>);
          if (!parsed.success || request.body !== undefined) throw new HttpFailure('INVALID_ARGUMENT');
          const id = (request.params as { id?: string }).id;
          if (id !== undefined && !validateContract('UUID', id).success) throw new HttpFailure('INVALID_ARGUMENT');
          return queryHandler!({ context, signal: controller.signal, query: parsed.data, ...(id === undefined ? {} : { id }) });
        };
        // Register before calling user code: authentication may itself initiate shutdown.
        let settled!: () => void;
        const completion = new Promise<void>(resolve => { settled = resolve; });
        lifetime.work.add(completion);
        const pending = work();
        const finish = () => { lifetime.work.delete(completion); settled(); };
        void pending.then(finish, finish);
        const body = await Promise.race([pending, cancelled]);
        const status = isCommand ? definition.status : 200;
        const encoded = serializeHttpResponse(definition.name, status, body);
        if (!encoded.success) throw new HttpFailure('INTERNAL_ERROR');
        if (isCommand) {
          const snapshot = JSON.parse(encoded.json);
          const version = snapshot.data?.objectRef?.version ?? snapshot.assignmentRef?.version;
          if (version !== undefined) reply.header('ETag', `"${version}"`);
          if (status === 202) reply.header('Location', `/v1/actions/${snapshot.data.trackingRef.id}`);
        }
        return reply.code(status).type('application/json').send(encoded.json);
      } catch (error) {
        let code: ErrorCode = error instanceof HttpFailure ? error.code : 'INTERNAL_ERROR';
        if (!([...protocolRegistry.commonErrors, ...definition.errors] as readonly string[]).includes(code)) code = 'INTERNAL_ERROR';
        const status = errorRegistry[code].httpStatus;
        const encoded = serializeHttpResponse(definition.name, status, createErrorResponse(code, correlationId));
        if (!encoded.success) throw new HttpFailure('INTERNAL_ERROR');
        return reply.code(status).type('application/json').send(encoded.json);
      } finally {
        clearTimeout(timer);
        clearTimeout(expiryTimer);
        controller.signal.removeEventListener('abort', onAbort);
        request.raw.removeListener('aborted', abort);
        reply.raw.removeListener('close', disconnected);
      }
    } });
  }
  return app;
}
