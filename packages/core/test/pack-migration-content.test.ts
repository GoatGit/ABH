import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PackManifest,PackMigrationStep} from '@abh/contracts';
import {digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {readPackMigrationContent} from '../src/extensions/pack-migration-content.ts';
import {packManifest} from './pack-fixture.ts';
import {options} from './database-fixture.ts';
async function fixture(bytes:Uint8Array=new TextEncoder().encode('CREATE TABLE hello_domain.orders (id integer);')){
 const pack=await packManifest() as PackManifest;
 const ref={type:'abh.artifact',id:'11111111-1111-4111-8111-111111111111',version:1};
 pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:ref};
 pack.migrations=[{ref:'migration.sql',digest:await digestBytes(bytes),sizeBytes:bytes.length,mediaType:'application/sql'}];
 const {signaturePayload:_,...digests}=await digestPackManifest(pack);Object.assign(pack.integrity,digests);
 const owners=[{packId:pack.metadata.id,schemaName:'hello_domain',databaseRole:'hello_migrator'}];
 const step:PackMigrationStep={ref:'migration.sql',digest:pack.migrations[0]!.digest,schemas:['hello_domain'],databaseRole:'hello_migrator',phase:'Expand',transactional:true,operations:['Create'],reviewRef:ref,dryRunRef:ref,safetyPointRef:ref,recoveryPlanRef:ref,compatibilityRef:ref};
 const calls:string[]=[];
 const source={refs:['input.json','migration.sql'],async open(ref:string){calls.push(ref);return {async *[Symbol.asyncIterator](){yield ref==='input.json'?new TextEncoder().encode('abc'):bytes;}};}};
 return {pack,owners,step,source,calls,bytes};
}
test('migration text is captured during the verified read, never reopened',async()=>{
 const f=await fixture();
 const result=await readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options());
 assert.deepEqual(f.calls,['input.json','migration.sql']);assert.equal(result[0]!.sql,new TextDecoder().decode(f.bytes));
 f.bytes.fill(0);f.step.schemas[0]='other';assert.equal(result[0]!.step.schemas[0],'hello_domain');assert.ok(result[0]!.sql.startsWith('CREATE TABLE'));
});
test('tampered migrations and unrelated Pack payload prevent returning any SQL',async()=>{
 for(const ref of ['migration.sql','input.json']){
  const f=await fixture(),original=f.source.open;
  f.source.open=async name=>name===ref?{async *[Symbol.asyncIterator](){yield new Uint8Array(name==='input.json'?3:f.bytes.length);}}:original(name);
  await assert.rejects(readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options()),{code:'PRECONDITION_FAILED'});
 }
});
test('malformed UTF-8 and NUL reject even when correctly digested',async()=>{
 for(const bytes of [new Uint8Array([0xc0,0xaf]),new Uint8Array([65,0,66])]){
  const f=await fixture(bytes);await assert.rejects(readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options()),{code:'INVALID_ARGUMENT'});
 }
});
test('source mutation after a yield cannot change captured verified SQL',async()=>{
 const f=await fixture(),expected=new TextDecoder().decode(f.bytes),original=f.source.open;
 f.source.open=async name=>name==='migration.sql'?{async *[Symbol.asyncIterator](){yield f.bytes;f.bytes.fill(0);}}:original(name);
 assert.equal((await readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options()))[0]!.sql,expected);
});
test('stalled source is bounded by the original deadline',async()=>{
 const f=await fixture();f.source.open=async()=>new Promise(()=>{});
 await assert.rejects(readPackMigrationContent(f.pack,f.owners,[f.step],f.source,{...options(),deadline:Date.now()+30}),{code:'DEPENDENCY_TIMEOUT'});
});
test('unsupported media and oversized migration reject before opening source',async()=>{
 for(const patch of [{mediaType:'application/json'},{sizeBytes:8388609}]){
  const f=await fixture();Object.assign(f.pack.migrations[0]!,patch);
  const {signaturePayload:_,...digests}=await digestPackManifest(f.pack);Object.assign(f.pack.integrity,digests);
  await assert.rejects(readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options()));assert.equal(f.calls.length,0);
 }
});
test('empty migration plan still verifies Pack payload and returns no invented SQL',async()=>{
 const pack=await packManifest() as PackManifest;
 const source={refs:['input.json'],async open(){return {async *[Symbol.asyncIterator](){yield new TextEncoder().encode('abc');}};}};
 assert.deepEqual(await readPackMigrationContent(pack,[],[],source,options()),[]);
});
test('Buffer slices cannot replace verified SQL after the hash consumes a chunk',async()=>{
 const bytes=Buffer.from('SELECT 1;'),expected=bytes.toString(),f=await fixture(bytes),original=f.source.open;
 f.source.open=async name=>name==='migration.sql'?{async *[Symbol.asyncIterator](){yield bytes;bytes.set(Buffer.from('SELECT 2;'));}}:original(name);
 assert.equal((await readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options()))[0]!.sql,expected);
});
test('overridden slice and shared-memory views are captured into private storage',async()=>{
 class AliasedBytes extends Uint8Array<ArrayBuffer> {override slice(){return this;}}
 for(const bytes of [new AliasedBytes(new ArrayBuffer(9)),new Uint8Array(new SharedArrayBuffer(9))]){
  bytes.set(Buffer.from('SELECT 1;'));
  const f=await fixture(bytes),original=f.source.open;
  f.source.open=async name=>name==='migration.sql'?{async *[Symbol.asyncIterator](){yield bytes;bytes.set(Buffer.from('SELECT 2;'));}}:original(name);
  assert.equal((await readPackMigrationContent(f.pack,f.owners,[f.step],f.source,options()))[0]!.sql,'SELECT 1;');
 }
});
