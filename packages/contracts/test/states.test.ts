import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { describeTransition, isLegalState, stateRegistry, type StateMachine } from '../src/states.ts';
import { validateContract } from '../src/schema.ts';

// Independent assertions derived from the normative Action/Operation contracts.
const action = {
  Proposed: ['NotStarted'], Validated: ['NotStarted'], Authorized: ['NotStarted'],
  Executing: ['Pending', 'Unknown'], Reconciling: ['Pending', 'Unknown'],
  Closed: ['Succeeded', 'PartiallySucceeded', 'Failed'],
  Rejected: ['NotStarted'], Expired: ['NotStarted'], Cancelled: ['NotStarted'],
};
const operation = {
  Pending: ['NotStarted'], Dispatching: ['Pending', 'Unknown'], Observing: ['Pending', 'Unknown'],
  Closed: ['Succeeded', 'Failed'], Cancelled: ['NotStarted'],
};
const outcomes = ['NotStarted', 'Pending', 'Unknown', 'Succeeded', 'PartiallySucceeded', 'Failed', 'Unregistered'];
for (const [machine, expected] of [['Action', action], ['Operation', operation]] as const) {
  test(`${machine} lifecycle/outcome combinations match the normative contract exhaustively`, () => {
    for (const [lifecycle, allowed] of Object.entries(expected)) {
      for (const outcome of outcomes) {
        const valid = allowed.includes(outcome);
        assert.equal(isLegalState(machine, lifecycle, outcome), valid, `${lifecycle}/${outcome}`);
        assert.equal(validateContract(`${machine}Position`, { lifecycle, outcome }).success, valid, `${lifecycle}/${outcome}`);
      }
      assert.equal(isLegalState(machine, lifecycle), false);
    }
    assert.equal(isLegalState(machine, 'Unregistered', 'Unknown'), false);
  });
}

test('terminal states cannot restart, including approved Decisions and revoked Authorities', () => {
  for (const [name, machine] of Object.entries(stateRegistry.machines)) {
    for (const terminal of machine.terminal) {
      for (const state of machine.states) assert.equal(describeTransition(name as StateMachine, terminal, state), undefined);
    }
  }
});

test('unknown outcomes cannot be erased by cancellation; retry describes current authorization guards', () => {
  assert.equal(describeTransition('Action', 'Executing', 'Cancelled'), undefined);
  assert.equal(describeTransition('Action', 'Reconciling', 'Executing'), undefined);
  assert.equal(describeTransition('Operation', 'Observing', 'Cancelled'), undefined);
  const transition = describeTransition('Operation', 'Observing', 'Pending')!;
  assert.deepEqual(transition.guardIds, ['operation.retry']);
  assert.match(stateRegistry.guards['operation.retry'].description, /Proven no effect.*parent still Executing.*current authorization/);
  assert.equal(stateRegistry.guards['operation.retry'].implementation, 'OwnerRequired');
});

test('unknown machine and accidental outcome on Decision fail closed', () => {
  assert.equal(isLegalState('__proto__' as StateMachine, 'Active'), false);
  assert.equal(describeTransition('constructor' as StateMachine, 'Active', 'Revoked'), undefined);
  assert.equal(isLegalState('Decision', 'Approved', 'Succeeded'), false);
  assert.equal(isLegalState('Decision', 'Approved'), true);
});

test('selected lifecycle enums are also present in the normative document', async () => {
  const doc = await readFile(new URL('../../../docs/V1/10-ABH详细设计/02-状态与执行契约规范.md', import.meta.url), 'utf8');
  assert.ok(doc.includes(`生命周期：${stateRegistry.machines.Action.states.join('、')}`));
  assert.ok(doc.includes(`Operation 生命周期：${stateRegistry.machines.Operation.states.join('、')}`));
  assert.ok(doc.includes(`Decision | ${stateRegistry.machines.Decision.states.join('、')}`));
});
