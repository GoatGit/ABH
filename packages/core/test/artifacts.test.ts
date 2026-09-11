import {createCoreHttpApp} from '../src/server/http.ts';
import {createAbhClient,AbhClientError} from '../src/client.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import {storeInlineArtifact} from '../src/data/store-inline-artifact.ts';
import {Database} from '../src/data/uow.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { ArtifactRecord, GrantRecord, StoreInlineArtifactPayload } from '@abh/contracts';
import { InlineArtifactOwner } from '../src/data/artifacts.ts';
import { ObjectArtifactOwner } from '../src/data/object-artifacts.ts';
import { cleanupAbandonedObjectArtifact,runObjectCleanupWorker } from '../src/data/object-cleanup-worker.ts';
import { contract,executeCommand,inputDigest,type CommandIdentity } from '../src/data/journal.ts';
import { storeObjectArtifact } from '../src/data/object-artifacts.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import { CoreError } from '../src/internal/errors.ts';
import { createDatabaseFixture,context,options } from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
test('object artifacts persist metadata only and verify external object bindings',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());await f.database.verify();
 const db=f.database,c=context(),owner=new ObjectArtifactOwner(),inline=new InlineArtifactOwner();
 const content=`{"output":"${'x'.repeat(70_000)}"}`;
 const input={ownerRef:ref('abh.tool-call'),mediaType:'application/json',dataClass:'tool.result',
  purposeNames:['abh.action.prepare'],sourceRefs:[ref('abh.tool-binding')],region:'local',retentionPolicyRef:ref('abh.retention-policy')};
 let references=true;const command:CommandIdentity={type:'abh.artifacts.store-object',commandId:randomUUID(),
  idempotencyKey:randomUUID(),digest:await inputDigest({operation:'stage-object'})};
 const stage=async(value=content)=>db.transaction(c,options(),async tx=>owner.stage(tx,command,input,value,async refs=>{
  if(!references||refs.length!==3)throw new CoreError('RESOURCE_NOT_FOUND');}));
 const staged=await stage();
 assert.equal(staged.record.status,'Staged');assert.equal(staged.bytes.byteLength,Buffer.byteLength(content));
 const [artifactRow]=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT inline_body FROM data.artifacts WHERE id=${staged.record.artifactRef.id}`);
 assert.equal(artifactRow!.inline_body,null);
 await assert.rejects(db.transaction(c,options(),tx=>inline.read(tx,staged.record.artifactRef,async()=>{})),{code:'PRECONDITION_FAILED'});
 await assert.rejects(stage('x'.repeat(65_537)),{code:'INVALID_ARGUMENT'});
 await assert.rejects(stage('x'.repeat(262_145)),{code:'LIMIT_EXCEEDED'});
 const objectRef=ref('abh.stored-object'),object={objectRef,digest:staged.digest,sizeBytes:staged.bytes.byteLength,mediaType:'application/json'};
 const attach=async(value=object,artifact=staged.record.artifactRef)=>db.transaction(c,options(),tx=>owner.attach(tx,artifact,value,{
   ...command,commandId:randomUUID(),idempotencyKey:randomUUID()}));
 const wrongObject={...object,digest:'sha256:'+'0'.repeat(64)};
 await assert.rejects(attach(wrongObject),{code:'PRECONDITION_FAILED'});
 const [before]=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT count(*) FROM data.object_artifacts`);
 assert.equal(before!.count,'0');
 const available=await attach();
 assert.equal(available.status,'Available');assert.equal(available.artifactRef.version,2);
 await assert.rejects(attach(undefined,available.artifactRef),{code:'PRECONDITION_FAILED'});
 await assert.rejects(attach(object,staged.record.artifactRef),{code:'PRECONDITION_FAILED'});
 const loaded=await db.transaction(c,options(),tx=>owner.load(tx,available.artifactRef,async(record,bound)=>{
  assert.equal(record.status,'Available');assert.deepEqual(bound.objectRef,objectRef);}));
 assert.deepEqual(loaded.object,object);
 await assert.rejects(db.transaction(c,options(),tx=>owner.load(tx,available.artifactRef,async()=>{throw new CoreError('FORBIDDEN');})),{code:'FORBIDDEN'});
 await assert.rejects(db.transaction(context(),options(),tx=>owner.load(tx,available.artifactRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
 const storage={async read(request:import('@abh/contracts').ReadObjectRequest){
  const served=request.range?staged.bytes.slice(request.range.start,request.range.endInclusive+1):staged.bytes;
  const servedObject={objectRef:request.objectRef,digest:staged.digest,sizeBytes:staged.bytes.byteLength,mediaType:'application/json'};
  return {status:'Completed' as const,data:{object:servedObject,
   ...(request.range?{range:{...request.range}}:{}) ,content:(async function*(){yield served;})()}};
  },
  async put(){throw new Error('not used');},async stat(){throw new Error('not used');},async delete(){throw new Error('not used');}
 };
 const authorizedContext=ref('abh.authorized-context');
 const full=await owner.read(db,c,options(),available.artifactRef,storage,authorizedContext,async()=>{});
 assert.equal(new TextDecoder().decode(full.bytes),content);assert.equal(full.range,undefined);
 const sliced=await owner.read(db,c,options(),available.artifactRef,storage,authorizedContext,async()=>{}, {start:10,endInclusive:19});
 assert.equal(new TextDecoder().decode(sliced.bytes),content.slice(10,20));
 assert.deepEqual(sliced.range,{start:10,endInclusive:19});
 await assert.rejects(owner.read(db,c,options(),available.artifactRef,storage,authorizedContext,async()=>{}, {start:10,endInclusive:staged.bytes.byteLength}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(owner.read(db,c,options(),available.artifactRef,storage,authorizedContext,async()=>{throw new CoreError('FORBIDDEN');}),{code:'FORBIDDEN'});
 const rangeless={...storage,async read(request:import('@abh/contracts').ReadObjectRequest){
  const served=staged.bytes;const servedObject={objectRef:request.objectRef,digest:staged.digest,
    sizeBytes:staged.bytes.byteLength,mediaType:'application/json'};
  return {status:'Completed' as const,data:{object:servedObject,content:(async function*(){yield served;})()}};
 }};
 await assert.rejects(owner.read(db,c,options(),available.artifactRef,rangeless,authorizedContext,
   async()=>{}, {start:0,endInclusive:9}),{code:'PRECONDITION_FAILED'});
 const racing={...storage,async read(request:import('@abh/contracts').ReadObjectRequest){
  await f.admin`UPDATE data.artifacts SET status='Tombstoned' WHERE id=${available.artifactRef.id}`;
  return storage.read(request);
 }};
 await assert.rejects(owner.read(db,c,options(),available.artifactRef,racing,authorizedContext,async()=>{}),{code:'PRECONDITION_FAILED'});
 const [stored]=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT inline_body FROM data.artifacts WHERE id=${available.artifactRef.id}`);
 assert.equal(stored!.inline_body,null);
});

test('binary object artifacts accept bounded allowlisted media only',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const db=f.database,c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.artifact.manage'}),
  authorizedContext=ref('abh.authorized-context'),
  payload={ownerRef:ref('abh.tool-call'),mediaType:'image/png',dataClass:'tool.result',
   purposeNames:['abh.artifact.manage'],sourceRefs:[ref('abh.tool-binding')],region:'local',
   retentionPolicyRef:ref('abh.retention-policy')};
 const png=(size:number)=>{const bytes=new Uint8Array(size);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);return bytes;};
 const readAll=async(content:AsyncIterable<Uint8Array>)=>{const chunks:Uint8Array[]=[];let size=0;
  for await(const chunk of content){size+=chunk.byteLength;chunks.push(chunk);}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;};
 let storedBytes:Uint8Array|undefined,storedDigest:string|undefined;const object=ref('abh.stored-object');
 const store:import('@abh/contracts/ports').ObjectStorePort={async put(request,_options,content){
   if(!content)throw new Error('content stream required');
   storedBytes=await readAll(content);storedDigest=request.digest;return {status:'Completed' as const,data:{
    objectRef:object,digest:request.digest,sizeBytes:request.sizeBytes,mediaType:request.mediaType}};},
  async read(request){assert.deepEqual(request.objectRef,object);const served=storedBytes!;
   return {status:'Completed' as const,data:{object:{objectRef:request.objectRef,digest:storedDigest!,
    sizeBytes:served.byteLength,mediaType:'image/png'},content:(async function*(){yield served;})()}};},
  async stat(){throw new Error('not used');},async delete(){throw new Error('not used');}};
 const invoke=(content:Uint8Array,mediaType='image/png')=>storeObjectArtifact(db,c,options(),{
  payload:{...payload,mediaType},content,objectStore:store,authorizedContextRef:authorizedContext,
  verifyReferences:async refs=>assert.equal(refs.length,3)});

 const bytes=png(70_000),available=await invoke(bytes);
 assert.equal(available.status,'Available');assert.equal(available.record.mediaType,'image/png');
 assert.equal(available.record.sizeBytes,bytes.byteLength);assert.deepEqual(storedBytes,bytes);
 const [artifactRow]=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT a.inline_body,a.status,s.status AS attempt_status
  FROM data.artifacts a JOIN data.object_staging_attempts s ON s.artifact_id=a.id AND s.artifact_version=1
  WHERE a.id=${available.record.artifactRef.id}`);
 assert.equal(artifactRow!.inline_body,null);assert.equal(artifactRow!.status,'Available');
 assert.equal(artifactRow!.attempt_status,'Published');
 const owner=new ObjectArtifactOwner(),read=await owner.read(db,c,options(),available.record.artifactRef,
  store,authorizedContext,async()=>{});
 assert.deepEqual(read.bytes,bytes);

 await assert.rejects(invoke(new Uint8Array(65_536)),{code:'LIMIT_EXCEEDED'});
 await assert.rejects(invoke(png(262_145)),{code:'LIMIT_EXCEEDED'});
 await assert.rejects(invoke(new Uint8Array(70_000)),{code:'INVALID_ARGUMENT'});
 const mismatched=new Uint8Array(70_000);mismatched.set([0x52,0x49,0x46,0x46]);
 mismatched.set([0x57,0x45,0x42,0x50],8);
 await assert.rejects(invoke(mismatched),{code:'INVALID_ARGUMENT'});
 await assert.rejects(invoke(png(70_000),'image/jpeg'),{code:'INVALID_ARGUMENT'});
});

test('abandoned Tracked object artifacts are cleaned through an authorized lease',{timeout:180_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());await f.database.verify();
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.artifact.manage'});
 const worker=deriveVerifiedContext({...c.request,actor:{type:'Service',id:randomUUID()},
  purposeOfUse:'abh.artifact.manage'});
 const org=c.tenant.resourceOrganizationId,scope={type:'abh.organization' as const,id:org,version:1},
  principal={type:'abh.principal' as const,id:worker.tenant.actor.id,version:1},
  grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
   scopeRefs:[scope],actionTypes:['abh.artifacts.delete'],purposeNames:['abh.artifact.manage'],
   validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+120_000).toISOString(),
   issuanceEvidenceRef:scope,status:'Active'});
 await f.database.transaction(worker,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Cleanup','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Cleanup worker','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const owner=new ObjectArtifactOwner(),authorizedContext=ref('abh.authorized-context'),
  grants=[grant.grantRef],cleanupOptions={workerId:randomUUID(),context:async()=>worker,
   objectStore:undefined as never,authorizedContextRef:authorizedContext,grantRefs:grants,
   signal:new AbortController().signal,resolveTracking:async()=>ref('abh.stored-object')};
 const trackingResult={status:'Tracked' as const,trackingRef:ref('abh.artifact')};
 const stored=await storeObjectArtifact(f.database,c,options(),{
  payload:{ownerRef:ref('abh.tool-call'),mediaType:'application/json',dataClass:'tool.result',
   purposeNames:['abh.artifact.manage'],sourceRefs:[ref('abh.tool-binding')],region:'local',
   retentionPolicyRef:ref('abh.retention-policy')},content:`{"output":"${'x'.repeat(70_000)}"}`,
  objectStore:{async put(){return trackingResult;},async read(){throw new Error('not used');},
   async stat(){throw new Error('not used');},async delete(){throw new Error('not used');}},
  authorizedContextRef:authorizedContext,verifyReferences:async()=>{}});
 assert.equal(stored.status,'Staged');
 const [tracked]=await f.admin`SELECT attempt_id,artifact_id,tracking_ref,status FROM data.object_staging_attempts WHERE status='Tracked'`;
 assert.equal(String(tracked!.artifact_id),stored.stagedArtifactRef.id);assert.deepEqual(tracked!.tracking_ref,trackingResult.trackingRef);
 const storedObject=ref('abh.stored-object');
 await f.database.transaction(c,options(),tx=>owner.resolveTracking(tx,tracked!.attempt_id,storedObject));
 const candidate={attemptId:String(tracked!.attempt_id),artifactRef:stored.stagedArtifactRef,
  objectRef:storedObject,proofId:randomUUID(),
  deleteIdempotencyKey:randomUUID()};
 const deleted:import('@abh/contracts').DeleteObjectRequest[]=[];
 const objectStore={async put(){throw new Error('not used');},async read(){throw new Error('not used');},
  async stat(){throw new Error('not used');},async delete(request:import('@abh/contracts').DeleteObjectRequest){
   deleted.push(structuredClone(request));assert.deepEqual(request.objectRef,candidate.objectRef);
   assert.equal(request.deletionProofRef.type,'abh.deletion-proof');assert.equal(request.deletionProofRef.version,1);
   assert.match(request.idempotencyKey,/^[\da-f-]{36}$/);
   assert.equal(request.context.target.action,'abh.artifacts.delete');
   return {status:'Completed' as const,data:{objectRef:candidate.objectRef,
    receiptRef:{type:'abh.deletion-proof',id:candidate.proofId,version:1}}};}};
 const cleanup=async(attempt:string,store:import('@abh/contracts/ports').ObjectStorePort)=>cleanupAbandonedObjectArtifact(
  f.database,worker,options(),attempt,{...cleanupOptions,objectStore:store,
   authorizedContextRef:authorizedContext});
 assert.equal(await cleanup(candidate.attemptId,objectStore),true);
 assert.equal(deleted.length,1);
 const [completed]=await f.admin`SELECT s.status,a.status AS artifact_status,a.version
  FROM data.object_staging_attempts s JOIN data.artifacts a ON a.id=s.artifact_id WHERE s.attempt_id=${candidate.attemptId}`;
 assert.equal(completed!.status,'CleanupCompleted');assert.equal(completed!.artifact_status,'Tombstoned');
 assert.equal(Number(completed!.version),2);
 const [proof]=await f.admin`SELECT proof_id,delete_idempotency_key FROM data.object_staging_attempts WHERE attempt_id=${candidate.attemptId}`;
 assert.equal(String(proof!.proof_id),deleted[0]!.deletionProofRef.id);assert.equal(proof!.delete_idempotency_key,deleted[0]!.idempotencyKey);
 assert.equal(await cleanup(candidate.attemptId,objectStore),false);assert.equal(deleted.length,1);
 const [activeLease]=await f.admin`SELECT count(*)::int AS count FROM runtime.work_leases
  WHERE target_type='abh.artifact' AND target_id=${candidate.artifactRef.id} AND lease_until>clock_timestamp()`;
 assert.equal(activeLease!.count,0);

 const recoveredObject=ref('abh.stored-object');
 const uncertainContent=`{"output":"${'z'.repeat(70_000)}"}`;
 const uncertainStore:import('@abh/contracts/ports').ObjectStorePort={async put(request){return {status:'Completed' as const,data:{
   objectRef:recoveredObject,digest:request.digest,sizeBytes:Buffer.byteLength(uncertainContent),
   mediaType:'application/json'}};},
  async read(){return {status:'Cancelled' as const,effect:'None' as const};},
  async stat(){throw new Error('not used');},async delete(){throw new Error('not used');}};
 await assert.rejects(storeObjectArtifact(f.database,c,options(),{
  payload:{ownerRef:ref('abh.tool-call'),mediaType:'application/json',dataClass:'tool.result',
   purposeNames:['abh.artifact.manage'],sourceRefs:[ref('abh.tool-binding')],region:'local',
   retentionPolicyRef:ref('abh.retention-policy')},content:uncertainContent,
  objectStore:uncertainStore,authorizedContextRef:authorizedContext,verifyReferences:async()=>{}}),
  {code:'DEPENDENCY_TIMEOUT'});
 const [recorded]=await f.admin`SELECT attempt_id,object_ref,status FROM data.object_staging_attempts
  WHERE attempt_id=(SELECT attempt_id FROM data.object_staging_attempts WHERE object_id=${recoveredObject.id})`;
 assert.equal(recorded!.status,'Recorded');assert.deepEqual(recorded!.object_ref,recoveredObject);
 const uncertainDeleted:import('@abh/contracts').DeleteObjectRequest[]=[];
 const uncertainReceiptId=randomUUID();
 assert.equal(await cleanup(String(recorded!.attempt_id),{...uncertainStore,async delete(request){
  uncertainDeleted.push(structuredClone(request));assert.deepEqual(request.objectRef,recoveredObject);
  return {status:'Completed' as const,data:{objectRef:recoveredObject,
   receiptRef:{type:'abh.deletion-proof',id:uncertainReceiptId,version:1}}};}}),true);
 assert.equal(uncertainDeleted.length,1);
 const [recoveredRow]=await f.admin`SELECT s.status,a.status AS artifact_status
  FROM data.object_staging_attempts s JOIN data.artifacts a ON a.id=s.artifact_id
  WHERE s.attempt_id=${recorded!.attempt_id}`;
 assert.equal(recoveredRow!.status,'CleanupCompleted');assert.equal(recoveredRow!.artifact_status,'Tombstoned');

 const secondInput={ownerRef:ref('abh.tool-call'),mediaType:'application/json',dataClass:'tool.result',
  purposeNames:['abh.artifact.manage'],sourceRefs:[ref('abh.tool-binding')],region:'local',
  retentionPolicyRef:ref('abh.retention-policy')},secondAttempt=randomUUID(),
  secondObject=ref('abh.stored-object'),secondTracking=ref('abh.artifact');
 const command:import('../src/data/journal.ts').CommandIdentity={type:'abh.artifacts.store-object',
  commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({operation:'stage-worker'})};
 const staged=await f.database.transaction(c,options(),tx=>owner.stage(tx,command,secondInput,
  `{"output":"${'y'.repeat(70_000)}"}`,async()=>{},secondAttempt));
 await f.database.transaction(c,options(),tx=>owner.track(tx,secondAttempt,staged.record.artifactRef,secondTracking));
 await f.database.transaction(c,options(),tx=>owner.resolveTracking(tx,secondAttempt,secondObject));
 let observed:boolean|undefined;const stop=new AbortController();
 await runObjectCleanupWorker(f.database,{workerId:cleanupOptions.workerId,context:async()=>worker,
  objectStore:{async put(){throw new Error('not used');},async read(){throw new Error('not used');},
   async stat(){throw new Error('not used');},async delete(request){
   assert.equal(request.objectRef.id,secondObject.id);
   return {status:'Completed' as const,data:{objectRef:secondObject,
    receiptRef:{type:'abh.deletion-proof',id:request.deletionProofRef.id,version:1}}};}},
  authorizedContextRef:authorizedContext,grantRefs:grants,signal:stop.signal,
  resolveTracking:async()=>secondObject,
  pageSize:100,intervalMs:1,minimumAgeMs:0,leaseSeconds:30,
  onPage:async result=>{observed=result.scanned===1&&result.cleaned===1;stop.abort();}});
 assert.equal(observed,true);
 const [secondRow]=await f.admin`SELECT status FROM data.object_staging_attempts WHERE attempt_id=${secondAttempt}`;
 assert.equal(secondRow!.status,'CleanupCompleted');
});
test('inline artifacts verify bytes, current access and tombstones', {timeout:120_000},async t=> {
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=f.database,c=context(),owner=new InlineArtifactOwner();
  const input:StoreInlineArtifactPayload={ownerRef:ref('abh.organization',c.tenant.resourceOrganizationId),mediaType:'text/plain',content:'内部简报\nRevenue: 100.01',dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],sourceRefs:[],region:'local',retentionPolicyRef:ref('abh.artifact')};
  const store=async(payload=input)=>{
    const cmd:CommandIdentity={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};let record:ArtifactRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{record=await owner.store(tx,cmd,payload,async()=>{});return record.artifactRef;}));return record!;
  };
  const artifact=await store();
  await t.test('UTF-8 content and digest round trip through an Available artifact',async()=> {
    const read=await db.transaction(c,{...options(),readOnly:true},tx=>owner.read(tx,artifact.artifactRef,async()=>{}));
    assert.equal(new TextDecoder().decode(read.bytes),input.content);assert.equal(read.record.sizeBytes,Buffer.byteLength(input.content));
    assert.equal(read.record.artifactRef.version,2);
    const events=await db.transaction(c,options(),tx=>tx.owner('DurableExecution')`SELECT record FROM data.outbox WHERE aggregate_id=${artifact.artifactRef.id} ORDER BY aggregate_version`);
    assert.deepEqual(events.map(e=>e.record.type),['abh.artifact.created','abh.artifact.publish']);
  });
  await t.test('unknown media, malformed JSON, byte-size overflow and invalid Unicode fail before writes',async()=> {
    for(const patch of [{mediaType:'text/html'},{mediaType:'application/json',content:'{invalid'},{content:'汉'.repeat(30_000)},{content:'\ud800'}])await assert.rejects(store({...input,...patch}));
    const rows=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT count(*) FROM data.artifacts`);assert.equal(rows[0]!.count,'1');
  });
  await t.test('authorization cannot replace returned Artifact metadata',async()=>{
    const read=await db.transaction(c,options(),tx=>owner.read(tx,artifact.artifactRef,async record=>{
      record.mediaType='application/json';record.ownerRef.id=randomUUID();record.sourceRefs.push(ref('abh.artifact'));
    }));
    assert.equal(read.record.mediaType,input.mediaType);assert.deepEqual(read.record.ownerRef,input.ownerRef);assert.deepEqual(read.record.sourceRefs,[]);
  });
  await t.test('tenant, purpose and current object authorization are required on every read',async()=> {
    await assert.rejects(db.transaction(context(),options(),tx=>owner.read(tx,artifact.artifactRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
    const otherPurpose=deriveVerifiedContext({...c.request,purposeOfUse:'abh.artifact.read'});
    await assert.rejects(db.transaction(otherPurpose,options(),tx=>owner.read(tx,artifact.artifactRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(db.transaction(c,options(),tx=>owner.read(tx,artifact.artifactRef,async()=>{throw new CoreError('FORBIDDEN');})),{code:'FORBIDDEN'});
  });
  await t.test('hash mismatch fails closed and never returns empty or corrupted content',async()=> {
    await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`UPDATE data.artifacts SET inline_body=${new TextEncoder().encode('corrupt')} WHERE id=${artifact.artifactRef.id}`);
    await assert.rejects(db.transaction(c,options(),tx=>owner.read(tx,artifact.artifactRef,async()=>{})),{code:'INTERNAL_ERROR'});
    await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`UPDATE data.artifacts SET inline_body=${new TextEncoder().encode(input.content)} WHERE id=${artifact.artifactRef.id}`);
  });
  await t.test('tombstone advances CAS and blocks reads without erasing retained evidence',async()=> {
    const evidence=ref('abh.decision'),cmd:CommandIdentity={type:'abh.artifacts.tombstone',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({artifact:artifact.artifactRef,evidence})};let tombstone:ArtifactRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{tombstone=await owner.tombstone(tx,cmd,artifact.artifactRef,evidence,async record=>{record.mediaType="application/json";record.ownerRef.id=randomUUID();});return tombstone.artifactRef;}));
    assert.equal(tombstone!.mediaType,input.mediaType);assert.deepEqual(tombstone!.ownerRef,input.ownerRef);
    await assert.rejects(db.transaction(c,options(),tx=>owner.read(tx,tombstone!.artifactRef,async()=>{})),{code:'FORBIDDEN'});
    await assert.rejects(db.transaction(c,options(),tx=>owner.read(tx,tombstone!.artifactRef,async record=>{record.status='Available';})),{code:'FORBIDDEN'});
    await assert.rejects(db.transaction(c,options(),tx=>owner.read(tx,artifact.artifactRef,async()=>{})),{code:'VERSION_CONFLICT'});
    const rows=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT octet_length(inline_body) AS size FROM data.artifacts WHERE id=${artifact.artifactRef.id}`);
    assert.equal(rows[0]!.size,Buffer.byteLength(input.content));
  });
});


test('artifact storage ingress validates current grants and governance before atomic acceptance and replay',{timeout:120000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:2});t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,scope=ref('abh.organization',org),principal=ref('abh.principal',c.tenant.actor.id),owner=new InlineArtifactOwner();
  const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.artifacts.store-inline'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'artifact ingress','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'artifact uploader','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  });
  const input:StoreInlineArtifactPayload={ownerRef:scope,mediaType:'application/json',content:'{"message":"真实输入"}',purposeNames:['abh.action.prepare'],dataClass:'abh.data.internal',sourceRefs:[scope],region:'local',retentionPolicyRef:ref('abh.artifact')};
  const command:CommandIdentity={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({organizationId:org,payload:input})};
  let allowed=true,references=true;
  const checks={fenceRefs:async()=>[],admit:async(_tx:unknown,received:StoreInlineArtifactPayload)=>{if(!allowed)throw new CoreError('FORBIDDEN');received.content='mutated callback';},references:async()=>{if(!references)throw new CoreError('RESOURCE_NOT_FOUND');}};
  const invoke=(database=db,grants=[grant.grantRef])=>storeInlineArtifact(database,c,options(),command,org,input,grants,checks);
  await assert.rejects(invoke(db,[]),{code:'AUTHORITY_REQUIRED'});allowed=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});allowed=true;
  references=false;await assert.rejects(invoke(),{code:'RESOURCE_NOT_FOUND'});references=true;
  await assert.rejects(storeInlineArtifact(db,c,options(),{...command,digest:await inputDigest({organizationId:randomUUID(),payload:input})},org,input,[grant.grantRef],checks),{code:'INVALID_ARGUMENT'});
  await f.admin`CREATE FUNCTION data.fixture_reject_artifact_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'artifact publication rollback'; END; $$`;
  await f.admin`CREATE TRIGGER fixture_reject_artifact_publish BEFORE UPDATE ON data.artifacts FOR EACH ROW EXECUTE FUNCTION data.fixture_reject_artifact_publish()`;
  try{await assert.rejects(invoke(),/artifact publication rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_artifact_publish ON data.artifacts`;await f.admin`DROP FUNCTION data.fixture_reject_artifact_publish()`;}
  const [empty]=await f.admin`SELECT (SELECT count(*) FROM data.artifacts) AS artifacts,(SELECT count(*) FROM data.outbox) AS events,(SELECT count(*) FROM data.command_receipts) AS receipts`;
  assert.deepEqual({...empty},{artifacts:'0',events:'0',receipts:'0'});
  const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(result=>result.replayed).length,1);assert.deepEqual(results[0]!.artifactRef,results[1]!.artifactRef);
  const read=await db.transaction(c,options(),tx=>owner.read(tx,results[0]!.artifactRef,async()=>{}));assert.equal(new TextDecoder().decode(read.bytes),input.content);
  const reconnect=await Database.connect(f.runtimeUrl,{max:1});try{assert.equal((await invoke(reconnect)).commandId,command.commandId);}finally{await reconnect.close();}
  const changed={...input,content:'{"different":true}'};
  await assert.rejects(storeInlineArtifact(db,c,options(),{...command,digest:await inputDigest({organizationId:org,payload:changed})},org,changed,[grant.grantRef],checks),{code:'IDEMPOTENCY_CONFLICT'});
  const tombstone={type:'abh.artifacts.tombstone',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(results[0]!.artifactRef)};
  await db.transaction(c,options(),tx=>owner.tombstone(tx,tombstone,results[0]!.artifactRef,scope,async()=>{}));
  assert.deepEqual((await invoke()).artifactRef,results[0]!.artifactRef);
  allowed=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});allowed=true;references=false;await assert.rejects(invoke(),{code:'RESOURCE_NOT_FOUND'});references=true;
  const issuer='artifact.http.fixture',audience='abh.test',subject=randomUUID(),identityDigest=await inputDigest([issuer,subject]);
  await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${principal.id},1)`;
  const identity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{issuer,audience,subject,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
  const app=createCoreHttpApp({database:db,identity,credentials:async request=>{if(request.headers.authorization!=='Bearer fixture')throw new CoreError('UNAUTHENTICATED');return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.action.prepare'};},artifactStorage:{grants:async()=>[grant.grantRef],checks}});
  t.after(()=>app.close());
  const key=randomUUID(),url='/v1/commands/abh.artifacts.store-inline';
  const send=(payload=input,target=org,headers:Record<string,string>={authorization:'Bearer fixture'})=>app.inject({method:'POST',url,headers:{...headers,'idempotency-key':key},payload:{target:{type:'abh.organization',id:target},payload}});
  assert.equal((await send(input,org,{})).statusCode,401);assert.equal((await send(input,randomUUID())).statusCode,403);
  allowed=false;assert.equal((await send()).statusCode,403);allowed=true;
  assert.equal((await send({...input,mediaType:'text/html'})).statusCode,400);
  const responses=await Promise.all([send(),send()]);for(const response of responses)assert.equal(response.statusCode,201,response.body);
  assert.deepEqual(responses[0]!.json(),responses[1]!.json());assert.equal(responses[0]!.headers.etag,'"2"');assert.equal(responses[0]!.headers.location,undefined);
  const accepted=responses[0]!.json();assert.equal(accepted.data.objectRef.type,'abh.artifact');
  assert.equal(new TextDecoder().decode((await db.transaction(c,options(),tx=>owner.read(tx,accepted.data.objectRef,async()=>{}))).bytes),input.content);
  const client=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer fixture'}),fetch:async(url,init)=>{
    const response=await app.inject({method:init?.method as 'POST',url:new URL(String(url)).pathname,headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
    return new Response(response.body,{status:response.statusCode,headers:{'content-type':String(response.headers['content-type'])}});
  }});
  const replay=()=>client.artifacts.storeInline({organizationId:org,idempotencyKey:key,payload:input});
  assert.deepEqual(await replay(),accepted);references=false;await assert.rejects(replay(),error=>error instanceof AbhClientError&&error.response?.error.code==='RESOURCE_NOT_FOUND');references=true;
  assert.equal((await send(changed)).json().error.code,'IDEMPOTENCY_CONFLICT');
  await db.transaction(c,options(),tx=>tx.owner('Control')`UPDATE control.fences SET stop_flag=true,epoch=epoch+1 WHERE scope_type='abh.grant' AND scope_id=${grant.grantRef.id}`);
  await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
  await assert.rejects(replay(),error=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');
  const [final]=await f.admin`SELECT count(*) AS artifacts FROM data.artifacts`;assert.equal(final!.artifacts,'2');
});
