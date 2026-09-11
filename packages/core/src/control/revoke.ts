import type { EntityRef, ExecutionAuthority, GrantRecord } from '@abh/contracts';
import { contract, appendChange, type CommandIdentity } from '../data/journal.ts';
import type { TenantTransaction } from '../data/uow.ts';
import { CoreError } from '../internal/errors.ts';
import { lockFences } from './fences.ts';

/** Called after current governance admission by the Control command handler in this UoW. */
export async function revokeGrant(tx: TenantTransaction, command: CommandIdentity, grantRef: EntityRef, evidenceRefs: EntityRef[]): Promise<GrantRecord> {
  contract('EntityRef',grantRef);
  if (grantRef.type!=='abh.grant' || !evidenceRefs.length) throw new CoreError('INVALID_ARGUMENT');
  for (const evidence of evidenceRefs) contract('EntityRef',evidence);
  const c=tx.context.tenant,sql=tx.owner('Control');
  const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},
    {type:'abh.principal',id:c.actor.id,version:1},grantRef]);
  const rows=await sql`SELECT record,version,status FROM control.grants WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${grantRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  const row=rows[0];
  if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
  if (Number(row.version)!==grantRef.version) throw new CoreError('VERSION_CONFLICT');
  if (row.status!=='Active') throw new CoreError('AUTHORITY_REQUIRED');
  const previous=contract('GrantRecord',row.record);
  const updated=contract('GrantRecord',{...previous,grantRef:{...grantRef,version:grantRef.version+1},status:'Revoked'});
  const changed=await sql`UPDATE control.grants SET status='Revoked',version=version+1,record=${JSON.stringify(updated)}::text::jsonb,
    updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${grantRef.id} AND version=${grantRef.version} RETURNING id`;
  if (!changed[0]) throw new CoreError('VERSION_CONFLICT');
  const fence=fences.find(f=>f.scopeRef.type==='abh.grant' && f.scopeRef.id===grantRef.id)!;
  const fenceRows=await sql`UPDATE control.fences SET epoch=epoch+1,version=version+1,stop_flag=true,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${fence.fenceRef.id} AND version=${fence.fenceRef.version} RETURNING version`;
  if (!fenceRows[0]) throw new CoreError('VERSION_CONFLICT');
  const fenceRef={...fence.fenceRef,version:Number(fenceRows[0].version)};
  await appendChange(tx,{command,target:updated.grantRef,eventType:'abh.grant.revoke',changedFields:['status'],relatedRefs:[fenceRef,...evidenceRefs]});
  await appendChange(tx,{command,target:fenceRef,eventType:'abh.fence.advanced',changedFields:['epoch','stopFlag'],relatedRefs:[updated.grantRef]});
  return updated;
}

/** Current governance admission and evidence validation run first, like revokeGrant. */
export async function revokeExecutionAuthority(tx:TenantTransaction,command:CommandIdentity,authorityRef:EntityRef,evidenceRefs:EntityRef[]):Promise<ExecutionAuthority>{
  contract('AuthorityRef',authorityRef);
  if(authorityRef.type!=='abh.execution-authority'||!evidenceRefs.length)throw new CoreError('INVALID_ARGUMENT');
  for(const evidence of evidenceRefs)contract('EntityRef',evidence);
  const c=tx.context.tenant,sql=tx.owner('Control');
  const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},authorityRef]);
  const rows=await sql`SELECT record,version,status FROM control.execution_authorities WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${authorityRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(rows[0].version)!==authorityRef.version)throw new CoreError('VERSION_CONFLICT');
  if(rows[0].status!=='Active')throw new CoreError('AUTHORITY_REQUIRED');
  const current=contract('ExecutionAuthority',rows[0].record);
  const next=contract('ExecutionAuthority',{...current,authorityRef:{...authorityRef,version:authorityRef.version+1},status:'Revoked'});
  const changed=await sql`UPDATE control.execution_authorities SET status='Revoked',version=version+1,record=${JSON.stringify(next)}::text::jsonb,
    updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${authorityRef.id} AND version=${authorityRef.version} RETURNING id`;
  if(!changed[0])throw new CoreError('VERSION_CONFLICT');
  const fence=fences.find(f=>f.scopeRef.type===authorityRef.type&&f.scopeRef.id===authorityRef.id)!;
  const updated=await sql`UPDATE control.fences SET epoch=epoch+1,version=version+1,stop_flag=true,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${fence.fenceRef.id} AND version=${fence.fenceRef.version} RETURNING version`;
  if(!updated[0])throw new CoreError('VERSION_CONFLICT');
  const fenceRef={...fence.fenceRef,version:Number(updated[0].version)};
  await appendChange(tx,{command,target:next.authorityRef,eventType:'abh.execution-authority.revoke',changedFields:['status'],relatedRefs:[fenceRef,...evidenceRefs]});
  await appendChange(tx,{command,target:fenceRef,eventType:'abh.fence.advanced',changedFields:['epoch','stopFlag'],relatedRefs:[next.authorityRef]});
  return next;
}
