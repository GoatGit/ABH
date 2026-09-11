import {randomUUID} from 'node:crypto';
import type {EnqueueJobRequest,EntityRef,EventEnvelope,OutboxDeliveryRecord,OutboxPublicationRecord,OutboxRoutingRecord,PrepareOutboxPayload,RecordOutboxDeliveryPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import {validatePortRequest,validatePortResult,type DurableExecutionPort,type PortCallOptions} from '@abh/contracts/ports';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {currentIdentity} from '../identity/owner.ts';
import {lockFences} from '../control/fences.ts';
import {CoreError} from '../internal/errors.ts';
import {sameRef} from '../execution/shared.ts';
import {WorkLeaseOwner} from './work-leases.ts';
import {readCommittedEvent} from './inbox.ts';

export interface OutboxChecks {
  fenceRefs(tx:TenantTransaction,event:EventEnvelope):Promise<EntityRef[]>;
  admit(tx:TenantTransaction,event:EventEnvelope,permission:'abh.runtime.prepare-outbox'|'abh.runtime.record-outbox-delivery',targetRef:EntityRef):Promise<void>;
}
export interface InstalledOutboxRouter {
  readonly ruleRef:EntityRef;
  readonly eventTypes:readonly EventEnvelope['type'][];
  /** Server derives each job from the committed event and installed subscriptions. No external I/O. */
  route(tx:TenantTransaction,event:EventEnvelope):Promise<OutboxRoutingRecord['deliveries']>;
}
export interface CompletedEnqueueProof {readonly kind:'CompletedEnqueueProof'}
const proofs=new WeakMap<CompletedEnqueueProof,{routingRef:EntityRef;routingDigest:string;consumerId:string;jobRef:EntityRef}>();

/** Call the installed Port outside a UoW. Uncertain/Tracked results cannot acknowledge publication. */
export async function enqueueOutbox(port:Pick<DurableExecutionPort,'enqueue'>,request:EnqueueJobRequest,options:PortCallOptions,routing:OutboxRoutingRecord,consumerId:string){
  contract('OutboxRoutingRecord',routing);const delivery=routing.deliveries.find(delivery=>delivery.consumerId===consumerId);
  if(await digestContract('OutboxRoutingRecord',routing)!==routing.digest||!delivery||canonicalJson(request.job)!==canonicalJson(delivery.job))throw new CoreError('IDEMPOTENCY_CONFLICT');
  if(!validatePortRequest('DurableExecutionPort.enqueue',request).success)throw new CoreError('INVALID_ARGUMENT');
  const result=validatePortResult('DurableExecutionPort.enqueue',await port.enqueue(request,options));
  if(!result.success)throw new CoreError('INTERNAL_ERROR');
  if(result.data.status!=='Completed')return result.data;
  const proof=Object.freeze({kind:'CompletedEnqueueProof' as const});
  proofs.set(proof,{routingRef:{...routing.routingRef},routingDigest:routing.digest,consumerId,jobRef:{...result.data.data.jobRef}});return {status:'Completed' as const,proof};
}

/** Frozen fanout and per-consumer acknowledgements are independent of queue delivery and Inbox processing. */
export class OutboxOwner {
  /** Tenant-local discovery; actual publication still requires per-event current admission. */
  async pendingEvents(tx:TenantTransaction,eventTypes:readonly EventEnvelope['type'][],limit=100,afterId?:string):Promise<EntityRef[]>{
    const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    if(!Number.isInteger(limit)||limit<1||limit>100||eventTypes.length>100)throw new CoreError('INVALID_ARGUMENT');
    if(afterId!==undefined)contract('UUID',afterId);
    const rows=await tx.owner('DurableExecution')`SELECT e.id FROM data.outbox e
      WHERE e.resource_organization_id=${c.resourceOrganizationId} AND e.deleted_at IS NULL
      AND (e.record->>'workspaceId' IS NULL OR e.record->>'workspaceId'=${c.workspaceId??null})
      AND (${afterId??null}::uuid IS NULL OR e.id>${afterId??null}::uuid)
      AND (e.record->>'type'=ANY(${[...eventTypes]}) OR EXISTS(SELECT 1 FROM runtime.outbox_routings r
        WHERE r.resource_organization_id=e.resource_organization_id AND r.event_id=e.id))
      AND NOT EXISTS(SELECT 1 FROM runtime.outbox_routings r JOIN runtime.outbox_publications p
        ON p.resource_organization_id=r.resource_organization_id AND p.routing_id=r.id
        WHERE r.resource_organization_id=e.resource_organization_id AND r.event_id=e.id)
      ORDER BY e.id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.event',id:row.id,version:1}));
  }
  async #read(tx:TenantTransaction,id:string,kind:'routing'|'delivery'|'publication'){
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('DurableExecution')`
      SELECT record,version,event_id AS link_id,NULL::text AS consumer_id FROM runtime.outbox_routings WHERE ${kind}='routing' AND resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      UNION ALL SELECT record,version,routing_id AS link_id,consumer_id FROM runtime.outbox_deliveries WHERE ${kind}='delivery' AND resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      UNION ALL SELECT record,version,routing_id AS link_id,NULL::text AS consumer_id FROM runtime.outbox_publications WHERE ${kind}='publication' AND resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(rows.length!==1)throw new CoreError('RESOURCE_NOT_FOUND');return rows[0]!;
  }
  async getRouting(tx:TenantTransaction,ref:EntityRef):Promise<OutboxRoutingRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.outbox-routing')throw new CoreError('INVALID_ARGUMENT');const row=await this.#read(tx,ref.id,'routing'),record=contract('OutboxRoutingRecord',row.record);
    if(!sameRef(record.routingRef,ref)||record.routingRef.version!==Number(row.version)||record.eventRef.id!==row.link_id||record.resourceOrganizationId!==tx.context.tenant.resourceOrganizationId
      ||await digestContract('OutboxRoutingRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async getDelivery(tx:TenantTransaction,ref:EntityRef):Promise<OutboxDeliveryRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.outbox-delivery')throw new CoreError('INVALID_ARGUMENT');const row=await this.#read(tx,ref.id,'delivery'),record=contract('OutboxDeliveryRecord',row.record);
    if(!sameRef(record.deliveryRef,ref)||record.deliveryRef.version!==Number(row.version)||record.routingRef.id!==row.link_id||record.consumerId!==row.consumer_id||record.resourceOrganizationId!==tx.context.tenant.resourceOrganizationId
      ||await digestContract('OutboxDeliveryRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async publication(tx:TenantTransaction,routingRef:EntityRef):Promise<OutboxPublicationRecord|undefined>{
    const routing=await this.getRouting(tx,routingRef),c=tx.context.tenant;
    const rows=await tx.owner('DurableExecution')`SELECT id FROM runtime.outbox_publications WHERE resource_organization_id=${c.resourceOrganizationId} AND routing_id=${routingRef.id}`;
    if(!rows[0])return undefined;const row=await this.#read(tx,rows[0].id,'publication'),record=contract('OutboxPublicationRecord',row.record);
    if(record.publicationRef.id!==rows[0].id||record.publicationRef.version!==Number(row.version)||!sameRef(record.routingRef,routingRef)||!sameRef(record.eventRef,routing.eventRef)||record.resourceOrganizationId!==c.resourceOrganizationId
      ||await digestContract('OutboxPublicationRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async #admit(tx:TenantTransaction,event:EventEnvelope,checks:OutboxChecks,permission:'abh.runtime.prepare-outbox'|'abh.runtime.record-outbox-delivery',targetRef:EntityRef){
    const c=tx.context.tenant;if(c.purposeOfUse!=='abh.runtime.deliver'||c.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...await checks.fenceRefs(tx,event)]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    if((await currentIdentity(tx)).scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');await checks.admit(tx,event,permission,targetRef);
  }
  /** Current publication admission also applies to fully published replays and each new queue call. */
  async admitPublication(tx:TenantTransaction,ref:EntityRef,checks:OutboxChecks):Promise<OutboxRoutingRecord>{
    const routing=await this.getRouting(tx,ref),event=await readCommittedEvent(tx,routing.eventRef);
    if(await inputDigest(event)!==routing.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');
    await this.#admit(tx,event,checks,'abh.runtime.record-outbox-delivery',routing.routingRef);return routing;
  }
  async pendingDeliveries(tx:TenantTransaction,ref:EntityRef):Promise<OutboxRoutingRecord['deliveries']>{
    const routing=await this.getRouting(tx,ref),c=tx.context.tenant;await this.#lock(tx,ref.id);
    const rows=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.outbox_deliveries WHERE resource_organization_id=${c.resourceOrganizationId} AND routing_id=${ref.id}`;
    const confirmed=new Set<string>();
    for(const row of rows){
      const delivery=await this.getDelivery(tx,{type:'abh.outbox-delivery',id:row.id,version:Number(row.version)});
      if(!routing.deliveries.some(item=>item.consumerId===delivery.consumerId)||confirmed.has(delivery.consumerId))throw new CoreError('INTERNAL_ERROR');
      confirmed.add(delivery.consumerId);
    }
    const publication=await this.publication(tx,ref);
    if(Boolean(publication)!==(confirmed.size===routing.deliveries.length))throw new CoreError('INTERNAL_ERROR');
    return routing.deliveries.filter(item=>!confirmed.has(item.consumerId));
  }
  async #lock(tx:TenantTransaction,id:string){
    const key=`${tx.context.tenant.resourceOrganizationId}/DurableExecution/abh.outbox-routing/${id}`;
    await tx.lock(4,key,()=>tx.owner('DurableExecution')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  }
  async admitPreparation(tx:TenantTransaction,input:PrepareOutboxPayload,checks:OutboxChecks):Promise<EventEnvelope>{
    contract('PrepareOutboxPayload',input);const event=await readCommittedEvent(tx,input.eventRef);
    if(await inputDigest(event)!==input.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');
    await this.#admit(tx,event,checks,'abh.runtime.prepare-outbox',input.eventRef);return event;
  }
  async prepare(tx:TenantTransaction,command:CommandIdentity,input:PrepareOutboxPayload,router:InstalledOutboxRouter,checks:OutboxChecks):Promise<OutboxRoutingRecord>{
    const event=await this.admitPreparation(tx,input,checks),c=tx.context.tenant;await this.#lock(tx,event.eventId);
    const prior=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.outbox_routings WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${event.eventId}`;
    if(prior[0])return this.getRouting(tx,{type:'abh.outbox-routing',id:prior[0].id,version:Number(prior[0].version)});
    if(!router.eventTypes.includes(event.type))throw new CoreError('PRECONDITION_FAILED');
    const deliveries=await router.route(tx,structuredClone(event));if(!deliveries.length)throw new CoreError('PRECONDITION_FAILED');
    const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('OutboxRoutingRecord',{routingRef:{type:'abh.outbox-routing',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,...input,routingRuleRef:router.ruleRef,deliveries,preparedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const record=contract('OutboxRoutingRecord',{...unsigned,digest:await digestContract('OutboxRoutingRecord',unsigned)});
    await tx.owner('DurableExecution')`INSERT INTO runtime.outbox_routings(resource_organization_id,id,workspace_id,purpose_names,event_id,record)
      VALUES (${c.resourceOrganizationId},${record.routingRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${event.eventId},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.routingRef,eventType:'abh.outbox-routing.created',changedFields:['eventRef','deliveries','digest'],relatedRefs:[input.eventRef,router.ruleRef]});return record;
  }
  async recordDelivery(tx:TenantTransaction,command:CommandIdentity,input:RecordOutboxDeliveryPayload,proof:CompletedEnqueueProof,checks:OutboxChecks):Promise<{delivery:OutboxDeliveryRecord;publication?:OutboxPublicationRecord}>{
    contract('RecordOutboxDeliveryPayload',input);const completed=proofs.get(proof),routing=await this.getRouting(tx,input.routingRef),c=tx.context.tenant;
    if(!completed||!sameRef(completed.routingRef,routing.routingRef)||completed.routingDigest!==routing.digest||completed.consumerId!==input.consumerId||!routing.deliveries.some(delivery=>delivery.consumerId===input.consumerId))throw new CoreError('AUTHORITY_REQUIRED');
    const event=await readCommittedEvent(tx,routing.eventRef);if(await inputDigest(event)!==routing.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');await this.#admit(tx,event,checks,'abh.runtime.record-outbox-delivery',routing.routingRef);await this.#lock(tx,routing.routingRef.id);
    const leases=new WorkLeaseOwner();await leases.requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,routing.routingRef);
    const sql=tx.owner('DurableExecution'),prior=await sql`SELECT id,version FROM runtime.outbox_deliveries WHERE resource_organization_id=${c.resourceOrganizationId} AND routing_id=${routing.routingRef.id} AND consumer_id=${input.consumerId}`;
    let delivery:OutboxDeliveryRecord;
    if(prior[0]){
      delivery=await this.getDelivery(tx,{type:'abh.outbox-delivery',id:prior[0].id,version:Number(prior[0].version)});
      if(!sameRef(delivery.jobRef,completed.jobRef))throw new CoreError('IDEMPOTENCY_CONFLICT');
    }else{
      const [clock]=await sql`SELECT clock_timestamp() AS now`;
      const unsigned=contract('OutboxDeliveryRecord',{deliveryRef:{type:'abh.outbox-delivery',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,routingRef:routing.routingRef,
        consumerId:input.consumerId,jobRef:completed.jobRef,recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
      delivery=contract('OutboxDeliveryRecord',{...unsigned,digest:await digestContract('OutboxDeliveryRecord',unsigned)});
      await sql`INSERT INTO runtime.outbox_deliveries(resource_organization_id,id,workspace_id,purpose_names,routing_id,consumer_id,record)
        VALUES (${c.resourceOrganizationId},${delivery.deliveryRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${routing.routingRef.id},${input.consumerId},${JSON.stringify(delivery)}::text::jsonb)`;
      await appendChange(tx,{command,target:delivery.deliveryRef,eventType:'abh.outbox-delivery.created',changedFields:['routingRef','consumerId','jobRef'],relatedRefs:[routing.routingRef,completed.jobRef]});
    }
    let publication=await this.publication(tx,routing.routingRef);
    if(!publication){
      const rows=await sql`SELECT id,version FROM runtime.outbox_deliveries WHERE resource_organization_id=${c.resourceOrganizationId} AND routing_id=${routing.routingRef.id}`;
      const all:OutboxDeliveryRecord[]=[];for(const row of rows)all.push(await this.getDelivery(tx,{type:'abh.outbox-delivery',id:row.id,version:Number(row.version)}));
      if(all.length>routing.deliveries.length||all.some(row=>!routing.deliveries.some(target=>target.consumerId===row.consumerId)))throw new CoreError('INTERNAL_ERROR');
      if(all.length===routing.deliveries.length){
        const [clock]=await sql`SELECT clock_timestamp() AS now`;
        const unsigned=contract('OutboxPublicationRecord',{publicationRef:{type:'abh.outbox-publication',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,routingRef:routing.routingRef,
          eventRef:routing.eventRef,deliveryRefs:all.map(row=>row.deliveryRef),recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
        publication=contract('OutboxPublicationRecord',{...unsigned,digest:await digestContract('OutboxPublicationRecord',unsigned)});
        await sql`INSERT INTO runtime.outbox_publications(resource_organization_id,id,workspace_id,purpose_names,routing_id,record)
          VALUES (${c.resourceOrganizationId},${publication.publicationRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${routing.routingRef.id},${JSON.stringify(publication)}::text::jsonb)`;
        await appendChange(tx,{command,target:publication.publicationRef,eventType:'abh.outbox-publication.created',changedFields:['eventRef','deliveryRefs'],relatedRefs:[routing.routingRef,...publication.deliveryRefs]});
      }
    }
    await leases.requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,routing.routingRef);return {delivery,...(publication?{publication}:{})};
  }
}
