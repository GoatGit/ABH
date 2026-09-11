import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolveDevelopmentConfig, requiredEnvironmentReferences, configurationMetadata } from '../src/config.ts';
import { createContractCatalog, validateRegisteredTarget } from '../src/catalog.ts';
import { portMethods, validatePortRequest, validatePortResult, type PortMethod } from '../src/ports.ts';
import { createErrorResponse } from '../src/errors.ts';
import { validateContract } from '../src/schema.ts';
import { readSources } from '../scripts/generate.mjs';
import { buildConfiguration, buildStateDocumentation, lintCatalog, lintPorts } from '../scripts/foundation.mjs';

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`../fixtures/valid/${name}.json`, import.meta.url), 'utf8')).value;
const source = await readSources();

test('configuration defaults are explicit, nonmutating and produce a fully required contract', async () => {
  const input = await fixture('development-config');
  const before = structuredClone(input);
  assert.equal(validateContract('ResolvedDevelopmentConfig', input).success, false);
  const result = resolveDevelopmentConfig(input);
  assert.equal(result.success, true);
  assert.deepEqual(input, before);
  if (!result.success) return;
  assert.deepEqual(result.data.database, { ...input.database, statementTimeoutMs: 5000, lockTimeoutMs: 1000 });
  assert.equal(result.data.runtime.action.maxOperations, 100);
  assert.equal(result.data.runtime.queue.publishBatch, 100);
  assert.equal(result.data.observability.projectTelemetry, false);
  assert.equal(validateContract('ResolvedDevelopmentConfig', result.data).success, true);
  assert.deepEqual(resolveDevelopmentConfig(result.data), result);
  input.runtime.action = { maxOperations: 10 };
  const smaller = resolveDevelopmentConfig(input);
  assert.equal(smaller.success && smaller.data.runtime.action.maxOperations, 10);
  input.runtime.action.maxOperations = '10';
  assert.equal(resolveDevelopmentConfig(input).success, false);
});

test('only explicit environment references are listed; no secret is resolved or placed in defaults', async () => {
  const config = await fixture('development-config');
  const result = requiredEnvironmentReferences(config);
  assert.deepEqual(result, { success: true, data: [
    { path: '/database/runtimeUrlRef', name: 'ABH_DATABASE_RUNTIME_URL' },
    { path: '/database/queueUrlRef', name: 'ABH_DATABASE_QUEUE_URL' },
  ] });
  for (const entry of Object.values(configurationMetadata)) if (entry.sensitivity === 'Reference') assert.equal('default' in entry, false);
  config.database.runtimeUrlRef = 'postgres://user:sensitive-sentinel@db';
  const invalid = resolveDevelopmentConfig(config);
  assert.equal(invalid.success, false);
  assert.ok(!JSON.stringify(invalid).includes('sensitive-sentinel'));
});

test('registered target validation admits an explicit Domain catalog without granting permission', async () => {
  const extension = await fixture('catalog-extension');
  const before = structuredClone(extension);
  const catalog = createContractCatalog([extension]);
  assert.equal(catalog.success, true);
  if (!catalog.success) return;
  const target = { objectRef: { type: 'hello.brief', id: '00000000-0000-4000-8000-000000000040', version: 1 }, action: 'hello.publish', scopeRefs: [{ type: 'abh.organization', id: '00000000-0000-4000-8000-000000000003', version: 1 }] };
  assert.equal(validateRegisteredTarget(catalog.data, target, 'hello.publish').success, true);
  for (const [input, purpose] of [
    [{ ...target, action: 'hello.unknown' }, 'hello.publish'],
    [target, 'arbitrary.purpose'],
    [{ ...target, objectRef: { ...target.objectRef, type: 'abh.grant' } }, 'hello.publish'],
    [{ ...target, scopeRefs: [{ ...target.scopeRefs[0]!, type: 'abh.grant' }] }, 'hello.publish'],
  ] as const) assert.equal(validateRegisteredTarget(catalog.data, input, purpose).success, false);
  extension.actions[0].targetTypes.push('abh.grant');
  assert.deepEqual(catalog.data.actions['hello.publish']!.targetTypes, ['hello.brief']);
  assert.throws(() => (catalog.data.actions['hello.publish']!.targetTypes as string[]).push('abh.grant'));
  assert.equal(Object.isFrozen(catalog.data.objectTypes), true);
  assert.equal(Object.isFrozen(before), false);
});

for (const [label, mutate] of [
  ['reserved namespace', (e: any) => { e.namespace = 'abh'; }],
  ['another namespace object', (e: any) => { e.objectTypes[0].name = 'other.brief'; }],
  ['duplicate named registration', (e: any) => { e.objectTypes.push({ ...e.objectTypes[0], description: 'conflicting version' }); }],
  ['unknown target type', (e: any) => { e.actions[0].targetTypes = ['hello.missing']; }],
  ['unknown purpose', (e: any) => { e.actions[0].purposeNames = ['hello.missing']; }],
  ['embedded executable code', (e: any) => { e.actions[0].implementation = 'sensitive-sentinel'; }],
] as const) test(`static catalog rejects ${label}`, async () => {
  const extension = await fixture('catalog-extension');
  mutate(extension);
  const result = createContractCatalog([extension]);
  assert.equal(result.success, false);
  assert.ok(!JSON.stringify(result).includes('sensitive-sentinel'));
});

test('duplicate extension namespaces do not depend on installation order', async () => {
  const extension = await fixture('catalog-extension');
  assert.equal(createContractCatalog([extension, extension]).success, false);
  assert.equal(createContractCatalog().success, true);
});

test('Port outcomes preserve uncertain work and reject unsafe retries or unknown error codes', async () => {
  assert.equal(validatePortResult('DurableExecutionPort.enqueue', await fixture('durable-tracked')).success, true);
  assert.equal(validatePortResult('IdentityProviderPort.verify', await fixture('identity-result')).success, true);
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(validatePortResult('DurableExecutionPort.enqueue', { status: 'Rejected', error: createErrorResponse('DEPENDENCY_TIMEOUT', id, true) }).success, false);
  assert.equal(validatePortResult('DurableExecutionPort.enqueue', { status: 'Rejected', error: createErrorResponse('DEPENDENCY_UNAVAILABLE', id) }).success, true);
  assert.equal(validatePortResult('IdentityProviderPort.verify', { status: 'Rejected', error: createErrorResponse('UNAUTHENTICATED', id) }).success, true);
  assert.equal(validatePortResult('DurableExecutionPort.enqueue', { status: 'Rejected', error: createErrorResponse('DECISION_STALE', id) }).success, false);
  assert.equal(validatePortResult('constructor' as PortMethod, {}).success, false);
  assert.equal(validatePortResult('ObjectStorePort.read', { status: 'Tracked', trackingRef: { type: 'abh.job', id, version: 1 } }).success, false);
  for (const entry of Object.values(portMethods)) if (entry.effect === 'DurableWrite') assert.ok('tracking' in entry);
});

test('Port targets use the generated catalog and cannot substitute another method permission', async () => {
  const request = await fixture('enqueue-job');
  assert.equal(validatePortRequest('DurableExecutionPort.enqueue', request).success, true);
  const catalog = createContractCatalog();
  assert.equal(catalog.success, true);
  if (catalog.success) assert.equal(validateRegisteredTarget(catalog.data, request.context.target, 'abh.runtime.deliver').success, true);
  request.context.target.action = 'abh.artifacts.delete';
  assert.equal(validatePortRequest('DurableExecutionPort.enqueue', request).success, false);
  assert.equal(validatePortRequest('constructor' as PortMethod, request).success, false);
});

test('configuration generation rejects missing metadata, unbounded values and default credentials', () => {
  for (const change of [
    (s: any) => { delete s.properties.web.properties.enabled['x-abh-config']; },
    (s: any) => { delete s.properties.database.properties.lockTimeoutMs.maximum; },
    (s: any) => { s.properties.database.properties.runtimeUrlRef.default = 'env:ABH_SECRET'; },
  ]) {
    const config = structuredClone(source.publicSchema.$defs.DevelopmentConfig);
    change(config);
    assert.throws(() => buildConfiguration(config, source.manifest.version));
  }
});

test('Core catalog generation rejects missing entity registration or Owner', () => {
  const definitions = { ...source.publicSchema.$defs, ...source.workflowSchema.$defs, ...source.adapterSchema.$defs };
  for (const change of [
    (c: any) => { c.objectTypes = c.objectTypes.filter((entry: any) => entry.name !== 'abh.action'); },
    (c: any) => { c.objectTypes[0].owner = 'Unknown'; },
    (c: any) => { c.objectTypes.push(c.objectTypes[0]); },
  ]) {
    const catalog = structuredClone(source.catalog); change(catalog);
    assert.throws(() => lintCatalog(catalog, definitions, source.states, source.protocol, source.manifest.version));
  }
});

test('Port generation requires known schemas, error mappings, current context and uncertain-result tracking', () => {
  const definitions = { ...source.publicSchema.$defs, ...source.workflowSchema.$defs, ...source.adapterSchema.$defs };
  for (const change of [
    (p: any) => { p.ports.DurableExecutionPort.methods.enqueue.response = 'Unknown'; },
    (p: any) => { p.ports.DurableExecutionPort.methods.enqueue.errors = ['UNKNOWN_ERROR']; },
    (p: any) => { delete p.ports.DurableExecutionPort.methods.enqueue.tracking; },
    (p: any) => { p.ports.ObjectStorePort.methods.put.context = 'PreAuthentication'; },
  ]) {
    const ports = structuredClone(source.ports); change(ports);
    assert.throws(() => lintPorts(ports, definitions, source.catalog.owners, source.errors, source.manifest.version));
  }
  const weakened = structuredClone(definitions);
  weakened.PutObjectRequest.required = weakened.PutObjectRequest.required.filter((name: string) => name !== 'authorizedContextRef');
  assert.throws(() => lintPorts(source.ports, weakened, source.catalog.owners, source.errors, source.manifest.version));
});

test('state documentation mapping detects missing machines, wrong sections and invented states', () => {
  const mapping = structuredClone(source.stateMapping);
  delete mapping.machines.Action;
  assert.throws(() => buildStateDocumentation(mapping, source.states, source.stateDoc), /coverage/);
  const state = structuredClone(source.states);
  state.machines.Action.states.push('SilentlyRetried');
  assert.throws(() => buildStateDocumentation(source.stateMapping, state, source.stateDoc), /absent/);
  const wrong = structuredClone(source.stateMapping);
  wrong.machines.Action.section = '## nonexistent';
  assert.throws(() => buildStateDocumentation(wrong, source.states, source.stateDoc), /Missing normative/);
});

test('internal evidence permission is registered explicitly without exposing an HTTP command',()=>{
  const catalog=createContractCatalog();assert.ok(catalog.success);
  const ref={type:'abh.operation',id:'00000000-0000-4000-8000-000000000001',version:1};
  const target={objectRef:ref,scopeRefs:[{...ref,type:'abh.organization'}],action:'abh.operations.record-receipt'};
  assert.equal(validateRegisteredTarget(catalog.data,target,'abh.operation.reconcile').success,true);
  assert.equal(validateRegisteredTarget(catalog.data,target,'abh.action.execute').success,false);
  for(const patch of [{name:'abh.actions.propose'},{targetTypes:['abh.organization']},{purposeNames:['unknown.purpose']},{purposeNames:[]}]){
    const invalid=structuredClone(source.catalog);invalid.actions=[{...invalid.actions[0],...patch}];
    assert.throws(()=>lintCatalog(invalid,{},source.states,source.protocol,source.manifest.version),/internal action registration/);
  }
});
