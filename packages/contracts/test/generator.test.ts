import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildArtifacts, lintRegistries, readSources } from '../scripts/generate.mjs';
import { lintProtocol, lintSemanticMetadata } from '../scripts/protocol.mjs';

const source = await readSources();
const failures = [
  ['version mismatch', (s: any, e: any) => { e.version = '9.9.9'; }],
  ['unknown owner', (s: any) => { s.machines.Action.owner = 'Unknown'; }],
  ['duplicate enum', (s: any) => { s.machines.Action.states.push('Proposed'); }],
  ['missing outcome combination', (s: any) => { delete s.machines.Action.combinations.Closed; }],
  ['unknown guard', (s: any) => { s.machines.Action.transitions[0].guardIds = ['action.missing']; }],
  ['terminal reopening', (s: any) => { s.machines.Action.transitions[0].from = 'Closed'; }],
  ['missing atomic audit', (s: any) => { s.machines.Action.transitions[0].effects = ['OwnerCAS', 'Outbox']; }],
  ['duplicate transition', (s: any) => { s.machines.Action.transitions.push(s.machines.Action.transitions[0]); }],
  ['missing error mapping', (s: any, e: any) => { delete e.entries[0].httpStatus; }],
  ['unsafe retry', (s: any, e: any) => { e.entries[0].retryable = true; }],
  ['duplicate error', (s: any, e: any) => { e.entries.push(e.entries[0]); }],
] as const;
for (const [name, mutate] of failures) {
  test(`Registry lint rejects ${name}`, () => {
    const states = structuredClone(source.states);
    const errors = structuredClone(source.errors);
    mutate(states, errors);
    assert.throws(() => lintRegistries(states, errors, source.manifest.version));
  });
}

test('two complete generations produce byte-identical artifacts', async () => {
  const first = await buildArtifacts();
  const second = await buildArtifacts();
  assert.deepEqual(first, second);
  const openapi = JSON.parse(first['openapi.json']);
  assert.equal(openapi.openapi, '3.1.0');
  assert.equal(openapi['x-abh-runtime-available'], false);
  assert.equal(Object.keys(openapi.paths).length, 36);
  assert.equal(openapi.paths['/v1/queries/abh.capabilities.query'].get['x-abh-permission'], 'abh.capabilities.read');
  assert.equal(openapi.paths['/v1/queries/abh.pack-inspection-jobs.inspect'].get['x-abh-permission'], 'abh.packs.record-data-impact');
  assert.ok(openapi.paths['/v1/commands/abh.artifacts.store-inline'].post.responses['201']);
  assert.equal(openapi.paths['/v1/commands/abh.actions.validate'], undefined);
  assert.equal(openapi.paths['/v1/commands/abh.actions.register-plan'], undefined);
  for (const methods of Object.values(openapi.paths) as any[]) for (const operation of Object.values(methods) as any[]) {
    assert.equal(operation['x-abh-implementation'], 'Unavailable');
    assert.ok(operation['x-abh-permission']);
    assert.ok(operation['x-abh-errors'].length);
  }
  assert.equal(openapi.components.schemas.TenantContext, undefined);
  assert.equal(JSON.parse(first['compatibility.json']).comparedAgainst, null);
  for (const [path, sql] of Object.entries(first)) {
    if (path.endsWith('.sql')) assert.match(sql as string, /IS NOT NULL/);
  }
  assert.match(first['sql/action.check.sql'], /lifecycle = 'Closed' AND outcome IN \('Succeeded', 'PartiallySucceeded', 'Failed'\)/);
});

for (const [name, mutate] of [
  ['unknown payload', (p: any) => { p.commands[0].payload = 'Unknown'; }],
  ['missing error mapping', (p: any) => { p.commands[0].errors.push('UNKNOWN_FAILURE'); }],
  ['missing permission', (p: any) => { delete p.commands.find((command: any)=>command.visibility==='Public').permission; }],
  ['unknown owner', (p: any) => { p.commands[0].owner = 'Unknown'; }],
  ['duplicate command', (p: any) => { p.commands.push(p.commands[0]); }],
  ['unknown query field', (p: any) => { p.queries[0].filters.push('context'); }],
  ['internal HTTP metadata', (p: any) => { p.commands.find((c: any) => c.visibility === 'Internal').status = 200; }],
  ['duplicate explicit event', (p: any) => { p.events.push(p.events[0]); }],
  ['explicit event collision', (p: any) => { p.events[0].type = source.states.machines.Action.transitions[0].event; }],
  ['unknown event owner', (p: any) => { p.events[0].owner = 'Unknown'; }],
] as const) {
  test(`Protocol lint rejects ${name}`, () => {
    const protocol = structuredClone(source.protocol);
    mutate(protocol);
    assert.throws(() => lintProtocol(protocol, { ...source.publicSchema.$defs, ...source.workflowSchema.$defs, ...source.factsSchema.$defs }, source.states, source.errors, source.manifest.version));
  });
}

test('semantic metadata rejects circular digest fields and silently deduplicated sets', () => {
  const definitions = structuredClone(source.workflowSchema.$defs);
  definitions.OperationPlan['x-abh-digest-fields'].push('digest');
  assert.throws(() => lintSemanticMetadata(definitions), /Invalid digest fields/);
  definitions.OperationPlan['x-abh-digest-fields'].pop();
  definitions.OperationPlan.properties.nodes.uniqueItems = false;
  assert.throws(() => lintSemanticMetadata(definitions), /Set must reject duplicates/);
});
