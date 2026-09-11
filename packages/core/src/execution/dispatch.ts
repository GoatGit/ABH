import {randomUUID} from 'node:crypto';
import type {AttemptObservationRecord,DispatchPermitRecord,EntityRef,IssueDispatchPermitPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {consumeDispatchAuthorization,type IssuedDispatchAuthorization} from '../control/dispatch.ts';
import {ResourceFenceOwner} from './resource-fences.ts';
import {OperationOwner} from './operations.ts';
import {ActionOwner} from './actions.ts';
import {readAttempt,readPermit} from './dispatch-facts.ts';

/** Controller owns one immutable Permit/Attempt pair. It never performs transport inside the UoW. */
export class DispatchOwner {
  getPermit=readPermit;
  getAttempt=readAttempt;
  async observations(tx:TenantTransaction,attemptRef:EntityRef):Promise<AttemptObservationRecord[]>{
    const attempt=await readAttempt(tx,attemptRef),c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT record,version,status,sequence FROM execution.attempt_observations WHERE resource_organization_id=${c.resourceOrganizationId}
      AND attempt_id=${attempt.attemptRef.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY sequence`;
    return rows.map(row=>{const record=contract('AttemptObservationRecord',row.record);
      if(record.resourceOrganizationId!==c.resourceOrganizationId||record.attemptRef.id!==attempt.attemptRef.id||record.observationRef.version!==Number(row.version)||record.status!==row.status||record.sequence!==Number(row.sequence))throw new CoreError('INTERNAL_ERROR');return record;});
  }
  async issue(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,input:IssueDispatchPermitPayload,
    resolve:(tx:TenantTransaction)=>Promise<IssuedDispatchAuthorization>):Promise<DispatchPermitRecord>{
    contract('OperationRef',operationRef);contract('IssueDispatchPermitPayload',input);const complete=tx.requireCompletion();
    const auth=consumeDispatchAuthorization(tx,operationRef,await resolve(tx)),c=tx.context.tenant;
    if(canonicalJson(input.snapshotRef)!==canonicalJson(auth.snapshot.snapshotRef))throw new CoreError('AUTHORITY_REQUIRED');
    // Control has acquired all stage 1/2/3 locks and the parent Action aggregate.
    const lease=await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,operationRef);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${operationRef.id}`;
    await tx.lock(4,key,()=>tx.owner('OperationController')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    if(canonicalJson(await new OperationOwner().get(tx,operationRef.id))!==canonicalJson(auth.operation))throw new CoreError('VERSION_CONFLICT');
    const slot=await new ResourceFenceOwner().occupy(tx,command,auth.node,operationRef,auth.intent.purposeNames);
    const [clock]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;
    const expiresAt=new Date(Math.min(clock!.now.getTime()+5000,Date.parse(auth.validUntil),Date.parse(lease.leaseUntil))).toISOString();
    if(Date.parse(expiresAt)<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
    const permitRef={type:'abh.dispatch-permit',id:randomUUID(),version:1},attemptRef={type:'abh.attempt',id:randomUUID(),version:1},ordinal=auth.operation.attemptCount+1;
    const unsigned=contract('DispatchPermitRecord',{permitRef,resourceOrganizationId:c.resourceOrganizationId,actionRef:auth.action.actionRef,operationRef,attemptRef,ordinal,snapshotRef:auth.snapshot.snapshotRef,
      workerId:input.workerId,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken,resourceFenceRef:slot.fenceRef,resourceFencingToken:slot.fencingToken,connectorRef:auth.node.connectorRef,
      payloadRef:auth.payloadRef,payloadDigest:auth.payloadDigest,dependencyRefs:auth.dependencyRefs,providerIdempotencyKey:auth.operation.providerIdempotencyKey,policyEvaluationRefs:auth.policyEvaluationRefs,
      issuedAt:clock!.now.toISOString(),expiresAt,digest:'sha256:'+'0'.repeat(64)});
    const permit=contract('DispatchPermitRecord',{...unsigned,digest:await digestContract('DispatchPermitRecord',unsigned)});
    const attempt=contract('AttemptRecord',{attemptRef,resourceOrganizationId:c.resourceOrganizationId,operationRef,ordinal,permitRef,providerIdempotencyKey:auth.operation.providerIdempotencyKey,createdAt:permit.issuedAt});
    const observation=contract('AttemptObservationRecord',{observationRef:{type:'abh.attempt-observation',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,attemptRef,
      sequence:1,status:'Created',observedAt:permit.issuedAt,evidenceRefs:[permitRef]});
    const sql=tx.owner('OperationController'),purposes=auth.intent.purposeNames;
    await sql`INSERT INTO execution.dispatch_permits(resource_organization_id,id,workspace_id,purpose_names,action_id,operation_id,attempt_id,ordinal,expires_at,record)
      VALUES (${c.resourceOrganizationId},${permitRef.id},${c.workspaceId??null},${purposes},${auth.action.actionRef.id},${operationRef.id},${attemptRef.id},${ordinal},${expiresAt},${JSON.stringify(permit)}::text::jsonb)`;
    await sql`INSERT INTO execution.attempts(resource_organization_id,id,workspace_id,purpose_names,operation_id,permit_id,ordinal,record)
      VALUES (${c.resourceOrganizationId},${attemptRef.id},${c.workspaceId??null},${purposes},${operationRef.id},${permitRef.id},${ordinal},${JSON.stringify(attempt)}::text::jsonb)`;
    await sql`INSERT INTO execution.attempt_observations(resource_organization_id,id,workspace_id,purpose_names,attempt_id,sequence,status,record)
      VALUES (${c.resourceOrganizationId},${observation.observationRef.id},${c.workspaceId??null},${purposes},${attemptRef.id},1,'Created',${JSON.stringify(observation)}::text::jsonb)`;
    await appendChange(tx,{command,target:permitRef,eventType:'abh.dispatch-permit.created',changedFields:['operationRef','snapshotRef','expiresAt'],relatedRefs:[attemptRef,lease.leaseRef,slot.fenceRef,...permit.policyEvaluationRefs]});
    await appendChange(tx,{command,target:attemptRef,eventType:'abh.attempt.created',changedFields:['operationRef','ordinal','permitRef'],relatedRefs:[permitRef]});
    await appendChange(tx,{command,target:observation.observationRef,eventType:'abh.attempt-observation.created',changedFields:['status','evidenceRefs'],relatedRefs:[attemptRef,permitRef]});
    const next=contract('OperationRecord',{...auth.operation,operationRef:{...operationRef,version:operationRef.version+1},attemptCount:ordinal,position:{lifecycle:'Dispatching',outcome:'Pending'}});
    const changed=await sql`UPDATE execution.operations SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,lifecycle='Dispatching',outcome='Pending',updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${operationRef.id} AND version=${operationRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.operationRef,eventType:'abh.operation.dispatch',changedFields:['position','attemptCount'],relatedRefs:[permitRef,attemptRef]});
    await new ActionOwner().startExecution(tx,command,auth.action.actionRef,permitRef);
    const [deadline]=await sql`SELECT clock_timestamp()<${expiresAt}::timestamptz AS valid`;
    if(!deadline!.valid)throw new CoreError('AUTHORITY_REQUIRED');auth.complete();complete();return permit;
  }
}
