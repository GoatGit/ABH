import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {Digest,EntityRef,EventEnvelope,ProjectionEnvelope,
  ProjectionRefreshReceipt,RefreshMissionSummaryCommand,RequestContext} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest} from '../data/journal.ts';
import type {InstalledEventConsumer} from '../durable/inbox.ts';
import {consumeCommittedEvent} from '../durable/inbox.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {digestCommandIntent} from '@abh/contracts/digest';
import {deriveVerifiedContext,requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {MissionOwner} from '../mission/missions.ts';
import {recordProjectionMetric,type ProjectionMetrics} from './projection-metrics.ts';

export type MissionSummarySourceVector={
  readonly missionVersion:number;
  readonly goalRevision:number;
  readonly stopEpoch:number;
  readonly pendingTriggers:number;
  readonly blockers:number;
};
export interface ProjectionChangeEvent {
  readonly eventId:string;readonly cursor:string;readonly projectionType:string;
  readonly subjectRef:{type:'abh.mission';id:string;version:number};
  readonly version:number;
  readonly watermark:number;readonly stale:boolean;
}
export type ProjectionSubscriptionHint=
  {kind:'reset'}|({kind:'change'}&ProjectionChangeEvent);
const missionSummaryProjectionType='abh.projection.mission-summary';
const missionSummaryEventTypes=['abh.mission.activate','abh.mission.pause','abh.mission.cancel','abh.mission.resume',
  'abh.mission.resolve','abh.mission.block','abh.mission.complete',
  'abh.mission.projection-refresh-requested'] as const;
const missionSummaryDataFields=new Set(['missionRef','goalDigest','domainType','status','goalRevision',
  'activeRunRef','pendingTriggerCount','blockerCount','updatedAt']);
  missionSummaryDataFields.add('businessStageRef');missionSummaryDataFields.add('resultRefs');

export function redactMissionSummaryData(projection:ProjectionEnvelope,fieldSet?:string,
  metrics?:ProjectionMetrics):ProjectionEnvelope{
  if(fieldSet===undefined)return projection;
  const fields=fieldSet.split(',');
  if(new Set(fields).size!==fields.length||fields.some(field=>!missionSummaryDataFields.has(field)))
    throw new CoreError('INVALID_ARGUMENT');
  recordProjectionMetric(metrics,source=>source.incrementQueryRedaction());
  return {...projection,data:Object.fromEntries(fields.map(field=>[field,projection.data[field]]))};
}

/** Submit only: the source-backed rebuild is owned by the durable projection consumer. */
export async function requestMissionSummaryRefresh(database:Database,context:VerifiedContext,
  options:TransactionOptions,supplied:RefreshMissionSummaryCommand,
  grantRefs:readonly EntityRef[]):Promise<ProjectionRefreshReceipt>{
  requireVerifiedContext(context);
  if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
  const input=contract('RefreshMissionSummaryCommand',structuredClone(supplied));
  if(input.payload.projectionType!==missionSummaryProjectionType)throw new CoreError('SCHEMA_UNSUPPORTED');
  if(input.target.type!=='abh.mission'||input.target.id!==input.payload.missionRef.id
    ||input.payload.missionRef.type!=='abh.mission')throw new CoreError('INVALID_ARGUMENT');
  const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
    digest:await digestCommandIntent(input)};
  return await database.transaction(context,options,async tx=>{
    const missionRef=input.payload.missionRef;
    const result=await executeCommand(tx,command,async()=>{
      await assertCurrentGrants(tx,{objectRef:missionRef,
        scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
        action:'abh.projections.request-mission-summary'},grantRefs);
    },async()=>{
      await assertCurrentGrants(tx,{objectRef:missionRef,
        scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
        action:'abh.projections.request-mission-summary'},grantRefs);
      const [row]=await tx.owner('MissionController')`SELECT version FROM core.missions
        WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${missionRef.id}
          AND deleted_at IS NULL AND ${tx.context.tenant.purposeOfUse}=ANY(purpose_names)
          AND (workspace_id IS NULL OR workspace_id=${tx.context.tenant.workspaceId??null}::uuid)
        FOR UPDATE`;
      if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
      if(Number(row.version)!==missionRef.version)throw new CoreError('VERSION_CONFLICT');
      const [ordinal]=await tx.owner('DurableExecution')`SELECT coalesce(max(event_ordinal),-1)+1 AS ordinal
        FROM data.outbox WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId}
          AND aggregate_type='abh.mission' AND aggregate_id=${missionRef.id}`;
      const eventOrdinal=Number(ordinal?.ordinal??0);
      if(!Number.isInteger(eventOrdinal)||eventOrdinal<0||eventOrdinal>1000)throw new CoreError('LIMIT_EXCEEDED');
      await appendChange(tx,{command,target:missionRef,eventType:'abh.mission.projection-refresh-requested',
        changedFields:['projection'],relatedRefs:[],eventOrdinal});
      return missionRef;
    });
    return {missionRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
  });
}

/** Tenant-scoped read-side writer; mission authority is rechecked before source facts are copied. */
export class ProjectionOwner {
  async get(tx:TenantTransaction,projectionType:string,subjectRef:EntityRef):Promise<ProjectionEnvelope>{
    contract('EntityRef',structuredClone(subjectRef));contract('UUID',subjectRef.id);
    if(projectionType.length===0)throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const [row]=await tx.owner('ProjectionController')`SELECT record FROM read.projections
      WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${projectionType}
        AND subject_id=${subjectRef.id} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const projection=contract('ProjectionEnvelope',row.record);
    if(projection.projectionType!==projectionType||canonicalJson(projection.subjectRef)!==canonicalJson(subjectRef)
      ||projection.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
    return projection;
  }

  async listMissionSummaries(tx:TenantTransaction,input:{type:string;missionStatus?:string;domainType?:string;
    limit?:number;after?:{updatedAt:string;id:string}},grantRefs:readonly EntityRef[]):Promise<{
    projections:ProjectionEnvelope[];next?:{updatedAt:string;id:string};asOf:string;
  }>{
    if(input.type!=='abh.projection.mission-summary')throw new CoreError('SCHEMA_UNSUPPORTED');
    if(input.missionStatus!==undefined&&!['Draft','Active','Paused','Blocked','Completed','Cancelled'].includes(input.missionStatus))
      throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,limit=Math.min(Math.max(input.limit??25,1),100),after=input.after;
    if(after){contract('UUID',after.id);contract('Time',after.updatedAt);}
    const afterUpdatedAt=after?.updatedAt??'1970-01-01T00:00:00.000Z';
    const afterId=after?.id??'00000000-0000-0000-0000-000000000000';
    const projections:ProjectionEnvelope[]=[];
    let scanAfter=after,nextCursor:{updatedAt:string;id:string}|undefined;
    const authorizedRows:Array<{id:string;updated_at_text:string}>=[];
    scanning:while(true){
      const scanUpdatedAt=scanAfter?.updatedAt??afterUpdatedAt;
      const scanId=scanAfter?.id??afterId;
      const rows=await tx.owner('ProjectionController')`SELECT id,record,
        to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_text
      FROM read.projections
      WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${missionSummaryProjectionType}
        AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${input.missionStatus??null}::text IS NULL OR record->'data'->>'status'=${input.missionStatus??null})
        AND (${input.domainType??null}::text IS NULL OR record->'data'->>'domainType'=${input.domainType??null})
        AND (${scanAfter!==undefined}::boolean=false OR updated_at<${scanUpdatedAt}::timestamptz
          OR (updated_at=${scanUpdatedAt}::timestamptz AND id<${scanId}::uuid))
      ORDER BY updated_at DESC,id DESC LIMIT ${limit+1}`;
      for(const row of rows){
        const projection=contract('ProjectionEnvelope',row.record);
        if(projection.projectionType!==missionSummaryProjectionType||projection.resourceOrganizationId!==c.resourceOrganizationId)
          throw new CoreError('INTERNAL_ERROR');
        const scope=projection.subjectRef;
        try{await assertCurrentGrants(tx,{objectRef:scope,
          scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
          action:'abh.projections.read'},grantRefs);}catch(error){
          if(error instanceof CoreError&&['FORBIDDEN','AUTHORITY_REQUIRED','EPOCH_REVOKED','PURPOSE_DENIED'].includes(error.code))continue;
          throw error;
        }
        if(projections.length===limit){
          const cursorRow=authorizedRows.at(-1)!;
          nextCursor={updatedAt:cursorRow.updated_at_text,id:cursorRow.id};break scanning;
        }
        projections.push(projection);
        authorizedRows.push({id:String(row.id),updated_at_text:String(row.updated_at_text)});
      }
      if(rows.length<limit+1)break;
      const last=rows.at(-1)!;scanAfter={updatedAt:last.updated_at_text,id:last.id};
    }
    return {projections,...(nextCursor?{next:nextCursor}:{}),asOf:new Date().toISOString()};
  }

  async refreshMissionSummary(tx:TenantTransaction,missionId:string,grantRefs?:readonly EntityRef[]):Promise<ProjectionEnvelope>{
    contract('UUID',missionId);const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.mission.manage'&&c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('PURPOSE_DENIED');
    if(c.purposeOfUse==='abh.runtime.deliver'){
      const [scope]=await tx.owner('MissionController')`SELECT id FROM core.missions
        WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${missionId} AND deleted_at IS NULL`;
      if(!scope)throw new CoreError('RESOURCE_NOT_FOUND');
      await assertCurrentGrants(tx,{objectRef:{type:'abh.mission',id:missionId,version:1},
        scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
        action:'abh.projections.build-mission-summary'},grantRefs??[]);
    }
    const [missionRow]=await tx.owner('MissionController')`SELECT record,version,status,goal_revision,stop_epoch FROM core.missions
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${missionId} AND deleted_at IS NULL
        AND (${c.purposeOfUse==='abh.runtime.deliver'}::boolean OR ${c.purposeOfUse}=ANY(purpose_names))
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      FOR UPDATE`;
    if(!missionRow)throw new CoreError('RESOURCE_NOT_FOUND');
    const mission=contract('MissionRecord',missionRow.record);
    if(mission.missionRef.id!==missionId||mission.missionRef.version!==Number(missionRow.version)
      ||mission.resourceOrganizationId!==c.resourceOrganizationId||mission.status!==missionRow.status
      ||mission.goalRevision!==Number(missionRow.goal_revision)||mission.stopEpoch!==Number(missionRow.stop_epoch))
      throw new CoreError('INTERNAL_ERROR');
    const [triggerRow]=await tx.owner('MissionController')`SELECT count(*) AS count FROM core.mission_triggers
      WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${missionId} AND deleted_at IS NULL`;
    const [blockerRow]=await tx.owner('MissionController')`SELECT count(*) AS count FROM core.mission_blockers
      WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${missionId} AND deleted_at IS NULL
        AND (record->>'resolved')::boolean=false`;
    const source:MissionSummarySourceVector={missionVersion:mission.missionRef.version,
      goalRevision:mission.goalRevision,stopEpoch:mission.stopEpoch,
      pendingTriggers:Number(triggerRow?.count??0),blockers:Number(blockerRow?.count??0)};
    const envelope=contract('ProjectionEnvelope',{projectionType:'abh.projection.mission-summary',subjectRef:mission.missionRef,
      resourceOrganizationId:c.resourceOrganizationId,schemaVersion:1,watermark:mission.stopEpoch,stale:false,
      data:{missionRef:mission.missionRef,goalDigest:mission.goalDigest,domainType:mission.domainType,
        status:mission.status,goalRevision:mission.goalRevision,
        ...(mission.activeRunRef?{activeRunRef:mission.activeRunRef}:{}),
        ...(mission.businessStageRef?{businessStageRef:mission.businessStageRef}:{}),
        ...(mission.resultRefs?{resultRefs:mission.resultRefs}:{}),
        pendingTriggerCount:source.pendingTriggers,blockerCount:source.blockers,
        updatedAt:mission.updatedAt},
      availableActions:mission.status==='Active'?['pause','cancel','block','revise-goal','close']:
        mission.status==='Draft'?['activate']:mission.status==='Paused'?['resume','cancel']:[],
      asOf:new Date().toISOString()});
    const [existing]=await tx.owner('ProjectionController')`SELECT record,source_version_vector FROM read.projections
      WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${missionSummaryProjectionType}
        AND subject_id=${missionId} FOR UPDATE`;
    if(existing){
      const existingVector=existing.source_version_vector as Record<string,unknown>;
      const current:MissionSummarySourceVector={
        missionVersion:Number(existingVector.missionVersion),goalRevision:Number(existingVector.goalRevision),
        stopEpoch:Number(existingVector.stopEpoch),pendingTriggers:Number(existingVector.pendingTriggers),
        blockers:Number(existingVector.blockers)};
      const sourceIsOlder=current.missionVersion>source.missionVersion
        ||current.missionVersion===source.missionVersion&&(current.goalRevision>source.goalRevision
          ||current.stopEpoch>source.stopEpoch||current.pendingTriggers>source.pendingTriggers
          ||current.blockers>source.blockers);
      if(sourceIsOlder)
        return contract('ProjectionEnvelope',existing.record);
      if(canonicalJson(existingVector)===canonicalJson(source)
        &&contract('ProjectionEnvelope',existing.record).stale===false)return existing.record;
      const changed=await tx.owner('ProjectionController')`UPDATE read.projections
        SET record=${JSON.stringify(envelope)}::text::jsonb,watermark=${mission.stopEpoch},stale=false,
          purpose_names=${mission.purposeNames},source_version_vector=${JSON.stringify(source)}::text::jsonb,
          built_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1
        WHERE resource_organization_id=${c.resourceOrganizationId} AND projection_type=${missionSummaryProjectionType}
          AND subject_id=${missionId} RETURNING id`;
      if(!changed[0])throw new CoreError('VERSION_CONFLICT');
      return envelope;
    }
    await tx.owner('ProjectionController')`INSERT INTO read.projections(resource_organization_id,id,workspace_id,
        purpose_names,record,projection_type,subject_id,watermark,stale,source_version_vector,built_at)
      VALUES (${c.resourceOrganizationId},gen_random_uuid(),${c.workspaceId??null},${mission.purposeNames},
        ${JSON.stringify(envelope)}::text::jsonb,${missionSummaryProjectionType},${missionId},${mission.stopEpoch},false,
        ${JSON.stringify(source)}::text::jsonb,CURRENT_TIMESTAMP)`;
    return envelope;
  }

  async pendingMissionEvents(tx:TenantTransaction,consumerId:string,grantRefs:readonly EntityRef[],
    limit=32):Promise<Array<{
    eventRef:{type:'abh.event';id:string;version:1};event:EventEnvelope;eventDigest:Digest;
    cursor:{id:string};
  }>>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    await assertCurrentGrants(tx,{objectRef:{type:'abh.organization',id:c.resourceOrganizationId,version:1},
      scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
      action:'abh.runtime.drain'},grantRefs);
    const rows=await tx.owner('DurableExecution')`SELECT event.id,event.created_at,event.record FROM data.outbox event
      LEFT JOIN read.projection_consumer_watermarks watermark
        ON watermark.resource_organization_id=event.resource_organization_id
         AND watermark.consumer_id=${consumerId} AND watermark.projection_type=${missionSummaryProjectionType}
      LEFT JOIN runtime.inbox inbox ON inbox.resource_organization_id=event.resource_organization_id
        AND inbox.consumer_id=${consumerId} AND inbox.event_id=event.id
      WHERE event.resource_organization_id=${c.resourceOrganizationId} AND event.deleted_at IS NULL
        AND event.aggregate_type='abh.mission' AND event.record->>'type' IN
          ('abh.mission.activate','abh.mission.pause','abh.mission.cancel','abh.mission.resume',
           'abh.mission.resolve','abh.mission.block','abh.mission.complete',
           'abh.mission.projection-refresh-requested')
        AND (event.workspace_id IS NULL OR event.workspace_id=${c.workspaceId??null}::uuid)
        AND inbox.id IS NULL AND (watermark.id IS NULL OR
          (event.created_at,event.id)>(watermark.last_event_created_at,watermark.last_event_id))
      ORDER BY event.created_at,event.id LIMIT ${limit}`;
    return await Promise.all(rows.map(async row=>{const event=contract('EventEnvelope',row.record);return {
      eventRef:{type:'abh.event',id:event.eventId,version:1},event,eventDigest:await inputDigest(event),
      cursor:{id:row.id}};}));
  }

  async historicalMissionEvents(tx:TenantTransaction,consumerId:string,grantRefs:readonly EntityRef[],
    limit=32):Promise<Array<{
    eventRef:{type:'abh.event';id:string;version:1};event:EventEnvelope;eventDigest:Digest;
      cursor:{id:string};
  }>>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    await assertCurrentGrants(tx,{objectRef:{type:'abh.organization',id:c.resourceOrganizationId,version:1},
      scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
      action:'abh.runtime.drain'},grantRefs);
    const rows=await tx.owner('DurableExecution')`SELECT event.id,event.record FROM data.outbox event
      JOIN read.projection_consumer_watermarks watermark
        ON watermark.resource_organization_id=event.resource_organization_id
         AND watermark.consumer_id=${consumerId} AND watermark.projection_type=${missionSummaryProjectionType}
      WHERE event.resource_organization_id=${c.resourceOrganizationId} AND event.deleted_at IS NULL
        AND event.aggregate_type='abh.mission' AND event.record->>'type' IN
          ('abh.mission.activate','abh.mission.pause','abh.mission.cancel','abh.mission.resume',
           'abh.mission.resolve','abh.mission.block','abh.mission.complete',
           'abh.mission.projection-refresh-requested')
        AND (event.workspace_id IS NULL OR event.workspace_id=${c.workspaceId??null}::uuid)
        AND (event.created_at,event.id)<=(watermark.last_event_created_at,watermark.last_event_id)
        AND NOT EXISTS(
          SELECT 1 FROM runtime.inbox inbox
          WHERE inbox.resource_organization_id=event.resource_organization_id
            AND inbox.consumer_id=${consumerId} AND inbox.event_id=event.id)
      ORDER BY event.created_at,event.id LIMIT ${limit}`;
    return await Promise.all(rows.map(async row=>{const event=contract('EventEnvelope',row.record);return {
      eventRef:{type:'abh.event',id:event.eventId,version:1},event,eventDigest:await inputDigest(event),
      cursor:{id:row.id}};}));
  }

  /** Tenant-scoped aggregate for fixed production series; never exposes subject identifiers. */
  async missionSummaryHealthSnapshot(tx:TenantTransaction,consumerId:string,
    grantRefs:readonly EntityRef[]):Promise<{lagMs:number;gapCount:number}>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    await assertCurrentGrants(tx,{objectRef:{type:'abh.organization',id:c.resourceOrganizationId,version:1},
      scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
      action:'abh.runtime.drain'},grantRefs);
    const [row]=await tx.owner('DurableExecution')`
      WITH eligible AS (
        SELECT event.created_at,inbox.id IS NULL AS unconsumed
        FROM data.outbox event
        LEFT JOIN runtime.inbox inbox
          ON inbox.resource_organization_id=event.resource_organization_id
         AND inbox.consumer_id=${consumerId} AND inbox.event_id=event.id
        WHERE event.resource_organization_id=${c.resourceOrganizationId} AND event.deleted_at IS NULL
          AND event.aggregate_type='abh.mission' AND event.record->>'type' IN
            ('abh.mission.activate','abh.mission.pause','abh.mission.cancel','abh.mission.resume',
             'abh.mission.resolve','abh.mission.block','abh.mission.complete',
             'abh.mission.projection-refresh-requested')
          AND (event.workspace_id IS NULL OR event.workspace_id=${c.workspaceId??null}::uuid)
      ) SELECT count(*) FILTER (WHERE unconsumed)::bigint AS gap_count,
        COALESCE(GREATEST(0,CEIL(EXTRACT(EPOCH FROM
          clock_timestamp()-min(created_at) FILTER (WHERE unconsumed))*1000)),0)::bigint AS lag_ms
      FROM eligible`;
    return {lagMs:Number(row?.lag_ms??0),gapCount:Number(row?.gap_count??0)};
  }

  async saveMissionConsumerWatermark(tx:TenantTransaction,consumerId:string,projectionType:string,
    cursor:{id:string}):Promise<void>{
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

export class MissionSummaryEventConsumer implements InstalledEventConsumer {
  readonly id='abh.projection-consumer.mission-summary';
  readonly eventTypes=missionSummaryEventTypes;
  private readonly grantRefs:readonly EntityRef[];
  constructor(grantRefs:readonly EntityRef[]){this.grantRefs=grantRefs;}
  async fenceRefs():Promise<EntityRef[]>{return [...this.grantRefs];}
  async admit(tx:TenantTransaction,event:EventEnvelope):Promise<void>{
    await assertCurrentGrants(tx,{objectRef:{type:'abh.event',id:event.eventId,version:1},
      scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
      action:'abh.runtime.consume-event'},this.grantRefs);
  }
  async handle(tx:TenantTransaction,_command:import('../data/journal.ts').CommandIdentity,event:EventEnvelope):Promise<EntityRef>{
    if(event.aggregateRef.type!=='abh.mission')throw new CoreError('FORBIDDEN');
    await new ProjectionOwner().refreshMissionSummary(tx,event.aggregateRef.id,this.grantRefs);
    const [watermark]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox
      WHERE resource_organization_id=${event.resourceOrganizationId} AND id=${event.eventId}`;
    if(!watermark)throw new CoreError('RESOURCE_NOT_FOUND');
    await new ProjectionOwner().saveMissionConsumerWatermark(tx,this.id,missionSummaryProjectionType,
      {id:watermark.id});
    return {type:'abh.mission',id:event.aggregateRef.id,version:event.aggregateVersion};
  }
}

const missionSummaryConsumerId='abh.projection-consumer.mission-summary';
const zeroEventId='00000000-0000-0000-0000-000000000000';

/** Authorized projection hints. Hints are generated only from committed Inbox effects. */
export async function* subscribeMissionSummaryChanges(database:Database,
  suppliedContext:VerifiedContext|RequestContext,options:TransactionOptions,subjectId:string,
  grantRefs:readonly EntityRef[],afterEventId?:string,
  pollIntervalMs=500):AsyncGenerator<ProjectionSubscriptionHint>{
  if(!Number.isSafeInteger(pollIntervalMs)||pollIntervalMs<50||pollIntervalMs>60000)
    throw new CoreError('INVALID_ARGUMENT');
  try {
    if(afterEventId!==undefined)contract('UUID',afterEventId);
    const context='tenant' in suppliedContext&&'request' in suppliedContext?
      suppliedContext:deriveVerifiedContext(suppliedContext);
    const subject={type:'abh.mission' as const,id:subjectId,version:1};
    const organization={type:'abh.organization' as const,id:context.tenant.resourceOrganizationId,version:1};
    let cursor=afterEventId;
    while(!options.signal.aborted){
      const changes=await database.transaction(context,options,async tx=>{
        await new MissionOwner().get(tx,subjectId);
        await assertCurrentGrants(tx,{objectRef:subject,scopeRefs:[organization],
          action:'abh.projections.read'},grantRefs);
        if(cursor===undefined){
          const [latest]=await tx.owner('DurableExecution')`SELECT event.id FROM runtime.inbox inbox
            JOIN data.outbox event ON event.resource_organization_id=inbox.resource_organization_id AND event.id=inbox.event_id
            WHERE inbox.resource_organization_id=${context.tenant.resourceOrganizationId}
              AND inbox.consumer_id=${missionSummaryConsumerId}
              AND event.aggregate_type='abh.mission' AND event.aggregate_id=${subjectId}
            ORDER BY event.created_at DESC,event.id DESC LIMIT 1`;
          return {baseline:latest?.id??null,rows:[]};
        }
        if(cursor!==zeroEventId&&cursor===afterEventId&&afterEventId!==undefined){
          const [anchor]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox
            WHERE resource_organization_id=${context.tenant.resourceOrganizationId} AND id=${cursor}
              AND aggregate_type='abh.mission' AND aggregate_id=${subjectId}`;
          if(!anchor)throw new CoreError('RESOURCE_NOT_FOUND');
        }
        const rows=await tx.owner('DurableExecution')`SELECT event.id,event.record,inbox.record AS inbox_record FROM runtime.inbox inbox
          JOIN data.outbox event ON event.resource_organization_id=inbox.resource_organization_id AND event.id=inbox.event_id
          WHERE inbox.resource_organization_id=${context.tenant.resourceOrganizationId}
            AND inbox.consumer_id=${missionSummaryConsumerId}
            AND event.aggregate_type='abh.mission' AND event.aggregate_id=${subjectId}
            AND (event.created_at,event.id)>COALESCE(
              (SELECT (anchor.created_at,anchor.id) FROM data.outbox anchor
                WHERE anchor.resource_organization_id=${context.tenant.resourceOrganizationId} AND anchor.id=${cursor}),
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
          if(await digestContract('InboxRecord',inbox)!==inbox.digest)
            throw new CoreError('INTERNAL_ERROR');
          if(event.eventId!==row.id||inbox.eventRef.id!==event.eventId||inbox.consumerId!==missionSummaryConsumerId)
            throw new CoreError('INTERNAL_ERROR');
          await new MissionOwner().get(tx,subjectId);
          await assertCurrentGrants(tx,{objectRef:{...subject,version:event.aggregateVersion},
            scopeRefs:[organization],action:'abh.projections.read'},grantRefs);
          return new ProjectionOwner().get(tx,missionSummaryProjectionType,
            {type:'abh.mission',id:subjectId,version:event.aggregateVersion});
        });
        cursor=event.eventId;
        yield {kind:'change',eventId:event.eventId,cursor:event.eventId,
          projectionType:missionSummaryProjectionType,
          subjectRef:{type:'abh.mission',id:subjectId,version:current.subjectRef.version},
          version:current.subjectRef.version,watermark:current.watermark,stale:current.stale};
      }
      if(changes.rows.length<32&&!options.signal.aborted)
        await delay(pollIntervalMs,undefined,{signal:options.signal});
    }
  } catch {
    if(!options.signal.aborted)yield {kind:'reset'};
  }
}

/** Installed tenant recovery loop: bounded Outbox discovery before every current-grant consumption. */
export async function runMissionSummaryProjectionWorker(database:Database,input:{
  context:ContextSource;grantRefs:readonly EntityRef[];signal:AbortSignal;
  pageSize?:number;intervalMs?:number;
  metrics?:ProjectionMetrics;
  onPage?(result:{scanned:number;handled:number;repaired:number;lagMs:number;gapCount:number},
    options:TransactionOptions):Promise<void>;
}):Promise<void>{
  const pageSize=input.pageSize??32,interval=input.intervalMs??500;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(interval)||interval<1||interval>60000)
    throw new CoreError('INVALID_ARGUMENT');
  const grants=input.grantRefs.map(ref=>({...ref})),consumer=new MissionSummaryEventConsumer(grants);
  let binding:string|undefined;
  while(!input.signal.aborted){
    try{
      const context=await requestVerifiedContext(options=>input.context(options),
        {deadline:Date.now()+10000,signal:input.signal}),c=context.tenant;
      if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
      const tenant=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
      if(binding!==undefined&&binding!==tenant)throw new CoreError('FORBIDDEN');binding=tenant;
      let scanned=0,handled=0,repaired=0;
      const consume=async(item:{eventRef:{type:'abh.event';id:string;version:1};eventDigest:string}):
        Promise<void>=>{
        try{await consumeCommittedEvent(database,context,
          {deadline:Date.now()+10000,signal:input.signal},
          {consumerId:consumer.id,eventRef:item.eventRef,eventDigest:item.eventDigest},consumer);}
        catch(error){recordProjectionMetric(input.metrics,source=>source.incrementRebuildFailure());throw error;}
      };
      while(!input.signal.aborted){
        const gaps=await database.transaction(context,{deadline:Date.now()+10000,signal:input.signal},tx=>
          new ProjectionOwner().historicalMissionEvents(tx,consumer.id,grants,pageSize));
        if(gaps.length===0)break;
        scanned+=gaps.length;
        for(const item of gaps){
          if(input.signal.aborted)return;
          await consume(item);
          handled++;repaired++;
        }
        if(gaps.length<pageSize)break;
      }
      while(!input.signal.aborted){
        const pending=await database.transaction(context,{deadline:Date.now()+10000,signal:input.signal},tx=>
          new ProjectionOwner().pendingMissionEvents(tx,consumer.id,grants,pageSize));
        if(pending.length===0)break;
        scanned+=pending.length;
        for(const item of pending){
          if(input.signal.aborted)return;
          await consume(item);
          handled++;
        }
        if(pending.length<pageSize)break;
      }
      if(input.signal.aborted)return;
      let lagMs=0,gapCount=0;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned,handled,repaired,lagMs,gapCount},options),
        {deadline:Date.now()+10000,signal:input.signal});
      try{
        const health=await database.transaction(context,{deadline:Date.now()+10000,signal:input.signal},tx=>
          new ProjectionOwner().missionSummaryHealthSnapshot(tx,consumer.id,grants));
        lagMs=health.lagMs;gapCount=health.gapCount;
        recordProjectionMetric(input.metrics,source=>{
          source.observeProjectionLag(lagMs);source.observeGapCount(gapCount);
        });
      }catch{if(input.signal.aborted)return;}
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
