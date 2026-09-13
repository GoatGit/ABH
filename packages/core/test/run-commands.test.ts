import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import type {LedgerRecord,ReleaseRecord,StaticAssignmentRecord} from '@abh/contracts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {contract,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {ObjectArtifactOwner} from '../src/data/object-artifacts.ts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {serializeHttpResponse} from '@abh/contracts/http';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {ToolGatewayOwner} from '../src/mission/gateway.ts';
import {cancelRun,completeRun,startRun} from '../src/mission/run-commands.ts';
import {closeMission,pauseMission} from '../src/mission/lifecycle.ts';
import {consumeCommittedEvent} from '../src/durable/inbox.ts';
import {MissionSummaryEventConsumer,runMissionSummaryProjectionWorker,requestMissionSummaryRefresh,
  subscribeMissionSummaryChanges} from '../src/workbench/projections.ts';
import {ProjectionCursorCodec} from '../src/server/projection-cursor.ts';
import {invokeTool,reconcileToolCall} from '../src/mission/tool-commands.ts';
import {createTenantRuntimeLoops,joinRuntimeLoops,type TenantRuntimeOptions} from '../src/durable/runtime-host.ts';
import {createMissionQueryHandlers,type MissionHttpInstallation} from '../src/server/mission-http.ts';
import {RunCursorCodec} from '../src/server/run-cursor.ts';
import {ProjectionOwner,redactMissionSummaryData} from '../src/workbench/projections.ts';
import {subscribeRunStatusChanges} from '../src/workbench/projections.ts';
import {subscribeOrganizationProjectionChanges} from '../src/workbench/projections.ts';
import {ProjectionMetricsCollector} from '../src/workbench/projection-metrics.ts';
import {inspectProjectionHealth} from '../src/diagnostics.ts';
import {StaticReleaseOwner} from '../src/release/static.ts';
import {context,options,createDatabaseFixture,seedLedgerCatalog} from './database-fixture.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});
const zeroUUID='00000000-0000-0000-0000-000000000000';
 const workflow={kind:'Workflow' as const,id:'hello.workflow',version:'1.0.0',digest:`sha256:${'0'.repeat(64)}`};
type IdempotencyKey=ReturnType<typeof randomUUID>;
const missionPurposeNames=['abh.mission.manage'];
const toolResultStorage={dataClass:'tool.result',region:'local',
 retentionPolicyRef:{type:'abh.retention-policy',id:randomUUID(),version:1}} as const;
function toolPorts(behavior:(request:import('../src/mission/gateway.ts').ToolAdapterRequest)=>Promise<import('../src/mission/gateway.ts').ToolAdapterResult>){
 const calls:import('../src/mission/gateway.ts').ToolAdapterRequest[]=[];
 return {calls,adapter:{async call(request:import('../src/mission/gateway.ts').ToolAdapterRequest){calls.push(request);return behavior(request);}},
  outputValidator:async(output:unknown)=>{if((output as {validate?:unknown}).validate==='reject')throw new Error('schema');},
  resultStorage:toolResultStorage};
}
function objectStorePort(){
 const objects=new Map<string,Uint8Array>();
 return {objects,port:{
  async put(request:import('@abh/contracts').PutObjectRequest,_options:unknown,content:AsyncIterable<Uint8Array>){
   const chunks:Uint8Array[]=[];let size=0;
   for await(const chunk of content){chunks.push(chunk);size+=chunk.byteLength;}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   if(await digestBytes(bytes)!==request.digest||size!==request.sizeBytes)throw new Error('store digest mismatch');
   const objectRef={type:'abh.stored-object' as const,id:randomUUID(),version:1};
   objects.set(objectRef.id,bytes);
   return {status:'Completed' as const,data:{objectRef,digest:request.digest,sizeBytes:size,mediaType:request.mediaType}};
  },
  async read(request:import('@abh/contracts').ReadObjectRequest){
   const bytes=objects.get(request.objectRef.id);if(!bytes)throw new Error('missing object');
   const descriptor={objectRef:request.objectRef,digest:await digestBytes(bytes),
     sizeBytes:bytes.byteLength,mediaType:'application/json'};
   return {status:'Completed' as const,data:{object:descriptor,content:(async function*(){yield bytes;})()}};
  },
  async stat(){throw new Error('not used');},
  async delete(){throw new Error('not used');},
 }};
}

test('Run lifecycle validates state, locks active runs, journals effects, and clears active run',async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.mission.manage'});
 const org=c.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1};
 const principal={type:'abh.principal',id:c.tenant.actor.id,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.runs.start','abh.runs.complete','abh.runs.cancel','abh.runs.read','abh.missions.pause','abh.missions.close',
    'abh.projections.read','abh.projections.request-mission-summary',
    'abh.tools.invoke','abh.tools.read'],
  purposeNames:['abh.mission.manage'],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Run fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Runner','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const missionId=randomUUID(),secondMissionId=randomUUID(),thirdMissionId=randomUUID(),conditionId=randomUUID(),
  authority=ref('abh.mission-authority'),goal=ref('abh.artifact');
 const now=new Date().toISOString();
 const missionBase={resourceOrganizationId:org,goalArtifactRef:goal,goalDigest:`sha256:${'0'.repeat(64)}`,goalRevision:1,
  domainType:'hello.mission',workflowRef:workflow,conditionRef:{type:'abh.mission-conditions',id:conditionId,version:1},
  responsibilityScopeRefs:[scope],status:'Active' as const,stopEpoch:0,pauseRequested:false,cleanupStatus:'NotRequired' as const,
  purposeNames:['abh.mission.manage'] as const,createdBy:c.tenant.actor,createdAt:now,updatedAt:now,authorityRef:authority};
 const seedMission=async(id:string,status:'Active'|'Draft'|'Paused',version=1)=>contract('MissionRecord',{
  ...missionBase,...(status==='Draft'?{authorityRef:undefined}:
    status==='Paused'?{pauseRequested:true}:{}),
  missionRef:{type:'abh.mission',id,version},status});
 const configureRelease=async()=>{
  const release:ReleaseRecord={releaseRef:{type:'abh.release',id:randomUUID(),version:1},resourceOrganizationId:org,
   assets:[{behaviorSlot:'hello.workflow',capabilityExactRefs:[workflow]}],gateRefs:[ref('abh.artifact')],
   compatibilityRef:ref('abh.artifact'),status:'Ready'};
  const assignment:StaticAssignmentRecord={assignmentRef:{type:'abh.assignment',id:randomUUID(),version:1},resourceOrganizationId:org,
   releaseRef:release.releaseRef,scopeRefs:[scope],scopeTier:'Organization',status:'Active',selectable:true,
   executionAllowed:true,evidenceRefs:[ref('abh.decision')]};
  const payload={release,assignment},commandId={type:'abh.releases.configure-static',commandId:randomUUID(),
   idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
  await f.database.transaction(c,options(),tx=>new StaticReleaseOwner().configure(tx,commandId,payload));
  return {release,assignment};
 };
 const releases=await configureRelease();
 const projectionOwner=new ProjectionOwner(),wrongPurpose=deriveVerifiedContext(
  {...context().request,purposeOfUse:'abh.action.prepare'});
 await f.database.transaction(c,options(),async tx=>{
  for(const [id,status] of [[missionId,'Active'],[secondMissionId,'Paused'],[thirdMissionId,'Active']] as const){
   const mission=await seedMission(id,status);
   await tx.owner('MissionController')`INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,goal_revision,status,stop_epoch)
     VALUES (${org},${id},${tx.context.tenant.workspaceId??null},${missionPurposeNames},${JSON.stringify(mission)}::text::jsonb,${mission.goalRevision},${status},${mission.stopEpoch})`;
  }
 });
 const initialProjection=await f.database.transaction(c,options(),tx=>
  projectionOwner.refreshMissionSummary(tx,missionId));
 assert.equal(initialProjection.projectionType,'abh.projection.mission-summary');assert.equal(initialProjection.stale,false);
 assert.equal(initialProjection.data.status,'Active');assert.deepEqual(initialProjection.availableActions,
  ['pause','cancel','block','revise-goal','close']);
 const projectionReplay=await f.database.transaction(c,options(),tx=>
  projectionOwner.refreshMissionSummary(tx,missionId));
 assert.deepEqual(projectionReplay,initialProjection);
 const projectionMetricsCollector=new ProjectionMetricsCollector();
 const projectionReadRefs=[grant.grantRef];
 const projectionQueryInstall:MissionHttpInstallation={grants:async()=>[],definition:null as never,
  activation:null as never,fenceRefs:async()=>[],tool:{...toolPorts(async()=>({status:'Completed' as const,output:{}})),
    inspectionGrants:async()=>[]},projectionMetrics:projectionMetricsCollector,
  projectionList:{cursor:new ProjectionCursorCodec(new Uint8Array(32).fill(7)),
    grants:async()=>structuredClone(projectionReadRefs)}};
 const projectionQueries=createMissionQueryHandlers(f.database,projectionQueryInstall);
 const projectionQuery={id:missionId,type:'abh.projection.mission-summary',fieldSet:'missionRef,status'};
 const redactedProjection=await projectionQueries['abh.projections.get'](c,options(),missionId,projectionQuery);
 assert.deepEqual(Object.keys(redactedProjection.projection.data).sort(),['missionRef','status']);
 assert.equal(redactedProjection.projection.projectionType,'abh.projection.mission-summary');
 assert.equal(projectionMetricsCollector.snapshot().queryRedactionCount,1);
 await assert.rejects(projectionQueries['abh.projections.get'](c,options(),missionId,
  {...projectionQuery,fieldSet:'missionRef,secret'}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(projectionQueries['abh.projections.get'](c,options(),missionId,
  {...projectionQuery,fieldSet:'missionRef,missionRef'}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(projectionQueries['abh.projections.get'](c,options(),missionId,
  {...projectionQuery,type:'abh.projection.action-timeline'}),{code:'RESOURCE_NOT_FOUND'});
 await f.database.transaction(c,options(),tx=>projectionOwner.refreshMissionSummary(tx,secondMissionId));
 const projectionListQuery={type:'abh.projection.mission-summary',limit:1};
 const projectionPage1=await projectionQueries['abh.projections.list'](c,options(),
  projectionListQuery);
 assert.equal(projectionPage1.projections.length,1);assert.ok(projectionPage1.cursor);
 const opaqueCursor=projectionPage1.cursor!;
 const projectionPage2=await projectionQueries['abh.projections.list'](c,options(),
  {...projectionListQuery,cursor:opaqueCursor});
 assert.equal(projectionPage2.projections.length,1);
 assert.notEqual(projectionPage1.projections[0]!.subjectRef.id,projectionPage2.projections[0]!.subjectRef.id);
 const filteredProjection=await projectionQueries['abh.projections.list'](c,options(),
  {...projectionListQuery,missionStatus:'Paused'});
 assert.deepEqual(filteredProjection.projections.map(value=>value.subjectRef.id),[secondMissionId]);
 await assert.rejects(projectionQueries['abh.projections.list'](c,options(),
  {type:'abh.projection.action-timeline'}),{code:'SCHEMA_UNSUPPORTED'});
 await assert.rejects(projectionQueries['abh.projections.list'](c,options(),
  {...projectionListQuery,cursor:opaqueCursor+'A'}),{code:'INVALID_ARGUMENT'});
 await assert.rejects(projectionQueries['abh.projections.list'](c,options(),
  {...projectionListQuery,cursor:opaqueCursor,missionStatus:'Paused'}),{code:'INVALID_ARGUMENT'});
 projectionReadRefs.length=0;
 assert.deepEqual((await projectionQueries['abh.projections.list'](c,options(),
  projectionListQuery)).projections,[]);
 projectionReadRefs.push(grant.grantRef);
 const codec=new ProjectionCursorCodec(new Uint8Array(32).fill(7));
 const after=codec.decode(opaqueCursor,c.request,{type:'abh.projection.mission-summary'});
 const encoded=codec.encode(after,c.request,{type:'abh.projection.mission-summary'});
 assert.deepEqual(codec.decode(encoded,c.request,{type:'abh.projection.mission-summary'}),after);
 await assert.rejects(async()=>codec.decode(encoded,c.request,
  {type:'abh.projection.mission-summary',missionStatus:'Paused'}),{code:'INVALID_ARGUMENT'});
 const servicePrincipal=ref('abh.principal'),service=deriveVerifiedContext(
  {...c.request,actor:{type:'Service' as const,id:servicePrincipal.id},purposeOfUse:'abh.runtime.deliver'});
 const runtimeGrant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:servicePrincipal,
  scopeRefs:[scope],actionTypes:['abh.runtime.drain','abh.runtime.consume-event',
    'abh.projections.build-mission-summary'],
  purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),
  validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'});
 const pauseCommand=contract('PauseMissionCommand',{type:'abh.missions.pause',schemaVersion:'0.1.0',commandId:randomUUID(),
  idempotencyKey:randomUUID(),target:{type:'abh.mission',id:missionId},
  expectedVersion:1,payload:{missionRef:{type:'abh.mission',id:missionId,version:1},
    reasonCode:'abh.reason.paused'}});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
    VALUES (${org},${servicePrincipal.id},'Projection Consumer','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
    VALUES (${org},${randomUUID()},${servicePrincipal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
    VALUES (${org},${runtimeGrant.grantRef.id},${servicePrincipal.id},${JSON.stringify(runtimeGrant)}::text::jsonb,
      ${runtimeGrant.validFrom},${runtimeGrant.validUntil},'Active')`;
  for(const subject of [servicePrincipal,runtimeGrant.grantRef])await tx.owner('Control')
    `INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${org},${randomUUID()},${subject.type},${subject.id},1)`;
 });
 const paused=await pauseMission(f.database,c,options(),pauseCommand,[grant.grantRef]);
 assert.equal(paused.status,'Paused');assert.equal(paused.missionRef.version,2);
 assert.equal(serializeHttpResponse('PauseMission',200,paused).success,true);
 const consumer=new MissionSummaryEventConsumer([runtimeGrant.grantRef]);
 const [pending]=await f.database.transaction(service,options(),tx=>
  projectionOwner.pendingMissionEvents(tx,consumer.id,[runtimeGrant.grantRef]));
 assert.equal(pending!.event.aggregateRef.id,missionId);assert.equal(pending!.event.type,'abh.mission.pause');
 await consumeCommittedEvent(f.database,service,options(),{
  consumerId:consumer.id,eventRef:pending!.eventRef,eventDigest:pending!.eventDigest},consumer);
 const projection=await f.database.transaction(c,options(),tx=>projectionOwner.get(tx,'abh.projection.mission-summary',
    {type:'abh.mission',id:missionId,version:2}));
 const watermark=await f.database.transaction(service,options(),async tx=>{
  const [row]=await tx.owner('ProjectionController')`SELECT last_event_id
    FROM read.projection_consumer_watermarks WHERE consumer_id=${consumer.id}
      AND projection_type='abh.projection.mission-summary'`;return row;});
 assert.equal(projection!.data.status,'Paused');
 assert.equal(watermark!.last_event_id,pending!.eventRef.id);
 const deniedFeed=subscribeMissionSummaryChanges(f.database,c,options(),missionId,[],
  pending!.eventRef.id,50);
 assert.deepEqual((await deniedFeed.next()).value,{kind:'reset'});
 await deniedFeed.return(undefined);
 const historicalFeed=subscribeMissionSummaryChanges(f.database,c,options(),missionId,[grant.grantRef],
  '00000000-0000-0000-0000-000000000000',50);
 const historical=await historicalFeed.next();
 assert.equal(historical.value!.kind,'change');
 assert.equal(historical.value!.eventId,pending!.eventRef.id);
 assert.equal(historical.value!.version,2);
 assert.equal(historical.value!.watermark,projection!.watermark);
 await historicalFeed.return(undefined);
 const refreshCommand=contract('RefreshMissionSummaryCommand',{
  type:'abh.projections.refresh-mission-summary',schemaVersion:'0.1.0',commandId:randomUUID(),
  idempotencyKey:randomUUID(),target:{type:'abh.mission',id:missionId},
  payload:{projectionType:'abh.projection.mission-summary',
    missionRef:{type:'abh.mission',id:missionId,version:2}}});
 const refresh=await requestMissionSummaryRefresh(f.database,c,options(),refreshCommand,[grant.grantRef]);
 assert.equal(refresh.replayed,false);assert.equal(refresh.missionRef.version,2);
 const refreshReplay=await requestMissionSummaryRefresh(f.database,c,options(),refreshCommand,[grant.grantRef]);
 assert.equal(refreshReplay.replayed,true);
 await assert.rejects(requestMissionSummaryRefresh(f.database,c,options(),
  {...refreshCommand,commandId:randomUUID(),idempotencyKey:randomUUID(),
   payload:{...refreshCommand.payload,projectionType:'abh.projection.action-timeline'}},[grant.grantRef]),
  {code:'SCHEMA_UNSUPPORTED'});
 const [refreshPending]=await f.database.transaction(service,options(),tx=>
  projectionOwner.pendingMissionEvents(tx,consumer.id,[runtimeGrant.grantRef]));
 assert.equal(refreshPending!.event.type,'abh.mission.projection-refresh-requested');
 assert.equal(refreshPending!.event.aggregateRef.id,missionId);
 await f.database.transaction(service,options(),tx=>projectionOwner.saveMissionConsumerWatermark(
  tx,consumer.id,'abh.projection.mission-summary',{id:refreshPending!.eventRef.id}));
 const [missingAfterWatermark]=await f.database.transaction(service,options(),tx=>
  projectionOwner.historicalMissionEvents(tx,consumer.id,[runtimeGrant.grantRef]));
 const pendingAfterGap=await f.database.transaction(service,options(),tx=>
  projectionOwner.pendingMissionEvents(tx,consumer.id,[runtimeGrant.grantRef]));
 assert.equal(missingAfterWatermark!.eventRef.id,refreshPending!.eventRef.id);
 assert.deepEqual(pendingAfterGap,[]);
 let refreshedProjection;
 const projectionWorkerMetrics=new ProjectionMetricsCollector();
 let repairedPage:{scanned:number;handled:number;repaired:number;lagMs:number;gapCount:number}|undefined;
 const stopProjectionWorker=new AbortController();
 const projectionWorker=runMissionSummaryProjectionWorker(f.database,{
  context:async()=>service,grantRefs:[runtimeGrant.grantRef],signal:stopProjectionWorker.signal,
  pageSize:10,intervalMs:5,metrics:projectionWorkerMetrics,
  onPage:async page=>{if(page.repaired===1)repairedPage=page;}});
 for(let elapsed=0;elapsed<15000;elapsed+=20){
	 const repaired=await f.database.transaction(service,options(),tx=>
	  tx.owner('DurableExecution')`SELECT 1 FROM runtime.inbox
	    WHERE resource_organization_id=${org} AND consumer_id=${consumer.id}
	      AND event_id=${refreshPending!.eventRef.id}`).catch(()=>undefined);
	 if(repaired?.length&&repairedPage)break;
 await new Promise(resolve=>setTimeout(resolve,20));
}
 for(let elapsed=0;elapsed<1000&&projectionWorkerMetrics.snapshot().projectionLagMs===null;elapsed+=10)
  await new Promise(resolve=>setTimeout(resolve,10));
 refreshedProjection=await f.database.transaction(c,options(),tx=>
  projectionOwner.get(tx,'abh.projection.mission-summary',
    {type:'abh.mission',id:missionId,version:2}));
 assert.equal(refreshedProjection!.data.status,'Paused');
 assert.equal(repairedPage!.repaired,1);
 assert.equal(repairedPage!.scanned,1);
 assert.equal(repairedPage!.gapCount,0);
 assert.equal(repairedPage!.lagMs,0);
 assert.equal(projectionWorkerMetrics.snapshot().gapCount,0);
 assert.equal(projectionWorkerMetrics.snapshot().projectionLagMs,0);
 assert.equal(projectionWorkerMetrics.snapshot().rebuildFailure,0);
 stopProjectionWorker.abort();await projectionWorker;
 const [missingAfterRepair]=await f.database.transaction(service,options(),tx=>
  projectionOwner.historicalMissionEvents(tx,consumer.id,[runtimeGrant.grantRef]));
 assert.equal(missingAfterRepair,undefined);
 const projectionHealth=await inspectProjectionHealth({connectionString:f.runtimeUrl,
  organizationId:org,subjectId:missionId,actorId:c.tenant.actor.id,
  signal:new AbortController().signal});
 assert.equal(projectionHealth.status,'Passed');
 assert.equal(projectionHealth.errorCode,null);
 assert.equal(projectionHealth.health.present,true);
 assert.equal(projectionHealth.health.stale,false);
 assert.equal(projectionHealth.health.gapCount,0);
 assert.equal(projectionHealth.health.safeRebuildCommand,'abh.projections.refresh-mission-summary');
 const resumedFeed=subscribeMissionSummaryChanges(f.database,c,options(),missionId,[grant.grantRef],
  pending!.eventRef.id,50);
 const resumed=await resumedFeed.next();
 assert.equal(resumed.value!.kind,'change');
 assert.equal(resumed.value!.eventId,refreshPending!.eventRef.id);
 assert.equal(resumed.value!.cursor,refreshPending!.eventRef.id);
 await resumedFeed.return(undefined);
 const unknownCursorFeed=subscribeMissionSummaryChanges(f.database,c,options(),missionId,[grant.grantRef],
  randomUUID(),50);
 assert.deepEqual((await unknownCursorFeed.next()).value,{kind:'reset'});
 await unknownCursorFeed.return(undefined);
 const resultRef=ref('abh.artifact'),closeCommand=contract('CloseMissionCommand',{
  type:'abh.missions.close',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.mission',id:thirdMissionId},expectedVersion:1,
  payload:{missionRef:{type:'abh.mission',id:thirdMissionId,version:1},resultRefs:[resultRef],
    conditionEvaluationRef:ref('abh.mission-condition-evaluation'),outcome:'Completed'}});
 const closed=await closeMission(f.database,c,options(),closeCommand,[grant.grantRef]);
 assert.equal(closed.status,'Completed');assert.equal(closed.missionRef.version,2);
 assert.equal(serializeHttpResponse('CloseMission',200,closed).success,true);
 const closedProjection=await f.database.transaction(c,options(),tx=>
  projectionOwner.refreshMissionSummary(tx,thirdMissionId));
 assert.equal(closedProjection.data.status,'Completed');
 assert.deepEqual(closedProjection.data.resultRefs,[resultRef]);
 assert.deepEqual(Object.keys(redactMissionSummaryData(closedProjection,'businessStageRef,resultRefs').data).sort(),
  ['businessStageRef','resultRefs']);
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`UPDATE core.missions SET version=1,status='Active',stop_epoch=0,
    record=jsonb_set(jsonb_set(jsonb_set(jsonb_set(record,'{missionRef,version}','1'),'{status}','"Active"'),
      '{stopEpoch}','0'),'{pauseRequested}','false'),updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${org} AND id=${missionId}`;
 });
 await f.database.transaction(c,options(),tx=>tx.owner('Control')
  `UPDATE control.grants SET status='Revoked' WHERE id=${runtimeGrant.grantRef.id}`);
 await assert.rejects(consumeCommittedEvent(f.database,service,options(),{
  consumerId:consumer.id,eventRef:pending!.eventRef,eventDigest:pending!.eventDigest},consumer),{code:'AUTHORITY_REQUIRED'});
 const projectionAfterReplay=await f.database.transaction(c,options(),tx=>
  projectionOwner.get(tx,'abh.projection.mission-summary',{type:'abh.mission',id:missionId,version:2}));
 assert.equal(projectionAfterReplay!.data.status,'Paused');
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`UPDATE core.missions SET version=2,status='Paused',stop_epoch=1,
    record=jsonb_set(jsonb_set(jsonb_set(jsonb_set(record,'{missionRef,version}','2'),'{status}','"Paused"'),'{stopEpoch}','1'),'{pauseRequested}','true'),
    updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${org} AND id=${missionId}`;
 });
 const advancedProjection=await f.database.transaction(c,options(),tx=>
  projectionOwner.refreshMissionSummary(tx,missionId));
 assert.equal(advancedProjection.watermark,1);assert.equal(advancedProjection.data.status,'Paused');
 assert.deepEqual(advancedProjection.availableActions,['resume','cancel']);
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`UPDATE core.missions SET version=1,status='Active',stop_epoch=0,
    record=jsonb_set(jsonb_set(jsonb_set(jsonb_set(record,'{missionRef,version}','1'),'{status}','"Active"'),'{stopEpoch}','0'),'{pauseRequested}','false')
    WHERE resource_organization_id=${org} AND id=${missionId}`;
 });
 const staleProjection=await f.database.transaction(c,options(),tx=>
  projectionOwner.refreshMissionSummary(tx,missionId));
 assert.deepEqual(staleProjection,advancedProjection);
 const [projectionVersion]=await f.admin`SELECT version FROM read.projections
  WHERE projection_type='abh.projection.mission-summary' AND subject_id=${missionId}`;
 assert.equal(Number(projectionVersion!.version),3);
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`UPDATE core.missions SET version=1,status='Active',stop_epoch=0,
    record=jsonb_set(jsonb_set(jsonb_set(jsonb_set(record,'{missionRef,version}','1'),'{status}','"Active"'),'{stopEpoch}','0'),'{pauseRequested}','false'),
    updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${org} AND id=${missionId}`;
 });
 await assert.rejects(f.database.transaction(wrongPurpose,options(),tx=>
  projectionOwner.get(tx,'abh.projection.mission-summary',{type:'abh.mission',id:missionId,version:1})),{code:'RESOURCE_NOT_FOUND'});
 await assert.rejects(f.database.transaction(wrongPurpose,options(),tx=>
  projectionOwner.refreshMissionSummary(tx,missionId)),{code:'PURPOSE_DENIED'});
 const payload=(missionVersion=1,overrides:{workflowRef?:typeof workflow;authorityRef?:typeof authority;triggerKey?:string}={})=>({
  missionRef:{type:'abh.mission' as const,id:missionId,version:missionVersion},triggerKey:overrides.triggerKey??'hello.trigger',
  workflowRef:overrides.workflowRef??workflow,authorityRef:overrides.authorityRef??authority,executionMode:'Production' as const});
 const command=(payloadValue:ReturnType<typeof payload>,idempotencyKey:IdempotencyKey=randomUUID())=>contract('StartRunCommand',{
  type:'abh.runs.start',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,target:{type:'abh.mission',id:missionId},payload:payloadValue});
 const invoke=(payloadValue:ReturnType<typeof payload>,idempotencyKey:IdempotencyKey=randomUUID())=>startRun(f.database,c,options(),command(payloadValue,idempotencyKey),[grant.grantRef]);

 await assert.rejects(invoke(payload(1,{workflowRef:{...workflow,version:'2.0.0'}})),{code:'PRECONDITION_FAILED'});
 await assert.rejects(invoke(payload(1,{authorityRef:ref('abh.mission-authority')})),{code:'PRECONDITION_FAILED'});
 await assert.rejects(invoke(payload(2)),{code:'VERSION_CONFLICT'});
 const draftMission=await seedMission(randomUUID(),'Draft');
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,goal_revision,status,stop_epoch)
    VALUES (${org},${draftMission.missionRef.id},${tx.context.tenant.workspaceId??null},${missionPurposeNames},${JSON.stringify(draftMission)}::text::jsonb,1,'Draft',0)`;
 });
 const draftPayload={...payload(),missionRef:{type:'abh.mission' as const,id:draftMission.missionRef.id,version:1}} as ReturnType<typeof payload>;
 await assert.rejects(invoke(draftPayload),{code:'PRECONDITION_FAILED'});

 const startKey:IdempotencyKey=randomUUID();
 const first=await invoke(payload(),startKey);assert.equal(first.status,'Queued');assert.equal(first.runRef.version,1);
 assert.equal(first.assignmentSnapshotRef.type,'abh.pin-set');
 const [startEvent]=await f.admin`SELECT id FROM data.outbox
   WHERE aggregate_type='abh.run' AND aggregate_id=${first.runRef.id} AND record->>'type'='abh.run.start'`;
 const [pinSetRow]=await f.admin`SELECT record FROM release.pin_sets WHERE id=${first.assignmentSnapshotRef.id}`;
 const pinSet=contract('PinSet',pinSetRow!.record);
 assert.equal(pinSet.subjectRef.id,first.runRef.id);
 assert.deepEqual(pinSet.pins[0]!.capabilityExactRefs,[workflow]);
 assert.equal(pinSet.pins[0]!.assignmentRef.id,releases.assignment.assignmentRef.id);
 const replay=await invoke(payload(),startKey);assert.deepEqual(replay.runRef,first.runRef);
 await assert.rejects(invoke(payload(2,{triggerKey:'other.trigger'})),{code:'RUN_ALREADY_ACTIVE'});
 const [missionRow]=await f.admin`SELECT record,version FROM core.missions WHERE id=${missionId}`;
 const activeMission=contract('MissionRecord',missionRow!.record);assert.deepEqual(activeMission.activeRunRef,first.runRef);
 assert.equal(Number(missionRow!.version),2);
 const [startLedger]=await f.admin`SELECT
  (SELECT count(*) FROM data.audit_records WHERE record->>'action'='abh.runs.start' AND record->'targetRef'->>'id'=${first.runRef.id}) AS audits,
  (SELECT count(*) FROM data.outbox WHERE aggregate_id=${first.runRef.id} AND record->>'type'='abh.run.start') AS events`;
 assert.deepEqual(startLedger,{audits:'1',events:'1'});
 const resultRefId=randomUUID();

 const complete=(runVersion:number,outcome:'Completed'|'Failed'|'Cancelled',idempotencyKey:IdempotencyKey=randomUUID())=>completeRun(f.database,c,options(),
  contract('CompleteRunCommand',{type:'abh.runs.complete',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
   target:{type:'abh.run',id:first.runRef.id},expectedVersion:runVersion,
   payload:{runRef:{type:'abh.run',id:first.runRef.id,version:runVersion},outcome,resultRefs:[{type:'abh.artifact',id:resultRefId,version:1}]}}),[grant.grantRef]);
 await assert.rejects(complete(2,'Completed'),{code:'VERSION_CONFLICT'});
 const completeKey:IdempotencyKey=randomUUID();
 const completed=await complete(1,'Completed',completeKey);assert.equal(completed.status,'Completed');assert.equal(completed.runRef.version,2);
 const completedReplay=await complete(1,'Completed',completeKey);
 assert.deepEqual(completedReplay.runRef,completed.runRef);
 const runFeed=subscribeRunStatusChanges(f.database,c,options(),first.runRef.id,[grant.grantRef],
   startEvent!.id,50);
 const runChange=await runFeed.next();
 assert.equal(runChange.value!.kind,'change');
 assert.equal(runChange.value!.projectionType,'abh.projection.run-status');
 assert.equal(runChange.value!.subjectRef.id,first.runRef.id);
 assert.equal(runChange.value!.version,2);
 await runFeed.return(undefined);
 const organizationFeed=subscribeOrganizationProjectionChanges(f.database,c,options(),
   org,[grant.grantRef],zeroUUID,50);
 const organizationChange=await organizationFeed.next();
 assert.equal(organizationChange.value!.kind,'change');
 assert.equal(organizationChange.value!.projectionType,'abh.projection.organization-feed');
 assert.equal(organizationChange.value!.subjectRef.type,'abh.organization');
 assert.equal(organizationChange.value!.subjectRef.id,org);
 await organizationFeed.return(undefined);
 const unknownOrganizationCursor=subscribeOrganizationProjectionChanges(f.database,c,
   options(),org,[grant.grantRef],randomUUID(),50);
 assert.deepEqual((await unknownOrganizationCursor.next()).value,{kind:'reset'});
 await unknownOrganizationCursor.return(undefined);
 const deniedOrganizationFeed=subscribeOrganizationProjectionChanges(f.database,c,
   options(),org,[ref('abh.grant')],undefined,50);
 assert.deepEqual((await deniedOrganizationFeed.next()).value,{kind:'reset'});
 await deniedOrganizationFeed.return(undefined);
 const unknownRunCursor=subscribeRunStatusChanges(f.database,c,options(),first.runRef.id,
   [grant.grantRef],randomUUID(),50);
 assert.deepEqual((await unknownRunCursor.next()).value,{kind:'reset'});
 await unknownRunCursor.return(undefined);
 const [missionAfter]=await f.admin`SELECT record,version FROM core.missions WHERE id=${missionId}`;
 const missionAfterRecord=contract('MissionRecord',missionAfter!.record);assert.equal(missionAfterRecord.activeRunRef,undefined);assert.equal(Number(missionAfter!.version),3);
 const [completeLedger]=await f.admin`SELECT
  (SELECT count(*) FROM data.audit_records WHERE record->>'action'='abh.runs.complete' AND record->'targetRef'->>'id'=${first.runRef.id}) AS audits,
  (SELECT count(*) FROM data.outbox WHERE aggregate_id=${first.runRef.id} AND record->>'type'='abh.run.complete') AS events`;
 assert.deepEqual(completeLedger,{audits:'1',events:'1'});

 const runListInstall:MissionHttpInstallation={...projectionQueryInstall,runList:{
  cursor:new RunCursorCodec(randomBytes(32)),grants:async()=>[grant.grantRef]}};
 const listRuns=(query:Record<string,unknown>)=>createMissionQueryHandlers(f.database,runListInstall)
   ['abh.runs.list'](c,options(),query);
 const secondRun=await invoke(payload(3,{triggerKey:'second.trigger'}));
 assert.equal(secondRun.status,'Queued');
 const secondCompleted=await completeRun(f.database,c,options(),
  contract('CompleteRunCommand',{type:'abh.runs.complete',schemaVersion:'0.1.0',commandId:randomUUID(),
   idempotencyKey:randomUUID(),target:{type:'abh.run',id:secondRun.runRef.id},expectedVersion:1,
   payload:{runRef:{...secondRun.runRef,version:1},outcome:'Completed',
    resultRefs:[{type:'abh.artifact',id:randomUUID(),version:1}]}}),[grant.grantRef]);
 assert.equal(secondCompleted.status,'Completed');

 const thirdRun=await invoke(payload(5,{triggerKey:'cancel.trigger'}));
 const evidenceRef=ref('abh.artifact');
 await f.database.transaction(c,options(),async tx=>{
  const running=contract('RunRecord',{...thirdRun,status:'Running'});
  await tx.owner('MissionController')`UPDATE core.runs SET status='Running',record=${JSON.stringify(running)}::text::jsonb
    WHERE resource_organization_id=${org} AND id=${thirdRun.runRef.id}`;
  const task=contract('TaskRecord',{taskRef:{type:'abh.task',id:randomUUID(),version:1},resourceOrganizationId:org,
   runRef:{...thirdRun.runRef},nodeKey:'cancel.node',kind:'DomainCommand' as const,inputRefs:[ref('abh.artifact')],
   status:'Running',required:true,attemptOrdinal:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  await tx.owner('MissionController')`INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
   VALUES (${org},${task.taskRef.id},${tx.context.tenant.workspaceId??null},${missionPurposeNames},${JSON.stringify(task)}::text::jsonb,
    ${thirdRun.runRef.id},${task.nodeKey},${task.status},${c.tenant.actor.id},${c.tenant.actor.id})`;
 });
 const cancel=(runVersion:number,idempotencyKey:IdempotencyKey=randomUUID())=>cancelRun(f.database,c,options(),
  contract('CancelRunCommand',{type:'abh.runs.cancel',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
   target:{type:'abh.run',id:thirdRun.runRef.id},expectedVersion:runVersion,
   payload:{runRef:{...thirdRun.runRef,version:runVersion},reasonCode:'abh.workbench.user.cancel',evidenceRefs:[evidenceRef]}}),[grant.grantRef]);
 const cancelKey:IdempotencyKey=randomUUID(),cancelled=await cancel(1,cancelKey);
 assert.equal(cancelled.status,'Cancelled');assert.equal(cancelled.stopEpoch,1);assert.equal(cancelled.runRef.version,2);
 assert.deepEqual(await cancel(1,cancelKey),cancelled);
 const [cancelledMissionRow]=await f.admin`SELECT record,version,stop_epoch FROM core.missions WHERE id=${missionId}`;
 const cancelledMission=contract('MissionRecord',cancelledMissionRow!.record);
 assert.equal(cancelledMission.activeRunRef,undefined);assert.equal(cancelledMission.stopEpoch,1);assert.equal(Number(cancelledMissionRow!.version),7);
 const [taskCounts]=await f.admin`SELECT
  count(*) FILTER (WHERE status='Cancelled') AS cancelled,
  count(*) FILTER (WHERE status='Running') AS running FROM core.tasks WHERE run_id=${thirdRun.runRef.id}`;
 assert.deepEqual(taskCounts,{cancelled:'1',running:'0'});
 const [cancelLedger]=await f.admin`SELECT
  (SELECT count(*) FROM data.audit_records WHERE record->>'action'='abh.runs.cancel' AND record->'targetRef'->>'id'=${thirdRun.runRef.id}) AS runaudits,
  (SELECT count(*) FROM data.outbox WHERE aggregate_id=${thirdRun.runRef.id} AND record->>'type'='abh.run.cancel') AS runevents,
  (SELECT count(*) FROM data.outbox WHERE aggregate_type='abh.task' AND aggregate_id IN
    (SELECT id FROM core.tasks WHERE run_id=${thirdRun.runRef.id}) AND record->>'type'='abh.task.cancelled') AS taskevents`;
 assert.deepEqual(cancelLedger,{runaudits:'1',runevents:'1',taskevents:'1'});
 const queuedRun=await invoke(payload(7,{triggerKey:'queued.cancel'}));
 await assert.rejects(cancelRun(f.database,c,options(),contract('CancelRunCommand',{
  type:'abh.runs.cancel',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.run',id:queuedRun.runRef.id},expectedVersion:1,
  payload:{runRef:{...queuedRun.runRef},reasonCode:'abh.workbench.user.cancel'}}),[grant.grantRef]),
  {code:'PRECONDITION_FAILED'});

 const runFilter={missionStatus:'Completed' as const,missionId,limit:1};
 const runPage1=await listRuns(runFilter);
 assert.equal(runPage1.runs.length,1);assert.ok(runPage1.cursor);
 await assert.rejects(listRuns({...runFilter,missionId:secondMissionId,cursor:runPage1.cursor}),{code:'INVALID_ARGUMENT'});
 const runPage2=await listRuns({...runFilter,cursor:runPage1.cursor});
 assert.equal(runPage2.cursor,undefined);
 assert.deepEqual([runPage1.runs[0]!.runRef.id,runPage2.runs[0]!.runRef.id].sort(),
   [first.runRef.id,secondRun.runRef.id].sort());
 assert.deepEqual((await listRuns({missionId:secondMissionId})).runs,[]);
 const deniedRunList:MissionHttpInstallation={...runListInstall,runList:{
  cursor:new RunCursorCodec(randomBytes(32)),grants:async()=>[]}};
 await assert.rejects(createMissionQueryHandlers(f.database,deniedRunList)
   ['abh.runs.list'](c,options(),{}),{code:'AUTHORITY_REQUIRED'});

 const binding=await f.database.transaction(c,options(),tx=>new ToolGatewayOwner().bind(tx,
 {type:'abh.invocation',id:randomUUID(),version:1},{type:'abh.tool-capability',id:randomUUID(),version:1},5));
 const behavior=async(request:import('../src/mission/gateway.ts').ToolAdapterRequest)=>{
  if(request.callKey==='large.object')return {status:'Completed' as const,output:{echo:'x'.repeat(70_000)},usage:'1'};
  if(request.callKey==='ambiguous.call')throw new Error('transport lost');
  if(request.callKey==='failed.call')return {status:'Failed' as const,errorDigest:`sha256:${'1'.repeat(64)}`};
  return {status:'Completed' as const,output:{echo:request.arguments.input},usage:'1'};
 };
 const ports=toolPorts(behavior);
 const invokeCommand=(idempotencyKey:IdempotencyKey,callKey='hello.call',bindingId=binding.bindingRef.id,
   invokePorts=ports)=>invokeTool(f.database,c,options(),contract('InvokeToolCommand',{
  type:'abh.tools.invoke',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,target:{type:'abh.tool-binding',id:binding.bindingRef.id},
  payload:{bindingRef:{...binding.bindingRef,id:bindingId},callKey,arguments:{input:'same'}}}),[grant.grantRef],invokePorts);
 const toolKey:IdempotencyKey=randomUUID(),toolFirst=await invokeCommand(toolKey),toolReplay=await invokeCommand(toolKey);
 assert.deepEqual(toolReplay,toolFirst);assert.equal(toolFirst.status,'Completed');assert.equal(ports.calls.length,1);
 assert.equal(ports.calls[0]!.binding.bindingRef.id,binding.bindingRef.id);
 const toolRecord=await f.database.transaction(c,options(),tx=>new ToolGatewayOwner().get(tx,toolFirst.callRef.id));
 assert.equal(toolRecord.status,'Completed');
 const artifactRef=toolRecord.resultArtifactRef!;
 const artifact=await f.database.transaction(c,options(),async tx=>{
  const stored=await new InlineArtifactOwner().read(tx,artifactRef,async()=>{});
  assert.equal(stored.record.ownerRef.id,toolFirst.callRef.id);
  assert.equal(stored.record.contentDigest,await digestBytes(stored.bytes));
  return JSON.parse(new TextDecoder().decode(stored.bytes));
 });
 assert.deepEqual(artifact,{kind:'ToolCallResult',callRef:toolFirst.callRef,output:{echo:'same'}});
 await invokeTool(f.database,c,options(),contract('InvokeToolCommand',{
  type:'abh.tools.invoke',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.tool-binding',id:binding.bindingRef.id},
  payload:{bindingRef:{...binding.bindingRef,id:randomUUID()},callKey:'hello.call',arguments:{input:'same'}}}),[grant.grantRef],ports)
  .then(()=>assert.fail('payload must match command target'),error=>assert.equal((error as {code?:string}).code,'INVALID_ARGUMENT'));
 await assert.rejects(invokeCommand(randomUUID(),'ambiguous.call'),{code:'DEPENDENCY_TIMEOUT'});
 assert.equal(ports.calls.length,2);
 await assert.rejects(invokeCommand(randomUUID(),'ambiguous.call'),{code:'DEPENDENCY_TIMEOUT'});
 assert.equal(ports.calls.length,2);
 const [pendingCall]=await f.admin`SELECT record FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id} AND call_key='ambiguous.call'`;
 assert.equal(contract('ToolCallRecord',pendingCall!.record).status,'Pending');
 await assert.rejects(invokeCommand(randomUUID(),'validation.call',binding.bindingRef.id,
   {...ports,outputValidator:async()=>{throw new Error('schema');}}),{code:'DEPENDENCY_TIMEOUT'});
 assert.equal(ports.calls.length,3);
 const [validationRow]=await f.admin`SELECT id,version FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id} AND call_key='validation.call'`;
 const validationReconciled=await reconcileToolCall(f.database,c,options(),{callRef:String(validationRow!.id),verdict:'Completed',
  output:{echo:'validated'},outputValidator:async output=>{assert.deepEqual(output,{echo:'validated'});},resultStorage:toolResultStorage},[grant.grantRef]);
 assert.equal(validationReconciled.status,'Completed');
 const [validationStored]=await f.admin`SELECT record FROM core.tool_calls WHERE id=${validationRow!.id}`;
 assert.equal(contract('ToolCallRecord',validationStored!.record).resultArtifactRef?.version,2);
 await invokeCommand(randomUUID(),'second.call');
 const failed=await invokeCommand(randomUUID(),'failed.call');
 assert.equal(failed.status,'Failed');assert.equal(failed.errorDigest,`sha256:${'1'.repeat(64)}`);
 const failedReplay=await invokeCommand(randomUUID(),'failed.call');
 assert.deepEqual(failedReplay,{callRef:failed.callRef,errorDigest:failed.errorDigest,status:'Failed'});
 assert.equal(ports.calls.length,5);
 const queryInstall:MissionHttpInstallation={grants:async()=>[],definition:null as never,activation:null as never,
  fenceRefs:async()=>[],tool:{...ports,inspectionGrants:async()=>[grant.grantRef]}};
 const queries=createMissionQueryHandlers(f.database,queryInstall);
 const inspection=await queries['abh.tools.get'](c,options(),failed.callRef.id);
 assert.equal(inspection.call.status,'Failed');assert.deepEqual(inspection.trackingRef,failed.callRef);
 assert.deepEqual(inspection.cost,{metered:false});assert.equal(inspection.call.errorDigest,`sha256:${'1'.repeat(64)}`);
 const deniedQueries=createMissionQueryHandlers(f.database,{...queryInstall,tool:{...ports,inspectionGrants:async()=>[]}});
 await assert.rejects(deniedQueries['abh.tools.get'](c,options(),failed.callRef.id),{code:'AUTHORITY_REQUIRED'});
 const [ambiguousRow]=await f.admin`SELECT id,version FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id} AND call_key='ambiguous.call'`;
 const failedCallRef={type:'abh.tool-call' as const,id:String(ambiguousRow!.id),version:Number(ambiguousRow!.version)+1};
 await assert.rejects(reconcileToolCall(f.database,c,options(),{callRef:String(ambiguousRow!.id),verdict:'Failed',
  errorDigest:`sha256:${'2'.repeat(64)}`,noEffectEvidenceRef:ref('abh.artifact')},[grant.grantRef]),{code:'RESOURCE_NOT_FOUND'});
 const evidenceCommand={commandId:randomUUID(),type:'abh.tools.invoke',idempotencyKey:randomUUID(),digest:await inputDigest(failedCallRef)};
 const evidence=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().store(tx,evidenceCommand,{
  ownerRef:binding.invocationRef,mediaType:'application/json',dataClass:toolResultStorage.dataClass,purposeNames:[c.tenant.purposeOfUse],
  sourceRefs:[{...failedCallRef,version:failedCallRef.version-1}],region:toolResultStorage.region,
  retentionPolicyRef:toolResultStorage.retentionPolicyRef,
  content:canonicalJson({kind:'ToolCallNoEffect',callRef:failedCallRef,errorDigest:`sha256:${'2'.repeat(64)}`}),
 },async refs=>assert.equal(refs.length,3)));
 const ambiguousFailed=await reconcileToolCall(f.database,c,options(),{callRef:String(ambiguousRow!.id),verdict:'Failed',
  errorDigest:`sha256:${'2'.repeat(64)}`,noEffectEvidenceRef:evidence.artifactRef},[grant.grantRef]);
 assert.equal(ambiguousFailed.status,'Failed');assert.equal(ambiguousFailed.errorDigest,`sha256:${'2'.repeat(64)}`);
 const [ambiguousStored]=await f.admin`SELECT record FROM core.tool_calls WHERE id=${ambiguousRow!.id}`;
 const ambiguousRecord=contract('ToolCallRecord',ambiguousStored!.record);
 assert.equal(ambiguousRecord.status,'Failed');assert.equal(ambiguousRecord.errorDigest,`sha256:${'2'.repeat(64)}`);
 assert.deepEqual(ambiguousRecord.failureEvidenceRef,evidence.artifactRef);
 await assert.rejects(invokeCommand(randomUUID(),'third.call'),{code:'LIMIT_EXCEEDED'});
 const [calls]=await f.admin`SELECT count(*)::int AS count FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id}`;
 assert.equal(calls!.count,5);
 const concurrentBinding=await f.database.transaction(c,options(),tx=>new ToolGatewayOwner().bind(tx,
  {type:'abh.invocation',id:randomUUID(),version:1},{type:'abh.tool-capability',id:randomUUID(),version:1},2));
 const concurrentPorts=toolPorts(async request=>({status:'Completed' as const,output:{echo:request.callKey}}));
 const concurrentCall=(callKey:string)=>invokeTool(f.database,c,options(),contract('InvokeToolCommand',{
  type:'abh.tools.invoke',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.tool-binding',id:concurrentBinding.bindingRef.id},
  payload:{bindingRef:concurrentBinding.bindingRef,callKey,arguments:{input:callKey}}}),[grant.grantRef],concurrentPorts);
 const concurrent=await Promise.allSettled(['a','b','c'].map(callKey=>concurrentCall(`concurrent.${callKey}`)));
 assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,2);
 assert.equal(concurrent.filter(result=>result.status==='rejected').length,1);
 const [concurrentCalls]=await f.admin`SELECT count(*)::int AS count FROM core.tool_calls WHERE binding_id=${concurrentBinding.bindingRef.id}`;
 assert.equal(concurrentCalls!.count,2);
 await f.admin`UPDATE core.tool_bindings SET record=jsonb_set(record,'{deadline}',to_jsonb(to_char(now()-interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) WHERE id=${binding.bindingRef.id}`;
 await assert.rejects(invokeCommand(randomUUID(),'after.deadline'),{code:'PRECONDITION_FAILED'});
 const [expired]=await f.admin`SELECT status,version FROM core.tool_bindings WHERE id=${binding.bindingRef.id}`;
 assert.equal(expired!.status,'Active');assert.equal(Number(expired!.version),1);
});

test('paid tool calls reserve, hold, consume and release atomically',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.mission.manage'});
 const org=c.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1};
 const principal={type:'abh.principal',id:c.tenant.actor.id,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.tools.invoke','abh.tools.read'],purposeNames:['abh.mission.manage'],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Paid tools','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Runner','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const ledgerOwner=new LedgerOwner(),budgetAmount='2';
 const ledgerCommand=async(operation:string,input:unknown):Promise<CommandIdentity>=>
  ({commandId:randomUUID(),type:`abh.test.tool.${operation}`,idempotencyKey:randomUUID(),digest:await inputDigest(input)});
 const configureLedger=async():Promise<LedgerRecord>=>{
  const input:Parameters<LedgerOwner['configure']>[2]={id:randomUUID(),scopeRef:{type:'abh.organization',id:org,version:1},resourceType:'abh.resource.tool-usage',meteringMode:'cumulative',
   unit:'abh.unit.credit',periodRef:(await seedLedgerCatalog(f.database,c,'abh.unit.credit')).periodRef,limit:'10'};
  return f.database.transaction(c,options(),async tx=>ledgerOwner.configure(tx,await ledgerCommand('configure',input),input));
 };
 const budget=(ledger:LedgerRecord)=>({ledgerRef:ledger.ledgerRef,amount:budgetAmount,
  expiresAt:new Date(Date.now()+60_000).toISOString()});
 const binding=await f.database.transaction(c,options(),tx=>new ToolGatewayOwner().bind(tx,
 {type:'abh.invocation',id:randomUUID(),version:1},{type:'abh.tool-capability',id:randomUUID(),version:1},10));
 const ports=toolPorts(async request=>{
  if(request.callKey==='large.object')return {status:'Completed' as const,output:{echo:'x'.repeat(70_000)},usage:'1'};
  if(request.callKey==='ambiguous.call')throw new Error('transport lost');
  if(request.callKey==='recovery.call'||request.callKey==='recovery.failed')throw new Error('transport lost');
  if(request.callKey==='failed.call')return {status:'Failed' as const,errorDigest:`sha256:${'3'.repeat(64)}`};
  return {status:'Completed' as const,output:{echo:request.arguments.input},usage:'1'};
  });
 const workerId=randomUUID(),worker={type:'abh.principal' as const,id:workerId,version:1};
 const workerGrant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:worker,
  scopeRefs:[scope],actionTypes:['abh.tools.invoke'],purposeNames:['abh.mission.manage'],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'});
 const workerContext=deriveVerifiedContext({...c.request,actor:{type:'Service' as const,id:workerId},
  purposeOfUse:'abh.mission.manage'});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${workerId},'Tool Recovery','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${workerId},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${workerGrant.grantRef.id},${workerId},${JSON.stringify(workerGrant)}::text::jsonb,${workerGrant.validFrom},${workerGrant.validUntil},'Active')`;
  for(const value of [worker,workerGrant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const invoke=(ledger:LedgerRecord,callKey:string,idempotencyKey=randomUUID())=>invokeTool(f.database,c,options(),
  contract('InvokeToolCommand',{type:'abh.tools.invoke',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
   target:{type:'abh.tool-binding',id:binding.bindingRef.id},
   payload:{bindingRef:binding.bindingRef,callKey,arguments:{input:callKey},budget:budget(ledger)}}),[grant.grantRef],ports);
 const balances=async(ledger:LedgerRecord)=>{const [row]=await f.admin`SELECT held_reservation::text AS held,
  confirmed_usage::text AS used FROM resource.ledgers WHERE id=${ledger.ledgerRef.id}`;return {held:row!.held,used:row!.used};};

 const successLedger=await configureLedger(),success=await invoke(successLedger,'success.call');
 assert.equal(success.status,'Completed');
 const [successRow]=await f.admin`SELECT record FROM core.tool_calls WHERE id=${success.callRef.id}`;
 const successRecord=contract('ToolCallRecord',successRow!.record);
 assert.equal(successRecord.costReservationRef?.type,'abh.reservation');
 assert.deepEqual(await balances(successLedger),{held:'0',used:'1'});
 const [successLink]=await f.admin`SELECT status FROM core.tool_call_reservations WHERE call_id=${success.callRef.id}`;
 assert.equal(successLink!.status,'Consumed');

 const pendingLedger=await configureLedger();
 await assert.rejects(invoke(pendingLedger,'ambiguous.call'),{code:'DEPENDENCY_TIMEOUT'});
 assert.deepEqual(await balances(pendingLedger),{held:'2',used:'0'});
 const recoveredLedger=await configureLedger(),failedRecoveryLedger=await configureLedger();
 await assert.rejects(invoke(recoveredLedger,'recovery.call'),{code:'DEPENDENCY_TIMEOUT'});
 await assert.rejects(invoke(failedRecoveryLedger,'recovery.failed'),{code:'DEPENDENCY_TIMEOUT'});
 const recoveryRequests:import('../src/mission/tool-commands.ts').ToolRecoveryRequest[]=[];
 const recoveryPorts={
  outputValidator:ports.outputValidator,resultStorage:toolResultStorage,grants:[workerGrant.grantRef],
  recovery:{async recover(request:import('../src/mission/tool-commands.ts').ToolRecoveryRequest){
   recoveryRequests.push(request);
   if(request.callKey==='recovery.call')return {status:'Completed' as const,output:{echo:'recovered'},usage:'1'};
   if(request.callKey==='recovery.failed')return {status:'Failed' as const,errorDigest:`sha256:${'5'.repeat(64)}`};
   return undefined;
  }}};
 const installedToolRecovery={...recoveryPorts,workerId:randomUUID(),context:async()=>workerContext,
  pageSize:100,intervalMs:1000,minimumAgeMs:0,
  onPage:async (result:Parameters<NonNullable<import('../src/mission/tool-commands.ts').ToolRecoveryOptions['onPage']>>[0])=>{
   assert.equal(result.scanned,3);assert.equal(result.recovered,2);stopWorker.abort();}};
 const runtimeBaseline={recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>;
 const runtimeLoops=createTenantRuntimeLoops(f.database,{...runtimeBaseline,toolRecovery:installedToolRecovery});
 assert.equal(runtimeLoops.length,createTenantRuntimeLoops(f.database,runtimeBaseline).length+1);
 installedToolRecovery.context=async()=>{throw new Error('replacement context must not run');};
 installedToolRecovery.recovery={async recover(){throw new Error('replacement recovery must not run');}};
 installedToolRecovery.minimumAgeMs=3_600_000;
 const stopWorker=new AbortController();
 await joinRuntimeLoops(stopWorker.signal,[runtimeLoops.at(-1)!]);
 assert.equal(recoveryRequests.length,3);
 const [recoveredRow]=await f.admin`SELECT record FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id} AND call_key='recovery.call'`;
 const recoveredRecord=contract('ToolCallRecord',recoveredRow!.record);
 assert.equal(recoveredRecord.status,'Completed');assert.equal(recoveredRecord.resultArtifactRef?.version,2);
 assert.deepEqual(await balances(recoveredLedger),{held:'0',used:'1'});
 const [failedRecoveryRow]=await f.admin`SELECT record FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id} AND call_key='recovery.failed'`;
 assert.equal(contract('ToolCallRecord',failedRecoveryRow!.record).status,'Failed');
 assert.deepEqual(await balances(failedRecoveryLedger),{held:'2',used:'0'});
 const [staleLeases]=await f.admin`SELECT count(*)::int AS count FROM runtime.work_leases WHERE target_type='abh.tool-call' AND lease_until>clock_timestamp()`;
 assert.equal(staleLeases!.count,0);

 const largeLedger=await configureLedger(),objectStorage=objectStorePort();
 const large=await invokeTool(f.database,c,options(),contract('InvokeToolCommand',{type:'abh.tools.invoke',
  schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.tool-binding',id:binding.bindingRef.id},
  payload:{bindingRef:binding.bindingRef,callKey:'large.object',arguments:{shape:'large'},
   budget:budget(largeLedger)}}),[grant.grantRef],{...ports,objectStore:objectStorage.port,
   authorizedContextRef:{type:'abh.authorized-context',id:randomUUID(),version:1}});
 assert.equal(large.status,'Completed');
 const [largeRow]=await f.admin`SELECT record FROM core.tool_calls WHERE id=${large.callRef.id}`;
 const largeRecord=contract('ToolCallRecord',largeRow!.record);
 assert.equal(largeRecord.resultArtifactRef?.version,2);assert.deepEqual(await balances(largeLedger),{held:'0',used:'1'});
 const [objectRow]=await f.admin`SELECT object_ref,size_bytes FROM data.object_artifacts WHERE artifact_id=${largeRecord.resultArtifactRef!.id}`;
 const storedBytes=[...objectStorage.objects.values()][0]!;assert.equal(objectRow!.size_bytes,String(storedBytes.byteLength));
 const storedObject=await f.database.transaction(c,options(),tx=>new ObjectArtifactOwner().load(tx,largeRecord.resultArtifactRef!,async()=>{}));
 assert.equal(storedObject.record.ownerRef.id,large.callRef.id);assert.equal(storedObject.object.sizeBytes,storedBytes.byteLength);
 await assert.rejects(f.database.transaction(c,options(),tx=>new InlineArtifactOwner().read(tx,largeRecord.resultArtifactRef!,async()=>{})),{code:'PRECONDITION_FAILED'});

 const failedLedger=await configureLedger(),failed=await invoke(failedLedger,'failed.call');
 assert.equal(failed.status,'Failed');assert.deepEqual(await balances(failedLedger),{held:'2',used:'0'});
 const [failedRow]=await f.admin`SELECT record FROM core.tool_calls WHERE id=${failed.callRef.id}`;
 const failedRecord=contract('ToolCallRecord',failedRow!.record);
 const queries=createMissionQueryHandlers(f.database,{grants:async()=>[],definition:null as never,activation:null as never,
  fenceRefs:async()=>[],tool:{...ports,inspectionGrants:async()=>[grant.grantRef]}});
 const inspection=await queries['abh.tools.get'](c,options(),failed.callRef.id);
 assert.equal(inspection.cost.metered,true);assert.equal(inspection.cost.status,'Held');
 assert.deepEqual(inspection.cost.reservationRef,failedRecord.costReservationRef);

 const [pendingRow]=await f.admin`SELECT id,version FROM core.tool_calls WHERE binding_id=${binding.bindingRef.id} AND call_key='ambiguous.call'`;
 const pendingCallRef={type:'abh.tool-call' as const,id:String(pendingRow!.id),version:Number(pendingRow!.version)+1};
 const evidenceCommand=await ledgerCommand('evidence',{callRef:pendingCallRef});
 const evidence=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().store(tx,evidenceCommand,{
  ownerRef:binding.invocationRef,mediaType:'application/json',dataClass:toolResultStorage.dataClass,purposeNames:[c.tenant.purposeOfUse],
  sourceRefs:[{...pendingCallRef,version:pendingCallRef.version-1}],region:toolResultStorage.region,
  retentionPolicyRef:toolResultStorage.retentionPolicyRef,
  content:canonicalJson({kind:'ToolCallNoEffect',callRef:pendingCallRef,errorDigest:`sha256:${'4'.repeat(64)}`}),
 },async evidenceRefs=>assert.equal(evidenceRefs.length,3)));
 const reconciled=await reconcileToolCall(f.database,c,options(),{callRef:String(pendingRow!.id),verdict:'Failed',
  errorDigest:`sha256:${'4'.repeat(64)}`,noEffectEvidenceRef:evidence.artifactRef},[grant.grantRef]);
 assert.equal(reconciled.status,'Failed');assert.deepEqual(await balances(pendingLedger),{held:'0',used:'0'});
 const [pendingLink]=await f.admin`SELECT status FROM core.tool_call_reservations WHERE call_id=${pendingCallRef.id}`;
 assert.equal(pendingLink!.status,'Released');
});
