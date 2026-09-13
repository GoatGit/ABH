import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseHttpCommand } from '@abh/contracts/http';
import { runMission } from '../src/mission.mjs';

const MISSION_ID = randomUUID();
const AUTHORITY_ID = randomUUID();
const INVOCATION_ID = randomUUID();
const ARTIFACT_ID = randomUUID();
const TASK_ID = randomUUID();

async function invoke(args, env = {}) {
  let stdout = '';
  let stderr = '';
  const code = await runMission(args, { env, stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } } });
  return { code, stdout, stderr };
}

/** Records one command and judges it with the same HTTP firewall a real ABH server uses. */
function startContractServer() {
  const seen = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/v1/queries/abh.missions.get') {
        const headers = { 'Content-Type': 'application/json' };
        response.writeHead(200, headers);
        response.end(JSON.stringify({ mission: { missionRef: { type: 'abh.mission', id: url.searchParams.get('id'), version: 7 }, status: 'Draft' } }));
        return;
      }
      if (request.method === 'POST' && url.pathname.startsWith('/v1/commands/')) {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const parsed = parseHttpCommand(url.pathname.split('/').pop(), request.headers, body);
        seen.push({ path: url.pathname, parsed, headers: request.headers, body });
        if (!parsed.success) {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ code: 'INVALID_ARGUMENT' }));
          return;
        }
        response.writeHead(url.pathname.endsWith('submit') ? 201 : 200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ commandId: randomUUID(), status: 'Accepted' }));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'NOT_FOUND' }));
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({
        url,
        seen,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

test('mission update commands satisfy the HTTP contract: strong-read version, If-Match and Idempotency-Key', async () => {
  const server = await startContractServer();
  try {
    const activated = await invoke(['activate', MISSION_ID, '--url', server.url, '--authority', AUTHORITY_ID]);
    assert.equal(activated.code, 0, activated.stderr);
    const activate = server.seen.at(-1);
    assert.ok(activate.parsed.success, JSON.stringify(activate.parsed));
    assert.equal(activate.headers['if-match'], '"7"');
    assert.match(activate.headers['idempotency-key'], /^[!-~]{1,200}$/);
    assert.deepEqual(activate.body.target, { type: 'abh.mission', id: MISSION_ID });
    assert.deepEqual(activate.body.payload.missionRef, { type: 'abh.mission', id: MISSION_ID, version: 7 });
    assert.deepEqual(activate.body.payload.authorityRef, { type: 'abh.mission-authority', id: AUTHORITY_ID, version: 1 });

    const paused = await invoke(['pause', MISSION_ID, '--url', server.url]);
    assert.equal(paused.code, 0, paused.stderr);
    const pause = server.seen.at(-1);
    assert.ok(pause.parsed.success, JSON.stringify(pause.parsed));
    assert.equal(pause.headers['if-match'], '"7"');
    assert.equal(pause.body.payload.reasonCode, 'manual.pause');

    const cancelled = await invoke(['cancel', MISSION_ID, '--url', server.url, '--reason', 'customer.requested']);
    assert.equal(cancelled.code, 0, cancelled.stderr);
    const cancel = server.seen.at(-1);
    assert.ok(cancel.parsed.success, JSON.stringify(cancel.parsed));
    assert.equal(cancel.body.payload.reasonCode, 'customer.requested');
  } finally { await server.close(); }
});

test('mission verify posts a Create command with Idempotency-Key and never an If-Match', async () => {
  const server = await startContractServer();
  try {
    const result = await invoke(['verify', TASK_ID, '--url', server.url, '--invocation', INVOCATION_ID, '--artifact', ARTIFACT_ID, '--verdict', 'Reject']);
    assert.equal(result.code, 0, result.stderr);
    const submit = server.seen.at(-1);
    assert.equal(submit.path, '/v1/commands/abh.verification.submit');
    assert.ok(submit.parsed.success, JSON.stringify(submit.parsed));
    assert.equal(submit.headers['if-match'], undefined);
    assert.deepEqual(submit.body.target, { type: 'abh.task', id: TASK_ID });
    assert.equal(submit.body.payload.verdict, 'Reject');
    assert.deepEqual(submit.body.payload.taskRef, { type: 'abh.task', id: TASK_ID, version: 1 });
  } finally { await server.close(); }
});

test('invalid mission usage fails locally without any network call and without leaking values', async () => {
  const server = await startContractServer();
  try {
    const before = server.seen.length;
    const noAuthority = await invoke(['activate', MISSION_ID, '--url', server.url]);
    assert.equal(noAuthority.code, 2);
    assert.match(noAuthority.stderr, /--authority/);
    assert.match(noAuthority.stderr, /abh mission <command>/);
    const badReason = await invoke(['pause', MISSION_ID, '--url', server.url, '--reason', 'Not A Name']);
    assert.equal(badReason.code, 2);
    assert.match(badReason.stderr, /--reason/);
    const badVerdict = await invoke(['verify', TASK_ID, '--url', server.url, '--invocation', INVOCATION_ID, '--artifact', ARTIFACT_ID, '--verdict', 'Maybe']);
    assert.equal(badVerdict.code, 2);
    const badUuid = await invoke(['verify', TASK_ID, '--url', server.url, '--invocation', 'nope', '--artifact', ARTIFACT_ID]);
    assert.equal(badUuid.code, 2);
    assert.equal(server.seen.length, before);
  } finally { await server.close(); }
});

test('mission command rejections surface the sanitized server code and stay bounded', async () => {
  const server = await startContractServer();
  try {
    const result = await invoke(['pause', MISSION_ID, '--url', 'http://127.0.0.1:1']);
    assert.equal(result.code, 6);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.startsWith('abh mission:'));
  } finally { await server.close(); }
});
