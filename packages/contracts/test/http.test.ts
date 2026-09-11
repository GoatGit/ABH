import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseHttpCommand, parseHttpQuery, serializeHttpResponse, type PublicCommandType } from '../src/http.ts';
import { createErrorResponse } from '../src/errors.ts';
import { validateContract } from '../src/schema.ts';

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`../fixtures/valid/${name}.json`, import.meta.url), 'utf8')).value;

test('HTTP headers produce the registered command draft without client-supplied context or ingress IDs', async () => {
  const body = await fixture('cancel-http-request');
  const before = structuredClone(body);
  const result = parseHttpCommand('abh.actions.cancel', { 'Idempotency-Key': 'cancel-brief-40', 'If-Match': '"3"' }, body);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.type, 'abh.actions.cancel');
  assert.equal('commandId' in result.data, false);
  assert.deepEqual(body, before);
  const command = { ...result.data, commandId: '00000000-0000-4000-8000-000000000050', schemaVersion: '0.1.0' };
  assert.equal(validateContract('CommandEnvelope', command).success, true);
  assert.equal(parseHttpCommand('abh.actions.cancel', { 'idempotency-key': 'cancel-brief-40', 'if-match': '"3"' }, { ...body, expectedVersion: 3, idempotencyKey: 'cancel-brief-40' }).success, true);
});

test('reject missing, conflicting, repeated and weak conditional headers', async () => {
  const body = await fixture('cancel-http-request');
  const valid = { 'Idempotency-Key': 'cancel-brief-40', 'If-Match': '"3"' };
  for (const headers of [
    {}, { 'Idempotency-Key': 'x' }, { 'If-Match': '"3"' },
    { ...valid, 'If-Match': '*' }, { ...valid, 'If-Match': 'W/"3"' },
    { ...valid, 'If-Match': '3' }, { ...valid, 'If-Match': '"03"' },
    { ...valid, 'If-Match': '"9007199254740992"' }, { ...valid, 'If-Match': ['"3"', '"4"'] },
    { ...valid, 'if-match': '"4"' }, { ...valid, 'Idempotency-Key': ['x', 'y'] },
  ]) assert.equal(parseHttpCommand('abh.actions.cancel', headers, body).success, false);
  for (const patch of [{ expectedVersion: 4 }, { expectedVersion: '3' }, { idempotencyKey: 'other' }, { commandId: 'forged' }, { context: { actor: 'forged' } }]) {
    assert.equal(parseHttpCommand('abh.actions.cancel', valid, { ...body, ...patch }).success, false);
  }
  const create = await fixture('propose-http-request');
  assert.equal(parseHttpCommand('abh.actions.propose', { 'Idempotency-Key': 'create' }, create).success, true);
  assert.equal(parseHttpCommand('abh.actions.propose', valid, create).success, false);
  for (const type of ['abh.actions.validate', 'abh.actions.register-plan', 'constructor', 'abh.arbitrary.dispatch']) {
    assert.deepEqual(parseHttpCommand(type as PublicCommandType, valid, body), { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] });
  }
});

test('query parsing converts only declared numeric fields, keeps filters closed and rejects duplicates', () => {
  assert.deepEqual(parseHttpQuery('abh.actions.list', { limit: '25', consistency: 'Projection', outcome: 'Unknown' }), { success: true, data: { limit: 25, consistency: 'Projection', outcome: 'Unknown' } });
  for (const query of [{ limit: '101' }, { limit: '1e2' }, { limit: '01' }, { limit: ['1', '2'] }, { sort: 'unregistered' }, { actor: 'forged' }, { outcome: 'ProviderAccepted' }]) {
    assert.equal(parseHttpQuery('abh.actions.list', query).success, false);
  }
  assert.equal(parseHttpQuery('abh.decisions.get', {}).success, false);
});

test('response validation rejects data leaks, invalid nested outcomes and unregistered error/status combinations', async () => {
  const response = await fixture('action-query-response');
  const encoded = serializeHttpResponse('GetAction', 200, response);
  assert.equal(encoded.success, true);
  if (encoded.success) assert.deepEqual(JSON.parse(encoded.json), response);
  response.data.context = { secret: 'sensitive-sentinel' };
  const rejected = serializeHttpResponse('GetAction', 200, response);
  assert.equal(rejected.success, false);
  assert.ok(!JSON.stringify(rejected).includes('sensitive-sentinel'));
  delete response.data.context;
  response.data.operationSummary[0].position.lifecycle = 'Closed';
  assert.equal(serializeHttpResponse('GetAction', 200, response).success, false);
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(serializeHttpResponse('GetAction', 404, createErrorResponse('RESOURCE_NOT_FOUND', id)).success, true);
  assert.equal(serializeHttpResponse('GetAction', 200, createErrorResponse('RESOURCE_NOT_FOUND', id)).success, false);
  assert.equal(serializeHttpResponse('GetAction', 409, createErrorResponse('DECISION_STALE', id)).success, false);
  assert.equal(serializeHttpResponse('SubmitDecision', 409, createErrorResponse('DECISION_STALE', id)).success, true);
  assert.equal(serializeHttpResponse('ValidateAction', 200, {}).success, false);
  let executed = false;
  const malicious = Object.assign(Object.create({ toJSON() { executed = true; return { secret: 'sensitive-sentinel' }; } }), await fixture('action-query-response'));
  assert.equal(serializeHttpResponse('GetAction', 200, malicious).success, false);
  assert.equal(executed, false);
});

test('OpenAPI uses the same closed schemas, registered errors and acceptance headers', async () => {
  const api = JSON.parse(await readFile(new URL('../generated/openapi.json', import.meta.url), 'utf8'));
  const propose = api.paths['/v1/commands/abh.actions.propose'].post;
  assert.ok(propose.responses['202'].headers.Location);
  assert.ok(propose.responses['202'].headers.ETag);
  assert.equal(propose.requestBody.content['application/json'].schema.$ref, '#/components/schemas/ProposeActionHttpRequest');
  const checkReferences = (value: any): void => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.match(value.$ref, /^#\/components\/schemas\//);
      assert.ok(api.components.schemas[value.$ref.slice('#/components/schemas/'.length)], value.$ref);
    }
    for (const child of Object.values(value)) checkReferences(child);
  };
  checkReferences(api);
});
