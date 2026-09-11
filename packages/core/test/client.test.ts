import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createHttpApp, HttpFailure } from '@abh/adapter-fastify';
import type { RequestContext } from '@abh/contracts';
import { AbhClientError, createAbhClient } from '../src/client.ts';

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`../../contracts/fixtures/valid/${name}.json`, import.meta.url), 'utf8')).value;
const submitted = await fixture('decision-submitted-response');
const payload = await fixture('submit-decision');
const view = await fixture('decision-view');
const identity = await fixture('request-context') as RequestContext;
const id = view.decisionRef.id;
const command = { id, expectedVersion: 1, idempotencyKey: 'decision-click-1', payload };
const meta = { asOf: '2026-09-08T00:00:00Z', watermark: 'decision-source/test', stale: false };
const baseUrl = 'https://example.test/api/';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const errorIs = (code: AbhClientError['code'], outcome: AbhClientError['outcome']) => (error: unknown) => {
  assert.ok(error instanceof AbhClientError); assert.equal(error.code, code); assert.equal(error.outcome, outcome); return true;
};

test('Decision client interoperates with HTTP adapter for all four operations', async t => {
  let calls = 0;
  const app = createHttpApp({ authenticate: async () => ({ ...identity, contextExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
    commands: {
      'abh.decisions.submit': async ({ command: received }) => {
        assert.equal(received.expectedVersion, 1); assert.equal(received.idempotencyKey, command.idempotencyKey);
        assert.deepEqual(received.payload, payload); return submitted;
      },
      'abh.decisions.withdraw': async () => ({ success: true, data: { objectRef: { ...view.decisionRef, version: 3 }, commandId: submitted.data.commandId, status: 'Withdrawn' } }),
    },
    queries: {
      'abh.decisions.get': async ({ query }) => { assert.deepEqual(query, { id, consistency: 'Strong' }); return { success: true, data: view, meta }; },
      'abh.decisions.list-inbox': async ({ query }) => { assert.deepEqual(query, { cursor: 'ic1.a+b/c=', limit: 2 }); return { success: true, data: [view], meta: { ...meta, nextCursor: 'ic1.next' } }; },
    },
  });
  t.after(() => app.close());
  const client = createAbhClient({ baseUrl, headers: async () => ({ authorization: 'Bearer test', 'if-match': '"999"' }), fetch: async (input, init) => {
    calls++; const url = new URL(String(input)); assert.equal(url.origin, 'https://example.test'); assert.ok(url.pathname.startsWith('/api/v1/'));
    assert.equal(init?.redirect, 'error'); assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test');
    const response = await app.inject({ method: init?.method as 'GET' | 'POST', url: url.pathname.slice(4) + url.search, headers: Object.fromEntries(new Headers(init?.headers)), ...(init?.body ? { payload: String(init.body) } : {}) });
    return new Response(response.body, { status: response.statusCode, headers: { 'content-type': String(response.headers['content-type']) } });
  } });
  assert.deepEqual(await client.decisions.submit(command), submitted);
  assert.equal((await client.decisions.withdraw({ ...command, payload: { reason: 'Canceled' } })).data.status, 'Withdrawn');
  assert.deepEqual((await client.decisions.get({ id, consistency: 'Strong' })).data, view);
  assert.equal((await client.decisions.listInbox({ cursor: 'ic1.a+b/c=', limit: 2 })).meta.nextCursor, 'ic1.next');
  assert.equal(calls, 4);
});

test('invalid arguments never send or leak underlying exceptions', async () => {
  let calls = 0;
  const client = createAbhClient({ baseUrl, fetch: async () => { calls++; return json(submitted); } });
  for (const bad of [{ ...command, expectedVersion: 0 }, { ...command, idempotencyKey: '\nsecret' }, { ...command, id: 'invalid' }, { ...command, payload: {} }]) {
    await assert.rejects(client.decisions.submit(bad as typeof command), errorIs('INVALID_ARGUMENT', 'NotSent'));
  }
  await assert.rejects(client.decisions.listInbox({ limit: 101 }), errorIs('INVALID_ARGUMENT', 'NotSent'));
  await assert.rejects(client.decisions.get({ id }, { timeoutMs: 0 }), errorIs('INVALID_ARGUMENT', 'NotSent'));
  assert.throws(() => createAbhClient({ baseUrl: 'invalid' }), errorIs('INVALID_ARGUMENT', 'NotSent'));
  assert.equal(calls, 0);
});

test('mission ref commands derive strong If-Match from the payload reference', async () => {
  const mission = {
    missionRef: { type: 'abh.mission', id, version: 4 },
    resourceOrganizationId: identity.resourceOrganizationId,
    goalArtifactRef: { type: 'abh.artifact', id, version: 1 },
    goalDigest: 'sha256:' + 'b'.repeat(64),
    goalRevision: 2,
    domainType: 'demo.project',
    workflowRef: { kind: 'Workflow', id: 'demo.workflow', version: '1.0.0', digest: 'sha256:' + 'b'.repeat(64) },
    conditionRef: { type: 'abh.mission-conditions', id, version: 1 },
    responsibilityScopeRefs: [{ type: 'abh.organization', id: identity.resourceOrganizationId, version: 1 }],
    status: 'Cancelled',
    stopEpoch: 1,
    pauseRequested: false,
    cleanupStatus: 'Pending',
    purposeNames: ['abh.mission.manage'],
    createdBy: { type: 'Human', id },
    createdAt: '2026-09-11T10:00:00Z',
    updatedAt: '2026-09-11T10:00:00Z',
    authorityRef: { type: 'abh.mission-authority', id, version: 1 },
  };
  const client = createAbhClient({ baseUrl, fetch: async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/api/v1/commands/abh.missions.cancel');
    const headers = new Headers(init?.headers), body = JSON.parse(String(init?.body));
    assert.equal(headers.get('if-match'), '"3"');
    assert.equal(headers.get('idempotency-key'), 'mission-cancel-1');
    assert.deepEqual(body.target, { type: 'abh.mission', id });
    assert.deepEqual(body.payload, { missionRef: { type: 'abh.mission', id, version: 3 }, reasonCode: 'abh.workbench.user.cancel' });
    return json(mission, 200);
  } });
  assert.deepEqual(await client.missions.cancel({
    idempotencyKey: 'mission-cancel-1',
    payload: { missionRef: { type: 'abh.mission', id, version: 3 }, reasonCode: 'abh.workbench.user.cancel' },
  }), mission);
});

test('no automatic retry on ambiguous write failure', async () => {
  let calls = 0;
  const client = createAbhClient({ baseUrl, fetch: async () => { calls++; throw new Error('secret'); } });
  await assert.rejects(client.decisions.submit(command), errorIs('TRANSPORT_ERROR', 'Unknown'));
  assert.equal(calls, 1);
});

test('bounded auth and fetch preserve before-send versus ambiguous outcome', async () => {
  let calls = 0;
  const client = createAbhClient({ baseUrl, timeoutMs: 20, headers: async () => new Promise(() => {}), fetch: async () => { calls++; return json(submitted); } });
  await assert.rejects(client.decisions.submit(command), errorIs('TRANSPORT_ERROR', 'NotSent'));
  assert.equal(calls, 0);
  const stop = new AbortController(); stop.abort();
  await assert.rejects(client.decisions.submit(command, { signal: stop.signal }), errorIs('TRANSPORT_ERROR', 'NotSent'));
  const pending = createAbhClient({ baseUrl, timeoutMs: 20, fetch: async () => new Promise(() => {}) });
  await assert.rejects(pending.decisions.submit(command), errorIs('TRANSPORT_ERROR', 'Unknown'));
});

test('late fetch responses and rejected protocol bodies are canceled', async () => {
  let resolve!: (response: Response) => void, canceled = 0;
  const response = () => new Response(new ReadableStream({ cancel() { canceled++; } }), { headers: { 'content-type': 'text/html' } });
  const client = createAbhClient({ baseUrl, timeoutMs: 20, fetch: async () => new Promise(r => { resolve = r; }) });
  await assert.rejects(client.decisions.submit(command), errorIs('TRANSPORT_ERROR', 'Unknown'));
  resolve(response()); await new Promise(r => setImmediate(r)); assert.equal(canceled, 1);
  await assert.rejects(createAbhClient({ baseUrl, fetch: async () => response() }).decisions.submit(command), errorIs('PROTOCOL_ERROR', 'Unknown'));
  assert.equal(canceled, 2);
});

test('invalid JSON, oversized streams, incorrect response schema and HTTP status are refused', async () => {
  for (const [response, maxResponseBytes] of [
    [() => json({ secret: true }), 4096], [() => json(submitted, 202), 4096],
    [() => new Response('{', { headers: { 'content-type': 'application/json' } }), 4096],
    [() => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }), 4096],
    [() => json(submitted), 100],
  ] as const) {
    const client = createAbhClient({ baseUrl, maxResponseBytes, fetch: async () => response() });
    await assert.rejects(client.decisions.submit(command), errorIs('PROTOCOL_ERROR', 'Unknown'));
  }
});

test('registered errors retain correlation and do not claim rollback', async t => {
  const app = createHttpApp({ authenticate: async () => { throw new HttpFailure('FORBIDDEN'); }, queries: { 'abh.decisions.get': async () => ({ success: true, data: view, meta }) } });
  t.after(() => app.close());
  const client = createAbhClient({ baseUrl, fetch: async () => {
    const response = await app.inject('/v1/queries/abh.decisions.get?id=' + id);
    return json(response.json(), response.statusCode);
  } });
  await assert.rejects(client.decisions.get({ id }), (error: unknown) => {
    assert.ok(error instanceof AbhClientError); assert.equal(error.outcome, 'Responded');
    assert.equal(error.response?.error.code, 'FORBIDDEN'); return true;
  });
});

test('client entry bundles for browsers without server dependencies', async () => {
  const result = await build({ stdin: { contents: "export { createAbhClient, AbhClientError } from '@abh/core/client';", resolveDir: new URL('..', import.meta.url).pathname, sourcefile: 'browser-consumer.ts' }, bundle: true, write: false, platform: 'browser', format: 'esm', metafile: true, logLevel: 'silent' });
  assert.ok(result.outputFiles[0]!.contents.length > 0);
  assert.ok(Object.keys(result.metafile!.inputs).every(path => !/postgres|fastify|opa-wasm|node:/.test(path)));
});

test('stream timeout cancels the body and late credential resolution never sends', async () => {
  let canceled = false;
  const streaming = createAbhClient({ baseUrl, timeoutMs: 20, fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { canceled = true; },
  }), { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(streaming.decisions.submit(command), errorIs('TRANSPORT_ERROR', 'Unknown'));
  assert.equal(canceled, true);
  let resolve!: (headers: HeadersInit) => void, calls = 0;
  const credentials = createAbhClient({ baseUrl, timeoutMs: 20, headers: async () => new Promise(r => { resolve = r; }), fetch: async () => { calls++; return json(submitted); } });
  await assert.rejects(credentials.decisions.submit(command), errorIs('TRANSPORT_ERROR', 'NotSent'));
  resolve({ authorization: 'late-secret' }); await new Promise(r => setImmediate(r));
  assert.equal(calls, 0);
});

test('Action contract client preserves create/update semantics and query path through HTTP adapter', async t => {
  const proposed = await fixture('propose-http-request');
  const action = await fixture('action-query-response');
  const accepted = { success: true, data: { objectRef: action.data.actionRef, trackingRef: action.data.actionRef, commandId: submitted.data.commandId } };
  const seen: string[] = [];
  const app = createHttpApp({ authenticate: async () => ({ ...identity, contextExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
    commands: {
      'abh.actions.propose': async ({ command }) => { assert.deepEqual(command.payload, proposed.payload); assert.deepEqual(command.target, proposed.target); return accepted; },
      'abh.actions.cancel': async ({ command }) => { assert.equal(command.expectedVersion, 2); return accepted; },
      'abh.actions.request-authorization': async ({ command }) => { assert.deepEqual(command.payload, {}); return accepted; },
    },
    queries: {
      'abh.actions.get': async ({ id, query }) => { assert.equal(id, action.data.actionRef.id); assert.deepEqual(query, { consistency: 'Strong' }); return action; },
      'abh.actions.list': async ({ query }) => { assert.deepEqual(query, { limit: 2, cursor: 'cursor+opaque' }); return { success: true, data: [action.data], meta: action.meta }; },
    },
  });
  t.after(() => app.close());
  const client = createAbhClient({ baseUrl, headers: async () => ({ 'if-match': '"999"', 'idempotency-key': 'stale-key' }), fetch: async (input, init) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers); seen.push(url.pathname);
    if (url.pathname.endsWith('abh.actions.propose') || init?.method === 'GET') assert.equal(headers.get('if-match'), null);
    const response = await app.inject({ method: init?.method as 'GET' | 'POST', url: url.pathname.slice(4) + url.search, headers: Object.fromEntries(headers), ...(init?.body ? { payload: String(init.body) } : {}) });
    return json(response.json(), response.statusCode);
  } });
  assert.deepEqual(await client.actions.proposeFromArtifact({ organizationId: proposed.target.id, idempotencyKey: 'proposal-1', payload: proposed.payload }), accepted);
  assert.deepEqual(await client.actions.cancel({ id: action.data.actionRef.id, expectedVersion: 2, idempotencyKey: 'cancel-1', payload: { reason: 'Canceled' } }), accepted);
  assert.deepEqual(await client.actions.requestAuthorization({ id: action.data.actionRef.id, expectedVersion: 2, idempotencyKey: 'auth-1', payload: {} }), accepted);
  assert.deepEqual(await client.actions.get(action.data.actionRef.id, { consistency: 'Strong' }), action);
  assert.deepEqual((await client.actions.list({ limit: 2, cursor: 'cursor+opaque' })).data, [action.data]);
  await assert.rejects(client.actions.get('../secrets'), errorIs('INVALID_ARGUMENT', 'NotSent'));
  assert.equal(seen.length, 5);
});


test('built public package subpath is usable without private imports', async () => {
  const published = await import('@abh/core/client');
  const client = published.createAbhClient({ baseUrl, fetch: async () => json(submitted) });
  assert.deepEqual(await client.decisions.submit(command), submitted);
});


test('high-level proposal validates before writes, snapshots inputs and keeps partial-write cancellation uncertain',async()=>{
  const artifactRef={type:'abh.artifact',id,version:2},high={organizationId:identity.resourceOrganizationId,idempotencyKey:'root-key',input:{message:'original'},artifact:{ownerRef:{type:'abh.organization',id:identity.resourceOrganizationId,version:1},purposeNames:['abh.action.prepare'],dataClass:'abh.data.internal',sourceRefs:[],region:'local',retentionPolicyRef:artifactRef},action:{actionType:'hello.publish',targetRefs:[artifactRef],sourceVersionRefs:[artifactRef]}};
  let calls=0;const stop=new AbortController();
  const client=createAbhClient({baseUrl,fetch:async(_url,init)=>{
    calls++;assert.equal(JSON.parse(String(init?.body)).payload.content,'{"message":"original"}');stop.abort();
    return json({success:true,data:{objectRef:artifactRef,commandId:submitted.data.commandId}},201);
  }});
  await assert.rejects(client.actions.propose({...high,action:{...high.action,targetRefs:[]}}),errorIs('INVALID_ARGUMENT','NotSent'));assert.equal(calls,0);
  await assert.rejects(client.actions.propose({...high,input:{message:'汉'.repeat(30000)}}),errorIs('INVALID_ARGUMENT','NotSent'));assert.equal(calls,0);
  const pending=client.actions.propose(high,{signal:stop.signal});high.input.message='caller mutation';
  await assert.rejects(pending,errorIs('TRANSPORT_ERROR','Unknown'));assert.equal(calls,1);
});

test('capability queries validate before credentials and preserve parameters across credential waits',async()=>{
  let release!:()=>void,calls=0,credentials=0;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  const client=createAbhClient({baseUrl,headers:async()=>{credentials++;await ready;return {};},fetch:async(input)=>{
    calls++;const url=new URL(String(input));assert.equal(url.pathname,'/api/v1/queries/abh.capabilities.query');
    assert.equal(url.searchParams.get('versionRange'),'>=1.0.0 <2.0.0 || ^3.0.0');assert.equal(url.searchParams.get('limit'),'1');
    return json({candidates:[],complete:false});
  }});
  await assert.rejects(client.capabilities.query({kind:'abh.tool',limit:101}),errorIs('INVALID_ARGUMENT','NotSent'));
  await assert.rejects(client.capabilities.query({kind:'abh.tool',limit:1,version:'1.0.0'}),errorIs('INVALID_ARGUMENT','NotSent'));
  assert.equal(credentials,0);assert.equal(calls,0);
  const input={kind:'abh.tool',limit:1,versionRange:'>=1.0.0 <2.0.0 || ^3.0.0'},pending=client.capabilities.query(input);
  input.limit=100;input.versionRange='*';release();
  assert.deepEqual(await pending,{candidates:[],complete:false});assert.equal(calls,1);
  const malformed=createAbhClient({baseUrl,fetch:async()=>json({candidates:[],complete:true,implementation:{path:'/private'}})});
  await assert.rejects(malformed.capabilities.query({kind:'abh.tool',limit:1}),errorIs('PROTOCOL_ERROR','Unknown'));
});
