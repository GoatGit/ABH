import { coreCatalog } from '../generated/catalog.ts';
import { validateContract, type ValidationIssue, type ValidationResult } from './schema.ts';
import type { ActionTypeRegistration, CatalogExtension, ObjectTypeRegistration, PurposeRegistration, Target } from '../generated/types.ts';

export { coreCatalog };
export type ContractCatalog = Readonly<{
  objectTypes: Readonly<Record<string, Readonly<ObjectTypeRegistration>>>;
  purposes: Readonly<Record<string, Readonly<PurposeRegistration>>>;
  actions: Readonly<Record<string, Readonly<ActionTypeRegistration>>>;
}>;

const problem = (path: string): ValidationIssue => ({ path, keyword: 'registration', message: 'Registration is missing, conflicting, or outside its namespace.' });
const invalid = (path: string): ValidationResult<never> => ({ success: false, code: 'INVALID_ARGUMENT', issues: [problem(path)] });

/** Static registration validation only. Caller must obtain extensions from the verified Pack Loader. */
export function createContractCatalog(extensions: readonly CatalogExtension[] = []): ValidationResult<ContractCatalog> {
  if (!Array.isArray(extensions) || extensions.length > 100) return invalid('/extensions');
  const objectTypes: Record<string, ObjectTypeRegistration> = Object.create(null);
  const purposes: Record<string, PurposeRegistration> = Object.create(null);
  const actions: Record<string, ActionTypeRegistration> = Object.create(null);
  for (const { name, scopeKind, description } of coreCatalog.objectTypes) objectTypes[name] = { name, scopeKind, description };
  for (const purpose of coreCatalog.purposes) purposes[purpose.name] = { ...purpose };
  for (const action of coreCatalog.actions) actions[action.name] = { ...action, targetTypes: [...action.targetTypes], purposeNames: [...action.purposeNames] };
  const namespaces = new Set<string>(['abh']);
  for (const [i, candidate] of extensions.entries()) {
    const checked = validateContract('CatalogExtension', candidate);
    if (!checked.success) return invalid(`/extensions/${i}`);
    const extension = checked.data;
    if (namespaces.has(extension.namespace)) return invalid(`/extensions/${i}/namespace`);
    namespaces.add(extension.namespace);
    for (const [field, store] of [['objectTypes', objectTypes], ['purposes', purposes], ['actions', actions]] as const) {
      for (const [j, entry] of extension[field].entries()) {
        if (!entry.name.startsWith(`${extension.namespace}.`) || Object.hasOwn(store, entry.name)) return invalid(`/extensions/${i}/${field}/${j}`);
        // Registrations are frozen later, including nested arrays. Never freeze caller-owned values.
        (store as Record<string, unknown>)[entry.name] = structuredClone(entry);
      }
    }
  }
  for (const action of Object.values(actions)) {
    if (action.targetTypes.some(name => !Object.hasOwn(objectTypes, name)) || action.purposeNames.some(name => !Object.hasOwn(purposes, name))) return invalid('/actions');
    Object.freeze(action.targetTypes);
    Object.freeze(action.purposeNames);
  }
  for (const store of [objectTypes, purposes, actions]) {
    for (const value of Object.values(store)) Object.freeze(value);
    Object.freeze(store);
  }
  return { success: true, data: Object.freeze({ objectTypes, purposes, actions }) };
}

/** Registration compatibility is not authorization; existence, ownership and current grants require Owner lookup. */
export function validateRegisteredTarget(catalog: ContractCatalog, target: Target, purpose: string): ValidationResult<Target> {
  const checked = validateContract('Target', target);
  if (!checked.success) return checked;
  const action = Object.hasOwn(catalog.actions, target.action) ? catalog.actions[target.action] : undefined;
  if (!action || !action.targetTypes.includes(target.objectRef.type)) return invalid('/action');
  if (!Object.hasOwn(catalog.purposes, purpose) || !action.purposeNames.includes(purpose)) return invalid('/purposeOfUse');
  for (const [i, scope] of target.scopeRefs.entries()) {
    const registration = Object.hasOwn(catalog.objectTypes, scope.type) ? catalog.objectTypes[scope.type] : undefined;
    if (!registration || registration.scopeKind === 'None') return invalid(`/scopeRefs/${i}`);
  }
  return checked;
}
