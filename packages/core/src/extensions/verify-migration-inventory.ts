import type {PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';
export interface MigrationSchemaInventory {
 schema:string;
 relations:Array<{name:string;kind:'r'|'p'|'v'|'m'|'f'|'S'}>;
}
/** Exact named relation inventory in explicitly selected owned schemas. Run in
 * the same read-only repeatable-read transaction as detailed table checks. Includes
 * partition leaves, views, materialized/foreign tables and sequences. Indexes and
 * TOAST are covered elsewhere; this is not a complete function/type/ACL inventory.
 */
export async function verifyMigrationInventory(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,inventory:readonly MigrationSchemaInventory[],options:TransactionOptions){
 const owners=validatePackSchemaOwnership(ownership),expected=JSON.parse(canonicalJson(inventory)) as MigrationSchemaInventory[],limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(!Array.isArray(expected)||!expected.length||expected.length>100||Buffer.byteLength(canonicalJson(expected))>1048576)throw new CoreError('LIMIT_EXCEEDED');
 const schemas=new Set<string>(),roles=new Set<string>();
 for(const item of expected){
  if(!item||Object.keys(item).sort().join(',')!=='relations,schema'||!Array.isArray(item.relations)||item.relations.length>10000||schemas.has(item.schema))throw new CoreError('INVALID_ARGUMENT');
  schemas.add(item.schema);const owner=owners.find(owner=>owner.packId===packId&&owner.schemaName===item.schema);if(!owner)throw new CoreError('FORBIDDEN');roles.add(owner.databaseRole);
  const names=new Set<string>();
  for(const relation of item.relations){
   if(!relation||Object.keys(relation).sort().join(',')!=='kind,name'||typeof relation.name!=='string'||!relation.name.length||Buffer.byteLength(relation.name)>63||relation.name.includes('\0')||!['r','p','v','m','f','S'].includes(relation.kind)||names.has(relation.name))throw new CoreError('INVALID_ARGUMENT');
   names.add(relation.name);
  }
 }
 const [session]=await sql`SELECT session_user AS session,current_user AS actor,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::integer AS version`;
 if(roles.size!==1||!session||!roles.has(session.session)||session.actor!==session.session||session.read_only!=='on'||session.isolation!=='repeatable read'||Math.floor(session.version/10000)!==16)throw new CoreError('FORBIDDEN');
 await sql`SELECT set_config('statement_timeout',${String(Math.min(10000,Math.max(1,limits.deadline-Date.now())))},true)`;
 const results=[];
 for(const item of expected){
  active();
  const [schema]=await sql`SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=${item.schema}`;
  if(!schema||schema.owner!==session.session)throw new CoreError('FORBIDDEN');
  const rows=await sql`SELECT c.relname AS name,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${item.schema} AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname COLLATE "C" LIMIT 10001`;
  if(rows.length>10000)throw new CoreError('LIMIT_EXCEEDED');
  const actual=rows.map(row=>({name:row.name as string,kind:row.kind as MigrationSchemaInventory['relations'][number]['kind']}));
  const byName=new Map(actual.map(row=>[row.name,row.kind])),wanted=new Map(item.relations.map(row=>[row.name,row.kind]));
  const missing=item.relations.filter(row=>!byName.has(row.name)).map(row=>({...row}));
  const unexpected=actual.filter(row=>!wanted.has(row.name));
  const changed=actual.filter(row=>wanted.has(row.name)&&wanted.get(row.name)!==row.kind).map(row=>({name:row.name,expectedKind:wanted.get(row.name)!,actualKind:row.kind}));
  results.push({schema:item.schema,actual,missing,unexpected,changed});
 }
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(expected)));active();
 return {matched:results.every(result=>!result.missing.length&&!result.unexpected.length&&!result.changed.length),expectedDigest,results};
}
