import type {PackSchemaOwnership,PackMigrationStep,PackManifest} from '@abh/contracts';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {databaseManifest} from '../data/manifest.ts';
import {CoreError} from '../internal/errors.ts';

export type {PackSchemaOwnership,PackMigrationStep} from '@abh/contracts';
const phases=['Expand','Backfill','Contract'] as const;
function identifier(value:string){if(typeof value!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(value))throw new CoreError('INVALID_ARGUMENT');}
function ownedSchema(name:string){
  identifier(name);
  if([...databaseManifest.schemas,'public','information_schema'].includes(name)||name.startsWith('pg_')||name.startsWith('abh_'))throw new CoreError('FORBIDDEN');
}
/** Validates the complete deployment-wide declaration set; no database authority is implied. */
export function validatePackSchemaOwnership(ownership:readonly PackSchemaOwnership[]):PackSchemaOwnership[]{
  if(!Array.isArray(ownership)||ownership.length>1000)throw new CoreError('LIMIT_EXCEEDED');
  const owners=JSON.parse(canonicalJson(ownership)) as PackSchemaOwnership[];
  const bySchema=new Set<string>(),byRole=new Map<string,string>();
  for(const owner of owners){
    contract('PackSchemaOwnership',owner);ownedSchema(owner.schemaName);identifier(owner.databaseRole);
    if(owner.databaseRole.startsWith('pg_')||owner.databaseRole.startsWith('abh_')||owner.databaseRole==='postgres'||bySchema.has(owner.schemaName))throw new CoreError('FORBIDDEN');
    if(byRole.has(owner.databaseRole)&&byRole.get(owner.databaseRole)!==owner.packId)throw new CoreError('FORBIDDEN');
    byRole.set(owner.databaseRole,owner.packId);bySchema.add(owner.schemaName);
  }
  return owners;
}
/** Static migration admission only. Evidence Ref presence is not evidence verification.
 * The deployment runner must verify referenced review/dry-run/safety/compatibility/recovery facts and enforce real database privileges.
 * No SQL parsing, dynamic loading, migration execution or capability authority is performed here.
 */
export async function validatePackMigrationPlan(manifest:PackManifest,ownership:readonly PackSchemaOwnership[],steps:readonly PackMigrationStep[]):Promise<PackMigrationStep[]>{
  if(!Array.isArray(ownership)||ownership.length>1000||!Array.isArray(steps)||steps.length>10000)throw new CoreError('LIMIT_EXCEEDED');
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest))),owners=validatePackSchemaOwnership(ownership),plan=JSON.parse(canonicalJson(steps)) as PackMigrationStep[];
  const digest=await digestPackManifest(pack);
  if(digest.packageDigest!==pack.integrity.packageDigest||digest.manifestDigest!==pack.integrity.manifestDigest||digest.artifactSetDigest!==pack.integrity.artifactSetDigest)throw new CoreError('PRECONDITION_FAILED');
  if(plan.length!==pack.migrations.length)throw new CoreError('PRECONDITION_FAILED');
  if(plan.length&&pack.trust.mode!=='TrustedCode')throw new CoreError('FORBIDDEN');
  const bySchema=new Map(owners.map(owner=>[owner.schemaName,owner]));
  const declared=new Map(pack.migrations.map(entry=>[entry.ref,entry])),used=new Set<string>();let phase=-1;
  for(const step of plan){
    contract('PackMigrationStep',step);
    const file=declared.get(step.ref);
    if(!file||file.digest!==step.digest||used.has(step.ref))throw new CoreError('PRECONDITION_FAILED');used.add(step.ref);
    const position=phases.indexOf(step.phase);if(position<phase)throw new CoreError('PRECONDITION_FAILED');phase=position;
    for(const schema of step.schemas){ownedSchema(schema);const owner=bySchema.get(schema);
      if(!owner||owner.packId!==pack.metadata.id||owner.databaseRole!==step.databaseRole)throw new CoreError('FORBIDDEN');
    }
    for(const ref of [step.reviewRef,step.dryRunRef,step.safetyPointRef,step.recoveryPlanRef,step.compatibilityRef,...(step.retirementRef?[step.retirementRef]:[])])contract('EntityRef',ref);
  }
  return plan;
}
