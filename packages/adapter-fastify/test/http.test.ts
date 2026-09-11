import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { connect } from 'node:net';
import type { RequestContext } from '@abh/contracts';
import { createHttpApp, stopHttpIngress, HttpFailure, type HttpInstallation, type PublicCommand } from '../src/index.ts';

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`../../contracts/fixtures/valid/${name}.json`, import.meta.url), 'utf8')).value;
const identity = await fixture('request-context') as RequestContext;
const body = await fixture('cancel-http-request');
const url = '/v1/commands/abh.actions.cancel';
const headers = { 'idempotency-key': 'cancel-1', 'if-match': '"3"' };
const authenticate: HttpInstallation['authenticate'] = async () => ({ ...identity, contextExpiresAt: new Date(Date.now() + 60_000).toISOString() });
const accepted = (command: PublicCommand) => ({ success: true, data: { objectRef: { ...body.target, version: 4 }, trackingRef: { ...body.target, version: 4 }, commandId: command.commandId } });

test('installed command receives trusted context/envelope and emits validated acceptance headers', async t => {
  let seen: Extract<PublicCommand, { type: 'abh.actions.cancel' }> | undefined;
  const app = createHttpApp({ authenticate, commands: { 'abh.actions.cancel': async ({ command, context }) => {
    seen = command;
    assert.notEqual(context.requestId, identity.requestId);
    assert.notEqual(context.correlationId, 'client-controlled');
    assert.equal(context.actor.id, identity.actor.id);
    assert.ok(Date.parse(context.receivedAt) > Date.parse(identity.receivedAt));
    return accepted(command);
  } } });
  t.after(() => app.close());
  const result = await app.inject({ method: 'POST', url, headers: { ...headers, 'x-request-id': 'client-controlled', 'x-context': '{"actor":"admin"}' }, payload: body });
  assert.equal(result.statusCode, 202, result.body);
  assert.equal(seen?.expectedVersion, 3);
  assert.equal(seen?.schemaVersion, '0.1.0');
  assert.equal(result.json().data.commandId, seen?.commandId);
  assert.equal(result.headers.etag, '"4"');
  assert.equal(result.headers.location, `/v1/actions/${body.target.id}`);
});

test('invalid transport input never reaches command Owner', async t => {
  let calls = 0;
  const app = createHttpApp({ authenticate, commands: { 'abh.actions.cancel': async () => { calls++; return {}; } } });
  t.after(() => app.close());
  for (const payload of [{ ...body, context: identity }, { ...body, commandId: identity.requestId }, { ...body, expectedVersion: '3' }]) {
    assert.equal((await app.inject({ method: 'POST', url, headers, payload })).statusCode, 400);
  }
  for (const badHeaders of [{}, { ...headers, 'if-match': 'W/"3"' }, { ...headers, 'if-match': ['"3"', '"3"'] }]) {
    assert.equal((await app.inject({ method: 'POST', url, headers: badHeaders, payload: body })).statusCode, 400, JSON.stringify(badHeaders));
  }
  assert.equal((await app.inject({ method: 'POST', url: `${url}?actor=admin`, headers, payload: body })).statusCode, 400);
  assert.equal(calls, 0);
});

test('query parser validates path UUID and closed filters without coercing arbitrary input', async t => {
  const response = await fixture('action-query-response');
  let calls = 0;
  const app = createHttpApp({ authenticate, queries: { 'abh.actions.get': async ({ id, query }) => {
    calls++;
    assert.equal(id, body.target.id);
    assert.deepEqual(query, { consistency: 'Strong' });
    return response;
  } } });
  t.after(() => app.close());
  assert.equal((await app.inject(`/v1/actions/${body.target.id}?consistency=Strong`)).statusCode, 200);
  for (const path of ['/v1/actions/no-uuid', `/v1/actions/${body.target.id}?actor=admin`, `/v1/actions/${body.target.id}?consistency=Strong&consistency=Strong`]) {
    assert.equal((await app.inject(path)).statusCode, 400);
  }
  assert.equal(calls, 1);
});

test('internal/uninstalled routes remain unavailable and invalid installations fail at construction', async t => {
  const app = createHttpApp({ authenticate });
  t.after(() => app.close());
  for (const path of [url, '/v1/commands/abh.actions.validate', '/v1/actions']) {
    const result = await app.inject({ method: 'POST', url: path, payload: body });
    assert.equal(result.statusCode, 404);
    assert.equal(result.json().error.code, 'RESOURCE_NOT_FOUND');
  }
  assert.throws(() => createHttpApp({ authenticate, commands: { 'abh.actions.validate': async () => ({}) } } as HttpInstallation));
  assert.throws(() => createHttpApp({ authenticate, deadlineMs: 0 }));
  assert.throws(() => createHttpApp({} as HttpInstallation));
});

test('auth failures and expired context deny Owner invocation without leaking exception data', async t => {
  let calls = 0;
  for (const [auth, expected] of [
    [async () => { throw new HttpFailure('UNAUTHENTICATED'); }, 'UNAUTHENTICATED'],
    [async () => identity, 'CONTEXT_EXPIRED'],
    [async () => ({ secret: 'private-value' }), 'INTERNAL_ERROR'],
    [async () => { throw new Error('private-value'); }, 'INTERNAL_ERROR'],
  ] as const) {
    const app = createHttpApp({ authenticate: auth as HttpInstallation['authenticate'], commands: { 'abh.actions.cancel': async () => { calls++; return {}; } } });
    t.after(() => app.close());
    const result = await app.inject({ method: 'POST', url, headers, payload: body });
    assert.equal(result.json().error.code, expected);
    assert.ok(!result.body.includes('private-value'));
  }
  assert.equal(calls, 0);
});

test('response schema firewall and registered errors prevent data leaks and unsafe retry promises', async t => {
  for (const handler of [async () => ({ secret: 'private-value' }), async () => { throw new Error('private-value'); }, async () => { throw new HttpFailure('DECISION_STALE'); }]) {
    const app = createHttpApp({ authenticate, commands: { 'abh.actions.cancel': handler } });
    t.after(() => app.close());
    const result = await app.inject({ method: 'POST', url, headers, payload: body });
    assert.equal(result.statusCode, 500);
    assert.ok(!result.body.includes('private-value'));
    assert.equal(result.json().error.retryable, false);
  }
  const app = createHttpApp({ authenticate, commands: { 'abh.actions.cancel': async () => { throw new HttpFailure('VERSION_CONFLICT'); } } });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: 'POST', url, headers, payload: body })).statusCode, 409);
});

test('malformed JSON, unsupported content and oversized requests use sanitized contract errors', async t => {
  const app = createHttpApp({ authenticate, bodyLimit: 400, commands: { 'abh.actions.cancel': async () => ({}) } });
  t.after(() => app.close());
  for (const [contentType, payload] of [['application/json', '{private-value'], ['application/octet-stream', 'private-value'], ['application/json', JSON.stringify({ secret: 'private-value'.repeat(100) })]]) {
    const result = await app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': contentType! }, payload: payload! });
    assert.equal(result.statusCode, 400);
    assert.equal(result.json().error.code, 'INVALID_ARGUMENT');
    assert.ok(!result.body.includes('private-value'));
  }
});

test('deadline bounds noncooperating authentication and prevents late Owner execution', async t => {
  let release!: (context: RequestContext) => void;
  let calls = 0;
  let signal!: AbortSignal;
  const app = createHttpApp({ deadlineMs: 20, authenticate: async (_request, ingress) => {
    signal = ingress.signal;
    return new Promise(resolve => { release = resolve; });
  }, commands: { 'abh.actions.cancel': async () => { calls++; return {}; } } });
  t.after(() => app.close());
  const result = await app.inject({ method: 'POST', url, headers, payload: body });
  assert.equal(result.json().error.code, 'CONTEXT_EXPIRED');
  assert.equal(signal.aborted, true);
  release({ ...identity, contextExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('handler deadline aborts cooperative work and returns a nonretryable response', async t => {
  let signal!: AbortSignal;
  const app = createHttpApp({ authenticate, deadlineMs: 20, commands: { 'abh.actions.cancel': async input => {
    signal = input.signal;
    return new Promise(() => {});
  } } });
  t.after(() => app.close());
  const result = await app.inject({ method: 'POST', url, headers, payload: body });
  assert.equal(signal.aborted, true);
  assert.equal(result.json().error.code, 'CONTEXT_EXPIRED');
  assert.equal(result.json().error.retryable, false);
});

// Injection normalizes arbitrary duplicate headers; use the wire to preserve them.
test('raw duplicate idempotency headers are rejected before Owner execution', async t => {
  let calls = 0;
  const app = createHttpApp({ authenticate, commands: { 'abh.actions.cancel': async () => { calls++; return {}; } } });
  t.after(() => app.close());
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const payload = JSON.stringify(body);
  const response = await new Promise<string>((resolve, reject) => {
    const socket = connect(address.port, '127.0.0.1', () => socket.write([
      `POST ${url} HTTP/1.1`, 'Host: localhost', 'Connection: close',
      'Content-Type: application/json', `Content-Length: ${Buffer.byteLength(payload)}`,
      'Idempotency-Key: one', 'Idempotency-Key: two', 'If-Match: "3"', '', payload,
    ].join('\r\n')));
    socket.setTimeout(2000, () => socket.destroy(new Error('test socket timeout')));
    let result = '';
    socket.on('data', data => { result += data.toString(); });
    socket.on('end', () => resolve(result));
    socket.on('error', reject);
  });
  assert.match(response, /^HTTP\/1.1 400/);
  assert.ok(response.includes('INVALID_ARGUMENT'));
  assert.equal(calls, 0);
});

test('SSE preserves Last-Event-ID, emits opaque cursor and bounds slow delivery', async t => {
  let after:string|undefined;
  const app=createHttpApp({authenticate,events:{subscribe:async function*(_type:string,_id:string,_context:RequestContext,
    signal:AbortSignal,cursor?:string){
    after=cursor;
    yield {kind:'change',projectionType:'abh.projection.mission-summary',version:2,watermark:1,cursor:'event-one'};
    yield {kind:'change',projectionType:'abh.projection.mission-summary',version:2,watermark:2,cursor:'event-two'};
    await new Promise<void>(resolve=>{signal.addEventListener('abort',()=>resolve(), {once:true});});
  }}});
  t.after(() => app.close());
  await app.listen({host:'127.0.0.1',port:0});
  const address=app.server.address();assert.ok(address&&typeof address!=='string');
  const response=await fetch(`http://127.0.0.1:${address.port}/v1/events/abh.mission/${body.target.id}`,{
    headers:{'last-event-id':'event-zero'}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'text/event-stream');
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  let text='';let deadline=false;
  const timeout=setTimeout(()=>{deadline=true;void response.body!.cancel();},1000);
  try{
    while(!deadline&&!text.includes('event-two')) {
      const next=await reader.read();if(next.done)break;text+=decoder.decode(next.value);
    }
  } finally {clearTimeout(timeout);void reader.cancel().catch(()=>{});}
  assert.equal(after,'event-zero');
  assert.match(text,/id: event-one\nevent: projection_changed/);
  assert.match(text,/id: event-two\nevent: projection_changed/);
});

test('SSE emits reset without object information', async t => {
  const drops:string[]=[];
  const app=createHttpApp({authenticate,events:{
    metrics:{incrementSseDrop:reason=>drops.push(reason)},
    subscribe:async function*(){
      yield {kind:'reset'};
    }
  }});
  t.after(() => app.close());
  await app.listen({host:'127.0.0.1',port:0});
  const address=app.server.address();assert.ok(address&&typeof address!=='string');
  const response=await fetch(`http://127.0.0.1:${address.port}/v1/events/abh.mission/${body.target.id}`);
  assert.equal(response.status,200);
 assert.equal(await response.text(),`retry: 5000\n\nevent: projection_reset\ndata: {"reason":"reset"}\n\n`);
 assert.deepEqual(drops,['reset']);
});

test('SSE rejects the sixth concurrent connection for one user', async t => {
  const app=createHttpApp({authenticate,events:{subscribe:async function*(_type:string,_id:string,
    _context:RequestContext,signal:AbortSignal){
    await new Promise<void>(resolve=>{signal.addEventListener('abort',()=>resolve(),{once:true});});
  }}});
  t.after(() => app.close());
  await app.listen({host:'127.0.0.1',port:0});
  const address=app.server.address();assert.ok(address&&typeof address!=='string');
  const endpoint=`http://127.0.0.1:${address.port}/v1/events/abh.mission/${body.target.id}`;
  const streams=await Promise.all(Array.from({length:5},()=>fetch(endpoint)));
  try {
    assert.ok(streams.every(response=>response.status===200));
    const rejected=await fetch(endpoint);
    assert.equal(rejected.status,429);
    assert.equal((await rejected.json()).error.code,'RATE_LIMITED');
  } finally {
    await Promise.all(streams.map(response=>response.body!.cancel().catch(()=>{})));
  }
  await new Promise(resolve=>setImmediate(resolve));
});


test('ingress shutdown joins Owner work after its HTTP deadline and is idempotent', async () => {
  let release!: () => void;
  let calls = 0;
  const app = createHttpApp({ authenticate, deadlineMs: 20, commands: { 'abh.actions.cancel': async () => {
    calls++;
    await new Promise<void>(resolve => { release = resolve; });
    throw new Error('late Owner failure');
  } } });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await app.inject({ method: 'POST', url, headers, payload: body });
  assert.equal(response.json().error.code, 'CONTEXT_EXPIRED');
  let stopped = false;
  const shutdown = stopHttpIngress(app);
  assert.equal(stopHttpIngress(app), shutdown);
  void shutdown.then(() => { stopped = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, false);
    await assert.rejects(app.inject({ method: 'POST', url, headers, payload: body }));
    assert.equal(calls, 1);
  } finally { release(); await shutdown; }
  assert.equal(stopped, true);
});

test('shutdown during authentication joins it and prevents an expired identity from entering Owner', async () => {
  let release!: (context: RequestContext) => void;
  let calls = 0;
  const app = createHttpApp({ deadlineMs: 20, authenticate: async () => new Promise(resolve => { release = resolve; }),
    commands: { 'abh.actions.cancel': async () => { calls++; return {}; } } });
  const response = await app.inject({ method: 'POST', url, headers, payload: body });
  assert.equal(response.json().error.code, 'CONTEXT_EXPIRED');
  let stopped = false;
  const shutdown = stopHttpIngress(app).then(() => { stopped = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, false);
  } finally { release({ ...identity, contextExpiresAt: new Date(Date.now() + 60000).toISOString() }); await shutdown; }
  assert.equal(calls, 0);
});
