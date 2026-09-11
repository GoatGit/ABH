import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {contract,inputDigest} from '../src/data/journal.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {serializeHttpResponse} from '@abh/contracts/http';
import {createMission} from '../src/mission/create-mission.ts';
import {MissionOwner} from '../src/mission/missions.ts';
import {createMissionQueryHandlers,type MissionHttpInstallation} from '../src/server/mission-http.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {MissionCursorCodec} from '../src/server/mission-cursor.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';
const ref=(type:string)=>({type,id:randomUUID(),version:1});
test('Mission Draft and immutable conditions commit together under independent authority',async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.mission.manage'}),org=c.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1},principal={type:'abh.principal',id:c.tenant.actor.id,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.missions.create'],purposeNames:['abh.mission.manage'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:scope,status:'Active'});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Mission fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Creator','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const payload={ownerRef:scope,mediaType:'application/json',content:'{"goal":"bounded fixture"}',dataClass:'abh.data.internal',purposeNames:['abh.mission.manage'],sourceRefs:[],region:'local',retentionPolicyRef:scope};
 const store={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
 const goal=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().store(tx,store,payload,async()=>{}));
 const input=contract('CreateMissionPayload',{goalArtifactRef:goal.artifactRef,domainType:'hello.mission',workflowRef:{kind:'Workflow',id:'hello.workflow',version:'1.0.0',digest:goal.contentDigest},conditions:{successConditionRef:ref('hello.predicate'),stopConditionRef:ref('hello.predicate'),triggerPolicyRef:ref('hello.trigger'),resourceEnvelopeRef:ref('abh.resource-envelope')},responsibilityScopeRefs:[scope]});
 const command=contract('CreateMissionCommand',{type:'abh.missions.create',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:input});
 let calls=0,deny=false,failAt=0;
 const checks={fenceRefs:async()=>[],definition:async()=>{if(deny||++calls===failAt)throw new Error('definition unavailable');}};
 const invoke=(grants=[grant.grantRef])=>createMission(f.database,c,options(),command,grants,checks);
 await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});assert.equal(calls,0);
 failAt=3;await assert.rejects(invoke(),/definition unavailable/);
 const [empty]=await f.admin`SELECT (SELECT count(*) FROM core.missions) AS missions,(SELECT count(*) FROM core.mission_conditions) AS conditions`;
 assert.deepEqual(empty,{missions:'0',conditions:'0'});failAt=0;
 const [a,b]=await Promise.all([invoke(),invoke()]);assert.deepEqual(a,b);
 const [receiptCount]=await f.admin`SELECT count(*)::int AS count FROM data.command_receipts
  WHERE command_type='abh.missions.create' AND idempotency_key=${command.idempotencyKey}`;
 assert.equal(Number(receiptCount!.count),1);
 assert.equal(serializeHttpResponse('CreateMission',201,a).success,true);
 const owner=new MissionOwner(),mission=await f.database.transaction(c,options(),tx=>owner.get(tx,a.missionRef.id));
 assert.equal(mission.status,'Draft');assert.equal(mission.goalRevision,1);assert.equal(mission.stopEpoch,0);assert.equal(mission.activeRunRef,undefined);assert.equal(mission.authorityRef,undefined);
 const conditions=await f.database.transaction(c,options(),tx=>owner.conditions(tx,mission.conditionRef));assert.deepEqual(conditions.missionRef,mission.missionRef);assert.deepEqual(conditions.successConditionRef,input.conditions.successConditionRef);
 deny=true;await assert.rejects(invoke(),/definition unavailable/);deny=false;
 const foreignOrg=randomUUID(),foreign=deriveVerifiedContext({...c.request,resourceOrganizationId:foreignOrg,actingOrganizationId:foreignOrg});await assert.rejects(f.database.transaction(foreign,options(),tx=>owner.get(tx,a.missionRef.id)),{code:'RESOURCE_NOT_FOUND'});
 await assert.rejects(f.database.transaction(c,options(),tx=>tx.owner('MissionController')`UPDATE core.mission_conditions SET record=record`),{code:'42501'});
 await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;await assert.rejects(invoke(),{code:'AUTHORITY_REQUIRED'});
});

test('Mission views aggregate real triggers, blockers, and state actions',async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.mission.manage'});
 const identity=()=>({type:'abh.missions.create' as const,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:`sha256:${'0'.repeat(64)}`});
 const payload={ownerRef:ref('abh.organization'),mediaType:'application/json',content:'{"goal":"view fixture"}',
  dataClass:'abh.data.internal',purposeNames:['abh.mission.manage'],sourceRefs:[],region:'local',
  retentionPolicyRef:ref('abh.retention-policy')};
 const store={type:'abh.artifacts.store-inline' as const,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
 const goal=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().store(tx,store,payload,async()=>{}));
 const owner=new MissionOwner();
 const missionInput=contract('CreateMissionPayload',{
  goalArtifactRef:goal.artifactRef,domainType:'hello.mission',
  workflowRef:{kind:'Workflow',id:'hello.workflow',version:'1.0.0',digest:goal.contentDigest},
  conditions:{successConditionRef:ref('hello.predicate'),stopConditionRef:ref('hello.predicate'),
   triggerPolicyRef:ref('hello.trigger'),resourceEnvelopeRef:ref('abh.resource-envelope')},
  responsibilityScopeRefs:[ref('abh.organization')]});
 const mission=await f.database.transaction(c,options(),tx=>owner.create(tx,identity(),missionInput,goal));
 const second=await f.database.transaction(c,options(),tx=>owner.create(tx,identity(),missionInput,goal));
 const install:MissionHttpInstallation={grants:async()=>[],definition:null as never,activation:null as never,
  fenceRefs:async()=>[],tool:null as never};
 const org=c.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1};
 const principal={type:'abh.principal',id:c.tenant.actor.id,version:1};
 const missionGrant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,
  principalRef:principal,scopeRefs:[scope],
  actionTypes:['abh.missions.activate','abh.missions.cancel','abh.missions.resume',
   'abh.missions.block','abh.missions.revise-goal','abh.missions.close','abh.missions.read'],
  purposeNames:['abh.mission.manage'],validFrom:new Date(Date.now()-1000).toISOString(),
  validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:scope,status:'Active'});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Mission views','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Operator','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${missionGrant.grantRef.id},${principal.id},${JSON.stringify(missionGrant)}::text::jsonb,${missionGrant.validFrom},${missionGrant.validUntil},'Active')`;
  for(const value of [scope,principal,missionGrant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const authorizedInstall:MissionHttpInstallation={...install,
  grants:async(_context,command)=>command.target.type==='abh.mission'?[missionGrant.grantRef]:[]};
 const authorizedView=()=>createMissionQueryHandlers(f.database,authorizedInstall)['abh.missions.get'](c,options(),mission.missionRef.id);
 const cursorCodec=new MissionCursorCodec(randomBytes(32));
 const listInstall:MissionHttpInstallation={...authorizedInstall,list:{
  cursor:cursorCodec,grants:async()=>[missionGrant.grantRef]}};
 const listMission=(query:Record<string,unknown>)=>createMissionQueryHandlers(f.database,listInstall)
   ['abh.missions.list'](c,options(),query);
 const deniedListInstall:MissionHttpInstallation={...listInstall,list:{
  cursor:cursorCodec,grants:async()=>[]}};
 const deniedMissionList=(query:Record<string,unknown>)=>createMissionQueryHandlers(f.database,deniedListInstall)
   ['abh.missions.list'](c,options(),query);
 let current=await authorizedView();assert.deepEqual(current.availableActions,['activate']);
 assert.deepEqual(current.pendingTriggers,[]);assert.deepEqual(current.blockers,[]);
 const draftFilter={missionStatus:'Draft' as const,domainType:'hello.mission',limit:1};
 const firstPage=await listMission(draftFilter);
 assert.equal(firstPage.missions.length,1);assert.equal(typeof firstPage.cursor,'string');
 await assert.rejects(listMission({...draftFilter,missionStatus:'Active',cursor:firstPage.cursor}),{code:'INVALID_ARGUMENT'});
 const secondPage=await listMission({...draftFilter,cursor:firstPage.cursor});
 assert.equal(secondPage.cursor,undefined);
 assert.deepEqual([firstPage.missions[0]!.missionRef.id,secondPage.missions[0]!.missionRef.id]
   .sort(),[mission.missionRef.id,second.missionRef.id].sort());
 assert.deepEqual((await listMission({missionStatus:'Active'})).missions,[]);
 await assert.rejects(deniedMissionList({}),{code:'AUTHORITY_REQUIRED'});

 const active=await f.database.transaction(c,options(),tx=>owner.activate(tx,
  {...mission.missionRef,type:'abh.mission'},ref('abh.mission-authority'),identity()));
 const triggerInput=contract('SubmitTriggerPayload',{missionRef:active.missionRef,triggerKey:'hello.trigger',
  sourceEventRef:ref('abh.event'),sourceWatermark:7,kind:'DomainEvent'});
 const submitted=await f.database.transaction(c,options(),tx=>owner.submitTrigger(tx,triggerInput));
 assert.equal(submitted.disposition,'Accepted');
 current=await authorizedView();assert.deepEqual(current.availableActions,['cancel','block','revise-goal','close']);
 await f.database.transaction(c,options(),async tx=>assert.rejects(assertCurrentGrants(tx,
  {objectRef:active.missionRef,scopeRefs:[scope],action:'abh.missions.pause'},[missionGrant.grantRef]),{code:'FORBIDDEN'}));
 assert.deepEqual(current.pendingTriggers.map(value=>value.triggerKey),['hello.trigger']);

 const blockerPayload={missionRef:active.missionRef,blockerType:'hello.required-blocker',
  sourceEvidenceRef:ref('abh.artifact'),required:true};
 const blocked=await f.database.transaction(c,options(),tx=>owner.block(tx,active.missionRef,blockerPayload,identity()));
 current=await authorizedView();assert.equal(current.availableActions.length,0);
 assert.deepEqual(current.blockers.map(value=>value.blockerType),['hello.required-blocker']);

 const resumed=await f.database.transaction(c,options(),tx=>owner.resume(tx,blocked.missionRef,[blockerPayload.missionRef&&{
  type:'abh.mission-blocker',id:current.blockers[0]!.blockerRef.id,version:1}],identity()));
 current=await authorizedView();assert.equal(resumed.status,'Active');
 assert.deepEqual(current.availableActions,['cancel','block','revise-goal','close']);
 assert.deepEqual(current.blockers,[]);
 const resolved=await f.database.transaction(c,options(),tx=>owner.blockers(tx,mission.missionRef.id,true));
 assert.deepEqual(resolved.map(value=>value.blockerType),['hello.required-blocker']);

 const paused=await f.database.transaction(c,options(),tx=>owner.pause(tx,resumed.missionRef,'hello.reason',identity()));
 current=await authorizedView();assert.deepEqual(current.availableActions,['resume','cancel']);
 assert.equal(current.mission.status,'Paused');

 const cancelled=await f.database.transaction(c,options(),tx=>owner.cancel(tx,paused.missionRef,'hello.reason',[],identity()));
 current=await authorizedView();assert.equal(cancelled.status,'Cancelled');assert.deepEqual(current.availableActions,[]);
});
