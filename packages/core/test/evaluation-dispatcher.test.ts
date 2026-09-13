import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {createHttpEvaluationDispatcher, type EvaluationDispatchContext} from '../src/mission/evaluation-dispatcher.ts';
import type {EvaluationRunRecord, WorkLeaseRecord} from '@abh/contracts';

const evaluationRun: EvaluationRunRecord = {
  runRef: {type: 'abh.evaluation-run', id: '00000000-0000-4000-8000-000000000001', version: 1},
  resourceOrganizationId: '00000000-0000-4000-8000-000000000002',
  candidateRef: {type: 'abh.learning-candidate', id: '00000000-0000-4000-8000-000000000003', version: 1},
  profileRef: {type: 'abh.evaluation-profile', id: '00000000-0000-4000-8000-000000000004', version: 1},
  baselineRef: {type: 'abh.artifact', id: '00000000-0000-4000-8000-000000000005', version: 1},
  retryOfRef: {type: 'abh.evaluation-run', id: '00000000-0000-4000-8000-000000000010', version: 1},
  assignmentUnit: 'evaluation.scenario', seed: 42, executionRefs: [], status: 'Queued',
  requestedBy: {type: 'Human', id: '00000000-0000-4000-8000-000000000006'},
  receiptRef: {type: 'abh.command', id: '00000000-0000-4000-8000-000000000007', version: 1},
  createdAt: '2026-09-12T00:00:00.000Z', expiresAt: '2026-09-12T01:00:00.000Z',
  digest: 'sha256:' + '0'.repeat(64),
};

const lease: WorkLeaseRecord = {
  leaseRef: {type: 'abh.work-lease', id: '00000000-0000-4000-8000-000000000008', version: 2},
  resourceOrganizationId: evaluationRun.resourceOrganizationId,
  targetRef: evaluationRun.runRef, workerId: '00000000-0000-4000-8000-000000000009',
  executionPrincipalRef: {type: 'abh.principal', id: '00000000-0000-4000-8000-00000000000a', version: 1},
  fencingToken: 3, leaseUntil: '2026-09-12T00:01:00.000Z',
};

const context = (): EvaluationDispatchContext => ({
  run: structuredClone(evaluationRun), lease: structuredClone(lease), attempt: 3,
  signal: new AbortController().signal,
});

function dispatcher(options: {body?:unknown; status?:number} = {}) {
  const requests: {authorization:string|undefined; body:unknown; path:string}[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      requests.push({authorization: request.headers.authorization, body: JSON.parse(raw), path: request.url ?? ''});
      response.writeHead(options.status ?? 202, {'content-type': 'application/json'});
      response.end(JSON.stringify(options.body ?? {outcome: 'Accepted'}));
    });
  });
  const adapter = {requests, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))};
  return new Promise<{adapter:typeof adapter; start:() => Promise<string>}>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({
      adapter,
      start: async () => {
        const address = server.address();
        assert(address && typeof address === 'object');
        return `http://127.0.0.1:${address.port}/host/`;
      },
    }));
  }).then(async value => {
    const endpoint = await value.start();
    const instance = createHttpEvaluationDispatcher({endpoint, timeoutMs: 1000,
      headers: async () => ({authorization: 'Bearer evaluation-host-token'})});
    return {...value, instance};
  });
}

test('evaluation HTTP dispatcher binds run and lease and accepts only the exact 202 contract', async () => {
  const environment = await dispatcher();
  try {
    const outcome = await environment.instance.dispatch(context());
    assert.equal(outcome, 'Accepted');
    assert.equal(environment.adapter.requests.length, 1);
    assert.equal(environment.adapter.requests[0]!.path, '/host/dispatch');
    assert.equal(environment.adapter.requests[0]!.authorization, 'Bearer evaluation-host-token');
    assert.deepEqual(environment.adapter.requests[0]!.body, {attempt: 3, evaluationRun, lease});
  } finally { await environment.adapter.close(); }
});

test('evaluation HTTP dispatcher preserves ambiguity without exposing host failures', async () => {
  for (const options of [{status: 403}, {body: {outcome: 'Accepted', extra: true}},
    {body: {outcome: 'Rejected'}}, {body: 'Accepted'}]) {
    const environment = await dispatcher(options);
    try { assert.equal(await environment.instance.dispatch(context()), 'Unknown'); }
    finally { await environment.adapter.close(); }
  }
});

test('evaluation HTTP dispatcher configuration rejects unsafe bounded values', () => {
  const endpoint = 'http://127.0.0.1/dispatch';
  const headers = async () => ({});
  assert.throws(() => createHttpEvaluationDispatcher({endpoint, headers, timeoutMs: 31_000}));
  assert.throws(() => createHttpEvaluationDispatcher({endpoint: 'https://host/eval?query=1', headers}));
  assert.throws(() => createHttpEvaluationDispatcher({endpoint: 'https://user:secret@host/eval/', headers}));
});

test('evaluation HTTP dispatcher treats redirects, invalid JSON, timeouts and oversize as Unknown', async () => {
  const requests: {path:string; raw:string}[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      requests.push({path: request.url ?? '', raw});
      const scenario = requests.length;
      if (scenario === 1) {
        response.writeHead(302, {location: 'https://elsewhere.invalid/dispatch'});
        response.end();
      } else if (scenario === 2) {
        response.writeHead(202, {'content-type': 'application/json'});
        response.end('{');
      } else if (scenario === 3) {
        response.writeHead(202, {'content-type': 'application/json'});
        response.end('x'.repeat(9));
      } else {
        const timer = setTimeout(() => {
          response.writeHead(202, {'content-type': 'application/json'});
          response.end(JSON.stringify({outcome: 'Accepted'}));
        }, 150);
        request.on('close', () => clearTimeout(timer));
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/`;
  const instance = createHttpEvaluationDispatcher({endpoint,
    headers: async () => ({}), timeoutMs: 100, maxResponseBytes: 8});
  try {
    for (let index = 0; index < 4; index += 1) {
      assert.equal(await instance.dispatch(context()), 'Unknown');
    }
    assert.equal(requests.length, 4);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('evaluation HTTP dispatcher cancels unresolved credentials with worker signal', async () => {
  let credentialSignal: AbortSignal|undefined;
  const instance = createHttpEvaluationDispatcher({
    endpoint: 'http://127.0.0.1/dispatch/',
    headers: signal => new Promise(resolve => { credentialSignal = signal; }),
    timeoutMs: 100,
  });
  const worker = new AbortController();
  const pending = instance.dispatch({...context(), signal: worker.signal});
  await new Promise(resolve => setTimeout(resolve, 10));
  worker.abort();
  assert.equal(await pending, 'Unknown');
  assert.equal(credentialSignal?.aborted, true);
});

test('evaluation HTTP dispatcher cancels upstream with worker signal', async () => {
  let fetchSignal: AbortSignal|undefined;
  const instance = createHttpEvaluationDispatcher({
    endpoint: 'http://127.0.0.1/dispatch/',
    headers: async () => ({}),
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal ?? undefined;
      fetchSignal = signal;
      signal?.addEventListener('abort', () => reject(new Error('aborted')), {once: true});
    }),
    timeoutMs: 100,
  });
  const worker = new AbortController();
  const pending = instance.dispatch({...context(), signal: worker.signal});
  await new Promise(resolve => setTimeout(resolve, 10));
  worker.abort();
  assert.equal(await pending, 'Unknown');
  assert.equal(fetchSignal?.aborted, true);
});
