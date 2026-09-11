import type postgres from 'postgres';
import {randomBytes} from 'node:crypto';
import type {PackManifest,PackSchemaOwnership,PackMigrationStep} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {databaseManifest} from '../data/manifest.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackMigrationPlan} from './pack-migration-plan.ts';
import type {TenantTransaction} from '../data/uow.ts';
import {PackSchemaOwnershipOwner} from './schema-ownership.ts';

/** Prove both live sessions see the same database lock namespace. Database names,
 * addresses and OIDs alone can coincide on independently provisioned servers.
 * The random lock contains no tenant data; finally attempts release on this connection.
 * A connection with failed cleanup must be discarded by the host, never pooled for execution.
 */
async function assertSameMigrationDatabase(tx:TenantTransaction,sql:postgres.ReservedSql):Promise<void>{
  const bytes=randomBytes(8),key=bytes.readBigInt64BE().toString(),high=bytes.readUInt32BE(0),low=bytes.readUInt32BE(4);
  const [held]=await sql`SELECT pg_backend_pid() AS pid,pg_try_advisory_lock(${key}::bigint) AS acquired`;
  if(!held?.acquired)throw new CoreError('PRECONDITION_FAILED');
  try{
    const rows=await tx.owner('PackLoader')`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND mode='ExclusiveLock' AND granted
      AND pid=${held.pid} AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND classid=${high}::oid AND objid=${low}::oid AND objsubid=1`;
    if(rows.length!==1)throw new CoreError('PRECONDITION_FAILED');
  }finally{
    const [released]=await sql`SELECT pg_advisory_unlock(${key}::bigint) AS released`;
    if(!released?.released)throw new CoreError('PRECONDITION_FAILED');
  }
}

/** Composed preflight using the persisted global inventory, never caller ownership claims.
 * The live connections must prove the same database; the host supplies current management admission.
 * Admission must retain its authority fences until the enclosing transaction ends.
 * The result grants no execution authority and cannot replace reviewed migration evidence.
 */
export async function verifyRegisteredPackMigrationDatabase(tx:TenantTransaction,sql:postgres.ReservedSql,manifest:PackManifest,steps:readonly PackMigrationStep[],admit:()=>Promise<void>):Promise<void>{
  const pack=JSON.parse(canonicalJson(manifest)) as PackManifest,plan=JSON.parse(canonicalJson(steps)) as PackMigrationStep[];
  const owner=new PackSchemaOwnershipOwner(),ownership=await owner.read(tx,admit);
  await assertSameMigrationDatabase(tx,sql);
  await verifyPackMigrationDatabase(sql,pack,ownership,plan);
  const current=await owner.read(tx,admit);
  if(canonicalJson(current)!==canonicalJson(ownership))throw new CoreError('VERSION_CONFLICT');
  // Current admission may involve asynchronous work. Do not accept a privilege check
  // that predates that work, or a Context that expired while the connection was busy.
  await verifyPackMigrationDatabase(sql,pack,current,plan);tx.assertActive();
}

/** Read-only catalog preflight on a pinned, directly authenticated migration connection.
 * This is not execution admission: governance, evidence, concurrent privilege changes,
 * routine bodies and deployment provisioning remain the runner's responsibility.
 * One connection handles one dedicated role; never use an elevated session with SET ROLE.
 */
export async function verifyPackMigrationDatabase(sql:postgres.ReservedSql,manifest:PackManifest,ownership:readonly PackSchemaOwnership[],steps:readonly PackMigrationStep[]):Promise<void>{
  const owners=JSON.parse(canonicalJson(ownership)) as PackSchemaOwnership[];
  const plan=await validatePackMigrationPlan(manifest,owners,steps);
  const roles=new Set(plan.map(step=>step.databaseRole));
  if(roles.size!==1)throw new CoreError('PRECONDITION_FAILED');
  const role=plan[0]!.databaseRole;
  const schemas=owners.filter(owner=>owner.databaseRole===role).map(owner=>owner.schemaName);
  const [actor]=await sql`SELECT current_user AS actor,session_user AS session,
    current_setting('server_version_num')::integer AS version,
    has_database_privilege(current_user,current_database(),'CREATE,TEMP') AS database_write`;
  if(actor?.actor!==role||actor.session!==role||Math.floor(actor.version/10000)!==databaseManifest.postgresMajor||actor.database_write)throw new CoreError('FORBIDDEN');
  const [identity]=await sql`SELECT oid,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit,rolcanlogin FROM pg_roles WHERE rolname=${role}`;
  if(!identity||!identity.rolcanlogin||identity.rolsuper||identity.rolcreatedb||identity.rolcreaterole||identity.rolreplication||identity.rolbypassrls||identity.rolinherit)throw new CoreError('FORBIDDEN');
  // Even NOINHERIT membership may permit SET ROLE; reject every outgoing membership.
  if((await sql`SELECT 1 FROM pg_auth_members WHERE member=${identity.oid}`).length)throw new CoreError('FORBIDDEN');
  // PostgreSQL 15+ can delegate SET/ALTER SYSTEM without granting a privileged role.
  // Explicit parameter grants (including PUBLIC) are outside a migration role's profile.
  const parameters=await sql`SELECT 1 FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
    WHERE a.grantee IN (0,${identity.oid}) AND a.privilege_type IN ('SET','ALTER SYSTEM') LIMIT 1`;
  const [configuration]=await sql`SELECT current_setting('session_replication_role') AS replication,
    current_setting('allow_system_table_mods') AS system_modifications`;
  if(parameters.length||configuration?.replication!=='origin'||configuration.system_modifications!=='off')throw new CoreError('FORBIDDEN');
  const namespaces=await sql`SELECT nspname,nspowner=${identity.oid} AS owned,
    has_schema_privilege(current_user,oid,'CREATE') AS writable FROM pg_namespace`;
  if(schemas.some(name=>!namespaces.some(n=>n.nspname===name&&n.owned&&n.writable))||namespaces.some(n=>!schemas.includes(n.nspname)&&(n.owned||n.writable)))throw new CoreError('FORBIDDEN');
  // Include column-only ACLs, sequences and grants inherited from PUBLIC.
  // PostgreSQL exposes session SET via the writable pg_settings view; it does not
  // grant catalog mutation. Session configuration must be controlled by the runner.
  const relations=await sql`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname<>ALL(${sql.array(schemas)})
      AND c.oid<>'pg_catalog.pg_settings'::regclass
      -- PostgreSQL owns the TOAST namespace; a Pack's text/array columns create
      -- internal relations there. Accept only catalog-linked storage of its own
      -- table, including that TOAST table's indexes, never arbitrary foreign objects.
      AND NOT (n.nspname='pg_toast' AND c.relowner=${identity.oid} AND EXISTS (
        SELECT 1 FROM pg_class parent JOIN pg_namespace pn ON pn.oid=parent.relnamespace
        WHERE parent.relowner=${identity.oid} AND pn.nspname=ANY(${sql.array(schemas)})
          AND parent.reltoastrelid<>0 AND (parent.reltoastrelid=c.oid OR EXISTS (
            SELECT 1 FROM pg_index ti WHERE ti.indexrelid=c.oid AND ti.indrelid=parent.reltoastrelid))))
      AND (c.relowner=${identity.oid} OR
        (c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES') OR
          (n.nspname NOT IN ('pg_catalog','information_schema') AND (has_table_privilege(current_user,c.oid,'SELECT') OR has_any_column_privilege(current_user,c.oid,'SELECT'))))) OR
        (c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))) LIMIT 1`;
  if(relations.length)throw new CoreError('FORBIDDEN');
  const routines=await sql`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname<>ALL(${sql.array(schemas)}) AND p.proowner=${identity.oid})
      OR (p.prosecdef AND has_function_privilege(current_user,p.oid,'EXECUTE')) LIMIT 1`;
  if(routines.length)throw new CoreError('FORBIDDEN');
}
