import type {EntityRef,PackInspectionJobRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

function management(tx:TenantTransaction){
 const c=tx.context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 return c;
}
/** Read persisted progress only. Caller admission must authorize the current
 * installation and evidence. This does not certify live inspection or Enable. */
export class PackInspectionJobOwner {
 /** Internal stop predicate only: no record is returned and no authority is
  * granted. Read without Control/aggregate locks so a long inspection cannot
  * block its own cancellation watcher. Committing Owners retain all admission. */
 async assertRunning(tx:TenantTransaction,ref:EntityRef):Promise<void>{
  const c=management(tx),input=contract('EntityRef',structuredClone(ref));
  if(input.type!=='abh.pack-inspection-job')throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('PackLoader')`SELECT version,status FROM extension.inspection_jobs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.id} AND workspace_id IS NULL
    AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==input.version)throw new CoreError('VERSION_CONFLICT');
  if(row.status!=='Running')throw new CoreError('PRECONDITION_FAILED');
  tx.assertActive();
 }

 /** Bounded internal keyset discovery. Nonterminal expired work remains visible
  * so the Owner can record its failure. Candidates are hints, never claims.
  * Admission is mandatory even for empty pages; per-record reads still authorize. */
 async scanPending(tx:TenantTransaction,limit:number,after:string|undefined,admit:()=>Promise<void>):Promise<{refs:EntityRef[];next?:string}>{
  const c=management(tx);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  const cursor=after===undefined?null:contract('UUID',after);
  await admit();tx.assertActive();
  const rows=await tx.owner('PackLoader')`SELECT id,version FROM extension.inspection_jobs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND workspace_id IS NULL AND deleted_at IS NULL
    AND ${c.purposeOfUse}=ANY(purpose_names) AND status IN ('Pending','Running','Waiting')
    AND (${cursor}::uuid IS NULL OR id>${cursor}::uuid) ORDER BY id LIMIT ${limit+1}`;
  const page=rows.slice(0,limit),refs=page.map(row=>contract('EntityRef',{type:'abh.pack-inspection-job',id:row.id,version:Number(row.version)}));
  await admit();tx.assertActive();
  return {refs,...(rows.length>limit&&page.length?{next:page.at(-1)!.id as string}:{})};
 }
 async read(tx:TenantTransaction,ref:EntityRef,admit:(record:PackInspectionJobRecord)=>Promise<void>):Promise<PackInspectionJobRecord>{
  return this.load(tx,ref,true,admit);
 }
 /** Resolve a persisted delivery hint without treating its old version as a CAS.
  * A future version rejects; callers must use the returned exact ref to mutate. */
 async readCurrent(tx:TenantTransaction,ref:EntityRef,admit:(record:PackInspectionJobRecord)=>Promise<void>):Promise<PackInspectionJobRecord>{
  return this.load(tx,ref,false,admit);
 }
 private async load(tx:TenantTransaction,ref:EntityRef,exact:boolean,admit:(record:PackInspectionJobRecord)=>Promise<void>):Promise<PackInspectionJobRecord>{
  const c=management(tx),input=contract('EntityRef',structuredClone(ref));
  if(input.type!=='abh.pack-inspection-job')throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('PackLoader')`SELECT id,version,record,pack_id,package_digest,environment_digest,deployment_version,status
   FROM extension.inspection_jobs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.id}
    AND workspace_id IS NULL AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(exact?Number(row.version)!==input.version:Number(row.version)<input.version)throw new CoreError('VERSION_CONFLICT');
  const record=contract('PackInspectionJobRecord',row.record);
  if(record.resourceOrganizationId!==c.resourceOrganizationId||record.jobRef.id!==row.id||record.jobRef.version!==Number(row.version)||
   record.packRef.id!==row.pack_id||record.packageDigest!==row.package_digest||record.environmentDigest!==row.environment_digest||
   record.deploymentVersion!==Number(row.deployment_version)||record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  await admit(structuredClone(record));tx.assertActive();return structuredClone(record);
 }
}
