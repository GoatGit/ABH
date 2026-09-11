import { contractShapes } from '../generated/contract-shapes.ts';

export type Shape = {
  ref?: string;
  properties?: Readonly<Record<string, Shape>>;
  constants?: Readonly<Record<string, unknown>>;
  items?: Shape;
  set?: boolean;
  branches?: readonly Shape[];
};
export const shapes: Readonly<Record<string, Shape>> = contractShapes;
export const pointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

export function matches(shape: Shape, value: unknown): boolean {
  return !shape.constants || (value !== null && typeof value === 'object' &&
    Object.entries(shape.constants).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected));
}

/** Walk already validated JSON using generated references, including nested envelopes. */
export function walkShape(
  shape: Shape, value: unknown, path: string,
  onReference: (name: string, value: unknown, path: string) => void,
  onSet: (value: readonly unknown[], path: string) => void,
): void {
  if (!matches(shape, value)) return;
  if (shape.ref) {
    onReference(shape.ref, value, path);
    walkShape(shapes[shape.ref]!, value, path, onReference, onSet);
  }
  if (Array.isArray(value)) {
    if (shape.set) onSet(value, path);
    if (shape.items) value.forEach((item, i) => walkShape(shape.items!, item, `${path}/${i}`, onReference, onSet));
  }
  if (value !== null && typeof value === 'object' && shape.properties) {
    for (const [key, child] of Object.entries(shape.properties)) {
      if (Object.hasOwn(value, key)) walkShape(child, (value as Record<string, unknown>)[key], `${path}/${pointer(key)}`, onReference, onSet);
    }
  }
  for (const branch of shape.branches ?? []) walkShape(branch, value, path, onReference, onSet);
}
