import {randomUUID} from 'node:crypto';
import type {ClaimWorkLeasePayload,EntityRef,WorkLeaseRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {currentIdentity} from '../identity/owner.ts';
import {lockFences} from '../control/fences.ts';
import {lifecyclePurposes} from '../data/purposes.ts';

/** Distinguishes contention from authority, binding or storage failures. */
export class WorkLeaseBusyError extends CoreError {constructor(){super('PRECONDITION_FAILED');}}
export class WorkLeaseNotCurrentError extends CoreError {constructor(){super('PRECONDITION_FAILED');}}

/** Worker ownership only. Claim, heartbeat and expiry neither issue authority nor prove an external request was unsent. */
export class WorkLeaseOwner {
  async #admit(tx:TenantTransaction):Promise<EntityRef>{
    const c=tx.context.tenant;if(c.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1}]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    const identity=await currentIdentity(tx);if(identity.scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');return identity.principal.principalRef;
  }
  async #lock(tx:TenantTransaction,target:EntityRef):Promise<void>{
    // Pack inspections acquire Deployment and PackLoader governance aggregates
    // before their final lease check. Every lease operation for this target type
    // uses the same later namespace; other targets retain their existing order.
    const namespace=target.type==='abh.installed-pack'?'WorkLease':'DurableExecution';
    const key=`${tx.context.tenant.resourceOrganizationId}/${namespace}/${target.type}/${target.id}`;
    await tx.lock(4,key,()=>tx.owner('DurableExecution')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  }
  async #read(tx:TenantTransaction,target:EntityRef):Promise<{record:WorkLeaseRecord;active:boolean}|undefined>{
    const c=tx.context.tenant;
    const rows=await tx.owner('DurableExecution')`SELECT id,record,version,worker_id,principal_id,fencing_token,lease_until,lease_until>clock_timestamp() AS active
      FROM runtime.work_leases WHERE resource_organization_id=${c.resourceOrganizationId} AND target_type=${target.type} AND target_id=${target.id}
        AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])return undefined;const row=rows[0],record=contract('WorkLeaseRecord',row.record);
    if(record.leaseRef.id!==row.id||record.resourceOrganizationId!==c.resourceOrganizationId||record.targetRef.type!==target.type||record.targetRef.id!==target.id||record.leaseRef.version!==Number(row.version)
      ||record.workerId!==row.worker_id||record.executionPrincipalRef.id!==row.principal_id||record.fencingToken!==Number(row.fencing_token)||Date.parse(record.leaseUntil)!==row.lease_until.getTime())throw new CoreError('INTERNAL_ERROR');
    return {record,active:row.active};
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<WorkLeaseRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.work-lease')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('DurableExecution')`SELECT target_type,target_id FROM runtime.work_leases WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    const value=await this.#read(tx,{type:rows[0].target_type,id:rows[0].target_id,version:1});
    if(!value)throw new CoreError('RESOURCE_NOT_FOUND');return value.record;
  }
  /** Caller holds its full Control and business aggregate fences. Observe under
   * the same target lock as renewal/takeover; a missing row is not loss evidence. */
  async observe(tx:TenantTransaction,target:EntityRef):Promise<{record:WorkLeaseRecord;assessedAt:string}>{
    contract('EntityRef',target);if(tx.context.tenant.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    await this.#lock(tx,target);const value=await this.#read(tx,target);
    if(!value)throw new CoreError('RESOURCE_NOT_FOUND');
    const [clock]=await tx.owner('DurableExecution')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
    tx.assertActive();return {record:value.record,assessedAt:String(clock!.now)};
  }
  async claim(tx:TenantTransaction,command:CommandIdentity,input:ClaimWorkLeasePayload,verifyTarget:(tx:TenantTransaction,target:EntityRef)=>Promise<void|string[]>):Promise<WorkLeaseRecord>{
    contract('ClaimWorkLeasePayload',input);const principal=await this.#admit(tx);
    const purposes=await verifyTarget(tx,input.targetRef);const purposeNames=lifecyclePurposes(purposes??[tx.context.tenant.purposeOfUse],tx.context.tenant.purposeOfUse);
    await this.#lock(tx,input.targetRef);const previous=await this.#read(tx,input.targetRef),c=tx.context.tenant;
    if(previous?.active){
      if(previous.record.workerId!==input.workerId||previous.record.executionPrincipalRef.id!==principal.id)throw new WorkLeaseBusyError();
      // Repeated claim does not extend the lease or increment the fencing token.
      return previous.record;
    }
    const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const record=contract('WorkLeaseRecord',{leaseRef:{type:'abh.work-lease',id:previous?.record.leaseRef.id??randomUUID(),version:(previous?.record.leaseRef.version??0)+1},
      resourceOrganizationId:c.resourceOrganizationId,targetRef:input.targetRef,workerId:input.workerId,executionPrincipalRef:principal,fencingToken:(previous?.record.fencingToken??0)+1,
      leaseUntil:new Date(Math.min(clock!.now.getTime()+input.leaseSeconds*1000,Date.parse(c.contextExpiresAt))).toISOString()});
    if(previous)await this.#save(tx,previous.record,record);
    else await tx.owner('DurableExecution')`INSERT INTO runtime.work_leases(resource_organization_id,id,workspace_id,purpose_names,target_type,target_id,worker_id,principal_id,fencing_token,lease_until,record)
      VALUES (${c.resourceOrganizationId},${record.leaseRef.id},${c.workspaceId??null},${purposeNames},${input.targetRef.type},${input.targetRef.id},${input.workerId},${principal.id},1,${record.leaseUntil},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.leaseRef,eventType:'abh.work-lease.claimed',changedFields:['workerId','fencingToken','leaseUntil'],relatedRefs:[input.targetRef,principal]});return record;
  }
  /** Dispatch already holds the full control/source fences; this only locks the lease aggregate and verifies current ownership. */
  async requireCurrent(tx:TenantTransaction,ref:EntityRef,workerId:string,fencingToken:number,target:EntityRef):Promise<WorkLeaseRecord>{
    contract('EntityRef',ref);contract('UUID',workerId);contract('Version',fencingToken);contract('EntityRef',target);
    if(ref.type!=='abh.work-lease'||tx.context.tenant.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    await this.#lock(tx,target);const value=await this.#read(tx,target);
    if(!value?.active||value.record.leaseRef.id!==ref.id||value.record.workerId!==workerId||value.record.fencingToken!==fencingToken||value.record.executionPrincipalRef.id!==tx.context.tenant.actor.id)throw new WorkLeaseNotCurrentError();
    return value.record;
  }
  async renew(tx:TenantTransaction,command:CommandIdentity,ref:EntityRef,workerId:string,fencingToken:number,leaseSeconds:number):Promise<WorkLeaseRecord>{
    contract('RenewWorkLeasePayload',{workerId,fencingToken,leaseSeconds});await this.#admit(tx);const initial=await this.get(tx,ref);
    const current=await this.requireCurrent(tx,ref,workerId,fencingToken,initial.targetRef);
    if(current.leaseRef.version!==ref.version)throw new CoreError('VERSION_CONFLICT');
    const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const next=contract('WorkLeaseRecord',{...current,leaseRef:{...current.leaseRef,version:current.leaseRef.version+1},leaseUntil:new Date(Math.min(clock!.now.getTime()+leaseSeconds*1000,Date.parse(tx.context.tenant.contextExpiresAt))).toISOString()});
    await this.#save(tx,current,next);await appendChange(tx,{command,target:next.leaseRef,eventType:'abh.work-lease.renewed',changedFields:['leaseUntil'],relatedRefs:[next.targetRef]});return next;
  }
  async release(tx:TenantTransaction,command:CommandIdentity,ref:EntityRef,workerId:string,fencingToken:number):Promise<WorkLeaseRecord>{
    contract('ReleaseWorkLeasePayload',{workerId,fencingToken});await this.#admit(tx);const initial=await this.get(tx,ref);
    const current=await this.requireCurrent(tx,ref,workerId,fencingToken,initial.targetRef);
    if(current.leaseRef.version!==ref.version)throw new CoreError('VERSION_CONFLICT');
    const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const next=contract('WorkLeaseRecord',{...current,leaseRef:{...current.leaseRef,version:current.leaseRef.version+1},leaseUntil:clock!.now.toISOString()});
    await this.#save(tx,current,next);await appendChange(tx,{command,target:next.leaseRef,eventType:'abh.work-lease.released',changedFields:['leaseUntil'],relatedRefs:[next.targetRef]});return next;
  }
  async #save(tx:TenantTransaction,current:WorkLeaseRecord,next:WorkLeaseRecord):Promise<void>{
    const c=tx.context.tenant,rows=await tx.owner('DurableExecution')`UPDATE runtime.work_leases SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,worker_id=${next.workerId},principal_id=${next.executionPrincipalRef.id},
      fencing_token=${next.fencingToken},lease_until=${next.leaseUntil},updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.leaseRef.id} AND version=${current.leaseRef.version} RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
  }
}
