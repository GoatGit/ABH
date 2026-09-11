import {readMigrationTriggers} from './migration-triggers.ts';
import type {PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';
import type {MigrationTableShape} from './verify-migration-tables.ts';
export interface MigrationViewShape {
 schema:string;name:string;owner:string;kind:'v'|'m';definition:string;options:string[];populated:boolean;
 indexes:MigrationTableShape['indexes'];
 triggers:MigrationTableShape['triggers'];
 rules:Array<{name:string;definition:string;enabled:string}>;
 columns:Array<{name:string;typeSchema:string;typeName:string;typeModifier:number}>;
}
export interface MigrationViewCheck {schema:string;name:string;expected:MigrationViewShape|null}
const fields=(value:object,keys:string)=>{if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys)throw new CoreError('INVALID_ARGUMENT');};
const name=(value:unknown)=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=63&&!value.includes('\0');
/** Catalog-only view definition checks on a dedicated read-only REPEATABLE READ
 * transaction. Does not execute view expressions or refresh materialized data.
 * Dependency behavior, ACLs and actual
 * data correctness require additional verification before migration completion.
 */
export async function verifyMigrationViews(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,checks:readonly MigrationViewCheck[],options:TransactionOptions){
 const owners=validatePackSchemaOwnership(ownership),expected=JSON.parse(canonicalJson(checks)) as MigrationViewCheck[],limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(Buffer.byteLength(canonicalJson(expected))>1048576)throw new CoreError('LIMIT_EXCEEDED');
 if(!Array.isArray(expected)||!expected.length||expected.length>100)throw new CoreError('INVALID_ARGUMENT');
 const roles=new Set<string>(),names=new Set<string>();
 for(const check of expected){
  fields(check,'expected,name,schema');if(!name(check.name))throw new CoreError('INVALID_ARGUMENT');
  const owner=owners.find(item=>item.packId===packId&&item.schemaName===check.schema);if(!owner)throw new CoreError('FORBIDDEN');roles.add(owner.databaseRole);
  const key=canonicalJson([check.schema,check.name]);if(names.has(key))throw new CoreError('INVALID_ARGUMENT');names.add(key);
  const shape=check.expected;if(shape===null)continue;
  fields(shape,'columns,definition,indexes,kind,name,options,owner,populated,rules,schema,triggers');
  if(shape.schema!==check.schema||shape.name!==check.name||shape.owner!==owner.databaseRole||!['v','m'].includes(shape.kind)||typeof shape.definition!=='string'||typeof shape.populated!=='boolean'||!Array.isArray(shape.options)||shape.options.length>100||shape.options.some(option=>typeof option!=='string')||new Set(shape.options).size!==shape.options.length||!Array.isArray(shape.columns)||shape.columns.length>1600)throw new CoreError('INVALID_ARGUMENT');
  if(!Array.isArray(shape.rules)||shape.rules.length>1000||!Array.isArray(shape.indexes)||shape.indexes.length>1000)throw new CoreError('INVALID_ARGUMENT');
  if(!Array.isArray(shape.triggers)||shape.triggers.length>1000||new Set(shape.triggers.map(trigger=>trigger.name)).size!==shape.triggers.length)throw new CoreError('INVALID_ARGUMENT');
  for(const trigger of shape.triggers){fields(trigger,'definition,enabled,functionDigest,name');if(!name(trigger.name)||typeof trigger.definition!=='string'||!['O','D','R','A'].includes(trigger.enabled)||!/^sha256:[0-9a-f]{64}$/.test(trigger.functionDigest))throw new CoreError('INVALID_ARGUMENT');}
  for(const rule of shape.rules){fields(rule,'definition,enabled,name');if(!name(rule.name)||typeof rule.definition!=='string'||!['O','D','R','A'].includes(rule.enabled))throw new CoreError('INVALID_ARGUMENT');}
  for(const index of shape.indexes){fields(index,'definition,live,name,primary,ready,replicaIdentity,unique,valid');if(!name(index.name)||typeof index.definition!=='string'||[index.live,index.primary,index.ready,index.replicaIdentity,index.unique,index.valid].some(value=>typeof value!=='boolean'))throw new CoreError('INVALID_ARGUMENT');}
  if(new Set(shape.rules.map(rule=>rule.name)).size!==shape.rules.length||new Set(shape.indexes.map(index=>index.name)).size!==shape.indexes.length)throw new CoreError('INVALID_ARGUMENT');
  for(const column of shape.columns){fields(column,'name,typeModifier,typeName,typeSchema');if(![column.name,column.typeSchema,column.typeName].every(name)||!Number.isInteger(column.typeModifier))throw new CoreError('INVALID_ARGUMENT');}
  if(new Set(shape.columns.map(column=>column.name)).size!==shape.columns.length)throw new CoreError('INVALID_ARGUMENT');
 }
 const [session]=await sql`SELECT session_user AS session,current_user AS actor,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::integer AS version`;
 if(roles.size!==1||!session||!roles.has(session.session)||session.actor!==session.session||session.read_only!=='on'||session.isolation!=='repeatable read'||Math.floor(session.version/10000)!==16)throw new CoreError('FORBIDDEN');
 await sql`SELECT set_config('search_path','pg_catalog',true),set_config('statement_timeout',${String(Math.min(10000,Math.max(1,limits.deadline-Date.now())))},true)`;
 const results:Array<{schema:string;name:string;actual:MigrationViewShape|null;differences:string[]}>=[];
 for(const check of expected){
  active();
  const [schema]=await sql`SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=${check.schema}`;
  if(!schema||schema.owner!==session.session)throw new CoreError('FORBIDDEN');
  const [row]=await sql`SELECT c.oid,c.relkind AS kind,r.rolname AS owner,c.relispopulated AS populated,c.reloptions AS options FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname=${check.schema} AND c.relname=${check.name}`;
  let actual:MigrationViewShape|null=null;
  if(row){
   if(!['v','m'].includes(row.kind))throw new CoreError('PRECONDITION_FAILED');
   const [view]=await sql`SELECT pg_get_viewdef(${row.oid}::oid,false) AS definition`;
   const columns=await sql`SELECT a.attname AS name,n.nspname AS type_schema,t.typname AS type_name,a.atttypmod AS type_modifier FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE a.attrelid=${row.oid} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1601`;
   const rules=await sql`SELECT rulename AS name,pg_get_ruledef(oid,false) AS definition,ev_enabled AS enabled FROM pg_rewrite WHERE ev_class=${row.oid} AND rulename<>'_RETURN' ORDER BY rulename COLLATE "C" LIMIT 1001`;
   const indexes=await sql`SELECT c.relname AS name,pg_get_indexdef(i.indexrelid,0,false) AS definition,i.indisvalid AS valid,i.indisready AS ready,i.indislive AS live,i.indisunique AS unique,i.indisprimary AS primary,i.indisreplident AS replica_identity FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=${row.oid} ORDER BY c.relname COLLATE "C" LIMIT 1001`;
   if(rules.length>1000||indexes.length>1000)throw new CoreError('LIMIT_EXCEEDED');
   if(columns.length>1600||(row.options?.length??0)>100)throw new CoreError('LIMIT_EXCEEDED');
   const triggers=await readMigrationTriggers(sql,row.oid);
   actual={triggers,rules:rules.map(rule=>({name:rule.name,definition:rule.definition,enabled:rule.enabled})),indexes:indexes.map(index=>({name:index.name,definition:index.definition,valid:index.valid,ready:index.ready,live:index.live,unique:index.unique,primary:index.primary,replicaIdentity:index.replica_identity})),schema:check.schema,name:check.name,owner:row.owner,kind:row.kind,definition:view!.definition,options:(row.options??[]).sort(),populated:row.populated,columns:columns.map(column=>({name:column.name,typeSchema:column.type_schema,typeName:column.type_name,typeModifier:column.type_modifier}))};
  }
  const differences:string[]=[];
  if(actual===null||check.expected===null){if(actual!==check.expected)differences.push('existence');}
  else for(const field of ['owner','kind','definition','options','populated','columns','rules','indexes','triggers'] as const){const wanted=field==='options'?[...check.expected.options].sort():check.expected[field];if(canonicalJson(actual[field])!==canonicalJson(wanted))differences.push(field);}
  results.push({schema:check.schema,name:check.name,actual,differences});
 }
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(expected)));active();return {matched:results.every(result=>!result.differences.length),expectedDigest,results};
}
