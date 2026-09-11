import type {PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';
export interface MigrationAclGrant {column:string|null;grantor:string;grantee:string;privilege:string;grantable:boolean}
export interface MigrationAclCheck {schema:string;name:string;kind:'r'|'p'|'v'|'m'|'f'|'S';grants:MigrationAclGrant[]}
const fields=(value:object,keys:string)=>{if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys)throw new CoreError('INVALID_ARGUMENT');};
const identifier=(value:unknown)=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=63&&!value.includes('\0');
const normalized=(grants:MigrationAclGrant[])=>grants.map(grant=>canonicalJson(grant)).sort();
/** Exact direct object/column ACL inspection. Expands PostgreSQL default owner
 * privileges when relacl is NULL; includes PUBLIC, grantor and grant option. Does
 * not infer effective permissions through membership, superuser, RLS or functions.
 * Caller binds actual database/current ownership and governed expectations.
 */
export async function verifyMigrationAcl(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,checks:readonly MigrationAclCheck[],options:TransactionOptions){
 const owners=validatePackSchemaOwnership(ownership),expected=JSON.parse(canonicalJson(checks)) as MigrationAclCheck[],limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(!Array.isArray(expected)||!expected.length||expected.length>100)throw new CoreError('INVALID_ARGUMENT');
 const roles=new Set<string>(),names=new Set<string>();
 for(const check of expected){
  fields(check,'grants,kind,name,schema');if(!identifier(check.name)||!['r','p','v','m','f','S'].includes(check.kind)||!Array.isArray(check.grants)||check.grants.length>10000)throw new CoreError('INVALID_ARGUMENT');
  const owner=owners.find(owner=>owner.packId===packId&&owner.schemaName===check.schema);if(!owner)throw new CoreError('FORBIDDEN');roles.add(owner.databaseRole);
  const key=canonicalJson([check.schema,check.name]);if(names.has(key))throw new CoreError('INVALID_ARGUMENT');names.add(key);
  for(const grant of check.grants){fields(grant,'column,grantable,grantee,grantor,privilege');if(grant.column!==null&&!identifier(grant.column)||!identifier(grant.grantor)||!identifier(grant.grantee)||!['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','USAGE'].includes(grant.privilege)||typeof grant.grantable!=='boolean')throw new CoreError('INVALID_ARGUMENT');}
  if(new Set(normalized(check.grants)).size!==check.grants.length)throw new CoreError('INVALID_ARGUMENT');
 }
 const [session]=await sql`SELECT session_user AS session,current_user AS actor,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::integer AS version`;
 if(roles.size!==1||!session||!roles.has(session.session)||session.actor!==session.session||session.read_only!=='on'||session.isolation!=='repeatable read'||Math.floor(session.version/10000)!==16)throw new CoreError('FORBIDDEN');
 await sql`SELECT set_config('search_path','pg_catalog',true),set_config('statement_timeout',${String(Math.min(10000,Math.max(1,limits.deadline-Date.now())))},true)`;
 const results=[];
 for(const check of expected){
  active();const [schema]=await sql`SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=${check.schema}`;
  if(!schema||schema.owner!==session.session)throw new CoreError('FORBIDDEN');
  const [relation]=await sql`SELECT c.oid,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${check.schema} AND c.relname=${check.name}`;
  if(!relation||relation.kind!==check.kind)throw new CoreError('PRECONDITION_FAILED');
  const rows=await sql`WITH grants AS (
   SELECT NULL::text AS column,a.* FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE c.oid=${relation.oid}
   UNION ALL SELECT att.attname::text AS column,a.* FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE att.attrelid=${relation.oid} AND att.attnum>0 AND NOT att.attisdropped
  ) SELECT g.column,r.rolname AS grantor,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE gr.rolname::text END AS grantee,g.privilege_type AS privilege,g.is_grantable AS grantable FROM grants g JOIN pg_roles r ON r.oid=g.grantor LEFT JOIN pg_roles gr ON gr.oid=g.grantee LIMIT 10001`;
  if(rows.length>10000)throw new CoreError('LIMIT_EXCEEDED');
  const actual:MigrationAclGrant[]=rows.map(row=>({column:row.column,grantor:row.grantor,grantee:row.grantee,privilege:row.privilege,grantable:row.grantable}));
  const wanted=normalized(check.grants),found=normalized(actual),wantedSet=new Set(wanted),foundSet=new Set(found);
  results.push({schema:check.schema,name:check.name,kind:check.kind,actual:found.map(value=>JSON.parse(value) as MigrationAclGrant),missing:wanted.filter(value=>!foundSet.has(value)).map(value=>JSON.parse(value) as MigrationAclGrant),unexpected:found.filter(value=>!wantedSet.has(value)).map(value=>JSON.parse(value) as MigrationAclGrant)});
 }
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(expected)));active();return {matched:results.every(result=>!result.missing.length&&!result.unexpected.length),expectedDigest,results};
}
