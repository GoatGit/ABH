import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {digestBytes} from '@abh/contracts/digest';
import {FilesystemObjectStore} from '../src/adapters/filesystem-object-store.ts';
import {ObjectArtifactOwner,storeObjectArtifactStream} from '../src/data/object-artifacts.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});

async function* chunks(bytes:Uint8Array,size=65_536):AsyncIterable<Uint8Array> {
  for(let offset=0;offset<bytes.length;offset+=size)yield bytes.subarray(offset,Math.min(offset+size,bytes.length));
}

async function readAll(content:AsyncIterable<Uint8Array>):Promise<Uint8Array> {
  const parts:Uint8Array[]=[];let size=0;
  for await(const part of content){parts.push(part);size+=part.byteLength;}
  const bytes=new Uint8Array(size);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes;
}

test('filesystem object store streams unbounded artifacts and persists idempotent bindings',{timeout:180_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());await f.database.verify();
  const root=await mkdtemp(join(tmpdir(),'abh-object-store-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=new FilesystemObjectStore(root),c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.artifact.manage'}),owner=new ObjectArtifactOwner(),
    authorizedContext=ref('abh.authorized-context');
  const size=300_000,bytes=new Uint8Array(size).map((_,index)=>index%251);
  const digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const key=randomUUID();
  const payload={ownerRef:ref('abh.tool-call'),mediaType:'application/octet-stream',dataClass:'tool.result',
    purposeNames:['abh.artifact.manage'],sourceRefs:[ref('abh.tool-binding')],region:'local',
    retentionPolicyRef:ref('abh.retention-policy')};
  const available=await storeObjectArtifactStream(f.database,c,options(),{
    payload,content:chunks(bytes),declaredSizeBytes:size,digest,objectStore:store,
    authorizedContextRef:authorizedContext,verifyReferences:async refs=>assert.equal(refs.length,3),
    idempotencyKey:key});
  assert.equal(available.status,'Available');assert.equal(available.record.status,'Available');
  assert.equal(available.record.sizeBytes,size);assert.equal(available.record.contentDigest,digest);
  const [binding]=await f.admin`SELECT size_bytes,object_ref FROM data.object_artifacts
    WHERE artifact_id=${available.record.artifactRef.id}` as {size_bytes:string;object_ref:{id:string;version:number}}[];
  assert.equal(Number(binding!.size_bytes),size);
  const objectRef={type:'abh.stored-object' as const,id:binding!.object_ref.id,version:binding!.object_ref.version};
  const request={authorizedContextRef:authorizedContext,
    context:{callId:randomUUID(),requestContextRef:{type:'abh.request-context' as const,id:c.tenant.requestId,version:1},
      target:{objectRef,scopeRefs:[ref('abh.organization',c.tenant.resourceOrganizationId)],action:'abh.artifacts.read'},
      deadline:new Date(Date.now()+10_000).toISOString()}};
  const first=await store.read({...request,objectRef},{signal:options().signal});
  assert.equal(first.status,'Completed');assert.deepEqual(await readAll(first.data.content),bytes);
  const range=await store.read({...request,objectRef,range:{start:10,endInclusive:19}},{signal:options().signal});
  assert.equal(range.status,'Completed');assert.deepEqual(await readAll(range.data.content),bytes.subarray(10,20));
  const putRequest={stagedArtifactRef:available.record.artifactRef,digest,sizeBytes:size,
    mediaType:'application/octet-stream',idempotencyKey:key,authorizedContextRef:authorizedContext,context:request.context};
  const replay=await store.put(putRequest,{signal:options().signal},chunks(bytes));
  assert.equal(replay.status,'Completed');assert.deepEqual(replay.data.objectRef,objectRef);
  const proof=ref('abh.deletion-proof'),deleteRequest={...request,objectRef,deletionProofRef:proof,idempotencyKey:randomUUID()};
  const deleted=await store.delete(deleteRequest,{signal:options().signal});
  assert.equal(deleted.status,'Completed');assert.deepEqual(deleted.data.receiptRef,proof);
  await assert.rejects(stat(join(root,'objects',objectRef.id.slice(0,2),`${objectRef.id}-v1`)),{code:'ENOENT'});
  const replayDelete=await store.delete(deleteRequest,{signal:options().signal});
  assert.equal(replayDelete.status,'Completed');assert.deepEqual(replayDelete.data,deleted.data);
});
