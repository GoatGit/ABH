import {randomUUID} from 'node:crypto';
import type {EntityRef,PurposeRecord} from '@abh/contracts';
import type {ContractCatalog} from '@abh/contracts/catalog';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from './fences.ts';
import {LearningOwner} from '../mission/learning.ts';

/** Purpose names are registered by a verified static catalog and activated by explicit governance. */
export class PurposeOwner {
  async configure(tx:TenantTransaction,command:CommandIdentity,input:PurposeRecord,catalog:ContractCatalog,verify:(tx:TenantTransaction,input:PurposeRecord)=>Promise<void>):Promise<PurposeRecord>{
    contract('PurposeRecord',input);const c=tx.context.tenant;
    if(input.resourceOrganizationId!==c.resourceOrganizationId||input.purposeRef.version!==1||input.status!=='Active'||!Object.hasOwn(catalog.purposes,input.name))throw new CoreError('PURPOSE_DENIED');
    await verify(tx,input);const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    await tx.owner('Control')`INSERT INTO control.purposes(resource_organization_id,id,purpose_names,name,status,record)
      VALUES (${c.resourceOrganizationId},${input.purposeRef.id},${[input.name]},${input.name},'Active',${JSON.stringify(input)}::text::jsonb)`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${c.resourceOrganizationId},${randomUUID()},'abh.purpose',${input.purposeRef.id},1)`;
    await appendChange(tx,{command,target:input.purposeRef,eventType:'abh.purpose.created',changedFields:['name','status'],relatedRefs:input.evidenceRefs});return input;
  }
  async requireAllCurrent(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<PurposeRecord[]>{
    const c=tx.context.tenant;if(!refs.length||refs.length>100||new Set(refs.map(ref=>ref.id)).size!==refs.length)throw new CoreError('PURPOSE_DENIED');
    const records:PurposeRecord[]=[];
    for(const ref of refs){
      contract('EntityRef',ref);if(ref.type!=='abh.purpose')throw new CoreError('PURPOSE_DENIED');
      const rows=await tx.owner('Control')`SELECT record,version,status,name FROM control.purposes WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL`;
      const row=rows[0];if(!row||row.status!=='Active'||Number(row.version)!==ref.version)throw new CoreError('PURPOSE_DENIED');
      const record=contract('PurposeRecord',row.record);
      if(record.purposeRef.id!==ref.id||record.purposeRef.version!==ref.version||record.resourceOrganizationId!==c.resourceOrganizationId||record.status!==row.status||record.name!==row.name)throw new CoreError('INTERNAL_ERROR');records.push(record);
    }
    const selected=records.filter(record=>record.name===c.purposeOfUse);if(selected.length!==1)throw new CoreError('PURPOSE_DENIED');return records;
  }
  async requireCurrent(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<PurposeRecord>{
    return (await this.requireAllCurrent(tx,refs)).find(record=>record.name===tx.context.tenant.purposeOfUse)!;
  }
  async revoke(tx:TenantTransaction,command:CommandIdentity,ref:EntityRef,evidence:EntityRef[],verify:(tx:TenantTransaction)=>Promise<void>):Promise<PurposeRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.purpose'||!evidence.length)throw new CoreError('INVALID_ARGUMENT');for(const item of evidence)contract('EntityRef',item);
    await verify(tx);const c=tx.context.tenant,sql=tx.owner('Control'),fences=await lockFences(tx,[ref,{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
    const rows=await sql`SELECT record,version,status FROM control.purposes WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');if(Number(rows[0].version)!==ref.version)throw new CoreError('VERSION_CONFLICT');if(rows[0].status!=='Active')throw new CoreError('PRECONDITION_FAILED');
    const next=contract('PurposeRecord',{...contract('PurposeRecord',rows[0].record),purposeRef:{...ref,version:ref.version+1},status:'Revoked'});
    await sql`UPDATE control.purposes SET record=${JSON.stringify(next)}::text::jsonb,status='Revoked',version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
    const fence=fences.find(f=>f.scopeRef.type===ref.type&&f.scopeRef.id===ref.id)!;
    await sql`UPDATE control.fences SET epoch=epoch+1,version=version+1,stop_flag=true,updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${fence.fenceRef.id}`;
    if(next.name.startsWith('abh.learning.'))await new LearningOwner().withdrawRevokedPurpose(tx,next.name);
    await appendChange(tx,{command,target:next.purposeRef,eventType:'abh.purpose.revoked',changedFields:['status'],relatedRefs:evidence});
    await appendChange(tx,{command,target:{...fence.fenceRef,version:fence.fenceRef.version+1},eventType:'abh.fence.advanced',changedFields:['epoch','stopFlag'],relatedRefs:[next.purposeRef]});return next;
  }
}
