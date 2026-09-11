import type {AttemptRecord,DispatchPermitRecord,EntityRef,OperationRecord} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {sameRef} from './shared.ts';

export async function readCurrentPermit(tx:TenantTransaction,operation:OperationRecord):Promise<DispatchPermitRecord>{
  const c=tx.context.tenant;
  const rows=await tx.owner('OperationController')`SELECT id,version FROM execution.dispatch_permits WHERE resource_organization_id=${c.resourceOrganizationId}
    AND operation_id=${operation.operationRef.id} AND ordinal=${operation.attemptCount} AND deleted_at IS NULL`;
  if(rows.length!==1)throw new CoreError('OPERATION_FACT_CONFLICT');
  const permit=await readPermit(tx,{type:'abh.dispatch-permit',id:rows[0]!.id,version:Number(rows[0]!.version)});
  if(permit.operationRef.id!==operation.operationRef.id||permit.ordinal!==operation.attemptCount||permit.operationRef.version>=operation.operationRef.version
    ||permit.actionRef.id!==operation.actionRef.id||permit.providerIdempotencyKey!==operation.providerIdempotencyKey)throw new CoreError('OPERATION_FACT_CONFLICT');return permit;
}

export async function readPermit(tx:TenantTransaction,ref:EntityRef):Promise<DispatchPermitRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.dispatch-permit')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
  const rows=await tx.owner('OperationController')`SELECT record,version,action_id,operation_id,attempt_id,ordinal,expires_at FROM execution.dispatch_permits
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],permit=contract('DispatchPermitRecord',row.record);
  if(!sameRef(permit.permitRef,ref)||permit.permitRef.version!==Number(row.version)||permit.resourceOrganizationId!==c.resourceOrganizationId
    ||permit.actionRef.id!==row.action_id||permit.operationRef.id!==row.operation_id||permit.attemptRef.id!==row.attempt_id||permit.ordinal!==row.ordinal
    ||Date.parse(permit.expiresAt)!==row.expires_at.getTime()||await digestContract('DispatchPermitRecord',permit)!==permit.digest)throw new CoreError('INTERNAL_ERROR');return permit;
}
export async function readAttempt(tx:TenantTransaction,ref:EntityRef):Promise<AttemptRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.attempt')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
  const rows=await tx.owner('OperationController')`SELECT record,version,operation_id,permit_id,ordinal FROM execution.attempts
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],attempt=contract('AttemptRecord',row.record);
  if(!sameRef(attempt.attemptRef,ref)||attempt.attemptRef.version!==Number(row.version)||attempt.resourceOrganizationId!==c.resourceOrganizationId
    ||attempt.operationRef.id!==row.operation_id||attempt.permitRef.id!==row.permit_id||attempt.ordinal!==row.ordinal)throw new CoreError('INTERNAL_ERROR');return attempt;
}
