import { randomUUID } from 'node:crypto';
import type { ArtifactRecord, EntityRef, StoreInlineArtifactPayload } from '@abh/contracts';
import { digestBytes } from '@abh/contracts/digest';
import type { TenantTransaction } from './uow.ts';
import { appendChange,contract,type CommandIdentity } from './journal.ts';
import { CoreError } from '../internal/errors.ts';

/** Small inert UTF-8 documents. Large/binary content requires the ObjectStorePort staging path. */
export class InlineArtifactOwner {
  /** Discovery hints for an exact Owner, including varying source sets. Caller
   * supplies current discovery admission and separately authorizes each read. */
  async scanOwned(tx:TenantTransaction,ownerRef:EntityRef,limit:number,after?:string):Promise<{refs:EntityRef[];next?:string}>{
    const owner=contract('EntityRef',structuredClone(ownerRef)),cursor=after===undefined?undefined:contract('UUID',after),c=tx.context.tenant;
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    const rows=await tx.owner('ArtifactStore')`SELECT id,version FROM data.artifacts WHERE resource_organization_id=${c.resourceOrganizationId}
      AND deleted_at IS NULL AND status='Available' AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND owner_lookup=jsonb_hash_extended(${JSON.stringify(owner)}::text::jsonb,0)
      AND record->'ownerRef'=${JSON.stringify(owner)}::text::jsonb AND record->>'mediaType'='application/json'
      AND (${cursor??null}::uuid IS NULL OR id>${cursor??null}::uuid) ORDER BY id LIMIT ${limit+1}`;
    const page=rows.slice(0,limit);tx.assertActive();
    return {refs:page.map(row=>contract('EntityRef',{type:'abh.artifact',id:String(row.id),version:Number(row.version)})),...(rows.length>limit?{next:String(page.at(-1)!.id)}:{})};
  }
  /** Stabilize a set of source rows through the caller transaction. Authorization still occurs on each read.
   * Acquire the complete set in UUID order after control/aggregate locks; never upgrade these locks to mutate sources.
   */
  async lockSources(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>{
    if(!Array.isArray(refs)||refs.length>10000)throw new CoreError('INVALID_ARGUMENT');
    const ids=new Set<string>();
    for(const value of refs){contract('EntityRef',value);if(value.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');ids.add(value.id);}
    const c=tx.context.tenant;
    if(!ids.size)return;
    await tx.owner('ArtifactStore')`SELECT id FROM data.artifacts WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=ANY(${[...ids].sort()}) AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY id FOR SHARE`;
  }

  /** Internal keyset scan of available inline JSON for an exact owner/source set.
   * Caller must authorize discovery before entry and authorize every actual read.
   * References are hints; this scan neither verifies content nor selects a winner.
   */
  async scanOwnedSources(tx:TenantTransaction,ownerRef:EntityRef,sourceRefs:readonly EntityRef[],limit:number,after?:string):Promise<{refs:EntityRef[];next?:string}>{
    const owner=contract('EntityRef',structuredClone(ownerRef)),sources=sourceRefs.map(ref=>contract('EntityRef',structuredClone(ref))),cursor=after===undefined?undefined:contract('UUID',after);
    if(!Number.isInteger(limit)||limit<1||limit>100||sources.length>10000)throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('ArtifactStore')`SELECT id,version FROM data.artifacts WHERE resource_organization_id=${c.resourceOrganizationId}
      AND deleted_at IS NULL AND status='Available' AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND owner_lookup=jsonb_hash_extended(${JSON.stringify(owner)}::text::jsonb,0)
      AND sources_lookup=jsonb_hash_extended(${JSON.stringify(sources)}::text::jsonb,0)
      AND record->'ownerRef'=${JSON.stringify(owner)}::text::jsonb AND record->'sourceRefs'=${JSON.stringify(sources)}::text::jsonb
      AND record->>'mediaType'='application/json' AND (${cursor??null}::uuid IS NULL OR id>${cursor??null}::uuid)
      ORDER BY id LIMIT ${limit+1}`;
    const page=rows.slice(0,limit);tx.assertActive();
    return {refs:page.map(row=>contract('EntityRef',{type:'abh.artifact',id:String(row.id),version:Number(row.version)})),...(rows.length>limit?{next:String(page.at(-1)!.id)}:{})};
  }

  async store(tx:TenantTransaction,command:CommandIdentity,input:StoreInlineArtifactPayload,
    verifyReferences:(refs:readonly EntityRef[])=>Promise<void>):Promise<ArtifactRecord>{
    contract('StoreInlineArtifactPayload',input);
    if(!['text/plain','application/json','application/vnd.abh.raw-transport+json'].includes(input.mediaType))throw new CoreError('INVALID_ARGUMENT');
    const bytes=new TextEncoder().encode(input.content);
    if(bytes.length>65_536 || new TextDecoder('utf-8',{fatal:true}).decode(bytes)!==input.content)throw new CoreError('LIMIT_EXCEEDED');
    if(input.mediaType==='application/json'||input.mediaType.endsWith('+json'))try{JSON.parse(input.content);}catch{throw new CoreError('INVALID_ARGUMENT');}
    await verifyReferences([input.ownerRef,input.retentionPolicyRef,...input.sourceRefs]);
    const c=tx.context.tenant;
    if(!input.purposeNames.includes(c.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
    const digest=await digestBytes(bytes),id=randomUUID();
    const staged=contract('ArtifactRecord',{artifactRef:{type:'abh.artifact',id,version:1},resourceOrganizationId:c.resourceOrganizationId,
      ownerRef:input.ownerRef,mediaType:input.mediaType,sizeBytes:bytes.length,contentDigest:digest,status:'Staged',dataClass:input.dataClass,
      purposeNames:input.purposeNames,sourceRefs:input.sourceRefs,region:input.region,retentionPolicyRef:input.retentionPolicyRef});
    const sql=tx.owner('ArtifactStore');
    await sql`INSERT INTO data.artifacts(resource_organization_id,id,workspace_id,purpose_names,record,inline_body,content_digest,status)
      VALUES (${c.resourceOrganizationId},${id},${c.workspaceId??null},${input.purposeNames},${JSON.stringify(staged)}::text::jsonb,${bytes},${digest},'Staged')`;
    await appendChange(tx,{command,target:staged.artifactRef,eventType:'abh.artifact.created',changedFields:['status','contentDigest'],relatedRefs:[input.ownerRef]});
    const available=contract('ArtifactRecord',{...staged,artifactRef:{...staged.artifactRef,version:2},status:'Available'});
    await sql`UPDATE data.artifacts SET status='Available',version=2,record=${JSON.stringify(available)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND version=1`;
    await appendChange(tx,{command,target:available.artifactRef,eventType:'abh.artifact.publish',changedFields:['status'],relatedRefs:input.sourceRefs});
    return available;
  }
  async #load(tx:TenantTransaction,artifactRef:EntityRef){
    artifactRef=structuredClone(artifactRef);
    contract('EntityRef',artifactRef);if(artifactRef.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('ArtifactStore')`SELECT record,version,status,inline_body,content_digest FROM data.artifacts
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${artifactRef.id} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    const row=rows[0];if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    if(Number(row.version)!==artifactRef.version)throw new CoreError('VERSION_CONFLICT');
    const record=contract('ArtifactRecord',row.record);
    if(record.artifactRef.id!==artifactRef.id || record.artifactRef.version!==Number(row.version) || record.resourceOrganizationId!==c.resourceOrganizationId || record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
    if(row.inline_body===null)throw new CoreError('PRECONDITION_FAILED');
    return {row,record};
  }
  async read(tx:TenantTransaction,artifactRef:EntityRef,authorize:(record:ArtifactRecord)=>Promise<void>):Promise<{record:ArtifactRecord;bytes:Uint8Array}>{
    const {row,record}=await this.#load(tx,artifactRef);
    await authorize(structuredClone(record));tx.assertActive();
    if(record.status!=='Available')throw new CoreError('FORBIDDEN');
    const bytes=new Uint8Array(row.inline_body);
    if(bytes.length!==record.sizeBytes || row.content_digest!==record.contentDigest || await digestBytes(bytes)!==record.contentDigest)throw new CoreError('INTERNAL_ERROR');
    tx.assertActive();return {record,bytes};
  }
  async tombstone(tx:TenantTransaction,command:CommandIdentity,artifactRef:EntityRef,evidenceRef:EntityRef,
    authorize:(record:ArtifactRecord)=>Promise<void>):Promise<ArtifactRecord>{
    artifactRef=structuredClone(artifactRef);evidenceRef=structuredClone(evidenceRef);
    contract('EntityRef',evidenceRef);
    const {record}=await this.#load(tx,artifactRef);await authorize(structuredClone(record));tx.assertActive();
    if(record.status==='Tombstoned')throw new CoreError('PRECONDITION_FAILED');
    const next=contract('ArtifactRecord',{...record,artifactRef:{...artifactRef,version:artifactRef.version+1},status:'Tombstoned'});
    const c=tx.context.tenant;
    const changed=await tx.owner('ArtifactStore')`UPDATE data.artifacts SET status='Tombstoned',record=${JSON.stringify(next)}::text::jsonb,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${artifactRef.id} AND version=${artifactRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.artifactRef,eventType:'abh.artifact.tombstone',changedFields:['status'],relatedRefs:[evidenceRef]});
    return next;
  }
}
