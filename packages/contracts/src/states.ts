import { stateRegistry } from '../generated/state-tables.ts';
export { stateRegistry };
export type StateMachine = keyof typeof stateRegistry.machines;
export type TransitionDescription = Readonly<{
  from: string;
  to: string;
  guardIds: readonly string[];
  event: string;
  effects: readonly string[];
}>;

type Machine = {
  states: readonly string[];
  transitions: readonly TransitionDescription[];
  combinations?: Readonly<Record<string, readonly string[]>>;
};

export function isLegalState(machine: StateMachine, state: string, outcome?: string): boolean {
  if (!Object.hasOwn(stateRegistry.machines, machine)) return false;
  const definition: Machine = stateRegistry.machines[machine];
  if (!definition.states.includes(state)) return false;
  return definition.combinations
    ? outcome !== undefined && definition.combinations[state]!.includes(outcome)
    : outcome === undefined;
}

/** Describes required Owner guards. An existing edge is never execution authorization. */
export function describeTransition(machine: StateMachine, from: string, to: string): TransitionDescription | undefined {
  if (!Object.hasOwn(stateRegistry.machines, machine)) return undefined;
  return (stateRegistry.machines[machine] as Machine).transitions.find(t => t.from === from && t.to === to);
}
