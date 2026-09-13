import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from './uow.ts';
import {contract} from './journal.ts';
import {CoreError} from '../internal/errors.ts';

export interface ArtifactDependency {
  readonly artifactRef:EntityRef;
  readonly sourceRef:EntityRef;
  readonly observedAt:string;
}

function reference(value:unknown):EntityRef{return contract('EntityRef',structuredClone(value));}

/** Immutable publication edge facts. Deletion is lifecycle evidence, not lineage rewriting. */
export class ArtifactLineageOwner {
  async record(tx:TenantTransaction,record:ArtifactRecord):Promise<void>{
    const available=contract('ArtifactRecord',structuredClone(record)),c=tx.context.tenant;
    if(available.artifactRef.type!=='abh.artifact'||available.artifactRef.version<2||available.status!=='Available')
      throw new CoreError('PRECONDITION_FAILED');
    if(available.sourceRefs.length>10_000)throw new CoreError('INVALID_ARGUMENT');
    const sources=new Map<string,EntityRef>();
    for(const value of available.sourceRefs){const source=reference(value);sources.set(canonicalJson(source),source);}
    if(!sources.size)return;
    const sql=tx.owner('ArtifactStore'),observed=new Date().toISOString();
    for(const source of sources.values()){
      if(source.id===available.artifactRef.id)throw new CoreError('IDEMPOTENCY_CONFLICT');
      await sql`INSERT INTO data.artifact_dependencies(
        resource_organization_id,id,workspace_id,purpose_names,artifact_id,artifact_version,
        source_ref,source_type,source_id,source_version,observed_at)
      VALUES (${c.resourceOrganizationId},${randomUUID()},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
        ${available.artifactRef.id},${available.artifactRef.version},${JSON.stringify(source)}::text::jsonb,
        ${source.type},${source.id},${source.version},${observed})
      ON CONFLICT (resource_organization_id,artifact_id,artifact_version,source_ref) DO NOTHING`;
    }
    tx.assertActive();
  }

  async descendants(tx:TenantTransaction,sourceRef:EntityRef,limit:number,after?:string):
    Promise<{dependencies:readonly ArtifactDependency[];next?:string}>{
    const source=reference(sourceRef),cursor=after===undefined?undefined:contract('UUID',after),c=tx.context.tenant;
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    const rows=await tx.owner('ArtifactStore')`SELECT d.artifact_id,d.artifact_version,d.observed_at
      FROM data.artifact_dependencies d JOIN data.artifacts a
        ON a.resource_organization_id=d.resource_organization_id AND a.id=d.artifact_id
      WHERE d.resource_organization_id=${c.resourceOrganizationId}
        AND d.source_type=${source.type} AND d.source_id=${source.id} AND d.source_version=${source.version}
        AND d.source_ref=${JSON.stringify(source)}::text::jsonb AND a.deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(d.purpose_names) AND (d.workspace_id IS NULL OR d.workspace_id=${c.workspaceId??null}::uuid)
        AND (${cursor??null}::uuid IS NULL OR d.artifact_id>${cursor??null}::uuid)
      ORDER BY d.artifact_id LIMIT ${limit+1}`;
    const page=rows.slice(0,limit);tx.assertActive();
    const dependencies=page.map(row=>({artifactRef:contract('EntityRef',{type:'abh.artifact',
      id:String(row.artifact_id),version:Number(row.artifact_version)}),sourceRef:structuredClone(source),
      observedAt:new Date(row.observed_at).toISOString()}));
    return {dependencies,...(rows.length>limit?{next:String(page.at(-1)!.artifact_id)}:{})};
  }
}
