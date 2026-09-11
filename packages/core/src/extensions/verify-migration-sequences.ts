import type {PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackSchemaOwnership} from './pack-migration-plan.ts';

export interface MigrationSequenceShape {
 schema:string;name:string;owner:string;typeSchema:string;typeName:'int2'|'int4'|'int8';
 start:string;increment:string;minimum:string;maximum:string;cache:string;cycle:boolean;
 ownedBy:{schema:string;table:string;column:string;dependency:'a'|'i'}|null;
}
export interface MigrationSequenceCheck {schema:string;name:string;expected:MigrationSequenceShape|null}
const fields=(value:object,names:string)=>{if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==names)throw new CoreError('INVALID_ARGUMENT');};
const identifier=(value:unknown)=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=63&&!value.includes('\0');
/** Catalog-only sequence definition verification. Decimal strings preserve int8
 * precision. Never reads/advances last_value or treats runtime counters as DDL.
 * Caller binds the database, current ownership and governed expectation; this is
 * not data verification or Enable authorization.
 */
export async function verifyMigrationSequences(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,checks:readonly MigrationSequenceCheck[],options:TransactionOptions){
 const owners=validatePackSchemaOwnership(ownership),expected=JSON.parse(canonicalJson(checks)) as MigrationSequenceCheck[],limits={...options};
 const active=()=>{if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(Buffer.byteLength(canonicalJson(expected))>1048576)throw new CoreError('LIMIT_EXCEEDED');
 if(!Array.isArray(expected)||!expected.length||expected.length>100)throw new CoreError('INVALID_ARGUMENT');
 const names=new Set<string>(),roles=new Set<string>();
 for(const check of expected){
  fields(check,'expected,name,schema');if(!identifier(check.name))throw new CoreError('INVALID_ARGUMENT');
  const owner=owners.find(item=>item.packId===packId&&item.schemaName===check.schema);if(!owner)throw new CoreError('FORBIDDEN');roles.add(owner.databaseRole);
  const key=canonicalJson([check.schema,check.name]);if(names.has(key))throw new CoreError('INVALID_ARGUMENT');names.add(key);
  const s=check.expected;if(s===null)continue;
  fields(s,'cache,cycle,increment,maximum,minimum,name,ownedBy,owner,schema,start,typeName,typeSchema');
  if(s.schema!==check.schema||s.name!==check.name||s.owner!==owner.databaseRole||s.typeSchema!=='pg_catalog'||!['int2','int4','int8'].includes(s.typeName)||typeof s.cycle!=='boolean')throw new CoreError('INVALID_ARGUMENT');
  for(const value of [s.start,s.increment,s.minimum,s.maximum,s.cache])if(typeof value!=='string'||! /^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value)||value.length>20||BigInt(value)<-9223372036854775808n||BigInt(value)>9223372036854775807n)throw new CoreError('INVALID_ARGUMENT');
  if(BigInt(s.increment)===0n||BigInt(s.cache)<=0n||BigInt(s.minimum)>=BigInt(s.maximum)||BigInt(s.start)<BigInt(s.minimum)||BigInt(s.start)>BigInt(s.maximum))throw new CoreError('INVALID_ARGUMENT');
  if(s.ownedBy!==null){fields(s.ownedBy,'column,dependency,schema,table');if(![s.ownedBy.schema,s.ownedBy.table,s.ownedBy.column].every(identifier)||!['a','i'].includes(s.ownedBy.dependency))throw new CoreError('INVALID_ARGUMENT');}
 }
 const [session]=await sql`SELECT session_user AS session,current_user AS actor,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,current_setting('server_version_num')::integer AS version`;
 if(roles.size!==1||!session||!roles.has(session.session)||session.actor!==session.session||session.read_only!=='on'||session.isolation!=='repeatable read'||Math.floor(session.version/10000)!==16)throw new CoreError('FORBIDDEN');
 await sql`SELECT set_config('search_path','pg_catalog',true),set_config('statement_timeout',${String(Math.min(10000,Math.max(1,limits.deadline-Date.now())))},true)`;
 const results:Array<{schema:string;name:string;actual:MigrationSequenceShape|null;differences:string[]}>=[];
 for(const check of expected){
  active();
  const [schema]=await sql`SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=${check.schema}`;
  if(!schema||schema.owner!==session.session)throw new CoreError('FORBIDDEN');
  const [row]=await sql`SELECT c.oid,c.relkind,r.rolname AS owner,tn.nspname AS type_schema,t.typname AS type_name,s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmin::text AS minimum,s.seqmax::text AS maximum,s.seqcache::text AS cache,s.seqcycle AS cycle
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner LEFT JOIN pg_sequence s ON s.seqrelid=c.oid LEFT JOIN pg_type t ON t.oid=s.seqtypid LEFT JOIN pg_namespace tn ON tn.oid=t.typnamespace WHERE n.nspname=${check.schema} AND c.relname=${check.name}`;
  let actual:MigrationSequenceShape|null=null;
  if(row){
   if(row.relkind!=='S'||!row.type_name)throw new CoreError('PRECONDITION_FAILED');
   const dependencies=await sql`SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,d.deptype AS dependency FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid AND NOT a.attisdropped
    WHERE d.classid='pg_class'::regclass AND d.objid=${row.oid} AND d.objsubid=0 AND d.refclassid='pg_class'::regclass AND d.refobjsubid>0 AND d.deptype IN ('a','i') LIMIT 2`;
   if(dependencies.length>1)throw new CoreError('PRECONDITION_FAILED');
   const dep=dependencies[0];
   actual={schema:check.schema,name:check.name,owner:row.owner,typeSchema:row.type_schema,typeName:row.type_name,start:row.start,increment:row.increment,minimum:row.minimum,maximum:row.maximum,cache:row.cache,cycle:row.cycle,ownedBy:dep?{schema:dep.schema,table:dep.table,column:dep.column,dependency:dep.dependency}:null};
  }
  const differences:string[]=[];
  if(actual===null||check.expected===null){if(actual!==check.expected)differences.push('existence');}
  else for(const field of ['owner','typeSchema','typeName','start','increment','minimum','maximum','cache','cycle','ownedBy'] as const)if(canonicalJson(actual[field])!==canonicalJson(check.expected[field]))differences.push(field);
  results.push({schema:check.schema,name:check.name,actual,differences});
 }
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(expected)));active();
 return {matched:results.every(result=>!result.differences.length),expectedDigest,results};
}
