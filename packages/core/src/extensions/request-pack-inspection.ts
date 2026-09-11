import {randomUUID} from 'node:crypto';
import type {EntityRef,InstalledPackRecord,PackInspectionJobRecord,RequestPackInspectionCommand,RequestPackInspectionPayload} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
export interface PackInspectionRequestAdmission {
 fenceRefs(tx:TenantTransaction,payload:RequestPackInspectionPayload):Promise<EntityRef[]>;
 /** Current deployment/environment policy. A request does not prove inspection. */
 current(tx:TenantTransaction,installation:InstalledPackRecord,payload:RequestPackInspectionPayload):Promise<void>;
}
/** Internal governance command: persist Pending and its receipt/audit/outbox
 * atomically. Delivery and inspection remain separate; expired requests reject
 * even on replay, while a live replay returns the original creation Ref. */
export async function requestPackInspection(database:Database,context:VerifiedContext,options:TransactionOptions,
 command:RequestPackInspectionCommand,grantRefs:readonly EntityRef[],checks:PackInspectionRequestAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const input=contract('RequestPackInspectionCommand',JSON.parse(canonicalJson(command))),payload=input.payload;
 const grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],limits={...options},c=context.tenant;
 const fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks);
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const grant=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
  const admit=async()=>{
   await grant();
   await new InstalledPackOwner().read(tx,payload.packRef,async installed=>{
    if(installed.manifest.integrity.packageDigest!==payload.packageDigest||installed.deploymentVersion!==payload.deploymentVersion)throw new CoreError('VERSION_CONFLICT');
    await current(tx,structuredClone(installed),structuredClone(payload));
   });
   await grant();
   const [time]=await tx.owner('PackLoader')`SELECT clock_timestamp()<${payload.expiresAt}::timestamptz AS live`;
   if(!time?.live)throw new CoreError('PRECONDITION_FAILED');tx.assertActive();
  };
  const result=await executeCommand(tx,identity,async()=>{
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(payload))]);
   await grant();
   const key=`${c.resourceOrganizationId}/Deployment`;
   await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
   await admit();
  },async()=>{
   const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
   const [principal]=await tx.owner('Identity')`SELECT version FROM identity.principals WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${c.actor.id} AND deleted_at IS NULL`;
   if(!principal)throw new CoreError('FORBIDDEN');
   const record:PackInspectionJobRecord=contract('PackInspectionJobRecord',{
    jobRef:{type:'abh.pack-inspection-job',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
    packRef:payload.packRef,packageDigest:payload.packageDigest,environmentDigest:payload.environmentDigest,deploymentVersion:payload.deploymentVersion,
    kind:'StructureAndDataInspection',status:'Pending',requestedBy:{type:'abh.principal',id:c.actor.id,version:Number(principal.version)},
    commandId:input.commandId,idempotencyKey:input.idempotencyKey,requestedAt:clock!.now,updatedAt:clock!.now,expiresAt:payload.expiresAt,
    budget:{maxAttempts:payload.maxAttempts,attempts:0,maxDurationMs:payload.maxDurationMs,elapsedMs:0},
   });
   await tx.owner('PackLoader')`INSERT INTO extension.inspection_jobs(resource_organization_id,id,record,pack_id,package_digest,environment_digest,deployment_version,status,purpose_names)
    VALUES (${c.resourceOrganizationId},${record.jobRef.id},${JSON.stringify(record)}::text::jsonb,${record.packRef.id},${record.packageDigest},${record.environmentDigest},${record.deploymentVersion},'Pending',${[c.purposeOfUse]})`;
   await appendChange(tx,{command:identity,target:record.jobRef,eventType:'abh.pack-inspection-job.requested',changedFields:['status','budget'],relatedRefs:[record.packRef]});
   return record.jobRef;
  });
  const ref=result.receipt.resultRef;
  if(ref.type!=='abh.pack-inspection-job'||ref.version!==1)throw new CoreError('INTERNAL_ERROR');
  // A replay must remain valid after progress advances; verify immutable request
  // fields against the current version without reopening or replacing the Job.
  const [row]=await tx.owner('PackLoader')`SELECT version FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}`;
  if(!row)throw new CoreError('INTERNAL_ERROR');
  await new PackInspectionJobOwner().read(tx,{...ref,version:Number(row.version)},async record=>{
   if(canonicalJson(record.packRef)!==canonicalJson(payload.packRef)||record.packageDigest!==payload.packageDigest||record.environmentDigest!==payload.environmentDigest||
    record.deploymentVersion!==payload.deploymentVersion||record.expiresAt!==payload.expiresAt||record.budget.maxAttempts!==payload.maxAttempts||
    record.budget.maxDurationMs!==payload.maxDurationMs||record.requestedBy.id!==c.actor.id||record.commandId!==result.receipt.commandRef.id||record.idempotencyKey!==input.idempotencyKey)throw new CoreError('PRECONDITION_FAILED');
  });
  await admit();return ref;
 });
}
