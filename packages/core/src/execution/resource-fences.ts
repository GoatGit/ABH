import {randomUUID} from 'node:crypto';
import type {EntityRef,OperationPlanNode,ResourceFenceRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {lifecyclePurposes} from '../data/purposes.ts';
import {CoreError} from '../internal/errors.ts';

type ResourceKey=Pick<OperationPlanNode,'connectionRef'|'accountRef'|'resourceKey'>;
const same=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id;

/** Persistent one-unresolved-operation slot, independent of Worker lease lifetime. */
export class ResourceFenceOwner {
  async lock(tx:TenantTransaction,key:ResourceKey):Promise<ResourceFenceRecord|undefined>{
    contract('EntityRef',key.connectionRef);contract('EntityRef',key.accountRef);contract('RegisteredName',key.resourceKey);
    if(key.connectionRef.type!=='abh.connection')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,canonical=`${c.resourceOrganizationId}/OperationController/${key.connectionRef.type}/${key.connectionRef.id}/${key.accountRef.type}/${key.accountRef.id}/${key.resourceKey}`;
    await tx.lock(2,canonical,()=>tx.owner('OperationController')`SELECT pg_advisory_xact_lock(hashtextextended(${canonical},0))`);
    return this.#get(tx,key);
  }
  /** Source query under the caller's parent/authorization locks; does not acquire a resource lock. */
  async read(tx:TenantTransaction,key:ResourceKey):Promise<ResourceFenceRecord|undefined>{ return this.#get(tx,key); }
  async #get(tx:TenantTransaction,key:ResourceKey):Promise<ResourceFenceRecord|undefined>{
    const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT id,record,version,fencing_token,unresolved_operation_id FROM execution.resource_fences
      WHERE resource_organization_id=${c.resourceOrganizationId} AND connection_id=${key.connectionRef.id} AND account_type=${key.accountRef.type} AND account_id=${key.accountRef.id} AND resource_key=${key.resourceKey}
        AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])return undefined;const row=rows[0],record=contract('ResourceFenceRecord',row.record);
    if(record.fenceRef.id!==row.id||record.resourceOrganizationId!==c.resourceOrganizationId||record.fenceRef.version!==Number(row.version)||record.fencingToken!==Number(row.fencing_token)
      ||(record.unresolvedOperationRef?.id??null)!==row.unresolved_operation_id||!same(record.connectionRef,key.connectionRef)||!same(record.accountRef,key.accountRef)||record.resourceKey!==key.resourceKey)throw new CoreError('INTERNAL_ERROR');return record;
  }
  /** Controller first verifies current authorization/plan. A committed Permit must be paired in this same UoW. */
  async occupy(tx:TenantTransaction,command:CommandIdentity,key:ResourceKey,operationRef:EntityRef,purposeNames:string[]):Promise<ResourceFenceRecord>{
    const target=contract('OperationRef',operationRef),c=tx.context.tenant,purposes=lifecyclePurposes(purposeNames,c.purposeOfUse);
    const current=await this.lock(tx,key);
    if(current?.unresolvedOperationRef||current?.blockedByReportRef)throw new CoreError('PRECONDITION_FAILED');
    const record=contract('ResourceFenceRecord',{fenceRef:{type:'abh.resource-fence',id:current?.fenceRef.id??randomUUID(),version:(current?.fenceRef.version??0)+1},resourceOrganizationId:c.resourceOrganizationId,
      connectionRef:key.connectionRef,accountRef:key.accountRef,resourceKey:key.resourceKey,fencingToken:(current?.fencingToken??0)+1,unresolvedOperationRef:target});
    if(current)await this.#save(tx,current,record);
    else await tx.owner('OperationController')`INSERT INTO execution.resource_fences(resource_organization_id,id,workspace_id,purpose_names,connection_id,account_type,account_id,resource_key,fencing_token,unresolved_operation_id,record)
      VALUES (${c.resourceOrganizationId},${record.fenceRef.id},${c.workspaceId??null},${purposes},${key.connectionRef.id},${key.accountRef.type},${key.accountRef.id},${key.resourceKey},1,${target.id},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.fenceRef,eventType:current?'abh.resource-fence.occupied':'abh.resource-fence.created',changedFields:['unresolvedOperationRef','fencingToken'],relatedRefs:[target]});return record;
  }
  async requireCurrent(tx:TenantTransaction,key:ResourceKey,operationRef:EntityRef,token:number):Promise<ResourceFenceRecord>{
    contract('OperationRef',operationRef);contract('Version',token);const current=await this.lock(tx,key);
    if(!current?.unresolvedOperationRef||!same(current.unresolvedOperationRef,operationRef)||current.fencingToken!==token)throw new CoreError('PRECONDITION_FAILED');return current;
  }
  /** A verified terminal contradiction blocks new dispatch, without replacing an unresolved occupant. */
  async block(tx:TenantTransaction,command:CommandIdentity,key:ResourceKey,reportRef:EntityRef,
    verify:()=>Promise<void>):Promise<ResourceFenceRecord>{
    contract('EntityRef',reportRef);if(reportRef.type!=='abh.reconciliation')throw new CoreError('INVALID_ARGUMENT');
    const current=await this.lock(tx,key);if(!current)throw new CoreError('OPERATION_FACT_CONFLICT');
    await verify();
    if(current.blockedByReportRef&&same(current.blockedByReportRef,reportRef))return current;
    const next=contract('ResourceFenceRecord',{...current,fenceRef:{...current.fenceRef,version:current.fenceRef.version+1},blockedByReportRef:reportRef});
    await this.#save(tx,current,next);
    await appendChange(tx,{command,target:next.fenceRef,eventType:'abh.resource-fence.blocked',changedFields:['blockedByReportRef'],relatedRefs:[reportRef,...(current.unresolvedOperationRef?[current.unresolvedOperationRef]:[])]});
    return next;
  }
  async clear(tx:TenantTransaction,command:CommandIdentity,key:ResourceKey,operationRef:EntityRef,token:number,evidence:EntityRef,
    verify:(tx:TenantTransaction,operation:EntityRef,evidence:EntityRef)=>Promise<void>):Promise<ResourceFenceRecord>{
    contract('EntityRef',evidence);const current=await this.requireCurrent(tx,key,operationRef,token);
    await verify(tx,operationRef,evidence);
    const {unresolvedOperationRef:_,...fields}=current;
    const next=contract('ResourceFenceRecord',{...fields,fenceRef:{...current.fenceRef,version:current.fenceRef.version+1}});
    await this.#save(tx,current,next);
    await appendChange(tx,{command,target:next.fenceRef,eventType:'abh.resource-fence.cleared',changedFields:['unresolvedOperationRef'],relatedRefs:[operationRef,evidence]});return next;
  }
  async #save(tx:TenantTransaction,current:ResourceFenceRecord,next:ResourceFenceRecord):Promise<void>{
    const c=tx.context.tenant,rows=await tx.owner('OperationController')`UPDATE execution.resource_fences SET version=version+1,record=${JSON.stringify(next)}::text::jsonb,fencing_token=${next.fencingToken},
      unresolved_operation_id=${next.unresolvedOperationRef?.id??null},updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.fenceRef.id} AND version=${current.fenceRef.version} RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
  }
}
