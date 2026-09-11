import type {PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Query,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyMigrationInventory,type MigrationSchemaInventory} from './verify-migration-inventory.ts';
import {verifyMigrationTables,type MigrationTableCheck} from './verify-migration-tables.ts';
import {verifyMigrationSequences,type MigrationSequenceCheck} from './verify-migration-sequences.ts';
import {verifyMigrationViews,type MigrationViewCheck} from './verify-migration-views.ts';
import {verifyMigrationAcl,type MigrationAclCheck} from './verify-migration-acl.ts';
export interface MigrationStructureExpectation {inventory:MigrationSchemaInventory[];tables:MigrationTableCheck[];sequences:MigrationSequenceCheck[];views:MigrationViewCheck[];acl:MigrationAclCheck[]}
/** Inventory and every declared ordinary/partitioned table, sequence and view definition checked on one supplied
 * read-only repeatable-read transaction. matched covers only this structural scope;
 * other relation kinds remain explicitly listed as requiring detailed verification.
 * Host must bind current ownership, actual database and governed expectation.
 */
export async function verifyMigrationStructure(sql:Query,ownership:readonly PackSchemaOwnership[],packId:string,expectation:MigrationStructureExpectation,options:TransactionOptions){
 const value=JSON.parse(canonicalJson(expectation)) as MigrationStructureExpectation,owners=JSON.parse(canonicalJson(ownership)) as PackSchemaOwnership[],limits={...options};
 if(!value||Object.keys(value).sort().join(',')!=='acl,inventory,sequences,tables,views'||!Array.isArray(value.inventory)||!Array.isArray(value.tables)||value.tables.length>100||!Array.isArray(value.sequences)||value.sequences.length>100||!Array.isArray(value.views)||value.views.length>100||!Array.isArray(value.acl)||value.acl.length>100)throw new CoreError('INVALID_ARGUMENT');
 if(Buffer.byteLength(canonicalJson(value))>1048576)throw new CoreError('LIMIT_EXCEEDED');
 const required=new Map<string,string>(),schemas=new Set<string>(),other:Array<{schema:string;name:string;kind:string}>=[];
 for(const item of value.inventory){
  if(!item||!Array.isArray(item.relations)||schemas.has(item.schema))throw new CoreError('INVALID_ARGUMENT');schemas.add(item.schema);
  for(const relation of item.relations){
   if(!relation)throw new CoreError('INVALID_ARGUMENT');
   const key=canonicalJson([item.schema,relation.name]);
   if(['r','p','S','v','m'].includes(relation.kind)){if(required.has(key))throw new CoreError('INVALID_ARGUMENT');required.set(key,relation.kind);}
   // View dependency behavior and foreign-table definitions remain outside this check.
   if(!['r','p','S'].includes(relation.kind))other.push({schema:item.schema,name:relation.name,kind:relation.kind});
  }
 }
 const covered=new Set<string>();
 const details=[...value.tables.map(check=>({check,kind:check?.expected?.kind})),...value.sequences.map(check=>({check,kind:'S'})),...value.views.map(check=>({check,kind:check?.expected?.kind}))];
 for(const {check,kind} of details){
  if(!check||!schemas.has(check.schema))throw new CoreError('INVALID_ARGUMENT');
  const key=canonicalJson([check.schema,check.name]);if(covered.has(key))throw new CoreError('INVALID_ARGUMENT');covered.add(key);
  const relation=value.inventory.find(item=>item.schema===check.schema)!.relations.find(item=>item.name===check.name);
  if(check.expected===null){if(relation)throw new CoreError('PRECONDITION_FAILED');}
  else if(!check.expected||required.get(key)!==kind)throw new CoreError('PRECONDITION_FAILED');
 }
 if([...required.keys()].some(key=>!covered.has(key)))throw new CoreError('PRECONDITION_FAILED');
 const aclRequired=new Map<string,string>();
 for(const schema of value.inventory)for(const relation of schema.relations){const key=canonicalJson([schema.schema,relation.name]);if(aclRequired.has(key))throw new CoreError('INVALID_ARGUMENT');aclRequired.set(key,relation.kind);}
 const aclCovered=new Set<string>();
 for(const check of value.acl){
  if(!check)throw new CoreError('INVALID_ARGUMENT');const key=canonicalJson([check.schema,check.name]);
  if(aclCovered.has(key))throw new CoreError('INVALID_ARGUMENT');aclCovered.add(key);
  if(aclRequired.get(key)!==check.kind)throw new CoreError('PRECONDITION_FAILED');
 }
 if([...aclRequired.keys()].some(key=>!aclCovered.has(key)))throw new CoreError('PRECONDITION_FAILED');
 const inventory=await verifyMigrationInventory(sql,owners,packId,value.inventory,limits);
 const tables=value.tables.length?await verifyMigrationTables(sql,owners,packId,value.tables,limits):null;
 const sequences=value.sequences.length?await verifyMigrationSequences(sql,owners,packId,value.sequences,limits):null;
 const views=value.views.length?await verifyMigrationViews(sql,owners,packId,value.views,limits):null;
 const acl=value.acl.length?await verifyMigrationAcl(sql,owners,packId,value.acl,limits):null;
 const expectedDigest=await digestBytes(new TextEncoder().encode(canonicalJson(value)));
 if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
 return {matched:inventory.matched&&(tables?.matched??true)&&(sequences?.matched??true)&&(views?.matched??true)&&(acl?.matched??true),requiresAdditionalVerification:other,expectedDigest,inventory,tables,sequences,views,acl};
}
