import {selectMigrationState} from '../src/extensions/select-migration-state.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {EntityRef} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {discoverMigrationState,type MigrationStateDiscoveryBinding} from '../src/extensions/discover-migration-state.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
/** Uses actual already persisted signed installation evidence, never substitutes a mock inspector. */
export async function checkMigrationStateDiscovery(f:Awaited<ReturnType<typeof createDatabaseFixture>>,c:VerifiedContext,binding:MigrationStateDiscoveryBinding,grant:EntityRef,original:EntityRef,onDuplicate?:()=>Promise<void>){
 const checks={fenceRefs:async()=>[],admit:async()=>{},read:async()=>{}};
 const discover=(input=binding,limit=20,after?:string)=>discoverMigrationState(f.database,c,options(),input,[grant],checks,limit,after);
 const select=(input=binding,maxScanned=20)=>selectMigrationState(f.database,c,options(),input,[grant],checks,maxScanned);
 assert.deepEqual(await select(),{status:'Selected',artifactRef:original});
 assert.deepEqual(await select({...binding,environmentDigest:('sha256:'+'0'.repeat(64)) as typeof binding.environmentDigest}),{status:'Missing'});
 const page=await discover();assert.equal(page.scanned,1);assert.equal(page.next,undefined);assert.deepEqual(page.candidates.map(item=>item.artifactRef),[original]);assert.equal(page.candidates[0]!.matched,true);
 assert.deepEqual((await discover({...binding,environmentDigest:('sha256:'+'0'.repeat(64)) as typeof binding.environmentDigest})).candidates,[]);
 await assert.rejects(discover(binding,0),{code:'INVALID_ARGUMENT'});
 await assert.rejects(discover({...binding,sources:[binding.sources[0],binding.sources[0],binding.sources[2],binding.sources[3]]}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(discoverMigrationState(f.database,c,options(),binding,[],checks),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(discoverMigrationState(f.database,c,options(),binding,[grant],{...checks,read:async()=>{throw new Error('observation read denied');}}),/observation read denied/);
 let admissions=0;
 await assert.rejects(discoverMigrationState(f.database,c,options(),binding,[grant],{...checks,admit:async()=>{if(++admissions===2)throw new Error('observation discovery withdrawn');}}),/observation discovery withdrawn/);
 const empty={...binding,packRef:{...binding.packRef,id:randomUUID()}};
 await assert.rejects(discoverMigrationState(f.database,c,options(),empty,[grant],{...checks,admit:async()=>{throw new Error('empty discovery denied');}}),/empty discovery denied/);
 // An independently committed Artifact copy must remain visible as a second hint.
 // Never resolve multiple saved observations by choosing an arbitrary first row.
 const duplicate=await f.database.transaction(c,options(),async tx=>{
  const owner=new InlineArtifactOwner(),saved=await owner.read(tx,original,async()=>{}),record=saved.record;
  const payload={ownerRef:record.ownerRef,mediaType:record.mediaType,content:new TextDecoder().decode(saved.bytes),purposeNames:record.purposeNames,dataClass:record.dataClass,sourceRefs:record.sourceRefs,region:record.region,retentionPolicyRef:record.retentionPolicyRef};
  const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
  return (await executeCommand(tx,command,async()=>{},async()=>(await owner.store(tx,command,payload,async()=>{})).artifactRef)).receipt.resultRef;
 });
 try{
  await onDuplicate?.();
  assert.deepEqual(await select(),{status:'Ambiguous'});
  assert.deepEqual(await select(binding,1),{status:'Incomplete'});
  assert.deepEqual(await select({...binding,environmentDigest:('sha256:'+'0'.repeat(64)) as typeof binding.environmentDigest},1),{status:'Incomplete'});
  const first=await discover(binding,1);assert.equal(first.scanned,1);assert.ok(first.next);assert.equal(first.candidates.length,1);
  const last=await discover(binding,1,first.next);assert.equal(last.scanned,1);assert.equal(last.next,undefined);
  assert.deepEqual([...first.candidates,...last.candidates].map(value=>value.artifactRef.id).sort(),[original.id,duplicate.id].sort());
 }finally{
  await f.database.transaction(c,options(),async tx=>{
   const command={type:'abh.artifacts.tombstone',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(duplicate)};
   await executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().tombstone(tx,command,duplicate,original,async()=>{})).artifactRef);
  });
 }
 assert.deepEqual((await discover()).candidates.map(item=>item.artifactRef),[original]);
}
