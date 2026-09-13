import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {AuthorizedContextRef,EntityRef,StoredObjectRef} from '@abh/contracts';
import type {ObjectStorePort} from '@abh/contracts/ports';
import type {Database,TenantTransaction,TransactionOptions} from './uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {contract} from './journal.ts';
import {InlineArtifactOwner} from './artifacts.ts';
import {ObjectArtifactOwner} from './object-artifacts.ts';

export interface RetentionPolicyDecision {
  readonly expiresAt?:string;
  readonly evidenceRef:EntityRef;
}

export interface RetentionWorkerOptions {
  readonly workerId:string;
  readonly context:ContextSource;
  readonly grantRefs:readonly EntityRef[];
  readonly signal:AbortSignal;
  readonly objectStore?:ObjectStorePort;
  readonly authorizedContextRef:AuthorizedContextRef;
  readonly resolveRetention:(record:import('@abh/contracts').ArtifactRecord,options:TransactionOptions)=>
    Promise<RetentionPolicyDecision>;
  readonly pageSize?:number;
  readonly intervalMs?:number;
  readonly leaseSeconds?:number;
  readonly onPage?:(result:{scanned:number;queued:number;completed:number})=>Promise<void>|void;
}

interface RetentionJob {
  readonly jobId:string;readonly artifactRef:EntityRef;
  readonly objectRef?:StoredObjectRef;
  readonly evidenceRef:EntityRef;readonly proofId:string;readonly idempotencyKey:string;
  readonly workerId:string;readonly fencingToken:number;readonly attempts:number;
}

const purpose=(tx:TenantTransaction)=>{const c=tx.context.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.artifact.manage'||c.actingOrganizationId!==c.resourceOrganizationId)
    throw new CoreError('FORBIDDEN');};

async function authorize(tx:TenantTransaction,artifactRef:EntityRef,grants:readonly EntityRef[],action='abh.artifacts.tombstone'):Promise<void>{
  const c=tx.context.tenant;
  await assertCurrentGrants(tx,{objectRef:artifactRef,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
    action},structuredClone(grants));
}

async function queueDue(database:Database,current:VerifiedContext,options:TransactionOptions,input:RetentionWorkerOptions):
  Promise<{scanned:number;queued:number}>{
  const size=input.pageSize??20;
  return database.transaction(current,options,async tx=>{
    purpose(tx);const sql=tx.owner('ArtifactStore');
    const rows=await sql`SELECT a.id,a.record,o.object_ref FROM data.artifacts a
      LEFT JOIN data.object_artifacts o ON o.resource_organization_id=a.resource_organization_id
        AND o.artifact_id=a.id AND o.artifact_version=a.version
      WHERE a.resource_organization_id=${current.tenant.resourceOrganizationId} AND a.deleted_at IS NULL AND a.status='Available'
        AND NOT EXISTS(SELECT 1 FROM data.artifact_retention_jobs j
          WHERE j.resource_organization_id=a.resource_organization_id AND j.artifact_id=a.id)
      ORDER BY a.id LIMIT ${size+1}`;
    let queued=0;
    for(const row of rows.slice(0,size)){
      const record=contract('ArtifactRecord',row.record),decision=await input.resolveRetention(record,options);
      const evidence=contract('EntityRef',structuredClone(decision.evidenceRef));
      if(decision.expiresAt===undefined||Date.parse(decision.expiresAt)>Date.now())continue;
      await authorize(tx,record.artifactRef,input.grantRefs);
      const object=row.object_ref?contract('StoredObjectRef',row.object_ref):undefined;
      await sql`INSERT INTO data.artifact_retention_jobs(
        resource_organization_id,id,workspace_id,purpose_names,artifact_id,artifact_version,state,
        policy_evidence,object_ref,deletion_proof_id,deletion_idempotency_key)
      VALUES (${current.tenant.resourceOrganizationId},${randomUUID()},${current.tenant.workspaceId??null},ARRAY[${current.tenant.purposeOfUse}],
        ${record.artifactRef.id},${record.artifactRef.version},'Pending',${JSON.stringify(evidence)}::text::jsonb,
        ${object?JSON.stringify(object):null}::text::jsonb,${randomUUID()},${randomUUID()})`;
      queued++;
    }
    tx.assertActive();return {scanned:Math.min(rows.length,size),queued};
  });
}

async function claim(database:Database,current:VerifiedContext,options:TransactionOptions,input:RetentionWorkerOptions):
  Promise<RetentionJob|undefined>{
  return database.transaction(current,options,async tx=>{
    purpose(tx);const c=tx.context.tenant,sql=tx.owner('ArtifactStore');
    const [row]=await sql`SELECT j.id,j.attempts,j.fencing_token,j.policy_evidence,j.object_ref,
      j.deletion_proof_id,j.deletion_idempotency_key,a.id AS artifact_id,a.version
      FROM data.artifact_retention_jobs j JOIN data.artifacts a
        ON a.resource_organization_id=j.resource_organization_id AND a.id=j.artifact_id AND a.version=j.artifact_version
      WHERE j.resource_organization_id=${c.resourceOrganizationId} AND j.state IN ('Pending','Deleting')
        AND (j.state='Pending' OR j.lease_until<=clock_timestamp())
      ORDER BY j.id FOR UPDATE OF j,a SKIP LOCKED LIMIT 1`;
    if(!row)return undefined;
    const artifactRef=contract('EntityRef',{type:'abh.artifact',id:String(row.artifact_id),version:Number(row.version)});
    await authorize(tx,artifactRef,input.grantRefs,'abh.artifacts.tombstone');
    const [lease]=await sql`SELECT clock_timestamp() + (${String(input.leaseSeconds??30)}||' seconds')::interval AS until`;
    if(!lease)throw new CoreError('INTERNAL_ERROR');
    const token=Number(row.fencing_token)+1,worker=input.workerId;
    await sql`UPDATE data.artifact_retention_jobs SET state='Deleting',attempts=attempts+1,worker_id=${worker},
      fencing_token=${token},lease_until=${lease.until},updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${row.id} AND attempts<5`;
    const object=row.object_ref?contract('StoredObjectRef',row.object_ref):undefined;
    return {jobId:String(row.id),artifactRef,...(object?{objectRef:object}:{}),
      evidenceRef:contract('EntityRef',row.policy_evidence),proofId:String(row.deletion_proof_id),
      idempotencyKey:String(row.deletion_idempotency_key),workerId:worker,fencingToken:token,attempts:Number(row.attempts)+1};
  });
}

async function complete(database:Database,current:VerifiedContext,options:TransactionOptions,input:RetentionWorkerOptions,
  job:RetentionJob,receipt?:EntityRef):Promise<boolean>{
  return database.transaction(current,options,async tx=>{
    purpose(tx);const c=tx.context.tenant,sql=tx.owner('ArtifactStore');
    const [jobRow]=await sql`SELECT state,worker_id,fencing_token,artifact_id,artifact_version,object_ref
      FROM data.artifact_retention_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${job.jobId} FOR UPDATE`;
    if(!jobRow||jobRow.state!=='Deleting'||jobRow.worker_id!==job.workerId||Number(jobRow.fencing_token)!==job.fencingToken)
      return false;
    const artifactRef=contract('EntityRef',{type:'abh.artifact',id:String(jobRow.artifact_id),version:Number(jobRow.artifact_version)});
    await authorize(tx,artifactRef,input.grantRefs,'abh.artifacts.tombstone');
    const boundObject=jobRow.object_ref?contract('StoredObjectRef',jobRow.object_ref):undefined;
    if(boundObject?.id!==job.objectRef?.id||boundObject?.version!==job.objectRef?.version)return false;
    const proof=contract('EntityRef',{type:'abh.deletion-proof',id:job.proofId,version:1});
    let receiptRef=proof;
    const command={type:'abh.artifacts.apply-retention',commandId:randomUUID(),idempotencyKey:randomUUID(),
      digest:'sha256:'+'0'.repeat(64)} as const;
    if(job.objectRef){
      if(!receipt)return false;
      const returned=contract('EntityRef',structuredClone(receipt));
      receiptRef=returned;
      await new ObjectArtifactOwner().tombstone(tx,command,artifactRef,proof,async record=>{
        await authorize(tx,record.artifactRef,input.grantRefs);});
    }else await new InlineArtifactOwner().tombstone(tx,command,artifactRef,proof,async record=>{
      await authorize(tx,record.artifactRef,input.grantRefs);});
    await sql`UPDATE data.artifact_retention_jobs SET state='Completed',worker_id=NULL,lease_until=NULL,
      receipt_ref=${JSON.stringify(receiptRef)}::text::jsonb,completed_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${job.jobId} AND state='Deleting' AND worker_id=${job.workerId}
        AND fencing_token=${job.fencingToken}`;
    tx.assertActive();return true;
  });
}

async function fail(database:Database,current:VerifiedContext,options:TransactionOptions,job:RetentionJob):Promise<void>{
  await database.transaction(current,options,async tx=>{
    purpose(tx);const c=tx.context.tenant;
    await tx.owner('ArtifactStore')`UPDATE data.artifact_retention_jobs SET state=CASE WHEN attempts>=5 THEN 'Failed' ELSE 'Pending' END,
      worker_id=NULL,lease_until=NULL,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${job.jobId} AND state='Deleting'
        AND worker_id=${job.workerId} AND fencing_token=${job.fencingToken}`;
    tx.assertActive();
  });
}

/** Retention is explicit, grant-checked, lease-fenced and deletion-before-tombstone. Missing delete confirmation leaves the job active. */
export async function runArtifactRetentionWorker(database:Database,input:RetentionWorkerOptions):Promise<void>{
  const pageSize=input.pageSize??20,interval=input.intervalMs??1000,leaseSeconds=input.leaseSeconds??30;
  contract('UUID',input.workerId);contract('AuthorizedContextRef',input.authorizedContextRef);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(interval)||interval<1||interval>60000
    ||!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>300)throw new CoreError('INVALID_ARGUMENT');
  const grants=structuredClone(input.grantRefs);let binding:string|undefined;
  const currentContext=async()=>{
    const value=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+10000,signal:input.signal}),c=value.tenant;
    const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return value;
  },options=():TransactionOptions=>({deadline:Date.now()+10000,signal:input.signal});
  while(!input.signal.aborted){
    try{
      const current=await currentContext(),scan=await queueDue(database,current,options(),input);
      let completed=0;
      for(;;){
        if(input.signal.aborted)return;
        const current=await currentContext(),job=await claim(database,current,options(),input);
        if(!job)break;
        try{
          let receipt:EntityRef|undefined;
          if(job.objectRef){
            if(!input.objectStore)throw new CoreError('DEPENDENCY_UNAVAILABLE');
            const response=await input.objectStore.delete({context:{deadline:new Date(Date.now()+10000).toISOString(),callId:randomUUID(),
                requestContextRef:{type:'abh.request-context',id:current.tenant.requestId,version:1},
                target:{objectRef:job.objectRef,scopeRefs:[{type:'abh.organization',id:current.tenant.resourceOrganizationId,version:1}],
                  action:'abh.artifacts.delete'}},
              authorizedContextRef:input.authorizedContextRef,objectRef:job.objectRef,
              deletionProofRef:{type:'abh.deletion-proof',id:job.proofId,version:1},idempotencyKey:job.idempotencyKey},
              {signal:input.signal});
            if(response.status==='Completed')receipt=contract('EntityRef',response.data.receiptRef);
          }
          if(await complete(database,await currentContext(),options(),input,job,receipt))completed++;
          else await fail(database,await currentContext(),options(),job);
        }catch(error){await fail(database,await currentContext(),options(),job);if(input.signal.aborted)return;}
      }
      if(input.signal.aborted)return;
      if(input.onPage)await input.onPage({scanned:scan.scanned,queued:scan.queued,completed});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
