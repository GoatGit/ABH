import {randomUUID} from 'node:crypto';
import type {ConsumeEventPayload,EntityRef,EventEnvelope,InboxRecord} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from '../control/fences.ts';
import {currentIdentity} from '../identity/owner.ts';
import {sameRef} from '../execution/shared.ts';

export interface InstalledEventConsumer {
  readonly id:string;
  readonly eventTypes:readonly EventEnvelope['type'][];
  fenceRefs(tx:TenantTransaction,event:EventEnvelope):Promise<EntityRef[]>;
  /** Current Service permission and routing admission; called for duplicates too. */
  admit(tx:TenantTransaction,event:EventEnvelope):Promise<void>;
  /** Invoke the actual state Owner in this UoW. No remote I/O, queue ack or nested Command ingress. */
  handle(tx:TenantTransaction,command:CommandIdentity,event:EventEnvelope):Promise<EntityRef>;
}

/** Read immutable lifecycle metadata for an installed consumer. Artifact content still needs its own admission. */
export async function readCommittedEvent(tx:TenantTransaction,eventRef:EntityRef):Promise<EventEnvelope>{
  contract('EntityRef',eventRef);if(eventRef.type!=='abh.event'||eventRef.version!==1)throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
  const rows=await tx.owner('DurableExecution')`SELECT record,aggregate_type,aggregate_id,aggregate_version,event_ordinal FROM data.outbox
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${eventRef.id} AND deleted_at IS NULL`;
  if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],event=contract('EventEnvelope',row.record);
  if(event.workspaceId&&event.workspaceId!==c.workspaceId)throw new CoreError('RESOURCE_NOT_FOUND');
  if(event.eventId!==eventRef.id||event.resourceOrganizationId!==c.resourceOrganizationId||event.aggregateRef.type!==row.aggregate_type||event.aggregateRef.id!==row.aggregate_id
    ||event.aggregateVersion!==Number(row.aggregate_version)||event.eventOrdinal!==row.event_ordinal)throw new CoreError('INTERNAL_ERROR');return event;
}

/** Inbox uniqueness spans Worker/Service identities. Only a committed Owner effect can mark the event handled. */
export class InboxOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<InboxRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.inbox')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('DurableExecution')`SELECT record,version,event_id,consumer_id FROM runtime.inbox WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],record=contract('InboxRecord',row.record);
    if(!sameRef(record.inboxRef,ref)||record.resourceOrganizationId!==c.resourceOrganizationId||record.inboxRef.version!==Number(row.version)||record.eventRef.id!==row.event_id
      ||record.consumerId!==row.consumer_id||await digestContract('InboxRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async admit(tx:TenantTransaction,input:ConsumeEventPayload,consumer:InstalledEventConsumer):Promise<EventEnvelope>{
    contract('ConsumeEventPayload',input);const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver'||c.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    if(input.consumerId!==consumer.id)throw new CoreError('FORBIDDEN');
    // Command dedupe (if present) precedes this semantic dedupe lock; both precede all Control locks.
    const key=`~inbox/${c.resourceOrganizationId}/${input.consumerId}/${input.eventRef.id}`,sql=tx.owner('DurableExecution');
    await tx.lock(0,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const event=await readCommittedEvent(tx,input.eventRef);
    if(!consumer.eventTypes.includes(event.type))throw new CoreError('FORBIDDEN');
    if(await inputDigest(event)!==input.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...await consumer.fenceRefs(tx,event)]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    const identity=await currentIdentity(tx);if(identity.scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');
    await consumer.admit(tx,event);
    return event;
  }
  async consume(tx:TenantTransaction,command:CommandIdentity,input:ConsumeEventPayload,consumer:InstalledEventConsumer):Promise<InboxRecord>{
    const event=await this.admit(tx,input,consumer),c=tx.context.tenant,sql=tx.owner('DurableExecution');
    const prior=await sql`SELECT id,version FROM runtime.inbox WHERE resource_organization_id=${c.resourceOrganizationId} AND consumer_id=${consumer.id} AND event_id=${input.eventRef.id}`;
    if(prior[0]){
      const record=await this.get(tx,{type:'abh.inbox',id:prior[0].id,version:Number(prior[0].version)});
      if(record.eventDigest!==input.eventDigest)throw new CoreError('IDEMPOTENCY_CONFLICT');return record;
    }
    const resultRef=contract('EntityRef',await consumer.handle(tx,command,structuredClone(event)));
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    const unsigned=contract('InboxRecord',{inboxRef:{type:'abh.inbox',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,...input,
      sourceAggregateRef:event.aggregateRef,sourceEventOrdinal:event.eventOrdinal,resultRef,handledAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const record=contract('InboxRecord',{...unsigned,digest:await digestContract('InboxRecord',unsigned)});
    await sql`INSERT INTO runtime.inbox(resource_organization_id,id,workspace_id,purpose_names,event_id,consumer_id,record)
      VALUES (${c.resourceOrganizationId},${record.inboxRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${event.eventId},${consumer.id},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.inboxRef,eventType:'abh.inbox.created',changedFields:['eventRef','consumerId','resultRef'],relatedRefs:[input.eventRef,resultRef]});return record;
  }
}

/** Installed Worker entry: admission runs even when its stable Command receipt already exists. */
export async function consumeCommittedEvent(database:Database,context:VerifiedContext,options:TransactionOptions,input:ConsumeEventPayload,consumer:InstalledEventConsumer):Promise<InboxRecord>{
  const owner=new InboxOwner(),command={type:'abh.runtime.consume-event',commandId:randomUUID(),idempotencyKey:`event/${input.consumerId}/${input.eventRef.id}`,digest:await inputDigest(input)};
  return database.transaction(context,options,async tx=>{
    const result=await executeCommand(tx,command,async()=>{await owner.admit(tx,input,consumer);},async()=>(await owner.consume(tx,command,input,consumer)).inboxRef);
    return owner.get(tx,result.receipt.resultRef);
  });
}
