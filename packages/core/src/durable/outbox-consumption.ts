import {randomUUID} from 'node:crypto';
import type {EntityRef,OutboxConsumptionRecord,OutboxRoutingRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {OutboxOwner} from './outbox.ts';
import {InboxOwner,readCommittedEvent} from './inbox.ts';
import {sameRef} from '../execution/shared.ts';

/** Per-event processing coverage, not a global watermark or permission to delete retained evidence. */
export class OutboxConsumptionOwner {
  /** Published candidates for bounded recovery; eligibility is re-proven from all Inbox facts before recording. */
  async pending(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
    const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    if(afterId!==undefined)contract('UUID',afterId);
    const rows=await tx.owner('DurableExecution')`SELECT p.routing_id FROM runtime.outbox_publications p
      WHERE p.resource_organization_id=${c.resourceOrganizationId} AND p.deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(p.purpose_names) AND (p.workspace_id IS NULL OR p.workspace_id=${c.workspaceId??null}::uuid)
      AND (${afterId??null}::uuid IS NULL OR p.routing_id>${afterId??null}::uuid)
      AND NOT EXISTS(SELECT 1 FROM runtime.outbox_consumptions x WHERE x.resource_organization_id=p.resource_organization_id AND x.routing_id=p.routing_id)
      ORDER BY p.routing_id LIMIT ${limit}`;
    const refs:EntityRef[]=[];
    for(const row of rows){
      const [routing]=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.outbox_routings WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${row.routing_id} AND deleted_at IS NULL`;
      if(!routing)throw new CoreError('INTERNAL_ERROR');refs.push({type:'abh.outbox-routing',id:routing.id,version:Number(routing.version)});
    }
    return refs;
  }
  async admit(tx:TenantTransaction,routingRef:EntityRef,grantRefs:readonly EntityRef[]):Promise<OutboxRoutingRecord>{
    const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    await assertCurrentGrants(tx,{objectRef:routingRef,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.runtime.record-outbox-consumption'},grantRefs);
    return new OutboxOwner().getRouting(tx,routingRef);
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<OutboxConsumptionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.outbox-consumption')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const [row]=await tx.owner('DurableExecution')`SELECT record,version,routing_id FROM runtime.outbox_consumptions
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('OutboxConsumptionRecord',row.record);
    if(!sameRef(ref,record.consumptionRef)||record.resourceOrganizationId!==c.resourceOrganizationId||Number(row.version)!==ref.version
      ||record.routingRef.id!==row.routing_id||await digestContract('OutboxConsumptionRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return record;
  }
  async record(tx:TenantTransaction,command:CommandIdentity,routingRef:EntityRef,grantRefs:readonly EntityRef[]):Promise<OutboxConsumptionRecord>{
    const routing=await this.admit(tx,routingRef,grantRefs),outbox=new OutboxOwner(),inbox=new InboxOwner(),c=tx.context.tenant;
    // Same aggregate lock as publication; immutable committed Inbox rows need no consumer locks.
    if((await outbox.pendingDeliveries(tx,routingRef)).length)throw new CoreError('PRECONDITION_FAILED');
    const publication=await outbox.publication(tx,routingRef);if(!publication)throw new CoreError('PRECONDITION_FAILED');
    const event=await readCommittedEvent(tx,routing.eventRef);
    if(await inputDigest(event)!==routing.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');
    const deliveryRows=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.outbox_deliveries WHERE resource_organization_id=${c.resourceOrganizationId} AND routing_id=${routingRef.id}`;
    const vector=(refs:readonly EntityRef[])=>canonicalJson(refs.map(ref=>canonicalJson(ref)).sort());
    if(vector(publication.deliveryRefs)!==vector(deliveryRows.map(row=>({type:'abh.outbox-delivery',id:row.id,version:Number(row.version)}))))throw new CoreError('INTERNAL_ERROR');
    const inboxRefs:EntityRef[]=[];
    for(const delivery of [...routing.deliveries].sort((a,b)=>a.consumerId.localeCompare(b.consumerId))){
      const [row]=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.inbox WHERE resource_organization_id=${c.resourceOrganizationId}
        AND event_id=${routing.eventRef.id} AND consumer_id=${delivery.consumerId} AND deleted_at IS NULL`;
      if(!row)throw new CoreError('PRECONDITION_FAILED');
      const record=await inbox.get(tx,{type:'abh.inbox',id:row.id,version:Number(row.version)});
      if(!sameRef(record.eventRef,routing.eventRef)||record.eventDigest!==routing.eventDigest||record.consumerId!==delivery.consumerId
        ||!sameRef(record.sourceAggregateRef,event.aggregateRef)||record.sourceEventOrdinal!==event.eventOrdinal)throw new CoreError('IDEMPOTENCY_CONFLICT');
      inboxRefs.push(record.inboxRef);
    }
    const [prior]=await tx.owner('DurableExecution')`SELECT id,version FROM runtime.outbox_consumptions WHERE resource_organization_id=${c.resourceOrganizationId} AND routing_id=${routingRef.id}`;
    if(prior){
      const record=await this.get(tx,{type:'abh.outbox-consumption',id:prior.id,version:Number(prior.version)});
      if(!sameRef(record.routingRef,routingRef)||!sameRef(record.eventRef,routing.eventRef)||!sameRef(record.publicationRef,publication.publicationRef)
        ||vector(record.inboxRefs)!==vector(inboxRefs))throw new CoreError('INTERNAL_ERROR');return record;
    }
    const [clock]=await tx.owner('DurableExecution')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('OutboxConsumptionRecord',{consumptionRef:{type:'abh.outbox-consumption',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
      routingRef,eventRef:routing.eventRef,publicationRef:publication.publicationRef,inboxRefs,recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const record=contract('OutboxConsumptionRecord',{...unsigned,digest:await digestContract('OutboxConsumptionRecord',unsigned)});
    await tx.owner('DurableExecution')`INSERT INTO runtime.outbox_consumptions(resource_organization_id,id,workspace_id,purpose_names,routing_id,record)
      VALUES (${c.resourceOrganizationId},${record.consumptionRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${routingRef.id},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.consumptionRef,eventType:'abh.outbox-consumption.created',changedFields:['routingRef','publicationRef','inboxRefs'],relatedRefs:[routingRef,publication.publicationRef,...inboxRefs]});return record;
  }
}

export async function recordOutboxConsumption(database:Database,context:VerifiedContext,options:TransactionOptions,routingRef:EntityRef,grantRefs:readonly EntityRef[]):Promise<OutboxConsumptionRecord>{
  const payload=contract('RecordOutboxConsumptionPayload',{routingRef}),owner=new OutboxConsumptionOwner();
  const command={type:'abh.runtime.record-outbox-consumption',commandId:randomUUID(),idempotencyKey:`outbox/consumed/${routingRef.id}`,digest:await inputDigest(payload)};
  return database.transaction(context,options,async tx=>{
    const result=await executeCommand(tx,command,async()=>{await owner.admit(tx,routingRef,grantRefs);},async()=>(await owner.record(tx,command,routingRef,grantRefs)).consumptionRef);
    return owner.get(tx,result.receipt.resultRef);
  });
}
