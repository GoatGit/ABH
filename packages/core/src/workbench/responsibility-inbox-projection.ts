import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {DecisionRecord,Digest,EntityRef,EventEnvelope,ProjectionEnvelope,
  InboxRecord,RequestContext,ResponsibilityInboxProjection,ResponsibilityRequestRecord} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import type {InstalledEventConsumer} from '../durable/inbox.ts';
import {consumeCommittedEvent} from '../durable/inbox.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {deriveVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {setTimeout as delay} from 'node:timers/promises';

const projectionType='abh.projection.responsibility-inbox';
const consumerId='abh.projection-consumer.responsibility-inbox';
const eventTypes=['abh.decision.created','abh.decision.approve','abh.decision.reject','abh.decision.expire',
  'abh.decision.supersede','abh.decision.withdraw','abh.responsibility-request.created',
  'abh.responsibility-request.route','abh.responsibility-request.unroute',
  'abh.responsibility-request.route-revised','abh.responsibility-request.close',
  'abh.responsibility-request.withdraw'] as const;

type SourceVector={requestVersion:number;routeRevision:number;decisionVersion:number};
export type ResponsibilityInboxProjectionHint=
  {kind:'reset'}|{kind:'change';eventId:string;cursor:string;projectionType:string;
    subjectRef:EntityRef;version:number;watermark:number;stale:boolean};
const zeroEventId='00000000-0000-0000-0000-000000000000';

function decisionSubjectIds(event:EventEnvelope):string[]{
  if(event.aggregateRef.type==='abh.decision')return [event.aggregateRef.id];
  if(event.aggregateRef.type==='abh.responsibility-request')
    return event.payload.factRefs.filter(ref=>ref.type==='abh.decision').map(ref=>ref.id);
  return [];
}

async function readDecision(tx:TenantTransaction,id:string):Promise<DecisionRecord>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('HumanGateway')`SELECT record,version,status FROM human.decisions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
    FOR UPDATE`;
  if(!row)return Promise.reject(new CoreError('RESOURCE_NOT_FOUND'));
  const decision=contract('DecisionRecord',row.record);
  if(decision.decisionRef.id!==id||decision.decisionRef.version!==Number(row.version)||decision.status!==row.status)
    throw new CoreError('INTERNAL_ERROR');
  return decision;
}

async function readRequest(tx:TenantTransaction,id:string):Promise<ResponsibilityRequestRecord>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('HumanGateway')`SELECT record,version,status FROM human.requests
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
    FOR UPDATE`;
  if(!row)return Promise.reject(new CoreError('RESOURCE_NOT_FOUND'));
  const request=contract('ResponsibilityRequestRecord',row.record);
  if(request.requestRef.id!==id||request.requestRef.version!==Number(row.version)||request.status!==row.status)
    throw new CoreError('INTERNAL_ERROR');
  return request;
}

export class ResponsibilityInboxProjectionOwner {
  async get(tx:TenantTransaction,decisionId:string):Promise<ProjectionEnvelope>{
    contract('UUID',decisionId);const c=tx.context.tenant;
    const [row]=await tx.owner('ProjectionController')`SELECT record FROM read.projections
      WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${projectionType}
        AND subject_id=${decisionId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const projection=contract('ProjectionEnvelope',row.record);
    if(projection.projectionType!==projectionType||projection.resourceOrganizationId!==c.resourceOrganizationId
      ||projection.subjectRef.id!==decisionId)throw new CoreError('INTERNAL_ERROR');
    return projection;
  }

  async refresh(tx:TenantTransaction,decisionId:string,grantRefs:readonly EntityRef[]):
    Promise<ProjectionEnvelope>{
    contract('UUID',decisionId);const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('PURPOSE_DENIED');
    const decision=await readDecision(tx,decisionId),request=await readRequest(tx,decision.package.requestRef.id);
    if(request.requestRef.id!==decision.package.requestRef.id||request.routeRevision!==decision.package.routeRevision
      ||request.proposalDigest!==decision.package.proposalDigest||!request.decisionRefs.some(ref=>ref.id===decisionId))
      throw new CoreError('INTERNAL_ERROR');
    await assertCurrentGrants(tx,{objectRef:decision.decisionRef,scopeRefs:[
      {type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.decisions.read'},grantRefs);
    const impact=canonicalJson({question:decision.package.question,recommendation:decision.package.recommendation,
      impactUpperBound:decision.package.impactUpperBound,risks:decision.package.risks});
    if(impact.length>2000)throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    const data=contract('ResponsibilityInboxProjection',{
      requestRef:request.requestRef,
      responsibilityKind:`abh.responsibility.${request.kind.toLowerCase()}` as const,
      assigneeRef:decision.responsibilityRef??decision.candidateResponsibilityRefs[0]!,
      impactSummary:impact,
      ...(decision.package.validUntil?{deadline:decision.package.validUntil}:{}),
      evidenceRefs:decision.package.evidenceRefs,
      availableResponses:decision.status==='Pending'?decision.package.allowedResponses:[],
      updatedAt:new Date().toISOString()});
    const source:SourceVector={requestVersion:request.requestRef.version,
      routeRevision:request.routeRevision,decisionVersion:decision.decisionRef.version};
    const envelope=contract('ProjectionEnvelope',{projectionType,subjectRef:decision.decisionRef,
      resourceOrganizationId:c.resourceOrganizationId,schemaVersion:1,watermark:request.routeRevision,stale:false,
      data,availableActions:decision.status==='Pending'?['submit','withdraw']:[],asOf:new Date().toISOString()});
    const [existing]=await tx.owner('ProjectionController')`SELECT record,source_version_vector FROM read.projections
      WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${projectionType}
        AND subject_id=${decisionId} FOR UPDATE`;
    if(existing){
      const prior=existing.source_version_vector as Record<string,unknown>;
      if(Number(prior.decisionVersion)>source.decisionVersion)
        return contract('ProjectionEnvelope',existing.record);
      if(canonicalJson(prior)===canonicalJson(source)&&contract('ProjectionEnvelope',existing.record).stale===false)
        return existing.record;
      const changed=await tx.owner('ProjectionController')`UPDATE read.projections
        SET record=${JSON.stringify(envelope)}::text::jsonb,watermark=${request.routeRevision},stale=false,
          purpose_names=${['abh.decision.review']},source_version_vector=${JSON.stringify(source)}::text::jsonb,
          built_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1
        WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${projectionType}
          AND subject_id=${decisionId} RETURNING id`;
      if(!changed[0])throw new CoreError('VERSION_CONFLICT');
      return envelope;
    }
    await tx.owner('ProjectionController')`INSERT INTO read.projections(resource_organization_id,id,workspace_id,
        purpose_names,record,projection_type,subject_id,watermark,stale,source_version_vector,built_at)
      VALUES (${c.resourceOrganizationId},gen_random_uuid(),${c.workspaceId??null},${['abh.decision.review']},
        ${JSON.stringify(envelope)}::text::jsonb,${projectionType},${decisionId},${request.routeRevision},false,
        ${JSON.stringify(source)}::text::jsonb,CURRENT_TIMESTAMP)`;
    return envelope;
  }

  async #events(tx:TenantTransaction,mode:'pending'|'historical',limit:number,
    grantRefs:readonly EntityRef[]):Promise<Array<{
    eventRef:{type:'abh.event';id:string;version:1};event:EventEnvelope;eventDigest:Digest;cursor:{id:string};
  }>>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    await assertCurrentGrants(tx,{objectRef:{type:'abh.organization',id:c.resourceOrganizationId,version:1},
      scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
      action:'abh.runtime.drain'},grantRefs);
    const sql=tx.owner('DurableExecution'),common={tenant:c.resourceOrganizationId,
      workspace:c.workspaceId??null,limit};
    const rows=mode==='pending'?await sql`SELECT event.id,event.record FROM data.outbox event
      LEFT JOIN read.projection_consumer_watermarks watermark
        ON watermark.resource_organization_id=event.resource_organization_id
         AND watermark.consumer_id=${consumerId} AND watermark.projection_type=${projectionType}
      LEFT JOIN runtime.inbox inbox ON inbox.resource_organization_id=event.resource_organization_id
        AND inbox.consumer_id=${consumerId} AND inbox.event_id=event.id
      WHERE event.resource_organization_id=${common.tenant} AND event.deleted_at IS NULL
        AND event.aggregate_type IN ('abh.decision','abh.responsibility-request')
        AND event.record->>'type'=ANY(${eventTypes})
        AND (event.workspace_id IS NULL OR event.workspace_id=${common.workspace}::uuid)
        AND inbox.id IS NULL AND (watermark.id IS NULL OR
          (event.created_at,event.id)>(watermark.last_event_created_at,watermark.last_event_id))
      ORDER BY event.created_at,event.id LIMIT ${common.limit}`:
      await sql`SELECT event.id,event.record FROM data.outbox event
      JOIN read.projection_consumer_watermarks watermark
        ON watermark.resource_organization_id=event.resource_organization_id
         AND watermark.consumer_id=${consumerId} AND watermark.projection_type=${projectionType}
      WHERE event.resource_organization_id=${common.tenant} AND event.deleted_at IS NULL
        AND event.aggregate_type IN ('abh.decision','abh.responsibility-request')
        AND event.record->>'type'=ANY(${eventTypes})
        AND (event.workspace_id IS NULL OR event.workspace_id=${common.workspace}::uuid)
        AND (event.created_at,event.id)<=(watermark.last_event_created_at,watermark.last_event_id)
        AND NOT EXISTS(SELECT 1 FROM runtime.inbox inbox WHERE inbox.resource_organization_id=event.resource_organization_id
          AND inbox.consumer_id=${consumerId} AND inbox.event_id=event.id)
      ORDER BY event.created_at,event.id LIMIT ${common.limit}`;
    return Promise.all(rows.map(async row=>{const event=contract('EventEnvelope',row.record);return {
      eventRef:{type:'abh.event',id:event.eventId,version:1},event,eventDigest:await inputDigest(event),
      cursor:{id:row.id}};}));
  }

  pendingEvents(tx:TenantTransaction,limit=32,grantRefs:readonly EntityRef[]=[]){
    return this.#events(tx,'pending',limit,grantRefs);}
  historicalEvents(tx:TenantTransaction,limit=32,grantRefs:readonly EntityRef[]=[]){
    return this.#events(tx,'historical',limit,grantRefs);}

  async saveWatermark(tx:TenantTransaction,cursor:{id:string}):Promise<void>{
    contract('UUID',cursor.id);const c=tx.context.tenant;
    await tx.owner('ProjectionController')`INSERT INTO read.projection_consumer_watermarks
      (resource_organization_id,id,workspace_id,purpose_names,consumer_id,projection_type,last_event_created_at,last_event_id)
      SELECT ${c.resourceOrganizationId},gen_random_uuid(),${c.workspaceId??null},${[c.purposeOfUse]},
        ${consumerId},${projectionType},event.created_at,${cursor.id}
      FROM data.outbox event WHERE event.resource_organization_id=${c.resourceOrganizationId} AND event.id=${cursor.id}
      ON CONFLICT(resource_organization_id,consumer_id,projection_type) DO UPDATE SET
        last_event_created_at=excluded.last_event_created_at,last_event_id=excluded.last_event_id,
        updated_at=CURRENT_TIMESTAMP
      WHERE (read.projection_consumer_watermarks.last_event_created_at,
          read.projection_consumer_watermarks.last_event_id)<=(excluded.last_event_created_at,excluded.last_event_id)`;
  }
}

export class ResponsibilityInboxProjectionConsumer implements InstalledEventConsumer {
  readonly id=consumerId;
  readonly eventTypes=eventTypes;
  private readonly grantRefs:readonly EntityRef[];
  constructor(grantRefs:readonly EntityRef[]){this.grantRefs=grantRefs;}
  async fenceRefs():Promise<EntityRef[]>{return [...this.grantRefs];}
  async admit(tx:TenantTransaction,event:EventEnvelope):Promise<void>{
    await assertCurrentGrants(tx,{objectRef:{type:'abh.event',id:event.eventId,version:1},
      scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
      action:'abh.runtime.consume-event'},this.grantRefs);
  }
  async handle(tx:TenantTransaction,_command:unknown,event:EventEnvelope):Promise<EntityRef>{
    const owner=new ResponsibilityInboxProjectionOwner();
    const ids=event.aggregateRef.type==='abh.responsibility-request'
      ?(await tx.owner('HumanGateway')`SELECT id FROM human.decisions WHERE resource_organization_id=${event.resourceOrganizationId}
        AND request_id=${event.aggregateRef.id} AND deleted_at IS NULL`).map(row=>String(row.id))
      :decisionSubjectIds(event);
    let result:EntityRef|undefined;
    for(const id of ids)result=(await owner.refresh(tx,id,this.grantRefs)).subjectRef;
    if(!result)throw new CoreError('RESOURCE_NOT_FOUND');
    return result;
  }
}

export async function* subscribeResponsibilityInboxChanges(database:Database,
  suppliedContext:VerifiedContext|RequestContext,options:TransactionOptions,decisionId:string,
  grantRefs:readonly EntityRef[],afterEventId?:string,
  pollIntervalMs=500):AsyncGenerator<ResponsibilityInboxProjectionHint>{
  if(!Number.isSafeInteger(pollIntervalMs)||pollIntervalMs<50||pollIntervalMs>60000)
    throw new CoreError('INVALID_ARGUMENT');
  try{
    contract('UUID',decisionId);if(afterEventId!==undefined)contract('UUID',afterEventId);
    const context='tenant' in suppliedContext&&'request' in suppliedContext?
      suppliedContext:deriveVerifiedContext(suppliedContext);
    const organization={type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1};
    let cursor=afterEventId;
    while(!options.signal.aborted){
      const changes=await database.transaction(context,options,async tx=>{
        const current=await new ResponsibilityInboxProjectionOwner().get(tx,decisionId);
        await assertCurrentGrants(tx,{objectRef:current.subjectRef,scopeRefs:[organization],
          action:'abh.projections.read'},grantRefs);
        if(cursor===undefined){
          const [latest]=await tx.owner('DurableExecution')`SELECT event.id FROM runtime.inbox inbox
            JOIN data.outbox event ON event.resource_organization_id=inbox.resource_organization_id
              AND event.id=inbox.event_id
            WHERE inbox.resource_organization_id=${context.tenant.resourceOrganizationId}
              AND inbox.consumer_id=${consumerId} AND inbox.deleted_at IS NULL
              AND ((event.aggregate_type='abh.decision' AND event.aggregate_id=${decisionId})
                OR inbox.record->'resultRef'->>'id'=${decisionId})
            ORDER BY event.created_at DESC,event.id DESC LIMIT 1`;
          return {baseline:latest?.id??null,rows:[]};
        }
        if(cursor!==zeroEventId&&cursor===afterEventId){
          const [anchor]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox
            WHERE resource_organization_id=${context.tenant.resourceOrganizationId} AND id=${cursor}`;
          if(!anchor)throw new CoreError('RESOURCE_NOT_FOUND');
        }
        const rows=await tx.owner('DurableExecution')`SELECT event.id,event.record,inbox.record AS inbox_record
          FROM runtime.inbox inbox
          JOIN data.outbox event ON event.resource_organization_id=inbox.resource_organization_id
            AND event.id=inbox.event_id
          WHERE inbox.resource_organization_id=${context.tenant.resourceOrganizationId}
            AND inbox.consumer_id=${consumerId} AND inbox.deleted_at IS NULL
            AND ((event.aggregate_type='abh.decision' AND event.aggregate_id=${decisionId})
              OR inbox.record->'resultRef'->>'id'=${decisionId})
            AND (event.created_at,event.id)>COALESCE(
              (SELECT (anchor.created_at,anchor.id) FROM data.outbox anchor
                WHERE resource_organization_id=${context.tenant.resourceOrganizationId} AND anchor.id=${cursor}),
              ('-infinity'::timestamptz,${zeroEventId}::uuid))
          ORDER BY event.created_at,event.id LIMIT 32`;
        return {baseline:null,rows};
      });
      if(cursor===undefined&&changes.baseline!==null)cursor=changes.baseline;
      for(const row of changes.rows){
        if(options.signal.aborted)return;
        const event=contract('EventEnvelope',row.record);
        const current=await database.transaction(context,options,async tx=>{
          const inbox=contract('InboxRecord',row.inbox_record);
          if(await digestContract('InboxRecord',inbox)!==inbox.digest)throw new CoreError('INTERNAL_ERROR');
          if(event.eventId!==row.id||inbox.eventRef.id!==event.eventId||inbox.consumerId!==consumerId)
            throw new CoreError('INTERNAL_ERROR');
          const projection=await new ResponsibilityInboxProjectionOwner().get(tx,decisionId);
          await assertCurrentGrants(tx,{objectRef:{...projection.subjectRef,version:event.aggregateVersion},
            scopeRefs:[organization],action:'abh.projections.read'},grantRefs);
          return projection;
        });
        cursor=event.eventId;
        yield {kind:'change',eventId:event.eventId,cursor:event.eventId,projectionType,
          subjectRef:current.subjectRef,version:current.subjectRef.version,
          watermark:current.watermark,stale:current.stale};
      }
      if(changes.rows.length<32&&!options.signal.aborted)
        await delay(pollIntervalMs,undefined,{signal:options.signal});
    }
  }catch{
    if(!options.signal.aborted)yield {kind:'reset'};
  }
}

/** Installed tenant projection worker with the same monotonic watermark contract as MissionSummary. */
export async function runResponsibilityInboxProjectionWorker(database:Database,input:{
  context:ContextSource;grantRefs:readonly EntityRef[];signal:AbortSignal;pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;handled:number;repaired:number},options:TransactionOptions):Promise<void>;
}):Promise<void>{
  const pageSize=input.pageSize??32,interval=input.intervalMs??500;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(interval)||interval<1||interval>60000)
    throw new CoreError('INVALID_ARGUMENT');
  const grants=input.grantRefs.map(ref=>({...ref})),owner=new ResponsibilityInboxProjectionOwner();
  let binding:string|undefined;
  while(!input.signal.aborted){
    try{
      const context=await requestVerifiedContext(options=>input.context(options),
        {deadline:Date.now()+10000,signal:input.signal}),c=context.tenant;
      if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
      const tenant=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
      if(binding!==undefined&&binding!==tenant)throw new CoreError('FORBIDDEN');binding=tenant;
      let scanned=0,handled=0,repaired=0;
      for(const mode of ['historical','pending'] as const){
        while(!input.signal.aborted){
          const events=await database.transaction(context,{deadline:Date.now()+10000,signal:input.signal},
            async tx=>mode==='historical'?owner.historicalEvents(tx,pageSize,grants):
              owner.pendingEvents(tx,pageSize,grants));
          if(events.length===0)break;scanned+=events.length;
          for(const item of events){
            if(input.signal.aborted)return;
            const result=await consumeCommittedEvent(database,context,{deadline:Date.now()+10000,signal:input.signal},
              {consumerId,eventRef:item.eventRef,eventDigest:item.eventDigest},
              new ResponsibilityInboxProjectionConsumer(grants));
            handled++;if(mode==='historical')repaired++;
            await database.transaction(context,{deadline:Date.now()+10000,signal:input.signal},tx=>owner.saveWatermark(tx,{id:result.eventRef.id}));
          }
          if(events.length<pageSize)break;
        }
      }
      if(input.signal.aborted)return;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned,handled,repaired},options),
        {deadline:Date.now()+10000,signal:input.signal});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
