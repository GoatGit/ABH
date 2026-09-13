/** Server composition will be exported when Identity and authorization ingress are complete. */
export const coreVersion = '0.1.0' as const;
export {defineBusiness,validateBusinessInput} from './business.ts';
export type {BusinessDefinition,BusinessDefinitionInput,BusinessAction,BusinessInputSchema,BusinessInputSchemaNode} from './business.ts';
