import type {PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';
export interface MigrationDataCheck {schema:string;table:string;rowCount:string;nonNull:string[];uniqueKeys:string[][]}
const fields=(value:object,keys:string)=>{if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys)throw new CoreError('INVALID_ARGUMENT');};
const identifier=(value:unknown)=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(value);
// Only previously validated identifiers enter SQL syntax. No caller expressions,
// predicates or SQL strings are accepted by this fixed invariant vocabulary.
const quote=(value:string)=>{if(!identifier(value))throw new CoreError('INVALID_ARGUMENT');return '"'+value+'"';};
const query=(sql:Query,text:string)=>{const parts=Object.assign([text],{raw:[text]});return sql(parts as unknown as TemplateStringsArray);};
/** Actual data invariants for named ordinary, non-inherited Pack tables. The
 * dedicated owner must see all rows: row_security=off causes FORCE RLS to fail,
 * never interprets a policy-filtered subset as the whole table. NULL key values
 * compare as equal for uniqueness; use nonNull to require complete keys too.
 * Caller governs expectations and database/ownership binding. This is not complete
 * domain verification, partition support, result persistence or Enable authority.
 */
export async function verifyMigrationData(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,checks:readonly MigrationDataCheck[],options:TransactionOptions){
 const owners=validatePackSchemaOwnership(ownership),expected=JSON.parse(canonicalJson(checks)) as MigrationDataCheck[],limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(!Array.isArray(expected)||!expected.length||expected.length>100)throw new CoreError('INVALID_ARGUMENT');
 const names=new Set<string>(),roles=new Set<string>();
 for(const check of expected){
  fields(check,'nonNull,rowCount,schema,table,uniqueKeys');
  if(!identifier(check.table)||typeof check.rowCount!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(check.rowCount)||BigInt(check.rowCount)>9223372036854775807n||!Array.isArray(check.nonNull)||check.nonNull.length>100||check.nonNull.some(column=>!identifier(column))||new Set(check.nonNull).size!==check.nonNull.length||!Array.isArray(check.uniqueKeys)||check.uniqueKeys.length>20)throw new CoreError('INVALID_ARGUMENT');
  for(const key of check.uniqueKeys)if(!Array.isArray(key)||!key.length||key.length>16||key.some(column=>!identifier(column))||new Set(key).size!==key.length)throw new CoreError('INVALID_ARGUMENT');
  if(new Set(check.uniqueKeys.map(key=>canonicalJson([...key].sort()))).size!==check.uniqueKeys.length)throw new CoreError('INVALID_ARGUMENT');
  const owner=owners.find(owner=>owner.packId===packId&&owner.schemaName===check.schema);if(!owner)throw new CoreError('FORBIDDEN');roles.add(owner.databaseRole);
  const name=canonicalJson([check.schema,check.table]);if(names.has(name))throw new CoreError('INVALID_ARGUMENT');names.add(name);
 }
 const [session]=await sql`SELECT session_user AS session,current_user AS actor,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::integer AS version,r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user`;
 if(roles.size!==1||!session||!roles.has(session.session)||session.actor!==session.session||session.rolsuper||session.rolbypassrls||session.read_only!=='on'||session.isolation!=='repeatable read'||Math.floor(session.version/10000)!==16)throw new CoreError('FORBIDDEN');
 await sql`SELECT set_config('search_path','pg_catalog',true),set_config('row_security','off',true)`;
 const results=[];
 for(const check of expected){
  active();await sql`SELECT set_config('statement_timeout',${String(Math.min(10000,Math.max(1,limits.deadline-Date.now())))},true)`;
  const relation=quote(check.schema)+'.'+quote(check.table);
  // Hold identity/DDL stable before reading catalog facts and retain the lock to
  // transaction end. ACCESS SHARE permits ordinary writes; REPEATABLE READ fixes
  // the data snapshot while preventing DROP/ALTER from replacing the inspected table.
  await query(sql,`LOCK TABLE ONLY ${relation} IN ACCESS SHARE MODE`);active();
  const [resolved]=await query(sql,`SELECT '${relation}'::regclass::oid AS oid`);
  const [table]=await sql`SELECT c.oid,c.relkind,r.rolname AS owner,s.rolname AS schema_owner,c.relrowsecurity AND c.relforcerowsecurity AS forced FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner JOIN pg_roles s ON s.oid=n.nspowner WHERE n.nspname=${check.schema} AND c.relname=${check.table}`;
  if(!table||table.oid!==resolved!.oid||table.relkind!=='r')throw new CoreError('PRECONDITION_FAILED');
  if(table.owner!==session.session||table.schema_owner!==session.session||table.forced)throw new CoreError('FORBIDDEN');
  if((await sql`SELECT 1 FROM pg_inherits WHERE inhparent=${table.oid} OR inhrelid=${table.oid} LIMIT 1`).length)throw new CoreError('PRECONDITION_FAILED');
  const columns=await sql`SELECT attname FROM pg_attribute WHERE attrelid=${table.oid} AND attnum>0 AND NOT attisdropped`;
  if([...check.nonNull,...check.uniqueKeys.flat()].some(column=>!columns.some(row=>row.attname===column)))throw new CoreError('PRECONDITION_FAILED');
  const [count]=await query(sql,`SELECT count(*)::text AS count FROM ONLY ${relation}`);active();
  const nulls=[];for(const column of check.nonNull){const [row]=await query(sql,`SELECT count(*)::text AS count FROM ONLY ${relation} WHERE ${quote(column)} IS NULL`);active();nulls.push({column,count:row!.count as string});}
  const duplicates=[];for(const key of check.uniqueKeys){const [row]=await query(sql,`SELECT count(*)::text AS count FROM (SELECT 1 FROM ONLY ${relation} GROUP BY ${key.map(quote).join(',')} HAVING count(*)>1) duplicate_groups`);active();duplicates.push({columns:[...key],groups:row!.count as string});}
  results.push({schema:check.schema,table:check.table,rowCount:count!.count as string,nulls,duplicates,matched:count!.count===check.rowCount&&nulls.every(item=>item.count==='0')&&duplicates.every(item=>item.groups==='0')});
 }
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(expected)));active();return {matched:results.every(result=>result.matched),expectedDigest,results};
}
