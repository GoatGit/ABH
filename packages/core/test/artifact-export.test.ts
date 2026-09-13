import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {FilesystemObjectStore} from '../src/adapters/filesystem-object-store.ts';
import {ArtifactExportOwner} from '../src/data/artifact-export.ts';
import {storeObjectArtifactStream} from '../src/data/object-artifacts.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});

test('artifact exports produce a hash-indexed open directory from a consistent snapshot',{timeout:180_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());await f.database.verify();
  const root=await mkdtemp(join(tmpdir(),'abh-export-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const objectRoot=await mkdtemp(join(tmpdir(),'abh-export-objects-'));t.after(()=>rm(objectRoot,{recursive:true,force:true}));
  const store=new FilesystemObjectStore(objectRoot),c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.artifact.manage'});
  const bytes=new Uint8Array(300_000).map((_,index)=>index%251);
  const digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const content=(async function*(){for(let offset=0;offset<bytes.length;offset+=65_536)yield bytes.subarray(offset,Math.min(offset+65_536,bytes.length));})();
  const available=await storeObjectArtifactStream(f.database,c,options(),{payload:{
    ownerRef:ref('abh.tool-call'),mediaType:'application/octet-stream',dataClass:'tool.result',
    purposeNames:['abh.artifact.manage'],sourceRefs:[ref('abh.tool-binding')],region:'local',
    retentionPolicyRef:ref('abh.retention-policy')},content,declaredSizeBytes:bytes.length,digest,objectStore:store,
    authorizedContextRef:ref('abh.authorized-context'),verifyReferences:async()=>{}});
  assert.equal(available.status,'Available');
  const exports=new ArtifactExportOwner(),scope=ref('abh.organization',c.tenant.resourceOrganizationId),
    evidence=ref('abh.retention-policy');
  const input={outputRoot:root,objectStore:store,authorizedContextRef:ref('abh.authorized-context'),scopeRef:scope,
    evidenceRef:evidence,maxArtifacts:10};
  const created=await exports.create(f.database,c,options(),input,async()=>{});
  assert.equal(created.state,'Pending');
  const completed=await exports.run(f.database,c,{...options(),deadline:Date.now()+60_000},input,
    created.exportRef,async()=>{});
  assert.equal(completed.state,'Completed');
  const output=join(root,c.tenant.resourceOrganizationId,completed.exportRef.id);
  const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));
  assert.equal(manifest.formatVersion,'1.0');assert.equal(manifest.counts.exportedArtifacts,1);
  const actualDigest=await (async()=>{const file=await readFile(join(output,
    'artifacts',`${available.record.artifactRef.id}.bin`));return `sha256:${createHash('sha256').update(file).digest('hex')}`;})();
  assert.equal(actualDigest,digest);
  for(const file of manifest.files) {
    const bytesFile=await readFile(join(output,file.path));
    assert.equal(`sha256:${createHash('sha256').update(bytesFile).digest('hex')}`,file.sha256);
  }
  const rows=await f.admin`SELECT state,manifest_digest,file_count FROM data.artifact_exports WHERE id=${completed.exportRef.id}` as
    {state:string;manifest_digest:string;file_count:string}[];
  assert.equal(rows[0]!.state,'Completed');assert.equal(Number(rows[0]!.file_count),manifest.files.length);
  const outputFiles=await readdir(output,{recursive:true});
  assert.ok(outputFiles.includes(join('records','artifacts.jsonl')));

  const expiringInput={...input,expiresAt:new Date(Date.now()-1).toISOString()};
  const expiring=await exports.create(f.database,c,options(),expiringInput,async()=>{});
  await exports.run(f.database,c,{...options(),deadline:Date.now()+60_000},expiringInput,expiring.exportRef,async()=>{});
  const expiringOutput=join(root,c.tenant.resourceOrganizationId,expiring.exportRef.id);
  assert.equal((await exports.expire(f.database,c,{...options(),deadline:Date.now()+60_000},root,async()=>{})),1);
  await assert.rejects(stat(expiringOutput),{code:'ENOENT'});
  const expired=await f.admin`SELECT state FROM data.artifact_exports WHERE id=${expiring.exportRef.id}` as {state:string}[];
  assert.equal(expired[0]!.state,'Expired');
});
