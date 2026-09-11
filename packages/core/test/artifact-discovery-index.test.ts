import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createDatabaseFixture,context,options} from './database-fixture.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand,inputDigest} from '../src/data/journal.ts';
import {databaseManifest} from '../src/data/manifest.ts';
import {DatabaseReadinessError} from '../src/data/readiness.ts';
import type {Query} from '../src/data/uow.ts';

test('Artifact discovery uses the registered lookup index under runtime RLS', {timeout:60000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());const c=context(),organization=c.tenant.resourceOrganizationId;
 const ownerRef={type:'abh.installed-pack',id:randomUUID(),version:1},sourceRefs=Array.from({length:100},()=>({type:'abh.artifact',id:randomUUID(),version:2}));
 const payload={ownerRef,sourceRefs,mediaType:'application/json',content:'{}',purposeNames:[c.tenant.purposeOfUse],dataClass:'abh.data.internal',region:'local',retentionPolicyRef:sourceRefs[0]!};
 const original=await f.database.transaction(c,options(),async tx=>{
  const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
  return (await executeCommand(tx,command,async()=>{},async()=>(await new InlineArtifactOwner().store(tx,command,payload,async()=>{})).artifactRef)).receipt.resultRef;
 });
 // Actual storage fixtures copy the valid available record, with distinct owners.
 // No filler is treated as a migration observation or verification proof.
 await f.admin`INSERT INTO data.artifacts(resource_organization_id,id,version,workspace_id,purpose_names,record,inline_body,content_digest,status,created_by,updated_by)
  SELECT resource_organization_id,gen_random_uuid(),version,workspace_id,purpose_names,jsonb_set(record,'{ownerRef,id}',to_jsonb(gen_random_uuid()::text)),inline_body,content_digest,status,created_by,updated_by
  FROM data.artifacts CROSS JOIN generate_series(1,4000) WHERE id=${original.id} AND resource_organization_id=${organization}`;
 await f.admin`ANALYZE data.artifacts`;
 const plans:unknown[]=[];
 await f.database.transaction(c,options(),async tx=>{
  const query=tx.owner('ArtifactStore');
  const traced:Query=async(strings,...parameters)=>{
   const explain=[...strings];explain[0]='EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+explain[0];
   const rows=await query(Object.assign(explain,{raw:explain}) as unknown as TemplateStringsArray,...parameters);plans.push(rows[0]!['QUERY PLAN']);
   return query(strings,...parameters);
  };
  const observed=new Proxy(tx,{get(target,key){if(key==='owner')return()=>traced;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const page=await new InlineArtifactOwner().scanOwnedSources(observed,ownerRef,sourceRefs,20);
  assert.deepEqual(page.refs,[original]);assert.equal(page.next,undefined);
  assert.deepEqual((await new InlineArtifactOwner().scanOwnedSources(observed,ownerRef,sourceRefs,20,original.id)).refs,[]);
  await f.admin`UPDATE data.artifacts SET record=jsonb_set(jsonb_set(record,'{ownerRef,version}','1.0'::jsonb),'{sourceRefs}',(SELECT jsonb_agg(value||jsonb_build_object('version',2.0::numeric)) FROM jsonb_array_elements(record->'sourceRefs'))) WHERE id=${original.id} AND resource_organization_id=${organization}`;
  assert.deepEqual((await new InlineArtifactOwner().scanOwnedSources(observed,ownerRef,sourceRefs,20)).refs,[original]);
 });
 for(const [position,plan] of plans.entries()){
 const nodes:Record<string,unknown>[]=[];
 const visit=(value:unknown)=>{if(value&&typeof value==='object'){if(!Array.isArray(value))nodes.push(value as Record<string,unknown>);for(const child of Object.values(value))visit(child);}};visit(plan);
 const indexed=nodes.find(node=>node['Index Name']==='artifacts_owner_sources_scan_idx');assert.ok(indexed,JSON.stringify(plan));
 assert.ok(String(indexed['Index Cond']).includes('owner_lookup')&&String(indexed['Index Cond']).includes('sources_lookup'),JSON.stringify(plan));
 assert.ok(Number(indexed['Rows Removed by Filter']??0)<=1,JSON.stringify(plan));
 if(position===1)assert.ok(String(indexed['Index Cond']).includes('id >'),JSON.stringify(plan));
 t.diagnostic(JSON.stringify({page:position,index:indexed['Index Name'],actualRows:indexed['Actual Rows'],rowsRemovedByFilter:indexed['Rows Removed by Filter']??0,sharedHitBlocks:indexed['Shared Hit Blocks']}));
 }
 const registered=databaseManifest.indexes.find(index=>index.schema==='data'&&index.name==='artifacts_owner_sources_scan_idx')!;
 await f.admin`DROP INDEX data.artifacts_owner_sources_scan_idx`;
 try{
  await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('lookup-index:data.artifacts_owner_sources_scan_idx'));
  await f.admin`CREATE INDEX artifacts_owner_sources_scan_idx ON data.artifacts(resource_organization_id,id)`;
  await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('lookup-index:data.artifacts_owner_sources_scan_idx'));
 }finally{await f.admin`DROP INDEX IF EXISTS data.artifacts_owner_sources_scan_idx`;await f.admin.unsafe(registered.definition);}
 await f.database.verify();
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('ArtifactStore')`UPDATE data.artifacts SET owner_lookup=42 WHERE id=${original.id}`),{code:'428C9'});
 await f.admin`ALTER TABLE data.artifacts ALTER COLUMN owner_lookup DROP EXPRESSION`;
 try{await assert.rejects(f.database.verify(),error=>error instanceof DatabaseReadinessError&&error.violations.includes('generated-lookup:data.artifacts.owner_lookup'));}
 finally{
  await f.admin`DROP INDEX data.artifacts_owner_sources_scan_idx`;
  await f.admin`ALTER TABLE data.artifacts DROP COLUMN owner_lookup`;
  await f.admin`ALTER TABLE data.artifacts ADD COLUMN owner_lookup bigint GENERATED ALWAYS AS (jsonb_hash_extended(record->'ownerRef',0)) STORED`;
  await f.admin.unsafe(registered.definition);
 }
 await f.database.verify();
});
