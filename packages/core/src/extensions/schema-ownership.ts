import type postgres from 'postgres';
import type {EntityRef,PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import type {Query,TenantTransaction} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';

/** Complete deployment inventory, not tenant-local ownership. Never returns SQL credentials. */
export async function readPackSchemaOwnership(sql:Query):Promise<PackSchemaOwnership[]>{
  const rows=await sql`SELECT schema_name,pack_id,database_role,migration_version,review_ref FROM extension.schema_ownership ORDER BY schema_name LIMIT 1001`;
  const owners=validatePackSchemaOwnership(rows.map(row=>({packId:row.pack_id,schemaName:row.schema_name,databaseRole:row.database_role})));
  for(const row of rows){
    contract('EntityRef',row.review_ref);
    if(Number(row.migration_version)!==0)throw new CoreError('PRECONDITION_FAILED');
  }
  return owners;
}

/** Provisioning only: call with the separately configured maintenance connection.
 * Review Ref records the deployment's reviewed configuration; this function does not
 * verify that evidence or grant migration/Enable authority. No runtime write path.
 * Assignments are immutable; changing ownership requires separate reviewed maintenance.
 */
export async function registerPackSchemaOwnership(database:postgres.Sql,ownership:readonly PackSchemaOwnership[],reviewRef:EntityRef):Promise<void>{
  const requested=validatePackSchemaOwnership(ownership),review=contract('EntityRef',JSON.parse(canonicalJson(reviewRef)));
  if(!requested.length)throw new CoreError('INVALID_ARGUMENT');
  await database.begin(async sql=>{
    await sql`SET LOCAL lock_timeout='5s'`;
    await sql`SET LOCAL statement_timeout='10s'`;
    const [actor]=await sql`SELECT current_user AS actor,session_user AS session,
      has_table_privilege(current_user,'extension.schema_ownership','INSERT') AND has_table_privilege(current_user,'extension.schema_roles','INSERT') AS can_register`;
    if(!actor||actor.actor!==actor.session||!actor.can_register||actor.actor.startsWith('abh_'))throw new CoreError('FORBIDDEN');
    // Both global tables are locked together, including against direct maintenance INSERTs.
    await sql`LOCK TABLE extension.schema_roles,extension.schema_ownership IN SHARE ROW EXCLUSIVE MODE`;
    const current=await readPackSchemaOwnership(sql);
    const additions=requested.filter(owner=>!current.some(existing=>canonicalJson(existing)===canonicalJson(owner)));
    validatePackSchemaOwnership([...current,...additions]);
    const catalog=await sql`SELECT n.nspname,r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,r.rolreplication,r.rolinherit,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership
      FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner`;
    for(const owner of requested){
      const actual=catalog.find(row=>row.nspname===owner.schemaName&&row.rolname===owner.databaseRole);
      if(!actual||!actual.rolcanlogin||actual.rolsuper||actual.rolcreatedb||actual.rolcreaterole||actual.rolbypassrls||actual.rolreplication||actual.rolinherit||actual.membership)throw new CoreError('FORBIDDEN');
    }
    for(const owner of additions){
      await sql`INSERT INTO extension.schema_roles(database_role,pack_id) VALUES (${owner.databaseRole},${owner.packId}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO extension.schema_ownership(schema_name,pack_id,database_role,review_ref)
        VALUES (${owner.schemaName},${owner.packId},${owner.databaseRole},${JSON.stringify(review)}::text::jsonb)`;
    }
  });
}

/** Management reads still require current deployment admission from the composing Owner. */
export class PackSchemaOwnershipOwner {
  async read(tx:TenantTransaction,admit:()=>Promise<void>):Promise<PackSchemaOwnership[]>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    await admit();tx.assertActive();return readPackSchemaOwnership(tx.owner('PackLoader'));
  }
}
