import {randomUUID} from 'node:crypto';
import type {EntityRef,PackDeploymentRevisionRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

/** Shared organization revision for Stage and future lifecycle transitions.
 * Callers must authorize the operation and commit its target transition and Journal in this same UoW. */
export class PackDeploymentRevisionOwner {
 async current(tx:TenantTransaction):Promise<number>{
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const key=`${c.resourceOrganizationId}/Deployment`;
  await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  const [row]=await tx.owner('PackLoader')`SELECT id,version,record,deployment_version,previous_deployment_version FROM extension.deployment_revisions
   WHERE resource_organization_id=${c.resourceOrganizationId} ORDER BY deployment_version DESC LIMIT 1`;
  if(!row)return 0;
  const record=contract('PackDeploymentRevisionRecord',row.record);
  if(record.revisionRef.id!==row.id||record.revisionRef.version!==Number(row.version)||record.resourceOrganizationId!==c.resourceOrganizationId||record.deploymentVersion!==Number(row.deployment_version)||record.previousDeploymentVersion!==Number(row.previous_deployment_version))throw new CoreError('INTERNAL_ERROR');
  return record.deploymentVersion;
 }
 async advance(tx:TenantTransaction,expected:number,targetRef:EntityRef):Promise<PackDeploymentRevisionRecord>{
  contract('EntityRef',targetRef);
  if(targetRef.type!=='abh.installed-pack'||!Number.isSafeInteger(expected)||expected<0||expected>=Number.MAX_SAFE_INTEGER)throw new CoreError('INVALID_ARGUMENT');
  if(await this.current(tx)!==expected)throw new CoreError('VERSION_CONFLICT');
  const c=tx.context.tenant;
  const [target]=await tx.owner('PackLoader')`SELECT id FROM extension.installed_packs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${targetRef.id} AND version=${targetRef.version} AND deployment_version=${expected+1} AND deleted_at IS NULL`;
  if(!target)throw new CoreError('PRECONDITION_FAILED');
  const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
  const record=contract('PackDeploymentRevisionRecord',{revisionRef:{type:'abh.pack-deployment-revision',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
   deploymentVersion:expected+1,previousDeploymentVersion:expected,targetRef:structuredClone(targetRef),recordedAt:clock!.now.toISOString()});
  await tx.owner('PackLoader')`INSERT INTO extension.deployment_revisions(resource_organization_id,id,record,deployment_version,previous_deployment_version)
   VALUES (${c.resourceOrganizationId},${record.revisionRef.id},${JSON.stringify(record)}::text::jsonb,${record.deploymentVersion},${expected})`;
  return record;
 }
}
