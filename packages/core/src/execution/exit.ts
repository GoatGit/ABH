import {randomUUID} from 'node:crypto';
import type {ClaimDispatchExitPayload,DispatchExitRecord,DispatchPermitRecord,EntityRef} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {consumeExitAuthorization,type IssuedDispatchAuthorization} from '../control/dispatch.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {sameRef} from './shared.ts';
import {DispatchOwner} from './dispatch.ts';

export interface ClaimedExit {exit:DispatchExitRecord;permit:DispatchPermitRecord;remainingMs:number}
/** A durable claim is consumed even if the process dies before transport. A replacement Worker must query, never reuse it. */
export class DispatchExitOwner {
  async claim(tx:TenantTransaction,command:CommandIdentity,permitRef:EntityRef,input:ClaimDispatchExitPayload,
    resolve:(tx:TenantTransaction)=>Promise<IssuedDispatchAuthorization>):Promise<ClaimedExit>{
    contract('ClaimDispatchExitPayload',input);const complete=tx.requireCompletion(),auth=consumeExitAuthorization(tx,permitRef,await resolve(tx)),permit=auth.exitPermit,c=tx.context.tenant;
    if(permit.workerId!==input.workerId||permit.leaseRef.id!==input.leaseRef.id||permit.leaseFencingToken!==input.leaseFencingToken)throw new CoreError('PRECONDITION_FAILED');
    const lease=await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,permit.operationRef);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${permit.operationRef.id}`,sql=tx.owner('OperationController');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const prior=await sql`SELECT id FROM execution.dispatch_exits WHERE resource_organization_id=${c.resourceOrganizationId} AND permit_id=${permitRef.id}`;
    if(prior[0])throw new CoreError('PRECONDITION_FAILED');
    const owner=new DispatchOwner(),attempt=await owner.getAttempt(tx,permit.attemptRef),observations=await owner.observations(tx,permit.attemptRef);
    if(!sameRef(attempt.permitRef,permit.permitRef)||!sameRef(attempt.operationRef,permit.operationRef)||attempt.ordinal!==permit.ordinal
      ||observations.length!==1||observations[0]!.status!=='Created')throw new CoreError('PRECONDITION_FAILED');
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    const expiresAt=new Date(Math.min(Date.parse(auth.validUntil),Date.parse(lease.leaseUntil),Date.parse(permit.expiresAt))).toISOString();
    if(Date.parse(expiresAt)<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
    const exit=contract('DispatchExitRecord',{exitRef:{type:'abh.dispatch-exit',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,permitRef,attemptRef:permit.attemptRef,
      workerId:input.workerId,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken,policyEvaluationRefs:auth.policyEvaluationRefs,claimedAt:clock!.now.toISOString(),expiresAt});
    await sql`INSERT INTO execution.dispatch_exits(resource_organization_id,id,workspace_id,purpose_names,permit_id,attempt_id,record)
      VALUES (${c.resourceOrganizationId},${exit.exitRef.id},${c.workspaceId??null},${auth.intent.purposeNames},${permitRef.id},${permit.attemptRef.id},${JSON.stringify(exit)}::text::jsonb)`;
    await appendChange(tx,{command,target:exit.exitRef,eventType:'abh.dispatch-exit.created',changedFields:['permitRef','claimedAt','workerId'],relatedRefs:[permitRef,permit.attemptRef,...exit.policyEvaluationRefs]});
    const [last]=await sql`SELECT clock_timestamp() AS now`;const remainingMs=Date.parse(expiresAt)-last!.now.getTime();
    if(remainingMs<=0)throw new CoreError('AUTHORITY_REQUIRED');auth.complete();complete();return {exit,permit,remainingMs};
  }
}
