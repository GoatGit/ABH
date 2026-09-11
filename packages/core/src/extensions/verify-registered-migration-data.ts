import type postgres from 'postgres';
import type {PackMigrationDataBinding,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyRegisteredPackMigrationDatabase} from './pack-migration-database.ts';
import {PackSchemaOwnershipOwner} from './schema-ownership.ts';
import {verifyMigrationData,type MigrationDataCheck} from './verify-migration-data.ts';
export type MigrationDataBinding = PackMigrationDataBinding;
/** Live registered target + explicit data invariant scope. Every selected table
 * belongs to a migration schema; host must authenticate completeness and the exact
 * binding, retain authority fences and own the read-only REPEATABLE READ target.
 * No signature verification, whole-database data coverage or Enable is implied.
 */
export async function verifyRegisteredMigrationData(tx:TenantTransaction,sql:postgres.ReservedSql,options:TransactionOptions,manifest:PackManifest,steps:readonly PackMigrationStep[],checks:readonly MigrationDataCheck[],admit:(binding:Readonly<MigrationDataBinding>)=>Promise<void>){
 const pack=structuredClone(manifest),plan=structuredClone(steps),expected=structuredClone(checks),limits={...options,signal:AbortSignal.any([options.signal,tx.signal])},authorize=admit;
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(!Array.isArray(plan)||!plan.length||!Array.isArray(expected)||!expected.length||expected.length>100)throw new CoreError('INVALID_ARGUMENT');
 const schemas=new Set(plan.flatMap(step=>step.schemas));
 if(expected.some(check=>!check||!schemas.has(check.schema)))throw new CoreError('PRECONDITION_FAILED');
 const binding:MigrationDataBinding={kind:'DataInvariants',organizationId:tx.context.tenant.resourceOrganizationId,packId:pack.metadata.id,packVersion:pack.metadata.version,packageDigest:pack.integrity.packageDigest,planDigest:await digestBytes(new TextEncoder().encode(canonicalJson(plan))),expectedDigest:await digestBytes(new TextEncoder().encode(canonicalJson(expected)))};
 const admission=async()=>{active();await authorize(Object.freeze({...binding}));active();};
 await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,admission);
 const owner=new PackSchemaOwnershipOwner(),ownership=await owner.read(tx,admission);
 const result=await verifyMigrationData(sql,ownership,pack.metadata.id,expected,limits);active();
 await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,admission);
 const latest=await owner.read(tx,async()=>{});
 if(canonicalJson(latest)!==canonicalJson(ownership)||binding.expectedDigest!==result.expectedDigest)throw new CoreError('VERSION_CONFLICT');
 active();return {...result,binding};
}
