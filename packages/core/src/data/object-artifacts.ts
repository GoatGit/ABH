import { randomUUID } from 'node:crypto';
import type { ArtifactRecord, AuthorizedContextRef, Digest, EntityRef, ObjectDescriptor, PortCallContext, StoredObjectRef } from '@abh/contracts';
import type { ObjectStorePort } from '@abh/contracts/ports';
import { digestBytes } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from './uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { appendChange,contract,inputDigest,type CommandIdentity } from './journal.ts';
import { CoreError } from '../internal/errors.ts';

export type ObjectArtifactInput=Omit<import('@abh/contracts').StoreInlineArtifactPayload,'content'>;
export type StagedObjectArtifact={
  readonly record:ArtifactRecord;
  readonly bytes:Uint8Array;
  readonly digest:Digest;
  readonly mediaType:string;
};
export type ObjectArtifactRange={readonly start:number;readonly endInclusive:number};
export type ObjectArtifactRead={
  readonly record:ArtifactRecord;
  readonly object:ObjectDescriptor;
  readonly bytes:Uint8Array;
  readonly range?:ObjectArtifactRange;
};

const objectMediaTypes=['text/plain','application/json','application/vnd.abh.raw-transport+json'];
const binaryMediaTypes=new Set(['image/png','image/jpeg','image/webp','image/gif']);

function sniffBinaryMediaType(bytes:Uint8Array):string|null{
  const startsWith=(signature:readonly number[],offset=0)=>signature.every((byte,index)=>bytes[offset+index]===byte);
  if(startsWith([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'image/png';
  if(startsWith([0xff,0xd8,0xff]))return 'image/jpeg';
  if(startsWith([0x52,0x49,0x46,0x46])&&startsWith([0x57,0x45,0x42,0x50],8))return 'image/webp';
  if(startsWith([0x47,0x49,0x46,0x38,0x37,0x61])||startsWith([0x47,0x49,0x46,0x38,0x39,0x61]))return 'image/gif';
  return null;
}

function objectRef(value:unknown):StoredObjectRef{
  const ref=contract('EntityRef',value);
  if(ref.type!=='abh.stored-object')throw new CoreError('INVALID_ARGUMENT');
  return {...ref,type:'abh.stored-object'};
}

function descriptorObject(value:unknown):StoredObjectRef{
  return objectRef(value);
}

function descriptor(value:unknown,input:{digest:Digest;sizeBytes:number;mediaType:string}):ObjectDescriptor{
  const object=contract('ObjectDescriptor',value);
  if(object.digest!==input.digest||object.sizeBytes!==input.sizeBytes||object.mediaType!==input.mediaType)
    throw new CoreError('PRECONDITION_FAILED');
  return {...object,objectRef:objectRef(object.objectRef)};
}

/** Persists only Artifact metadata and ObjectStore bindings; content bytes stay in the installed port. */
export class ObjectArtifactOwner {
  async stage(tx:TenantTransaction,command:CommandIdentity,input:ObjectArtifactInput,content:string,
    verifyReferences:(refs:readonly EntityRef[])=>Promise<void>,attemptId:string=randomUUID()):Promise<StagedObjectArtifact>{
    contract('EntityRef',structuredClone(input.ownerRef));contract('RegisteredName',input.dataClass);
    if(!objectMediaTypes.includes(input.mediaType))throw new CoreError('INVALID_ARGUMENT');
    const bytes=new TextEncoder().encode(content);
    if(bytes.length<=65_536||bytes.length>262_144||new TextDecoder('utf-8',{fatal:true}).decode(bytes)!==content)
      throw new CoreError('LIMIT_EXCEEDED');
    if(input.mediaType==='application/json'||input.mediaType.endsWith('+json'))try{JSON.parse(content);}catch{throw new CoreError('INVALID_ARGUMENT');}
    return this.#persist(tx,command,input,bytes,verifyReferences,attemptId);
  }

  async stageBinary(tx:TenantTransaction,command:CommandIdentity,input:ObjectArtifactInput,content:Uint8Array,
    verifyReferences:(refs:readonly EntityRef[])=>Promise<void>,attemptId:string=randomUUID()):Promise<StagedObjectArtifact>{
    contract('EntityRef',structuredClone(input.ownerRef));contract('RegisteredName',input.dataClass);
    if(content.length<=65_536||content.length>262_144)throw new CoreError('LIMIT_EXCEEDED');
    if(!binaryMediaTypes.has(input.mediaType)||!sniffBinaryMediaType(content))throw new CoreError('INVALID_ARGUMENT');
    const bytes=new Uint8Array(content.byteLength);bytes.set(content);
    if(sniffBinaryMediaType(bytes)!==input.mediaType)throw new CoreError('INVALID_ARGUMENT');
    return this.#persist(tx,command,input,bytes,verifyReferences,attemptId);
  }

  async #persist(tx:TenantTransaction,command:CommandIdentity,input:ObjectArtifactInput,bytes:Uint8Array,
    verifyReferences:(refs:readonly EntityRef[])=>Promise<void>,attemptId:string):Promise<StagedObjectArtifact>{
    await verifyReferences([input.ownerRef,input.retentionPolicyRef,...input.sourceRefs]);
    const c=tx.context.tenant;
    if(!input.purposeNames.includes(c.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
    const digest=await digestBytes(bytes),id=randomUUID();contract('UUID',attemptId);
    const staged=contract('ArtifactRecord',{artifactRef:{type:'abh.artifact',id,version:1},resourceOrganizationId:c.resourceOrganizationId,
      ownerRef:input.ownerRef,mediaType:input.mediaType,sizeBytes:bytes.length,contentDigest:digest,status:'Staged',dataClass:input.dataClass,
      purposeNames:input.purposeNames,sourceRefs:input.sourceRefs,region:input.region,retentionPolicyRef:input.retentionPolicyRef});
    await tx.owner('ArtifactStore')`INSERT INTO data.artifacts(resource_organization_id,id,workspace_id,purpose_names,record,inline_body,content_digest,status)
      VALUES (${c.resourceOrganizationId},${id},${c.workspaceId??null},${input.purposeNames},${JSON.stringify(staged)}::text::jsonb,NULL,${digest},'Staged')`;
    await tx.owner('ArtifactStore')`INSERT INTO data.object_staging_attempts(resource_organization_id,attempt_id,workspace_id,purpose_names,artifact_id,artifact_version,status)
      VALUES (${c.resourceOrganizationId},${attemptId},${c.workspaceId??null},${input.purposeNames},${id},1,'Pending')`;
    await appendChange(tx,{command,target:staged.artifactRef,eventType:'abh.artifact.created',changedFields:['status','contentDigest'],relatedRefs:[input.ownerRef]});
    return {record:staged,bytes,digest,mediaType:input.mediaType};
  }

  async attach(tx:TenantTransaction,stagedRef:EntityRef,completed:unknown,command:CommandIdentity,
    attemptId?:string):Promise<ArtifactRecord>{
    const ref=contract('EntityRef',structuredClone(stagedRef)),supplied=contract('ObjectDescriptor',completed),
      suppliedObject=objectRef(supplied.objectRef);
    const c=tx.context.tenant;
    const [row]=await tx.owner('ArtifactStore')`SELECT record,version,status FROM data.artifacts
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
    if(!row||Number(row.version)!==ref.version||row.status!=='Staged')throw new CoreError('PRECONDITION_FAILED');
    const staged=contract('ArtifactRecord',row.record);
    const object=descriptor(supplied,{digest:staged.contentDigest,sizeBytes:staged.sizeBytes,mediaType:staged.mediaType});
    if(staged.artifactRef.id!==ref.id||staged.status!=='Staged'||object.digest!==staged.contentDigest
      ||object.sizeBytes!==staged.sizeBytes||object.mediaType!==staged.mediaType)throw new CoreError('PRECONDITION_FAILED');
    const purposes=structuredClone(staged.purposeNames);
    await tx.owner('ArtifactStore')`INSERT INTO data.object_artifacts(resource_organization_id,artifact_id,artifact_version,workspace_id,purpose_names,object_id,object_version,object_ref,content_digest,size_bytes,media_type)
      VALUES (${c.resourceOrganizationId},${ref.id},${ref.version+1},${c.workspaceId??null},${purposes},${suppliedObject.id},${suppliedObject.version},${JSON.stringify(object.objectRef)}::text::jsonb,
        ${object.digest},${object.sizeBytes},${object.mediaType})`;
    if(attemptId!==undefined){contract('UUID',attemptId);
      const published=await tx.owner('ArtifactStore')`UPDATE data.object_staging_attempts SET status='Published',updated_at=clock_timestamp(),updated_by=${c.actor.id}
        WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND artifact_id=${ref.id}
          AND artifact_version=${ref.version} AND status IN ('Pending','Tracked','Recorded') RETURNING attempt_id`;
      if(!published[0])throw new CoreError('VERSION_CONFLICT');}
    const available=contract('ArtifactRecord',{...staged,artifactRef:{...staged.artifactRef,version:2},status:'Available'});
    const changed=await tx.owner('ArtifactStore')`UPDATE data.artifacts SET status='Available',version=2,
      record=${JSON.stringify(available)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=1 AND status='Staged' RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:available.artifactRef,eventType:'abh.artifact.publish',changedFields:['status'],relatedRefs:staged.sourceRefs});
    return available;
  }

  async track(tx:TenantTransaction,attemptId:string,artifactRef:EntityRef,trackingRef:EntityRef):Promise<void>{
    contract('UUID',attemptId);const ref=contract('EntityRef',structuredClone(artifactRef)),
      tracking=contract('EntityRef',structuredClone(trackingRef)),c=tx.context.tenant;
    const [row]=await tx.owner('ArtifactStore')`SELECT s.artifact_id,s.artifact_version,a.status FROM data.object_staging_attempts s
      JOIN data.artifacts a ON a.resource_organization_id=s.resource_organization_id AND a.id=s.artifact_id AND a.version=s.artifact_version
      WHERE s.resource_organization_id=${c.resourceOrganizationId} AND s.attempt_id=${attemptId} FOR UPDATE OF s,a`;
    if(!row||String(row.artifact_id)!==ref.id||Number(row.artifact_version)!==ref.version||row.status!=='Staged')
      throw new CoreError('PRECONDITION_FAILED');
    const changed=await tx.owner('ArtifactStore')`UPDATE data.object_staging_attempts SET tracking_id=${tracking.id},tracking_version=${tracking.version},
      tracking_ref=${JSON.stringify(tracking)}::text::jsonb,status='Tracked',updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND status='Pending' RETURNING attempt_id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
  }

  async abandonedStaged(tx:TenantTransaction,limit:number,afterAttempt?:string,
    minimumAgeMs=1000):Promise<ObjectStagingCleanupItem[]>{
    if(tx.context.tenant.purposeOfUse!=='abh.artifact.manage'||!Number.isSafeInteger(limit)||limit<1||limit>100
      ||!Number.isSafeInteger(minimumAgeMs)||minimumAgeMs<0||minimumAgeMs>3_600_000)throw new CoreError('INVALID_ARGUMENT');
    if(afterAttempt!==undefined)contract('UUID',afterAttempt);
    const c=tx.context.tenant,rows=await tx.owner('ArtifactStore')`
      SELECT s.status,s.attempt_id,s.artifact_id,s.artifact_version,s.tracking_ref,
        s.object_id,s.object_version,s.object_ref,s.proof_id,s.delete_idempotency_key
      FROM data.object_staging_attempts s JOIN data.artifacts a
        ON a.resource_organization_id=s.resource_organization_id AND a.id=s.artifact_id
        AND a.version=s.artifact_version AND a.status='Staged'
      WHERE s.resource_organization_id=${c.resourceOrganizationId} AND s.status IN ('Tracked','Recorded','Ready','CleanupQueued')
        AND s.updated_at<=clock_timestamp()-(${String(minimumAgeMs)}||' milliseconds')::interval
        AND (${afterAttempt??null}::uuid IS NULL OR s.attempt_id>${afterAttempt??null}::uuid)
      ORDER BY s.attempt_id LIMIT ${limit}`;
    return rows.map(row=>{
      const attemptId=String(row.attempt_id),artifactRef={type:'abh.artifact' as const,id:String(row.artifact_id),
        version:Number(row.artifact_version)},tracking=contract('EntityRef',row.tracking_ref);
      if(tracking.type!=='abh.artifact')throw new CoreError('INTERNAL_ERROR');
      if(row.status==='Tracked')return {status:'Tracked' as const,attemptId,artifactRef,trackingRef:tracking};
      const raw=contract('EntityRef',row.object_ref);if(raw.type!=='abh.stored-object')throw new CoreError('INTERNAL_ERROR');
      return {status:row.status==='Recorded'?'Ready':row.status as 'Ready'|'CleanupQueued',attemptId,artifactRef,
        objectRef:{...raw,type:'abh.stored-object'},proofId:String(row.proof_id),
        deleteIdempotencyKey:String(row.delete_idempotency_key)};
    });
  }

  async resolveTracking(tx:TenantTransaction,attemptId:string,objectRef:StoredObjectRef):Promise<void>{
    contract('UUID',attemptId);const object=descriptorObject(objectRef),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.artifact.manage')throw new CoreError('PURPOSE_DENIED');
    const changed=await tx.owner('ArtifactStore')`UPDATE data.object_staging_attempts SET object_id=${object.id},
      object_version=${object.version},object_ref=${JSON.stringify(object)}::text::jsonb,status='Ready',
      updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND status='Tracked' RETURNING attempt_id`;
    if(!changed[0])throw new CoreError('PRECONDITION_FAILED');
  }

  /** Persist the addressable object immediately after an untracked Completed put. */
  async recordCompleted(tx:TenantTransaction,attemptId:string,objectRef:StoredObjectRef):Promise<void>{
    contract('UUID',attemptId);const object=descriptorObject(objectRef),c=tx.context.tenant;
    const changed=await tx.owner('ArtifactStore')`UPDATE data.object_staging_attempts SET object_id=${object.id},
      object_version=${object.version},object_ref=${JSON.stringify(object)}::text::jsonb,status='Recorded',
      updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND status='Pending' RETURNING attempt_id`;
    if(!changed[0])throw new CoreError('PRECONDITION_FAILED');
  }

  async queueCleanup(tx:TenantTransaction,attemptId:string):Promise<ObjectStagingCleanupCandidate>{
    contract('UUID',attemptId);const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.artifact.manage')throw new CoreError('PURPOSE_DENIED');
    const [row]=await tx.owner('ArtifactStore')`SELECT s.artifact_id,s.artifact_version,s.object_ref,s.proof_id,
      s.delete_idempotency_key,s.status,a.status AS artifact_status
      FROM data.object_staging_attempts s JOIN data.artifacts a
        ON a.resource_organization_id=s.resource_organization_id AND a.id=s.artifact_id AND a.version=s.artifact_version
      WHERE s.resource_organization_id=${c.resourceOrganizationId} AND s.attempt_id=${attemptId} FOR UPDATE OF s,a`;
    if(!row||row.status!=='Recorded'&&row.status!=='Ready'&&row.status!=='CleanupQueued'||row.artifact_status!=='Staged')
      throw new CoreError('PRECONDITION_FAILED');
    const proofId=row.proof_id?String(row.proof_id):randomUUID(),
      deleteIdempotencyKey=row.delete_idempotency_key??randomUUID();
    if(row.status!=='CleanupQueued')await tx.owner('ArtifactStore')`
      UPDATE data.object_staging_attempts SET proof_id=${proofId},proof_version=1,
        delete_idempotency_key=${deleteIdempotencyKey},status='CleanupQueued',
        updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND status IN ('Recorded','Ready')`;
    else await tx.owner('ArtifactStore')`UPDATE data.object_staging_attempts SET updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND status='CleanupQueued'`;
    const raw=contract('EntityRef',row.object_ref);if(raw.type!=='abh.stored-object')throw new CoreError('INTERNAL_ERROR');
    return {status:row.status as 'Ready'|'CleanupQueued',attemptId,artifactRef:{type:'abh.artifact',id:String(row.artifact_id),version:Number(row.artifact_version)},
      objectRef:{...raw,type:'abh.stored-object'},proofId,deleteIdempotencyKey};
  }

  async completeCleanup(tx:TenantTransaction,command:CommandIdentity,attemptId:string,artifactRef:EntityRef,
    objectRef:StoredObjectRef,receiptRef:EntityRef):Promise<void>{
    contract('UUID',attemptId);const ref=contract('EntityRef',structuredClone(artifactRef)),
      object=descriptorObject(objectRef),evidence=contract('EntityRef',structuredClone(receiptRef)),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.artifact.manage')throw new CoreError('PURPOSE_DENIED');
    const [row]=await tx.owner('ArtifactStore')`SELECT s.status,s.object_ref,a.record FROM data.object_staging_attempts s
      JOIN data.artifacts a ON a.resource_organization_id=s.resource_organization_id AND a.id=s.artifact_id
        AND a.version=s.artifact_version
      WHERE s.resource_organization_id=${c.resourceOrganizationId} AND s.attempt_id=${attemptId}
        FOR UPDATE OF s,a`;
    if(!row||row.status!=='CleanupQueued')throw new CoreError('PRECONDITION_FAILED');
    const staged=contract('ArtifactRecord',row.record);
    const boundObject=descriptorObject(row.object_ref);
    if(staged.artifactRef.id!==ref.id||staged.artifactRef.version!==ref.version||staged.status!=='Staged'
      ||boundObject.id!==object.id||boundObject.version!==object.version||boundObject.type!==object.type)
      throw new CoreError('PRECONDITION_FAILED');
    const tombstoned=contract('ArtifactRecord',{...staged,artifactRef:{...staged.artifactRef,version:ref.version+1},status:'Tombstoned'});
    const changedArtifact=await tx.owner('ArtifactStore')`UPDATE data.artifacts SET status='Tombstoned',version=version+1,
      record=${JSON.stringify(tombstoned)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}
        AND status='Staged' RETURNING id`;
    const changedAttempt=await tx.owner('ArtifactStore')`UPDATE data.object_staging_attempts SET status='CleanupCompleted',
      updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${attemptId} AND status='CleanupQueued' RETURNING attempt_id`;
    if(!changedArtifact[0]||!changedAttempt[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:tombstoned.artifactRef,eventType:'abh.artifact.tombstone',
      changedFields:['status'],relatedRefs:[evidence]});
  }

  async load(tx:TenantTransaction,artifactRef:EntityRef,authorize:(record:ArtifactRecord,object:ObjectDescriptor)=>Promise<void>):
    Promise<{record:ArtifactRecord;object:ObjectDescriptor}>{
    const ref=contract('EntityRef',structuredClone(artifactRef));if(ref.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('ArtifactStore')`SELECT a.record AS artifact,a.version,a.status,o.object_ref
      FROM data.artifacts a JOIN data.object_artifacts o
        ON o.resource_organization_id=a.resource_organization_id AND o.artifact_id=a.id AND o.artifact_version=a.version
      WHERE a.resource_organization_id=${c.resourceOrganizationId} AND a.id=${ref.id} AND a.deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(a.purpose_names) AND (a.workspace_id IS NULL OR a.workspace_id=${c.workspaceId??null}::uuid)`;
    const row=rows[0];if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
    const record=contract('ArtifactRecord',row.artifact);
    if(record.artifactRef.id!==ref.id||record.artifactRef.version!==ref.version||record.status!=='Available'||row.status!=='Available')
      throw new CoreError('PRECONDITION_FAILED');
    const raw=contract('EntityRef',row.object_ref);if(raw.type!=='abh.stored-object')throw new CoreError('INTERNAL_ERROR');
    const object=descriptor({objectRef:raw,digest:record.contentDigest,sizeBytes:record.sizeBytes,mediaType:record.mediaType},
      {digest:record.contentDigest,sizeBytes:record.sizeBytes,mediaType:record.mediaType});
    await authorize(structuredClone(record),object);tx.assertActive();
    return {record,object};
  }

  /** Proxy through the installed port; no signed URL and no bypass of Artifact authorization. */
  async read(database:Database,context:VerifiedContext,options:TransactionOptions,artifactRef:EntityRef,
    objectStore:import('@abh/contracts/ports').ObjectStorePort,authorizedContextRef:AuthorizedContextRef,
    authorize:(record:ArtifactRecord,object:ObjectDescriptor)=>Promise<void>,range?:ObjectArtifactRange):
    Promise<{record:ArtifactRecord;object:ObjectDescriptor;bytes:Uint8Array;range?:ObjectArtifactRange}>{
    const current=await database.transaction(context,{...options,readOnly:true},tx=>this.load(tx,artifactRef,authorize));
    if(range!==undefined){
      if(!Number.isInteger(range.start)||!Number.isInteger(range.endInclusive)||range.start<0
        ||range.endInclusive<range.start||range.endInclusive>=current.record.sizeBytes)throw new CoreError('INVALID_ARGUMENT');
    }
    const deadline=new Date(Math.min(options.deadline,Date.parse(context.tenant.contextExpiresAt))).toISOString();
    const request=contract('ReadObjectRequest',{context:{
      callId:randomUUID(),requestContextRef:{type:'abh.request-context',id:context.tenant.requestId,version:1},
      target:{objectRef:current.object.objectRef,scopeRefs:[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1}],
        action:'abh.artifacts.read'},deadline,
    },authorizedContextRef:structuredClone(authorizedContextRef),objectRef:current.object.objectRef,
      ...(range?{range:{start:range.start,endInclusive:range.endInclusive}}:{})});
    const response=await objectStore.read(request,{signal:options.signal});
    if(response.status!=='Completed')throw new CoreError('DEPENDENCY_TIMEOUT');
    const object=descriptor(response.data.object,{digest:current.record.contentDigest,
      sizeBytes:current.record.sizeBytes,mediaType:current.record.mediaType});
    if(response.data.range?.start!==range?.start||response.data.range?.endInclusive!==range?.endInclusive)
      throw new CoreError('PRECONDITION_FAILED');
    const expectedLength=range?range.endInclusive-range.start+1:current.record.sizeBytes;
    const bytes=await readBounded(response.data.content,262_144);
    if(bytes.byteLength!==expectedLength)throw new CoreError('PRECONDITION_FAILED');
    if(!range&&await digestBytes(bytes)!==current.record.contentDigest)throw new CoreError('PRECONDITION_FAILED');
    const rechecked=await database.transaction(context,{...options,readOnly:true},tx=>this.load(tx,artifactRef,authorize));
    if(JSON.stringify(rechecked.record)!==JSON.stringify(current.record)
      ||JSON.stringify(rechecked.object)!==JSON.stringify(current.object))throw new CoreError('PRECONDITION_FAILED');
    return {record:rechecked.record,object:rechecked.object,bytes,
      ...(range?{range:{start:range.start,endInclusive:range.endInclusive}}:{})};
  }
}

export type ObjectStagingCleanupCandidate={
  readonly status:'Ready'|'CleanupQueued';readonly attemptId:string;readonly artifactRef:EntityRef;
  readonly objectRef:StoredObjectRef;readonly proofId:string;readonly deleteIdempotencyKey:string;
};
export type ObjectStagingCleanupItem={readonly status:'Tracked';readonly attemptId:string;
  readonly artifactRef:EntityRef;readonly trackingRef:EntityRef}|
  ({readonly status:'Ready'|'CleanupQueued'}&Omit<ObjectStagingCleanupCandidate,'status'>);

export interface StoreObjectArtifactInput {
  readonly payload:ObjectArtifactInput;
  readonly content:string|Uint8Array;
  readonly objectStore:ObjectStorePort;
  readonly authorizedContextRef:AuthorizedContextRef;
  readonly verifyReferences:(refs:readonly EntityRef[])=>Promise<void>;
}

export type StoreObjectArtifactResult=
  {readonly status:'Available';readonly record:ArtifactRecord}|
  {readonly status:'Staged';readonly stagedArtifactRef:EntityRef;readonly trackingRef:EntityRef};

async function readBounded(content:AsyncIterable<Uint8Array>,limit:number):Promise<Uint8Array>{
  const chunks:Uint8Array[]=[];let size=0;
  for await(const chunk of content){
    if(!(chunk instanceof Uint8Array))throw new CoreError('INVALID_ARGUMENT');
    size+=chunk.byteLength;if(size>limit)throw new CoreError('LIMIT_EXCEEDED');
    chunks.push(chunk);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

async function* bytesToStream(bytes:Uint8Array,chunkSize=65_536):AsyncIterable<Uint8Array>{
  for(let offset=0;offset<bytes.length;offset+=chunkSize)yield bytes.slice(offset,offset+chunkSize);
}

/** Runs the cross-store protocol explicitly; Tracked callers must keep the domain effect pending. */
export async function storeObjectArtifact(database:import('./uow.ts').Database,
  context:import('../internal/context.ts').VerifiedContext,options:import('./uow.ts').TransactionOptions,
  input:StoreObjectArtifactInput):Promise<StoreObjectArtifactResult>{
  const command:CommandIdentity={commandId:randomUUID(),type:'abh.artifacts.store-object',
    idempotencyKey:randomUUID(),digest:await inputDigest({operation:'object-artifact-store'})};
  const attemptId=randomUUID(),owner=new ObjectArtifactOwner(),
    staged=await database.transaction(context,options,tx=>
      typeof input.content==='string'
        ?owner.stage(tx,command,input.payload,input.content,input.verifyReferences,attemptId)
        :owner.stageBinary(tx,command,input.payload,input.content,input.verifyReferences,attemptId));
  const c=context.tenant,request={stagedArtifactRef:staged.record.artifactRef,digest:staged.digest,
    sizeBytes:staged.bytes.byteLength,mediaType:staged.mediaType,idempotencyKey:randomUUID(),
    authorizedContextRef:structuredClone(input.authorizedContextRef),
    context:{callId:randomUUID(),requestContextRef:{type:'abh.request-context' as const,id:c.requestId,version:1},
      target:{objectRef:staged.record.artifactRef,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
        action:'abh.artifacts.store'},deadline:new Date(options.deadline).toISOString()}};
  const result=await input.objectStore.put(request,{signal:options.signal},bytesToStream(staged.bytes));
  if(result.status==='Tracked'){
    const trackingRef=contract('EntityRef',result.trackingRef);
    await database.transaction(context,options,tx=>owner.track(tx,attemptId,staged.record.artifactRef,trackingRef));
    return {status:'Staged',stagedArtifactRef:staged.record.artifactRef,trackingRef};
  }
  if(result.status==='Completed')await database.transaction(context,options,tx=>
    owner.recordCompleted(tx,attemptId,descriptor(result.data,{digest:staged.digest,
      sizeBytes:staged.bytes.byteLength,mediaType:staged.mediaType}).objectRef));
  if(result.status!=='Completed')throw new CoreError('DEPENDENCY_TIMEOUT');
  const read=await input.objectStore.read({context:request.context,authorizedContextRef:request.authorizedContextRef,
    objectRef:result.data.objectRef},{signal:options.signal});
  if(read.status!=='Completed')throw new CoreError('DEPENDENCY_TIMEOUT');
  const bytes=await readBounded(read.data.content,262_144);
  if(bytes.byteLength!==staged.bytes.byteLength||await digestBytes(bytes)!==staged.digest)throw new CoreError('PRECONDITION_FAILED');
  const record=await database.transaction(context,options,tx=>
    owner.attach(tx,staged.record.artifactRef,result.data,{...command,commandId:randomUUID(),idempotencyKey:randomUUID()},attemptId));
  return {status:'Available',record};
}
