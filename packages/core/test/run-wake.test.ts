import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {DurableWaitRecord,GrantRecord,MissionRecord,WakeRunCommand} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import {contract,inputDigest} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {wakeRun} from '../src/mission/run-commands.ts';
import {runRunWakeWorker} from '../src/mission/run-wake-worker.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});
const workflow={kind:'Workflow' as const,id:'graph.workflow',version:'1.0.0',digest:`sha256:${'0'.repeat(64)}`};

test('WakeRun verifies its durable wait and Mission before resuming a Waiting Run',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const base=context(),org=base.tenant.resourceOrganizationId,serviceId=randomUUID(),missionId=randomUUID(),runId=randomUUID();
 const workerId=randomUUID();
 const c=deriveVerifiedContext({...base.request,actor:{type:'Service' as const,id:serviceId},
  purposeOfUse:'abh.runtime.deliver' as const});
 const scope={type:'abh.organization' as const,id:org,version:1},principal={type:'abh.principal' as const,id:serviceId,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.runs.wake'],purposeNames:['abh.runtime.deliver' as const],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'}) satisfies GrantRecord;
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
   VALUES (${org},${org},'Run wake fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
   VALUES (${org},${serviceId},'Run coordinator','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
   VALUES (${org},${randomUUID()},${serviceId},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
   VALUES (${org},${grant.grantRef.id},${serviceId},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`
   INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
   VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const now=new Date().toISOString(),activeRun={type:'abh.run' as const,id:runId,version:1};
 const mission=contract('MissionRecord',{missionRef:{type:'abh.mission' as const,id:missionId,version:1},resourceOrganizationId:org,
  goalArtifactRef:ref('abh.artifact'),goalDigest:`sha256:${'0'.repeat(64)}`,goalRevision:1,domainType:'hello.mission',
  workflowRef:workflow,conditionRef:ref('abh.mission-conditions'),responsibilityScopeRefs:[scope],status:'Active',stopEpoch:0,
  pauseRequested:false,cleanupStatus:'NotRequired' as const,purposeNames:['abh.mission.manage'] as const,
   createdBy:c.tenant.actor,createdAt:now,updatedAt:now,authorityRef:ref('abh.mission-authority'),activeRunRef:activeRun});
 const run=contract('RunRecord',{runRef:activeRun,resourceOrganizationId:org,
  missionRef:mission.missionRef,triggerKey:'wake.trigger',goalRevision:1,stopEpoch:0,
  progressBudgetSeconds:3600,progressDeadline:new Date(Date.now()+600_000).toISOString(),workflowRef:workflow,
  assignmentSnapshotRef:ref('abh.artifact'),executionMode:'Production' as const,status:'Waiting' as const,
  createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,goal_revision,status,stop_epoch)
   VALUES (${org},${missionId},NULL,${['abh.mission.manage']},${JSON.stringify(mission)}::text::jsonb,1,'Active',0)`;
  await tx.owner('MissionController')`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
   VALUES (${org},${runId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(run)}::text::jsonb,
    ${missionId},${run.triggerKey},'Waiting',1,0,${c.tenant.actor.id},${c.tenant.actor.id})`;
 });
 const baseRegistration={ownerRef:activeRun,waitKey:randomUUID(),dueAt:new Date(Date.now()+60_000).toISOString(),
  causeRef:ref('abh.artifact'),authorityRef:scope,conditionRef:ref('hello.wait-condition'),sourceRef:ref('hello.source')};
 const wait=async(status:'Pending'|'Succeeded',owner=activeRun,version=1,
   satisfied=status==='Succeeded'):Promise<DurableWaitRecord>=>{
  const registration={...baseRegistration,ownerRef:owner,waitKey:randomUUID()};
  const waitRef={type:'abh.durable-wait' as const,id:randomUUID(),version};
  const source={sourceRef:registration.sourceRef,eventOrdinal:0,satisfied,
   evidenceRefs:[ref('abh.artifact')]};
  const baseRecord={waitRef,resourceOrganizationId:org,
   ownerRef:owner,waitKey:registration.waitKey,dueAt:registration.dueAt,causeRef:registration.causeRef,
   authorityRef:registration.authorityRef,conditionRef:registration.conditionRef,sourceRef:registration.sourceRef,
   waitingIntentRef:owner,status,source,registeredAt:now};
  const registrationDigest=await inputDigest(registration);
  const unsigned={...baseRecord,
   ...(status==='Succeeded'?{resolvedAt:now,wakeupRef:{type:'abh.durable-wakeup' as const,id:randomUUID(),version:1}}:{})};
  const zeroDigest='sha256:'+('0'.repeat(64));
  const unsignedForDigest={...unsigned,registrationDigest,digest:zeroDigest};
  return contract('DurableWaitRecord',{...unsignedForDigest,digest:await digestContract('DurableWaitRecord',unsignedForDigest)});
 };
 const saveWakeup=async(record:DurableWaitRecord)=>{if(!record.wakeupRef)return;await f.admin`
  INSERT INTO runtime.wakeups(resource_organization_id,id,workspace_id,purpose_names,wait_id,record,created_by,updated_by)
  VALUES (${org},${record.wakeupRef.id},NULL,${['abh.runtime.deliver']},${record.waitRef.id},
   ${JSON.stringify({wakeupRef:record.wakeupRef,resourceOrganizationId:org,waitRef:record.waitRef,
    ownerRef:record.ownerRef,authorityRef:record.authorityRef,reason:record.source.satisfied?'Condition':'Deadline',
    source:record.source,createdAt:record.resolvedAt,digest:'sha256:'+('0'.repeat(64))})}::text::jsonb,
   ${c.tenant.actor.id},${c.tenant.actor.id})`;};
 const save=async(record:DurableWaitRecord)=>{await f.admin`
  INSERT INTO runtime.waits(resource_organization_id,id,workspace_id,purpose_names,record,owner_type,owner_id,wait_key,due_at,status,created_by,updated_by)
  VALUES (${org},${record.waitRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},
   ${JSON.stringify(record)}::text::jsonb,${record.ownerRef.type},${record.ownerRef.id},${record.waitKey},
   ${record.dueAt},${record.status},${c.tenant.actor.id},${c.tenant.actor.id})`;await saveWakeup(record);};
 const command=(runRef=activeRun,waitId:string=randomUUID(),expectedVersion=1,idempotencyKey=randomUUID()):WakeRunCommand=>
  contract('WakeRunCommand',{type:'abh.runs.wake',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
   target:{type:'abh.run',id:runRef.id},expectedVersion,payload:{runRef,causeRef:ref('abh.artifact'),
    waitRef:{type:'abh.durable-wait',id:waitId,version:1}}});
 const pending=await wait('Pending');await save(pending);
 await assert.rejects(wakeRun(f.database,c,options(),command(activeRun,pending.waitRef.id),[grant.grantRef]),
  {code:'PRECONDITION_FAILED'});
 const wrongOwner=await wait('Pending',{type:'abh.run' as const,id:randomUUID(),version:1});await save(wrongOwner);
 await assert.rejects(wakeRun(f.database,c,options(),command(activeRun,wrongOwner.waitRef.id),[grant.grantRef]),
  {code:'PRECONDITION_FAILED'});
 const deadline=await wait('Succeeded',activeRun,1,false);await save(deadline);
 const deadlineCandidates=await f.admin`SELECT wait.id AS wait_id,wait.record->'source'->>'satisfied' AS satisfied
  FROM core.runs run JOIN runtime.waits wait ON wait.resource_organization_id=run.resource_organization_id
   AND wait.owner_type='abh.run' AND wait.owner_id=run.id AND wait.status='Succeeded'
   AND wait.record->'source'->>'satisfied'='true'
  WHERE run.id=${runId} ORDER BY wait.created_at`;
 assert.equal(deadlineCandidates.length,0);
 const workerPage=await new Promise<{scanned:number;awakened:number}>((resolve,reject)=>{
  const controller=new AbortController();
  void runRunWakeWorker(f.database,{
   workerId,context:async()=>c,grantRefs:[grant.grantRef],signal:controller.signal,
   intervalMs:1000,transactionTimeoutMs:10000,
   onPage:async result=>{controller.abort();resolve(result);},
  }).catch(error=>reject(error));
 });
 assert.deepEqual(workerPage,{scanned:0,awakened:0});
 const [stalledRun]=await f.admin`SELECT version,status FROM core.runs WHERE id=${runId}`;
 assert.deepEqual({version:Number(stalledRun!.version),status:stalledRun!.status},{version:1,status:'Waiting'});
 const succeeded=await wait('Succeeded');await save(succeeded);
 const wakeCommand=command(activeRun,succeeded.waitRef.id);
 const first=await wakeRun(f.database,c,options(),wakeCommand,[grant.grantRef]);
 assert.equal(first.status,'Running');assert.equal(first.runRef.version,2);
 assert.deepEqual(await wakeRun(f.database,c,options(),wakeCommand,[grant.grantRef]),first);
 await assert.rejects(wakeRun(f.database,c,options(),command(activeRun,succeeded.waitRef.id),[grant.grantRef]),
  {code:'VERSION_CONFLICT'});
 const [runRow]=await f.admin`SELECT version,status FROM core.runs WHERE id=${runId}`;
 assert.deepEqual({version:Number(runRow!.version),status:runRow!.status},{version:2,status:'Running'});
 const [ledger]=await f.admin`SELECT
  (SELECT count(*)::int FROM data.audit_records WHERE record->>'action'='abh.runs.wake') AS audits,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.run.resume') AS events`;
 assert.deepEqual(ledger,{audits:1,events:1});
 const secondRunId=randomUUID(),secondRun={type:'abh.run' as const,id:secondRunId,version:1};
 const secondRunRecord=contract('RunRecord',{...run,runRef:secondRun,status:'Waiting',triggerKey:'wake.trigger.second'});
 const secondWait=await wait('Succeeded',secondRun);
 await f.admin`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
  VALUES (${org},${secondRunId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(secondRunRecord)}::text::jsonb,
   ${missionId},${secondRunRecord.triggerKey},'Waiting',1,0,${c.tenant.actor.id},${c.tenant.actor.id})`;
 await f.admin`UPDATE core.missions SET record=jsonb_set(record,'{activeRunRef}',${JSON.stringify(secondRun)}::text::jsonb)
  WHERE resource_organization_id=${org} AND id=${missionId}`;
 await save(secondWait);
 const workerWake=await new Promise<{scanned:number;awakened:number}>((resolve,reject)=>{
  const controller=new AbortController();
  void runRunWakeWorker(f.database,{
   workerId,context:async()=>c,grantRefs:[grant.grantRef],signal:controller.signal,
   intervalMs:1000,transactionTimeoutMs:10000,
   onPage:async result=>{controller.abort();resolve(result);},
  }).catch(error=>reject(error));
 });
 assert.deepEqual(workerWake,{scanned:1,awakened:1});
 const [resumed]=await f.admin`SELECT version,status FROM core.runs WHERE id=${secondRunId}`;
 assert.deepEqual({version:Number(resumed!.version),status:resumed!.status},{version:2,status:'Running'});
 const [finalLedger]=await f.admin`SELECT
  (SELECT count(*)::int FROM data.audit_records WHERE record->>'action'='abh.runs.wake') AS audits,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.run.resume') AS events`;
 assert.deepEqual(finalLedger,{audits:2,events:2});
 await assert.rejects(wakeRun(f.database,c,options(),command(secondRun,secondWait.waitRef.id),[]),
  {code:'AUTHORITY_REQUIRED'});
});
