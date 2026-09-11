import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PackManifest} from '@abh/contracts';
import {digestPackManifest} from '@abh/contracts/digest';
import {verifyPackDataImpact,assessPackDataImpact,type PackDataInventory,type PackDataDefinition} from '../src/extensions/pack-data-impact.ts';
import {packManifest} from './pack-fixture.ts';
const digest=`sha256:${'a'.repeat(64)}` as const,other=`sha256:${'b'.repeat(64)}` as const;
const entry=(id:string,kind:PackDataDefinition['kind']='Schema'):PackDataDefinition=>({id,kind,digest});
const inventory=(entries:PackDataDefinition[]=[],complete=true):PackDataInventory=>({complete,entries});
const manifest=async()=>await packManifest() as PackManifest;
test('no migration is not sufficient: incomplete inventories never become not applicable',async()=>{
 const pack=await manifest();
 assert.equal((await assessPackDataImpact(pack,inventory(),inventory())).status,'NotApplicable');
 for(const [before,after] of [[inventory([],false),inventory()],[inventory(),inventory([],false)]]){
  const report=await assessPackDataImpact(pack,before!,after!);assert.equal(report.status,'Incomplete');assert.deepEqual(report.reasons,['InventoryIncomplete']);
 }
 const report=await assessPackDataImpact(pack,inventory(),inventory([entry('org.example.projection','Projection')]));
 assert.equal(report.status,'Required');assert.deepEqual(report.migrationRefs,[]);assert.equal(report.changes[0]!.change,'Added');
});
test('impact identifies additions, removals, changes and semantic identity across kinds deterministically',async()=>{
 const pack=await manifest(),before=inventory([entry('org.example.changed'),entry('org.example.removed'),entry('org.example.same')]);
 const after=inventory([{...entry('org.example.changed'),digest:other},entry('org.example.same'),entry('org.example.added','DataTransform'),entry('org.example.same','Projection')]);
 const report=await assessPackDataImpact(pack,before,after);
 assert.equal(report.changes.length,4);assert.equal(report.changes.find(item=>item.id==='org.example.changed')!.change,'Changed');
 assert.equal(report.changes.find(item=>item.id==='org.example.removed')!.afterDigest,undefined);
 assert.deepEqual(await assessPackDataImpact(pack,inventory([...before.entries].reverse()),inventory([...after.entries].reverse())),report);
 assert.equal(report.subjectDigest,pack.integrity.packageDigest);assert.notEqual(report.baselineDigest,report.targetDigest);
});
test('declared migration requires verification even if inventories are equal',async()=>{
 const pack=await manifest();pack.trust.mode='TrustedCode';pack.resources={enforcement:'HostProfile',profileRef:{type:'abh.profile',id:'11111111-1111-4111-8111-111111111111',version:1}};pack.migrations=[{...pack.artifacts[0]!,ref:'migrations/001.sql'}];
 const {signaturePayload:_,...integrity}=await digestPackManifest(pack);Object.assign(pack.integrity,integrity);
 const report=await assessPackDataImpact(pack,inventory(),inventory());assert.equal(report.status,'Required');
 assert.deepEqual(report.reasons,['DeclaredMigrations']);assert.deepEqual(report.migrationRefs,['migrations/001.sql']);
});
test('malformed, duplicate inventories and tampered manifest cannot produce impact evidence',async()=>{
 const pack=await manifest();
 await assert.rejects(assessPackDataImpact(pack,inventory([entry('org.example.same'),entry('org.example.same')]),inventory()),{code:'INVALID_ARGUMENT'});
 await assert.rejects(assessPackDataImpact(pack,{complete:true,entries:[],extra:true} as PackDataInventory,inventory()),{code:'INVALID_ARGUMENT'});
 await assert.rejects(assessPackDataImpact({...pack,metadata:{...pack.metadata,version:'2.0.0'}},inventory(),inventory()),{code:'PRECONDITION_FAILED'});
 const before=inventory([entry('org.example.a')]),after=inventory([entry('org.example.a')]);
 const pending=assessPackDataImpact(pack,before,after);after.entries[0]!.digest=other;assert.equal((await pending).status,'NotApplicable');
});

test('schema-valid impact forgery cannot replace recomputation from independent inventories',async()=>{
 const pack=await manifest(),before=inventory([entry('org.example.a')]),after=inventory([{...entry('org.example.a'),digest:other},entry('org.example.b','Projection')]);
 const report=await assessPackDataImpact(pack,before,after);
 assert.deepEqual(await verifyPackDataImpact(pack,before,after,{...report,changes:[...report.changes].reverse()}),report);
 const hidden={...report,status:'NotApplicable' as const,changes:[],reasons:[],targetDigest:report.baselineDigest};
 await assert.rejects(verifyPackDataImpact(pack,before,after,hidden),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackDataImpact(pack,before,after,{...report,changes:report.changes.slice(1)}),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackDataImpact(pack,before,after,{...report,subjectDigest:other}),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackDataImpact(pack,inventory(),after,report),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackDataImpact(pack,before,inventory(after.entries,false),report),{code:'PRECONDITION_FAILED'});
 const mutable=structuredClone(report),pending=verifyPackDataImpact(pack,before,after,mutable);mutable.changes=[];
 assert.deepEqual(await pending,report);
});
test('claimed migrations and their reasons must match the actual Manifest',async()=>{
 const pack=await manifest(),empty=inventory(),report=await assessPackDataImpact(pack,empty,empty);
 await assert.rejects(verifyPackDataImpact(pack,empty,empty,{...report,status:'Required',migrationRefs:['migration.sql'],reasons:['DeclaredMigrations']}),{code:'PRECONDITION_FAILED'});
});
