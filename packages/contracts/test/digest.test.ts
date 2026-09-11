import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { canonicalJson, checkPinInput, ContractDigestError, digestBytes, digestCommandIntent, digestContract, digestRequiredSlots } from '../src/digest.ts';

const fixture = async (name: string) => JSON.parse(await readFile(new URL(`../fixtures/valid/${name}.json`, import.meta.url), 'utf8')).value;

test('RFC 8785 number, escaping and UTF-16 ordering vectors; SHA-256 known vector', async () => {
  const input = { numbers: [333333333.33333329, 1E30, 4.50, 2e-3, 1e-27], string: '€$\u000f\nA\'B"\\\\"/', literals: [null, true, false] };
  assert.equal(canonicalJson(input), String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`);
  const ordered = canonicalJson({ '\u20ac': 1, '\r': 2, '\ufb33': 3, '1': 4, '\ud83d\ude00': 5, '\u0080': 6, '\u00f6': 7 });
  assert.equal(ordered, '{"\\r":2,"1":4,"\u0080":6,"ö":7,"€":1,"😀":5,"דּ":3}');
  assert.equal(canonicalJson(-0), '0');
  assert.notEqual(canonicalJson('é'), canonicalJson('e\u0301'), 'JCS must not normalize Unicode');
  assert.equal(await digestBytes(new TextEncoder().encode('abc')), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('reject non-JSON, malformed Unicode and resource exhaustion without coercion or getters', () => {
  let executed = false;
  const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() { executed = true; return 'sensitive-sentinel'; } });
  const cyclic: any = {}; cyclic.self = cyclic;
  const sparse = new Array(2); sparse[1] = 1;
  let deep: any = null; for (let i = 0; i < 66; i++) deep = [deep];
  for (const value of [NaN, Infinity, undefined, 1n, Symbol('x'), { a: undefined }, [undefined], { toJSON() { executed = true; return {}; } }, new Date(), getter, cyclic, sparse, deep, '\ud800', { '\udfff': true }, 'x'.repeat(1_048_577)]) {
    assert.throws(() => canonicalJson(value), (error: unknown) => error instanceof ContractDigestError && error.code === 'INVALID_ARGUMENT' && !error.message.includes('sensitive-sentinel'));
  }
  assert.equal(executed, false);
});

test('command digests exclude transport identity, preserve semantic CAS, and normalize sets', async () => {
  const command = await fixture('propose-command');
  command.payload.targetRefs.push({ type: 'hello.brief', id: '00000000-0000-4000-8000-000000000099', version: 1 });
  const original = structuredClone(command);
  const digest = await digestCommandIntent(command);
  command.commandId = '00000000-0000-4000-8000-000000000088';
  command.idempotencyKey = 'another-transport-key';
  command.payload.targetRefs.reverse();
  assert.equal(await digestCommandIntent(command), digest);
  assert.deepEqual(original.payload.targetRefs, [...command.payload.targetRefs].reverse());
  command.payload.targetRefs[0].version++;
  assert.notEqual(await digestCommandIntent(command), digest);
  const cancel = await fixture('cancel-command');
  const first = await digestCommandIntent(cancel);
  cancel.expectedVersion++;
  assert.notEqual(await digestCommandIntent(cancel), first);
  command.payload.targetRefs.push({ ...command.payload.targetRefs[0], version: 5 });
  await assert.rejects(digestCommandIntent(command), ContractDigestError);
});

test('plan and decision payload field selection avoids self-reference and preserves ordinary array order', async () => {
  const plan = await fixture('operation-plan');
  const before = JSON.stringify(plan);
  const first = await digestContract('OperationPlan', plan);
  assert.equal(JSON.stringify(plan), before, 'Canonicalization cannot sort caller-owned arrays');
  plan.digest = first;
  plan.planRef.version++;
  plan.nodes.reverse();
  assert.equal(await digestContract('OperationPlan', plan), first);
  plan.nodes[0].payloadDigest = `sha256:${'f'.repeat(64)}`;
  assert.notEqual(await digestContract('OperationPlan', plan), first);
  const decision = await fixture('decision-package');
  const packageDigest = await digestContract('DecisionPackage', decision);
  decision.packageDigest = packageDigest;
  decision.allowedResponses.reverse();
  assert.equal(await digestContract('DecisionPackage', decision), packageDigest);
  decision.alternatives.reverse();
  assert.notEqual(await digestContract('DecisionPackage', decision), packageDigest);
});

test('authority history retains its issuance digest without reviving authority', async () => {
  const authority = await fixture('execution-authority');
  const digest = await digestContract('ExecutionAuthority', authority);
  authority.status = 'Revoked';
  authority.authorityRef.version++;
  authority.issuanceDigest = digest;
  assert.equal(await digestContract('ExecutionAuthority', authority), digest);
  authority.validUntil = '2026-09-07T02:00:00Z';
  assert.notEqual(await digestContract('ExecutionAuthority', authority), digest);
});

test('pin recovery compares subject identity and semantic inputs, preserving lifecycle version independence', async () => {
  const pin = await fixture('action-pin-set');
  const request = await fixture('pin-request');
  pin.requiredSlotsDigest = await digestRequiredSlots(request.requiredBehaviorSlots);
  request.subjectRef.version++;
  await checkPinInput(pin, request);
  for (const change of [
    (r: any) => { r.subjectInputDigest = `sha256:${'f'.repeat(64)}`; },
    (r: any) => { r.subjectRef.id = '00000000-0000-4000-8000-000000000099'; },
    (r: any) => { r.requiredBehaviorSlots.push('hello.compiler'); },
  ]) {
    const changed = structuredClone(request); change(changed);
    await assert.rejects(checkPinInput(pin, changed), (error: unknown) => error instanceof ContractDigestError && error.code === 'PIN_INPUT_CONFLICT');
  }
  assert.equal(await digestRequiredSlots(['hello.compiler', 'hello.connector']), await digestRequiredSlots(['hello.connector', 'hello.compiler']));
  await assert.rejects(digestRequiredSlots(['hello.connector', 'hello.connector']), ContractDigestError);
  request.requiredBehaviorSlots.push('hello.compiler');
  pin.requiredSlotsDigest = await digestRequiredSlots(request.requiredBehaviorSlots);
  await assert.rejects(checkPinInput(pin, request), (error: unknown) => error instanceof ContractDigestError && error.code === 'PIN_INPUT_CONFLICT', 'A matching input digest cannot hide an incomplete pin set');
});
