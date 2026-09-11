import {randomUUID} from 'node:crypto';
import type {PackMigrationAttemptRecord,PackMigrationExecutionResult} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';
export type MigrationExecutionResult=PackMigrationExecutionResult;
const results=new WeakMap<object,{attempt:PackMigrationAttemptRecord;result:MigrationExecutionResult;observedAt:string;commandId:string}>();
/** Internal producer hook; never exposed through the public package. */
export function bindMigrationExecutionResult(result:MigrationExecutionResult,attempt:PackMigrationAttemptRecord):MigrationExecutionResult{
 results.set(result,{attempt:structuredClone(attempt),result:{...result},observedAt:new Date().toISOString(),commandId:randomUUID()});return result;
}
export function matchMigrationExecutionResult(result:MigrationExecutionResult){
 const stored=results.get(result);
 if(!stored||canonicalJson(result)!==canonicalJson(stored.result))throw new CoreError('PRECONDITION_FAILED');
 return structuredClone(stored);
}
