import type {EntityRef,ResponsibilityAssignmentRecord} from '@abh/contracts';
import {randomUUID} from 'node:crypto';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from '../control/fences.ts';

export async function currentResponsibility(tx:TenantTransaction,ref:EntityRef,requiredWorkspace?:string|null):Promise<ResponsibilityAssignmentRecord|undefined>{
  contract('EntityRef',ref);if(ref.type!=='abh.responsibility-assignment')throw new CoreError('INVALID_ARGUMENT');
  const c=tx.context.tenant;
  if(requiredWorkspace!==undefined&&requiredWorkspace!==null)contract('UUID',requiredWorkspace);
  const rows=await tx.owner('HumanGateway')`SELECT r.record,r.version,r.status,r.principal_id,r.valid_from,r.valid_until,p.version AS principal_version FROM human.responsibilities r
    JOIN identity.principals p ON p.resource_organization_id=r.resource_organization_id AND p.id=r.principal_id
    JOIN identity.memberships m ON m.resource_organization_id=r.resource_organization_id AND m.principal_id=p.id
    WHERE r.resource_organization_id=${c.resourceOrganizationId} AND r.id=${ref.id} AND r.version=${ref.version}
      AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)
      AND (r.workspace_id IS NULL OR r.workspace_id=${requiredWorkspace===undefined?c.workspaceId??null:requiredWorkspace}::uuid)
      AND r.status='Active' AND r.valid_from<=clock_timestamp() AND r.valid_until>clock_timestamp() AND r.deleted_at IS NULL
      AND p.identity_kind='Human' AND p.status='Active' AND p.deleted_at IS NULL AND m.status='Active' AND m.deleted_at IS NULL`;
  if(!rows[0])return undefined;
  const row=rows[0],record=contract('ResponsibilityAssignmentRecord',row.record);
  if(record.responsibilityRef.id!==ref.id||record.responsibilityRef.version!==Number(row.version)||record.resourceOrganizationId!==c.resourceOrganizationId
    ||record.status!==row.status||record.principalRef.id!==row.principal_id||record.principalRef.version!==Number(row.principal_version)
    ||Date.parse(record.validFrom)!==row.valid_from.getTime()||Date.parse(record.validUntil)!==row.valid_until.getTime())throw new CoreError('AUTHORITY_REQUIRED');
  return record;
}

/** Provisioned by governance/bootstrap after authority and source evidence are checked. */
export async function assignResponsibility(tx:TenantTransaction,command:CommandIdentity,input:ResponsibilityAssignmentRecord):Promise<EntityRef>{
  const record=contract('ResponsibilityAssignmentRecord',input),c=tx.context.tenant;
  if(record.resourceOrganizationId!==c.resourceOrganizationId||record.status!=='Active'||record.responsibilityRef.version!==1)throw new CoreError('INVALID_ARGUMENT');
  await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
  const principal=await tx.owner('Identity')`SELECT p.id FROM identity.principals p JOIN identity.memberships m
    ON m.resource_organization_id=p.resource_organization_id AND m.principal_id=p.id WHERE p.resource_organization_id=${c.resourceOrganizationId}
      AND p.id=${record.principalRef.id} AND p.version=${record.principalRef.version} AND p.identity_kind='Human' AND p.status='Active' AND m.status='Active' AND p.deleted_at IS NULL AND m.deleted_at IS NULL`;
  if(!principal[0])throw new CoreError('AUTHORITY_REQUIRED');
  await tx.owner('HumanGateway')`INSERT INTO human.responsibilities(resource_organization_id,id,workspace_id,principal_id,valid_from,valid_until,status,record)
    VALUES (${c.resourceOrganizationId},${record.responsibilityRef.id},${c.workspaceId??null},${record.principalRef.id},${record.validFrom},${record.validUntil},'Active',${JSON.stringify(record)}::text::jsonb)`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
    VALUES (${c.resourceOrganizationId},${randomUUID()},'abh.responsibility-assignment',${record.responsibilityRef.id},1)`;
  await appendChange(tx,{command,target:record.responsibilityRef,eventType:'abh.responsibility-assignment.created',changedFields:['status','scopeRefs'],relatedRefs:[record.principalRef]});
  return record.responsibilityRef;
}
