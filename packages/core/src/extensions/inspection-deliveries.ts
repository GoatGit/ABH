import {randomUUID} from 'node:crypto';
import type {EntityRef,EventEnvelope,PackInspectionDeliveryRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {readCommittedEvent,type InstalledEventConsumer} from '../durable/inbox.ts';
const consumerId='abh.pack-inspection-job.advance';
export interface PackInspectionDeliveryAdmission {
 fenceRefs(tx:TenantTransaction,event:EventEnvelope):Promise<EntityRef[]>;
 current(tx:TenantTransaction,event:EventEnvelope):Promise<void>;
}
function scope(tx:TenantTransaction,purpose:'abh.runtime.deliver'|'abh.pack.manage'){
 const c=tx.context.tenant;
 if(c.purposeOfUse!==purpose||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||c.actor.type!=='Service')throw new CoreError('FORBIDDEN');
 return c;
}
async function source(tx:TenantTransaction,hint:EventEnvelope){
 const supplied=contract('EventEnvelope',structuredClone(hint));
 if(!['abh.pack-inspection-job.requested','abh.pack-inspection-job.wait'].includes(supplied.type)||supplied.aggregateRef.type!=='abh.pack-inspection-job')throw new CoreError('FORBIDDEN');
 const event=await readCommittedEvent(tx,{type:'abh.event',id:supplied.eventId,version:1});
 if(canonicalJson(event)!==canonicalJson(supplied))throw new CoreError('IDEMPOTENCY_CONFLICT');return event;
}
async function checked(tx:TenantTransaction,row:Record<string,unknown>){
 const record=contract('PackInspectionDeliveryRecord',row.record);
 if(record.resourceOrganizationId!==tx.context.tenant.resourceOrganizationId||record.deliveryRef.id!==row.id||Number(row.version)!==1||
  record.eventRef.id!==row.event_id||record.jobRef.id!==row.job_id||record.jobRef.version!==Number(row.job_version)||await digestContract('PackInspectionDeliveryRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
 const event=await source(tx,await readCommittedEvent(tx,record.eventRef));
 if(canonicalJson(event.aggregateRef)!==canonicalJson(record.jobRef)||event.causationId!==record.sourceCommandRef.id||await inputDigest(event)!==record.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');
 return record;
}
/** Immutable acceptance only. Business progress and its work lease remain separate. */
export class PackInspectionDeliveryOwner {
 async accept(tx:TenantTransaction,command:CommandIdentity,hint:EventEnvelope,admit:(event:EventEnvelope)=>Promise<void>):Promise<PackInspectionDeliveryRecord>{
  const c=scope(tx,'abh.runtime.deliver'),event=await source(tx,hint);
  await admit(structuredClone(event));tx.assertActive();
  const key=`${c.resourceOrganizationId}/PackLoader/InspectionDelivery/${event.eventId}`;
  await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  const [prior]=await tx.owner('PackLoader')`SELECT * FROM extension.inspection_deliveries WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${event.eventId}`;
  if(prior)return checked(tx,prior);
  const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
  const unsigned=contract('PackInspectionDeliveryRecord',{deliveryRef:{type:'abh.pack-inspection-delivery',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
   jobRef:event.aggregateRef,eventRef:{type:'abh.event',id:event.eventId,version:1},sourceCommandRef:{type:'abh.command',id:event.causationId,version:1},eventDigest:await inputDigest(event),acceptedAt:(clock!.now as Date).toISOString(),digest:'sha256:'+'0'.repeat(64)});
  const record=contract('PackInspectionDeliveryRecord',{...unsigned,digest:await digestContract('PackInspectionDeliveryRecord',unsigned)});
  await tx.owner('PackLoader')`INSERT INTO extension.inspection_deliveries(resource_organization_id,id,purpose_names,job_id,job_version,event_id,record)
   VALUES (${c.resourceOrganizationId},${record.deliveryRef.id},${['abh.runtime.deliver','abh.pack.manage']},${record.jobRef.id},${record.jobRef.version},${event.eventId},${JSON.stringify(record)}::text::jsonb)`;
  await appendChange(tx,{command,target:record.deliveryRef,eventType:'abh.pack-inspection-delivery.accepted',changedFields:['jobRef','eventRef','eventDigest'],relatedRefs:[record.jobRef,record.eventRef]});
  await admit(structuredClone(event));tx.assertActive();return record;
 }
 /** Require the exact accepted version and its committed Inbox, under management
  * discovery admission. An older accepted attempt never schedules a later retry. */
 async findAccepted(tx:TenantTransaction,jobRef:EntityRef,admit:(record:PackInspectionDeliveryRecord)=>Promise<void>):Promise<PackInspectionDeliveryRecord|undefined>{
  const c=scope(tx,'abh.pack.manage'),ref=contract('EntityRef',structuredClone(jobRef));
  if(ref.type!=='abh.pack-inspection-job')throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('PackLoader')`SELECT d.*,i.record AS inbox_record FROM extension.inspection_deliveries d JOIN runtime.inbox i
   ON i.resource_organization_id=d.resource_organization_id AND i.event_id=d.event_id AND i.consumer_id=${consumerId}
    AND i.record#>>'{resultRef,type}'='abh.pack-inspection-delivery' AND i.record#>>'{resultRef,id}'=d.id::text
   WHERE d.resource_organization_id=${c.resourceOrganizationId} AND d.job_id=${ref.id} AND d.job_version=${ref.version}
    AND d.workspace_id IS NULL AND d.deleted_at IS NULL AND ${c.purposeOfUse}=ANY(d.purpose_names) AND i.workspace_id IS NULL AND i.deleted_at IS NULL`;
  if(!row)return undefined;
  const record=await checked(tx,row),inbox=contract('InboxRecord',row.inbox_record);
  if(inbox.resourceOrganizationId!==c.resourceOrganizationId||inbox.consumerId!==consumerId||canonicalJson(inbox.sourceAggregateRef)!==canonicalJson(ref)||
   canonicalJson(inbox.resultRef)!==canonicalJson(record.deliveryRef)||canonicalJson(inbox.eventRef)!==canonicalJson(record.eventRef)||inbox.eventDigest!==record.eventDigest||await digestContract('InboxRecord',inbox)!==inbox.digest)throw new CoreError('INTERNAL_ERROR');
  await admit(structuredClone(record));tx.assertActive();return record;
 }
}
/** Installed Inbox consumer; both delivery and limited acceptance Grants are
 * current even on replay. It never invokes the long-running inspector. */
export function createPackInspectionJobConsumer(grantRefs:readonly EntityRef[],checks:PackInspectionDeliveryAdmission):InstalledEventConsumer {
 const grants=structuredClone(grantRefs),fences=checks.fenceRefs.bind(checks),current=checks.current.bind(checks);
 const admit=async(tx:TenantTransaction,hint:EventEnvelope)=>{
  const c=scope(tx,'abh.runtime.deliver'),event=await source(tx,hint),organization={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const authorize=async()=>{
   await assertCurrentGrants(tx,{objectRef:{type:'abh.event',id:event.eventId,version:1},scopeRefs:[organization],action:'abh.runtime.consume-event'},grants);
   await assertCurrentGrants(tx,{objectRef:event.aggregateRef,scopeRefs:[organization],action:'abh.pack-inspection-jobs.accept-delivery'},grants);
  };
  await authorize();await current(tx,structuredClone(event));await authorize();
  const [saved]=await tx.owner('PackLoader')`SELECT * FROM extension.inspection_deliveries WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${event.eventId}`;
  const [inbox]=await tx.owner('DurableExecution')`SELECT record FROM runtime.inbox WHERE resource_organization_id=${c.resourceOrganizationId} AND consumer_id=${consumerId} AND event_id=${event.eventId}`;
  if(saved){const record=await checked(tx,saved);if(inbox&&canonicalJson(contract('InboxRecord',inbox.record).resultRef)!==canonicalJson(record.deliveryRef))throw new CoreError('INTERNAL_ERROR');}
  else if(inbox)throw new CoreError('INTERNAL_ERROR');
  tx.assertActive();
 };
 return {id:consumerId,eventTypes:['abh.pack-inspection-job.requested','abh.pack-inspection-job.wait'],
  fenceRefs:async(tx,event)=>[...structuredClone(grants),...await fences(tx,event)],admit,
  handle:async(tx,command,event)=>(await new PackInspectionDeliveryOwner().accept(tx,command,event,value=>admit(tx,value))).deliveryRef,
 };
}
