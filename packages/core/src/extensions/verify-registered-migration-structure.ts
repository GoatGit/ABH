import type postgres from 'postgres';
import type {PackMigrationStructureBinding,PackManifest,PackMigrationStep} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyRegisteredPackMigrationDatabase} from './pack-migration-database.ts';
import {PackSchemaOwnershipOwner} from './schema-ownership.ts';
import {verifyMigrationStructure,type MigrationStructureExpectation} from './verify-migration-structure.ts';

export type MigrationStructureBinding = PackMigrationStructureBinding;
/** Internal result inspection on the caller's dedicated, read-only REPEATABLE READ
 * transaction. Uses persistent ownership and a live cross-connection database proof.
 * Admission must authenticate the exact binding against current governed artifacts
 * and retain deployment/installation authority fences in tx. This callback is not
 * itself signature verification. Connection lifetime, installation/evidence binding,
 * data verification, durable reports and Enable remain the composing Owner's duties.
 */
export async function verifyRegisteredMigrationStructure(tx:TenantTransaction,sql:postgres.ReservedSql,options:TransactionOptions,
 manifest:PackManifest,steps:readonly PackMigrationStep[],expectation:MigrationStructureExpectation,
 admit:(binding:Readonly<MigrationStructureBinding>)=>Promise<void>){
 const pack=JSON.parse(canonicalJson(manifest)) as PackManifest,plan=JSON.parse(canonicalJson(steps)) as PackMigrationStep[],expected=JSON.parse(canonicalJson(expectation)) as MigrationStructureExpectation,limits={...options},authorize=admit;
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(!Array.isArray(plan)||!plan.length||!expected||!Array.isArray(expected.inventory))throw new CoreError('INVALID_ARGUMENT');
 // A caller cannot omit a changed schema and still obtain a matching plan result.
 const schemas=[...new Set(plan.flatMap(step=>step.schemas))].sort(),selected=expected.inventory.map(item=>item.schema).sort();
 if(canonicalJson(schemas)!==canonicalJson(selected))throw new CoreError('PRECONDITION_FAILED');
 const binding:MigrationStructureBinding={organizationId:tx.context.tenant.resourceOrganizationId,packId:pack.metadata.id,packVersion:pack.metadata.version,packageDigest:pack.integrity.packageDigest,
  planDigest:await digestBytes(new TextEncoder().encode(canonicalJson(plan))),expectedDigest:await digestBytes(new TextEncoder().encode(canonicalJson(expected)))};
 const admission=async()=>{active();await authorize(Object.freeze({...binding}));active();};
 await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,admission);active();
 const owner=new PackSchemaOwnershipOwner(),ownership=await owner.read(tx,admission);
 const result=await verifyMigrationStructure(sql,ownership,pack.metadata.id,expected,limits);active();
 await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,admission);
 const current=await owner.read(tx,async()=>{});
 if(canonicalJson(current)!==canonicalJson(ownership)||result.expectedDigest!==binding.expectedDigest)throw new CoreError('VERSION_CONFLICT');
 active();return {...result,binding};
}
