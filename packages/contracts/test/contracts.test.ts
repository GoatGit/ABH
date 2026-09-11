import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateContract, schemaIds, type SchemaName } from '../src/schema.ts';
import { validateTenantContext } from '../src/internal/tenant-context.ts';
import { createErrorResponse, errorRegistry } from '../src/errors.ts';

const fixturesRoot = new URL('../fixtures/', import.meta.url);
const read = async (path: string) => JSON.parse(await readFile(new URL(path, fixturesRoot), 'utf8'));
const validate = (schema: string, value: unknown) => schema === 'TenantContext'
  ? validateTenantContext(value)
  : validateContract(schema as SchemaName, value);

for (const path of await readdir(new URL('valid/', fixturesRoot))) {
  const fixture = await read(`valid/${path}`);
  test(`accept representation: ${path}`, () => {
    const original = JSON.stringify(fixture.value);
    const result = validate(fixture.schema, fixture.value);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(JSON.stringify(fixture.value), original, 'Validation must never mutate input');
  });
}

for (const fixture of await read('invalid/cases.json')) {
  test(`reject: ${fixture.name}`, async () => {
    const { schema, value } = await read(`valid/${fixture.base}.json`);
    for (const patch of fixture.patches) {
      const keys = patch.path.slice(1).split('/');
      const last = keys.pop();
      const parent = keys.reduce((object: any, key: string) => object[key], value);
      if (patch.op === 'remove') delete parent[last]; else parent[last] = patch.value;
    }
    const before = JSON.stringify(value);
    const result = validate(schema, value);
    assert.equal(result.success, false, fixture.name);
    assert.equal(JSON.stringify(value), before, 'Invalid input must not be silently fixed');
    assert.ok(!JSON.stringify(result).includes('sensitive-sentinel'));
    assert.ok(!JSON.stringify(result).includes('postgres://user:secret'));
  });
}

test('public schema registry excludes internal TenantContext and unknown names', () => {
  assert.ok(!Object.hasOwn(schemaIds, 'TenantContext'));
  for (const name of ['TenantContext', '__proto__', 'constructor', 'remote.unregistered']) {
    assert.deepEqual(validateContract(name as SchemaName, {}), { success: false, code: 'SCHEMA_UNSUPPORTED', issues: [] });
  }
});

test('microsecond validity bounds preserve precision and UTC ordering', async () => {
  const { value } = await read('valid/execution-authority.json');
  value.validFrom = '2026-09-07T00:00:00.000001Z';
  value.validUntil = '2026-09-07T00:00:00.000002Z';
  assert.equal(validateContract('ExecutionAuthority', value).success, true);
  value.validUntil = value.validFrom;
  assert.equal(validateContract('ExecutionAuthority', value).success, false);
  value.validFrom = '2026-09-07T00:00:00.1Z';
  value.validUntil = '2026-09-07T00:00:00.09Z';
  assert.equal(validateContract('ExecutionAuthority', value).success, false);
});

test('cross-organization context can represent an explicit workspace, without authorizing it', async () => {
  const { value } = await read('valid/request-context.json');
  value.actingOrganizationId = '00000000-0000-4000-8000-000000000020';
  value.workspaceId = '00000000-0000-4000-8000-000000000021';
  assert.equal(validateContract('RequestContext', value).success, true);
});

test('all registered public errors validate; retries are opt-in and bounded by category', () => {
  const correlationId = '00000000-0000-4000-8000-000000000001';
  for (const code of Object.keys(errorRegistry) as (keyof typeof errorRegistry)[]) {
    const response = createErrorResponse(code, correlationId);
    assert.equal(response.error.retryable, false);
    assert.equal(validateContract('ErrorResponse', response).success, true, code);
    const retry = createErrorResponse(code, correlationId, true);
    assert.equal(retry.error.retryable, errorRegistry[code].retryable);
    assert.equal(validateContract('ErrorResponse', retry).success, true, code);
  }
  const unknownEffect = { ...createErrorResponse('DEPENDENCY_TIMEOUT', correlationId), outcome: 'Unknown' };
  assert.equal(validateContract('ErrorResponse', unknownEffect).success, false, 'Unknown effect requires an Operation tracking response');
  const error = createErrorResponse('FORBIDDEN', correlationId);
  assert.equal(validateContract('ErrorResponse', { ...error, error: { ...error.error, retryable: true } }).success, false);
  assert.equal(validateContract('ErrorResponse', { ...error, error: { ...error.error, stack: 'sensitive-sentinel' } }).success, false);
});

test('exact SemVer rejects ranges, leading zeroes and malformed prereleases', () => {
  for (const version of ['0.1.0', '1.2.3-rc.1', '1.2.3+build.7']) assert.equal(validateContract('ExactVersion', version).success, true);
  for (const version of ['^0.1.0', 'latest', '01.2.3', '1.2.3-01', '1.2', '1.2.3\n']) assert.equal(validateContract('ExactVersion', version).success, false, version);
});

test('preview-only recovery requirements never masquerade as completed tests', async () => {
  const requirements = await read('recovery-requirements.json');
  assert.equal(requirements.status, 'SpecificationOnly');
  for (const scenario of requirements.cases) {
    for (const name of scenario.startingFixtures) {
      const fixture = await read(`valid/${name}.json`);
      assert.equal(validate(fixture.schema, fixture.value).success, true);
    }
  }
});

test('nested decision packages enforce byte bounds and reject ambiguous money limits', async () => {
  const { value } = await read('valid/decision-view.json');
  value.package.impactUpperBound.maxMoney = [{ amount: '10', currency: 'USD' }, { amount: '20', currency: 'USD' }];
  assert.equal(validateContract('DecisionView', value).success, false);
  value.package.impactUpperBound.maxMoney = [];
  value.package.risks = Array.from({ length: 32 }, () => '界'.repeat(1000));
  const result = validateContract('DecisionView', value);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.issues.some(issue => issue.path === '/package' && issue.message.includes('64 KiB')));
});
