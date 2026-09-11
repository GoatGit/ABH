import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PackManifest} from '@abh/contracts';
import {digestPackManifest} from '@abh/contracts/digest';
import {validatePackMigrationPlan,type PackMigrationStep} from '../src/extensions/pack-migration-plan.ts';
import {packManifest} from './pack-fixture.ts';
const ref={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1};
async function fixture(){
 const pack=await packManifest() as PackManifest;pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
 pack.migrations=[{...pack.artifacts[0]!,ref:'migration.sql'}];Object.assign(pack.integrity,await digestPackManifest(pack));delete (pack.integrity as unknown as Record<string,unknown>).signaturePayload;
 const owners=[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}];
 const step:PackMigrationStep={ref:'migration.sql',digest:pack.migrations[0]!.digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
 return {pack,owners,step};
}
test('migration plan binds exact declared content and independently owned schema/role',async()=>{
 const {pack,owners,step}=await fixture();assert.deepEqual(await validatePackMigrationPlan(pack,owners,[step]),[step]);
 for(const patch of [{ref:'other.sql'},{digest:'sha256:'+'f'.repeat(64)},{schemas:['other_domain']},{databaseRole:'other_migrator'}])await assert.rejects(validatePackMigrationPlan(pack,owners,[{...step,...patch}]));
 await assert.rejects(validatePackMigrationPlan(pack,owners,[]),{code:'PRECONDITION_FAILED'});
 const pending=validatePackMigrationPlan(pack,owners,[step]);step.schemas[0]='identity';assert.equal((await pending)[0]!.schemas[0],'hello_domain');
});
test('Core, PostgreSQL and foreign schema ownership can never authorize Pack migrations',async()=>{
 const {pack,owners,step}=await fixture();
 for(const name of ['identity','control','extension','public','pg_catalog','information_schema','abh_migrations'])await assert.rejects(validatePackMigrationPlan(pack,[{...owners[0]!,schemaName:name}],[{...step,schemas:[name]}]),{code:'FORBIDDEN'});
 for(const role of ['abh_runtime','abh_core_owner','postgres','pg_read_all_data'])await assert.rejects(validatePackMigrationPlan(pack,[{...owners[0]!,databaseRole:role}],[{...step,databaseRole:role}]),{code:'FORBIDDEN'});
 await assert.rejects(validatePackMigrationPlan(pack,[{...owners[0]!,packId:'org.other.pack'}],[step]),{code:'FORBIDDEN'});
});
test('destructive contraction needs retired-code evidence and recovery refs cannot be omitted',async()=>{
 const {pack,owners,step}=await fixture();
 await assert.rejects(validatePackMigrationPlan(pack,owners,[{...step,operations:['Drop']}]),{code:'INVALID_ARGUMENT'});
 await assert.rejects(validatePackMigrationPlan(pack,owners,[{...step,phase:'Contract'}]),{code:'INVALID_ARGUMENT'});
 assert.equal((await validatePackMigrationPlan(pack,owners,[{...step,phase:'Contract',operations:['Drop'],retirementRef:ref,transactional:false}]))[0]!.transactional,false);
 await assert.rejects(validatePackMigrationPlan(pack,owners,[{...step,recoveryPlanRef:undefined} as unknown as PackMigrationStep]));
});
test('no declared migrations does not manufacture empty work',async()=>{
 const pack=await packManifest() as PackManifest;assert.deepEqual(await validatePackMigrationPlan(pack,[],[]),[]);
});
test('plans cannot duplicate a migration or regress from Contract to Expand',async()=>{
 const {pack,owners,step}=await fixture();pack.migrations.push({...pack.migrations[0]!,ref:'second.sql'});
 const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
 await assert.rejects(validatePackMigrationPlan(pack,owners,[step,step]),{code:'PRECONDITION_FAILED'});
 await assert.rejects(validatePackMigrationPlan(pack,owners,[{...step,phase:'Contract',retirementRef:ref},{...step,ref:'second.sql'}]),{code:'PRECONDITION_FAILED'});
 assert.equal((await validatePackMigrationPlan(pack,owners,[step,{...step,ref:'second.sql',phase:'Backfill',operations:['DataWrite']}])).length,2);
});
test('dedicated roles cannot be shared across Packs in either ownership order',async()=>{
 const {pack,owners,step}=await fixture();
 const foreign={...owners[0]!,packId:'org.other.pack',schemaName:'other_domain'};
 for(const rows of [[...owners,foreign],[foreign,...owners]])await assert.rejects(validatePackMigrationPlan(pack,rows,[step]),{code:'FORBIDDEN'});
 const extra={...owners[0]!,schemaName:'hello_history'};
 assert.equal((await validatePackMigrationPlan(pack,[...owners,extra],[{...step,schemas:['hello_domain','hello_history']}])).length,1);
 assert.equal((await validatePackMigrationPlan(pack,[...owners,{...foreign,databaseRole:'other_migrator'}],[step])).length,1);
 await assert.rejects(validatePackMigrationPlan(pack,[...owners,...owners],[step]),{code:'FORBIDDEN'});
});
