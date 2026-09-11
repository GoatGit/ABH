import {readMigrationTriggers} from './migration-triggers.ts';
import type {Digest,PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';

export interface MigrationTableShape {
 schema:string;name:string;owner:string;kind:'r'|'p';rls:boolean;forceRls:boolean;
 partition:{key:string|null;bound:string|null;parents:Array<{schema:string;name:string;detachPending:boolean}>};
 columns:Array<{name:string;typeSchema:string;typeName:string;typeModifier:number;notNull:boolean;identity:string;generated:string;defaultExpression:string|null}>;
 indexes:Array<{name:string;definition:string;valid:boolean;ready:boolean;live:boolean;unique:boolean;primary:boolean;replicaIdentity:boolean}>;
 policies:Array<{name:string;command:string;permissive:boolean;roles:string[];using:string|null;check:string|null}>;
 triggers:Array<{name:string;definition:string;enabled:string;functionDigest:Digest}>;
 constraints:Array<{name:string;type:string;definition:string;validated:boolean;deferrable:boolean;initiallyDeferred:boolean}>;
}
export interface MigrationTableCheck {schema:string;name:string;expected:MigrationTableShape|null}
function fields(value:object,names:string[]){
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==names.sort().join(','))throw new CoreError('INVALID_ARGUMENT');
}
function validateShape(shape:MigrationTableShape){
 fields(shape,['schema','name','owner','kind','rls','forceRls','columns','constraints','indexes','policies','triggers','partition']);
 fields(shape.partition,['key','bound','parents']);
 if([shape.partition.key,shape.partition.bound].some(value=>value!==null&&typeof value!=='string')||!Array.isArray(shape.partition.parents)||shape.partition.parents.length>100)throw new CoreError('INVALID_ARGUMENT');
 for(const parent of shape.partition.parents){fields(parent,['schema','name','detachPending']);if(typeof parent.schema!=='string'||typeof parent.name!=='string'||typeof parent.detachPending!=='boolean')throw new CoreError('INVALID_ARGUMENT');}
 if(new Set(shape.partition.parents.map(parent=>canonicalJson([parent.schema,parent.name]))).size!==shape.partition.parents.length)throw new CoreError('INVALID_ARGUMENT');
 if(!['r','p'].includes(shape.kind)||typeof shape.rls!=='boolean'||typeof shape.forceRls!=='boolean')throw new CoreError('INVALID_ARGUMENT');
 if(!Array.isArray(shape.indexes)||shape.indexes.length>1000||!Array.isArray(shape.policies)||shape.policies.length>1000)throw new CoreError('INVALID_ARGUMENT');
 if(!Array.isArray(shape.triggers)||shape.triggers.length>1000||new Set(shape.triggers.map(t=>t.name)).size!==shape.triggers.length)throw new CoreError('INVALID_ARGUMENT');
 for(const trigger of shape.triggers){
  fields(trigger,['name','definition','enabled','functionDigest']);
  if(typeof trigger.name!=='string'||typeof trigger.definition!=='string'||!['O','D','R','A'].includes(trigger.enabled)||!/^sha256:[0-9a-f]{64}$/.test(trigger.functionDigest))throw new CoreError('INVALID_ARGUMENT');
 }
 for(const index of shape.indexes){
  fields(index,['name','definition','valid','ready','live','unique','primary','replicaIdentity']);
  if(typeof index.name!=='string'||typeof index.definition!=='string'||[index.valid,index.ready,index.live,index.unique,index.primary,index.replicaIdentity].some(value=>typeof value!=='boolean'))throw new CoreError('INVALID_ARGUMENT');
 }
 for(const policy of shape.policies){
  fields(policy,['name','command','permissive','roles','using','check']);
  if(typeof policy.name!=='string'||!['*','r','a','w','d'].includes(policy.command)||typeof policy.permissive!=='boolean'||!Array.isArray(policy.roles)||!policy.roles.length||policy.roles.length>1000||policy.roles.some(role=>typeof role!=='string')||new Set(policy.roles).size!==policy.roles.length||[policy.using,policy.check].some(value=>value!==null&&typeof value!=='string'))throw new CoreError('INVALID_ARGUMENT');
 }
 if(new Set(shape.indexes.map(i=>i.name)).size!==shape.indexes.length||new Set(shape.policies.map(p=>p.name)).size!==shape.policies.length)throw new CoreError('INVALID_ARGUMENT');
 for(const column of shape.columns){
  fields(column,['name','typeSchema','typeName','typeModifier','notNull','identity','generated','defaultExpression']);
  if(typeof column.name!=='string'||typeof column.typeSchema!=='string'||typeof column.typeName!=='string'||!Number.isInteger(column.typeModifier)||typeof column.notNull!=='boolean'||!['','a','d'].includes(column.identity)||!['','s'].includes(column.generated)||column.defaultExpression!==null&&typeof column.defaultExpression!=='string')throw new CoreError('INVALID_ARGUMENT');
 }
 for(const constraint of shape.constraints){
  fields(constraint,['name','type','definition','validated','deferrable','initiallyDeferred']);
  if(typeof constraint.name!=='string'||typeof constraint.type!=='string'||typeof constraint.definition!=='string'||typeof constraint.validated!=='boolean'||typeof constraint.deferrable!=='boolean'||typeof constraint.initiallyDeferred!=='boolean')throw new CoreError('INVALID_ARGUMENT');
 }
 if(new Set(shape.columns.map(c=>c.name)).size!==shape.columns.length||new Set(shape.constraints.map(c=>c.name)).size!==shape.constraints.length)throw new CoreError('INVALID_ARGUMENT');
}
/** Actual PostgreSQL structural result check, using a caller-owned read-only
 * REPEATABLE READ transaction on the directly authenticated Pack role. The host
 * must verify live database binding/current persistent ownership and govern the
 * expected plan separately. Checks only named ordinary/partitioned tables: it is
 * not data verification, whole-schema inventory or Enable.
 */
export async function verifyMigrationTables(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,checks:readonly MigrationTableCheck[],options:TransactionOptions){
 const owners=validatePackSchemaOwnership(ownership),expected=JSON.parse(canonicalJson(checks)) as MigrationTableCheck[],limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
 active();
 if(Buffer.byteLength(canonicalJson(expected))>1048576)throw new CoreError('LIMIT_EXCEEDED');
 if(!Array.isArray(expected)||!expected.length||expected.length>100)throw new CoreError('INVALID_ARGUMENT');
 const names=new Set<string>(),roles=new Set<string>();
 for(const check of expected){
  if(!check||Object.keys(check).sort().join(',')!=='expected,name,schema'||!/^[a-z][a-z0-9_]{0,62}$/.test(check.name))throw new CoreError('INVALID_ARGUMENT');
  const owner=owners.find(item=>item.schemaName===check.schema&&item.packId===packId);
  if(!owner)throw new CoreError('FORBIDDEN');roles.add(owner.databaseRole);
  const key=canonicalJson([check.schema,check.name]);if(names.has(key))throw new CoreError('INVALID_ARGUMENT');names.add(key);
  if(check.expected!==null&&(check.expected.schema!==check.schema||check.expected.name!==check.name||check.expected.owner!==owner.databaseRole||!Array.isArray(check.expected.columns)||check.expected.columns.length>1600||!Array.isArray(check.expected.constraints)||check.expected.constraints.length>1000))throw new CoreError('INVALID_ARGUMENT');
  if(check.expected!==null)validateShape(check.expected);
 }
 const [session]=await sql`SELECT session_user AS session,current_user AS actor,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::integer AS version`;
 if(roles.size!==1||!session||!roles.has(session.session)||session.actor!==session.session||session.read_only!=='on'||session.isolation!=='repeatable read'||Math.floor(session.version/10000)!==16)throw new CoreError('FORBIDDEN');
 // Stable deparsed expressions, independent of the caller's search_path. This is
 // transaction-local session configuration, never execution of expected strings.
 await sql`SELECT set_config('search_path','pg_catalog',true),set_config('statement_timeout',${String(Math.min(10000,Math.max(1,limits.deadline-Date.now())))},true)`;
 const results:Array<{schema:string;name:string;actual:MigrationTableShape|null;differences:string[]}>=[];
 for(const check of expected){
  active();
  const [schema]=await sql`SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=${check.schema}`;
  if(!schema||schema.owner!==session.session)throw new CoreError('FORBIDDEN');
  const [table]=await sql`SELECT c.oid,c.relkind AS kind,r.rolname AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,pg_get_partkeydef(c.oid) AS partition_key,pg_get_expr(c.relpartbound,c.oid,false) AS partition_bound
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
    WHERE n.nspname=${check.schema} AND c.relname=${check.name}`;
  let actual:MigrationTableShape|null=null;
  if(table){
   if(!['r','p'].includes(table.kind))throw new CoreError('PRECONDITION_FAILED');
   const parents=await sql`SELECT n.nspname AS schema,c.relname AS name,i.inhdetachpending AS detach_pending FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhparent JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE i.inhrelid=${table.oid} ORDER BY i.inhseqno LIMIT 101`;
   if(parents.length>100)throw new CoreError('LIMIT_EXCEEDED');
   const columns=await sql`SELECT a.attname AS name,n.nspname AS type_schema,t.typname AS type_name,a.atttypmod AS type_modifier,a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=t.typnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=${table.oid} AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1601`;
   const constraints=await sql`SELECT conname AS name,contype AS type,pg_get_constraintdef(oid,false) AS definition,convalidated AS validated,condeferrable AS deferrable,condeferred AS initially_deferred
    FROM pg_constraint WHERE conrelid=${table.oid} ORDER BY conname COLLATE "C" LIMIT 1001`;
   const indexes=await sql`SELECT c.relname AS name,pg_get_indexdef(i.indexrelid,0,false) AS definition,i.indisvalid AS valid,i.indisready AS ready,i.indislive AS live,i.indisunique AS unique,i.indisprimary AS primary,i.indisreplident AS replica_identity
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=${table.oid} ORDER BY c.relname COLLATE "C" LIMIT 1001`;
   const policies=await sql`SELECT p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,
    ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE r.rolname::text END FROM unnest(p.polroles) AS role_id LEFT JOIN pg_roles r ON r.oid=role_id ORDER BY (CASE WHEN role_id=0 THEN 'PUBLIC' ELSE r.rolname::text END) COLLATE "C") AS roles,
    pg_get_expr(p.polqual,p.polrelid,false) AS using,pg_get_expr(p.polwithcheck,p.polrelid,false) AS check
    FROM pg_policy p WHERE p.polrelid=${table.oid} ORDER BY p.polname COLLATE "C" LIMIT 1001`;
   const triggers=await readMigrationTriggers(sql,table.oid);
   if(columns.length>1600||constraints.length>1000||indexes.length>1000||policies.length>1000||triggers.length>1000)throw new CoreError('LIMIT_EXCEEDED');
   if(policies.some(policy=>policy.roles.length>1000))throw new CoreError('LIMIT_EXCEEDED');
   if(policies.some(policy=>policy.roles.some((role:unknown)=>typeof role!=='string')))throw new CoreError('PRECONDITION_FAILED');
   actual={schema:check.schema,name:check.name,owner:table.owner,kind:table.kind,rls:table.rls,forceRls:table.force_rls,
    partition:{key:table.partition_key,bound:table.partition_bound,parents:parents.map(parent=>({schema:parent.schema,name:parent.name,detachPending:parent.detach_pending}))},
    triggers,
    indexes:indexes.map(i=>({name:i.name,definition:i.definition,valid:i.valid,ready:i.ready,live:i.live,unique:i.unique,primary:i.primary,replicaIdentity:i.replica_identity})),
    policies:policies.map(p=>({name:p.name,command:p.command,permissive:p.permissive,roles:p.roles,using:p.using,check:p.check})),
    columns:columns.map(column=>({name:column.name,typeSchema:column.type_schema,typeName:column.type_name,typeModifier:column.type_modifier,notNull:column.not_null,identity:column.identity,generated:column.generated,defaultExpression:column.default_expression})),
    constraints:constraints.map(item=>({name:item.name,type:item.type,definition:item.definition,validated:item.validated,deferrable:item.deferrable,initiallyDeferred:item.initially_deferred}))};
  }
  const differences:string[]=[];
  if(actual===null||check.expected===null){if(actual!==check.expected)differences.push('existence');}
  else for(const field of ['owner','kind','rls','forceRls','columns','constraints','indexes','policies','triggers','partition'] as const)if(canonicalJson(actual[field])!==canonicalJson(check.expected[field]))differences.push(field);
  results.push({schema:check.schema,name:check.name,actual,differences});
 }
 active();
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(expected)));active();
 return {matched:results.every(result=>!result.differences.length),expectedDigest,results};
}
