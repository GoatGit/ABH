import {createHash,type Hash} from 'node:crypto';
import {mkdir,open as openOutputFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,AuthorizedContextRef,EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from './uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {contract,inputDigest,type CommandIdentity} from './journal.ts';
import {CoreError} from '../internal/errors.ts';
import {InlineArtifactOwner} from './artifacts.ts';
import {digestBytes} from '@abh/contracts/digest';

export interface ArtifactExportOptions {
  readonly outputRoot:string;
  readonly objectStore:import('@abh/contracts/ports').ObjectStorePort;
  readonly authorizedContextRef:AuthorizedContextRef;
  readonly scopeRef:EntityRef;
  readonly evidenceRef:EntityRef;
  readonly redactionPolicyRef?:EntityRef;
  readonly expiresAt?:string;
  readonly maxArtifacts?:number;
}

export interface ArtifactExportRecord {
  readonly exportRef:EntityRef;
  readonly state:'Pending'|'Running'|'Completed'|'Failed'|'Expired';
}

export interface ArtifactExportManifest {
  readonly formatVersion:'1.0';
  readonly schemaVersion:1;
  readonly scopeRef:EntityRef;
  readonly watermark:string;
  readonly redactionPolicyRef?:EntityRef;
  readonly files:readonly {readonly path:string;readonly sha256:string;readonly sizeBytes:number}[];
  readonly counts:Record<string,number>;
  readonly limitations:readonly string[];
}

interface ClaimedExport {
  readonly id:string;readonly scope:EntityRef;readonly evidence:EntityRef;readonly redaction?:EntityRef;
}

export class ArtifactExportOwner {
  async create(database:Database,current:VerifiedContext,options:TransactionOptions,input:ArtifactExportOptions,
    authorize:()=>Promise<void>):Promise<ArtifactExportRecord> {
    const scope=contract('EntityRef',structuredClone(input.scopeRef)),evidence=contract('EntityRef',structuredClone(input.evidenceRef));
    if(scope.type!=='abh.organization'&&scope.type!=='abh.workspace')throw new CoreError('INVALID_ARGUMENT');
    if(input.expiresAt!==undefined&&Number.isNaN(Date.parse(input.expiresAt)))throw new CoreError('INVALID_ARGUMENT');
    if(input.maxArtifacts!==undefined&&(!Number.isSafeInteger(input.maxArtifacts)||input.maxArtifacts<1))throw new CoreError('INVALID_ARGUMENT');
    await authorize();
    const id=randomUUID();
    await database.transaction(current,options,async tx=>{
      await tx.owner('ArtifactStore')`INSERT INTO data.artifact_exports(
        resource_organization_id,id,workspace_id,purpose_names,state,scope_ref,evidence_ref,redaction_policy_ref,expires_at)
      VALUES (${current.tenant.resourceOrganizationId},${id},${current.tenant.workspaceId??null},
        ARRAY[${current.tenant.purposeOfUse}],'Pending',${JSON.stringify(scope)}::text::jsonb,
        ${JSON.stringify(evidence)}::text::jsonb,
        ${input.redactionPolicyRef?JSON.stringify(contract('EntityRef',input.redactionPolicyRef)):null}::text::jsonb,
        ${input.expiresAt??null})`;
    });
    return {exportRef:{type:'abh.export',id,version:1},state:'Pending'};
  }

  async run(database:Database,current:VerifiedContext,options:TransactionOptions,input:ArtifactExportOptions,
    exportRef:EntityRef,authorize:()=>Promise<void>):Promise<ArtifactExportRecord> {
    await authorize();
    const claimId=contract('EntityRef',structuredClone(exportRef)).id,claimed=await this.#claim(database,current,options,claimId);
    if(!claimed)return {exportRef:{type:'abh.export',id:claimId,version:1},state:'Pending'};
    const directory=join(input.outputRoot,current.tenant.resourceOrganizationId,claimed.id);
    try {
      await rm(directory,{recursive:true,force:true});await mkdir(join(directory,'records'),{recursive:true});
      await mkdir(join(directory,'artifacts'),{recursive:true});
      const files:{path:string;sha256:string;sizeBytes:number}[]=[];
      const counts:Record<string,number>={};
      let watermark=new Date().toISOString();
      let exportedArtifacts=0;
      const maxArtifacts=input.maxArtifacts??1000;
      await database.transaction(current,{...options,readOnlySnapshot:true},async tx=>{
        const [clock]=await tx.owner('ArtifactStore')`SELECT clock_timestamp() AS watermark`;
        watermark=new Date(clock!.watermark as string).toISOString();
        const artifactRows=await tx.owner('ArtifactStore')`SELECT a.id,a.version,a.record,a.inline_body,a.status,
            o.object_ref
          FROM data.artifacts a LEFT JOIN data.object_artifacts o
            ON o.resource_organization_id=a.resource_organization_id AND o.artifact_id=a.id
            AND o.artifact_version=a.version
          WHERE a.resource_organization_id=${current.tenant.resourceOrganizationId}
            AND ${current.tenant.purposeOfUse}=ANY(a.purpose_names)
            AND (a.workspace_id IS NULL OR a.workspace_id=${current.tenant.workspaceId??null}::uuid)
          ORDER BY a.id LIMIT ${maxArtifacts}`;
        counts.artifacts=artifactRows.length;
        await this.#writeJsonl(join(directory,'records','artifacts.jsonl'),artifactRows.map(row=>({
          artifactRef:{type:'abh.artifact',id:String(row.id),version:Number(row.version)},record:row.record,status:row.status})),files);
        const dependencies=await tx.owner('ArtifactStore')`SELECT artifact_id,artifact_version,source_ref,source_version,observed_at
          FROM data.artifact_dependencies WHERE resource_organization_id=${current.tenant.resourceOrganizationId} ORDER BY artifact_id,source_id LIMIT 10000`;
        counts.dependencies=dependencies.length;
        await this.#writeJsonl(join(directory,'records','artifact-dependencies.jsonl'),dependencies,files);
        const audits=await tx.owner('ArtifactStore')`SELECT id AS event_id,record FROM data.audit_records
          WHERE resource_organization_id=${current.tenant.resourceOrganizationId} ORDER BY event_id LIMIT 10000`;
        counts.audit=audits.length;
        await this.#writeJsonl(join(directory,'records','audit.jsonl'),audits.map(row=>row.record),files);
        for(const item of artifactRows) {
          const record=contract('ArtifactRecord',item.record);
          const path=join(directory,'artifacts',`${String(item.id)}.bin`);
          if(record.status!=='Available'||record.artifactRef.id!==String(item.id)
            ||record.artifactRef.version!==Number(item.version))throw new CoreError('PRECONDITION_FAILED');
          if(item.object_ref) {
            const objectRef=contract('EntityRef',item.object_ref);
            if(objectRef.type!=='abh.stored-object')throw new CoreError('INTERNAL_ERROR');
            const deadline=new Date(Math.min(options.deadline,Date.parse(current.tenant.contextExpiresAt))).toISOString();
            const request=contract('ReadObjectRequest',{context:{callId:randomUUID(),
              requestContextRef:{type:'abh.request-context',id:current.tenant.requestId,version:1},
              target:{objectRef,scopeRefs:[{type:'abh.organization',id:current.tenant.resourceOrganizationId,version:1}],
                action:'abh.artifacts.read'},deadline},
              authorizedContextRef:structuredClone(input.authorizedContextRef),objectRef});
            const response=await input.objectStore.read(request,{signal:options.signal});
            if(response.status!=='Completed')throw new CoreError('DEPENDENCY_TIMEOUT');
            const returned=response.data.object;
            if(returned.objectRef.id!==objectRef.id||returned.digest!==record.contentDigest
              ||returned.sizeBytes!==record.sizeBytes||returned.mediaType!==record.mediaType)
              throw new CoreError('PRECONDITION_FAILED');
            const written=await this.#writeStream(path,response.data.content,files);
            if(written.sizeBytes!==record.sizeBytes
              ||`sha256:${written.digest}`!==record.contentDigest)throw new CoreError('PRECONDITION_FAILED');
          } else {
            const raw=item.inline_body;
            const bytes=typeof raw==='string'?Buffer.from(raw,'utf8'):new Uint8Array(raw as Uint8Array);
            if(record.sizeBytes!==bytes.byteLength)throw new CoreError('PRECONDITION_FAILED');
            if(await digestBytes(bytes)!==record.contentDigest)throw new CoreError('PRECONDITION_FAILED');
            await this.#writeBytes(path,bytes,files);
          }
          exportedArtifacts++;
        }
      });
      counts.exportedArtifacts=exportedArtifacts;
      const manifest:ArtifactExportManifest={formatVersion:'1.0',schemaVersion:1,scopeRef:claimed.scope,watermark,
        ...(claimed.redaction?{redactionPolicyRef:claimed.redaction}:{}),files,counts,
        limitations:['Point-in-time read-only export; records committed after the watermark are not included.',
          'Secret material, credentials, grants and policy inputs are intentionally omitted.']};
      const manifestPath=join(directory,'manifest.json');
      const finalManifest:ArtifactExportManifest={...manifest,files};
      const finalEncoded=JSON.stringify(finalManifest,null,2);await writeFile(manifestPath,finalEncoded);
      const finalHash=`sha256:${createHash('sha256').update(finalEncoded).digest('hex')}`;
      const command:CommandIdentity={type:'abh.exports.create',commandId:randomUUID(),idempotencyKey:randomUUID(),
        digest:await inputDigest({exportId:claimed.id,manifestDigest:finalHash})};
      await database.transaction(current,options,async tx=> {
        const saved=await new InlineArtifactOwner().store(tx,command,{
          ownerRef:claimed.scope,mediaType:'application/json',content:finalEncoded,dataClass:'export.manifest',
          purposeNames:[current.tenant.purposeOfUse],sourceRefs:[claimed.scope,claimed.evidence],region:'local',
          retentionPolicyRef:claimed.evidence},async()=>{});
        const [row]=await tx.owner('ArtifactStore')`UPDATE data.artifact_exports SET state='Completed',
          manifest_ref=${JSON.stringify(saved.artifactRef)}::text::jsonb,manifest_digest=${finalHash}::text,watermark=${watermark}::timestamptz,
          file_count=${files.length},output_bytes=${Buffer.byteLength(finalEncoded)},worker_id=NULL,lease_until=NULL,
          completed_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=${current.tenant.actor.id}
          WHERE resource_organization_id=${current.tenant.resourceOrganizationId} AND id=${claimed.id}
            AND state='Running' AND worker_id=${current.tenant.actor.id} RETURNING id`;
        if(!row)throw new CoreError('VERSION_CONFLICT');
      });
      return {exportRef:{type:'abh.export',id:claimed.id,version:1},state:'Completed'};
    } catch(error) {
      await rm(directory,{recursive:true,force:true});
      const code=error instanceof CoreError?error.code:'INTERNAL_ERROR';
      await database.transaction(current,options,async tx=>{
        await tx.owner('ArtifactStore')`UPDATE data.artifact_exports SET state='Failed',error_code=${code},
          manifest_ref=NULL,manifest_digest=NULL,watermark=NULL,file_count=0,output_bytes=0,completed_at=NULL,
          worker_id=NULL,lease_until=NULL,updated_at=clock_timestamp(),updated_by=${current.tenant.actor.id}
          WHERE resource_organization_id=${current.tenant.resourceOrganizationId} AND id=${claimed.id} AND state='Running'`;
      });
      throw error;
    }
  }

  async #claim(database:Database,current:VerifiedContext,options:TransactionOptions,exportId:string):Promise<ClaimedExport|undefined> {
    return database.transaction(current,options,async tx=>{
      const [row]=await tx.owner('ArtifactStore')`SELECT id,scope_ref,evidence_ref,redaction_policy_ref
        FROM data.artifact_exports WHERE resource_organization_id=${current.tenant.resourceOrganizationId}
          AND id=${exportId} AND state='Pending' FOR UPDATE`;
      if(!row)return undefined;
      await tx.owner('ArtifactStore')`UPDATE data.artifact_exports SET state='Running',worker_id=${current.tenant.actor.id},
        fencing_token=fencing_token+1,lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp(),
        updated_by=${current.tenant.actor.id} WHERE resource_organization_id=${current.tenant.resourceOrganizationId}
          AND id=${exportId} AND state='Pending'`;
      return {id:String(row.id),scope:contract('EntityRef',row.scope_ref),evidence:contract('EntityRef',row.evidence_ref),
        ...(row.redaction_policy_ref?{redaction:contract('EntityRef',row.redaction_policy_ref)}:{})};
    });
  }

  async expire(database:Database,current:VerifiedContext,options:TransactionOptions,outputRoot:string,
    authorize:()=>Promise<void>):Promise<number> {
    await authorize();
    const claimed=await database.transaction(current,options,async tx=>{
      const rows=await tx.owner('ArtifactStore')`UPDATE data.artifact_exports
        SET worker_id=${current.tenant.actor.id},fencing_token=fencing_token+1,
          lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp(),
          updated_by=${current.tenant.actor.id}
        WHERE id IN (
          SELECT id FROM data.artifact_exports
          WHERE resource_organization_id=${current.tenant.resourceOrganizationId} AND state='Completed'
            AND expires_at IS NOT NULL AND expires_at<=clock_timestamp()
          ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED
        ) RETURNING id`;
      return rows.map(row=>String(row.id));
    });
    return database.transaction(current,options,async tx=>{
      let expired=0;
      for(const id of claimed) {
        try {
          await rm(join(outputRoot,current.tenant.resourceOrganizationId,id),{recursive:true,force:true});
          await tx.owner('ArtifactStore')`UPDATE data.artifact_exports SET state='Expired',manifest_ref=NULL,
            manifest_digest=NULL,watermark=NULL,file_count=0,output_bytes=0,completed_at=NULL,worker_id=NULL,
            lease_until=NULL,updated_at=clock_timestamp(),updated_by=${current.tenant.actor.id}
            WHERE resource_organization_id=${current.tenant.resourceOrganizationId} AND id=${id}
              AND state='Completed' AND worker_id=${current.tenant.actor.id}`;
          expired++;
        } catch(error) {
          await tx.owner('ArtifactStore')`UPDATE data.artifact_exports SET worker_id=NULL,
            lease_until=NULL,updated_at=clock_timestamp(),updated_by=${current.tenant.actor.id}
            WHERE resource_organization_id=${current.tenant.resourceOrganizationId} AND id=${id}
              AND state='Completed' AND worker_id=${current.tenant.actor.id}`;
          throw error;
        }
      }
      return expired;
    });
  }

  async #writeJsonl(path:string,rows:readonly unknown[],files:{path:string;sha256:string;sizeBytes:number}[]):Promise<void> {
    const encoded=rows.map(row=>JSON.stringify(row)).join('\n')+(rows.length?'\n':'');
    await writeFile(path,encoded);
    files.push({path:path.slice(path.indexOf('records/')),sha256:`sha256:${createHash('sha256').update(encoded).digest('hex')}`,
      sizeBytes:Buffer.byteLength(encoded)});
  }

  async #writeBytes(path:string,bytes:Uint8Array,files:{path:string;sha256:string;sizeBytes:number}[]):Promise<void> {
    await writeFile(path,bytes);
    files.push({path:path.slice(path.indexOf('artifacts/')),sha256:`sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      sizeBytes:bytes.byteLength});
  }

  async #writeStream(path:string,content:AsyncIterable<Uint8Array>,files:{path:string;sha256:string;sizeBytes:number}[]):
    Promise<{digest:string;sizeBytes:number}> {
    const hash=createHash('sha256');let size=0;const handle=await openOutputFile(path,'w');
    try {
      for await(const chunk of content) {
        const bytes=new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength);
        hash.update(bytes);await handle.writeFile(bytes);size+=bytes.byteLength;
      }
      await handle.sync();
    } finally { await handle.close(); }
    const digest=hash.digest('hex');
    files.push({path:path.slice(path.indexOf('artifacts/')),sha256:`sha256:${digest}`,sizeBytes:size});
    return {digest,sizeBytes:size};
  }
}
