import type {ContextManifest,EntityRef} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

const missionPurposeNames=['abh.mission.manage'];

export class ContextOwner {
 async store(tx:TenantTransaction,manifest:ContextManifest):Promise<ContextManifest>{
  contract('ContextManifest',structuredClone(manifest));
  const c=tx.context.tenant;
  const value=contract('ContextManifest',{...manifest,manifestDigest:await digestContract('ContextManifest',manifest)});
  await tx.owner('MissionController')`INSERT INTO core.context_manifests(resource_organization_id,id,workspace_id,purpose_names,record,task_id)
    VALUES (${c.resourceOrganizationId},${manifest.contextRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(value)}::text::jsonb,${manifest.taskRef.id})`;
  return value;
 }
 async get(tx:TenantTransaction,ref:EntityRef):Promise<ContextManifest>{
  contract('EntityRef',ref);const value=await this.getById(tx,ref.id);
  if(canonicalJson(value.contextRef)!==canonicalJson(ref))throw new CoreError('RESOURCE_NOT_FOUND');
  return value;
 }
 async getById(tx:TenantTransaction,id:string):Promise<ContextManifest>{
  contract('UUID',id);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version FROM core.context_manifests
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const value=contract('ContextManifest',row.record);
  if(value.resourceOrganizationId!==c.resourceOrganizationId
    ||value.contextRef.id!==id||Number(row.version)!==value.contextRef.version
    ||value.manifestDigest!==await digestContract('ContextManifest',value))throw new CoreError('INTERNAL_ERROR');
  return value;
 }
}
