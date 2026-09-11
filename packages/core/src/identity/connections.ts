import {randomUUID} from 'node:crypto';
import type {ConnectionRecord,EntityRef,OperationPlanNode} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {lifecyclePurposes} from '../data/purposes.ts';
import {lockFences} from '../control/fences.ts';
import {sameRef} from '../execution/shared.ts';
import {CoreError} from '../internal/errors.ts';

/** Logical Connection binding only; secret material is never accepted or returned by this Owner. */
export class ConnectionOwner {
  async configure(tx:TenantTransaction,command:CommandIdentity,input:ConnectionRecord,verify:(tx:TenantTransaction,input:ConnectionRecord)=>Promise<void>):Promise<ConnectionRecord>{
    contract('ConnectionRecord',input);const c=tx.context.tenant,purposeNames=lifecyclePurposes(input.purposeNames,c.purposeOfUse);
    if(input.resourceOrganizationId!==c.resourceOrganizationId||input.connectionRef.version!==1||input.status!=='Active')throw new CoreError('INVALID_ARGUMENT');
    await verify(tx,input);const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},...input.scopeRefs]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    await tx.owner('Identity')`INSERT INTO identity.connections(resource_organization_id,id,workspace_id,purpose_names,status,record)
      VALUES (${c.resourceOrganizationId},${input.connectionRef.id},${c.workspaceId??null},${purposeNames},'Active',${JSON.stringify(input)}::text::jsonb)`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${c.resourceOrganizationId},${randomUUID()},'abh.connection',${input.connectionRef.id},1)`;
    await appendChange(tx,{command,target:input.connectionRef,eventType:'abh.connection.created',changedFields:['scopeRefs','connectorRefs','status'],relatedRefs:input.evidenceRefs});return input;
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<ConnectionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.connection')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('Identity')`SELECT record,version,status FROM identity.connections WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('ConnectionRecord',rows[0].record);
    if(Number(rows[0].version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
    if(!sameRef(record.connectionRef,ref)||record.resourceOrganizationId!==c.resourceOrganizationId||record.status!==rows[0].status)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async assertNode(tx:TenantTransaction,node:OperationPlanNode):Promise<ConnectionRecord>{
    contract('OperationPlanNode',node);const record=await this.get(tx,node.connectionRef);
    if(record.status!=='Active'||!record.accountRefs.some(ref=>sameRef(ref,node.accountRef))||!record.connectorRefs.some(ref=>canonicalJson(ref)===canonicalJson(node.connectorRef))
      ||node.scopeRefs.some(scope=>!record.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');return record;
  }
  async revoke(tx:TenantTransaction,command:CommandIdentity,ref:EntityRef,evidence:EntityRef[],verify:(tx:TenantTransaction)=>Promise<void>):Promise<ConnectionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.connection'||!evidence.length)throw new CoreError('INVALID_ARGUMENT');for(const item of evidence)contract('EntityRef',item);
    await verify(tx);const c=tx.context.tenant;
    const fences=await lockFences(tx,[ref,{type:'abh.organization',id:c.resourceOrganizationId,version:1}]),current=await this.get(tx,ref);
    if(current.status!=='Active')throw new CoreError('PRECONDITION_FAILED');
    const next=contract('ConnectionRecord',{...current,connectionRef:{...ref,version:ref.version+1},status:'Revoked'});
    await tx.owner('Identity')`UPDATE identity.connections SET record=${JSON.stringify(next)}::text::jsonb,status='Revoked',version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
    const fence=fences.find(f=>f.scopeRef.type===ref.type&&f.scopeRef.id===ref.id)!;
    await tx.owner('Control')`UPDATE control.fences SET epoch=epoch+1,version=version+1,stop_flag=true,updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${fence.fenceRef.id}`;
    await appendChange(tx,{command,target:next.connectionRef,eventType:'abh.connection.revoked',changedFields:['status'],relatedRefs:evidence});
    await appendChange(tx,{command,target:{...fence.fenceRef,version:fence.fenceRef.version+1},eventType:'abh.fence.advanced',changedFields:['epoch','stopFlag'],relatedRefs:[next.connectionRef]});return next;
  }
}
