import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {GrantRecord,RecoverRunCommand,RunRecord,TaskRecord} from '@abh/contracts';
import {contract} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {recoverRun,runRunRecoveryWorker} from '../src/mission/run-recovery.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});
const workflow={kind:'Workflow' as const,id:'recovery.workflow',version:'1.0.0',digest:`sha256:${'0'.repeat(64)}`};

test('Run recovery cancels orphan tasks, clears stale mission state, and fences workers',async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const base=context(),org=base.tenant.resourceOrganizationId;
 const serviceId=randomUUID();
 const c=deriveVerifiedContext({...base.request,actor:{type:'Service' as const,id:serviceId},
  purposeOfUse:'abh.runtime.deliver' as const});
 const scope={type:'abh.organization' as const,id:org,version:1},principal={type:'abh.principal' as const,id:serviceId,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.runs.recover'],purposeNames:['abh.runtime.deliver' as const],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'}) satisfies GrantRecord;
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Recovery fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${serviceId},'Run recovery','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${serviceId},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${serviceId},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const now=new Date().toISOString(),goal=ref('abh.artifact'),authority=ref('abh.mission-authority');
 const mission=(id:string,activeRun?:RunRecord['runRef'])=>contract('MissionRecord',{missionRef:{type:'abh.mission' as const,id,version:1},
  resourceOrganizationId:org,goalArtifactRef:goal,goalDigest:`sha256:${'0'.repeat(64)}`,goalRevision:1,domainType:'recovery.mission',
  workflowRef:workflow,conditionRef:ref('abh.mission-conditions'),responsibilityScopeRefs:[scope],status:'Active' as const,stopEpoch:0,
  pauseRequested:false,cleanupStatus:'NotRequired' as const,purposeNames:['abh.mission.manage'] as const,
  createdBy:{type:'Human' as const,id:randomUUID()},createdAt:now,updatedAt:now,authorityRef:authority,
  ...(activeRun?{activeRunRef:activeRun}:{})});
 const run=(id:string,status:RunRecord['status'],missionId:string)=>contract('RunRecord',{runRef:{type:'abh.run' as const,id,version:1},
  resourceOrganizationId:org,missionRef:{type:'abh.mission' as const,id:missionId,version:1},triggerKey:'recovery.trigger',
  goalRevision:1,stopEpoch:0,workflowRef:workflow,assignmentSnapshotRef:ref('abh.artifact'),executionMode:'Production' as const,
  status,createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 const taskId=randomUUID(),succeededTaskId=randomUUID(),runId=randomUUID(),missionId=randomUUID();
 const recoveredRun=run(runId,'Completed',missionId),activeRun=run(randomUUID(),'Running',randomUUID());
 const task=(id:string,status:TaskRecord['status'],parentRunId=runId):TaskRecord=>contract('TaskRecord',{taskRef:{type:'abh.task' as const,id,version:1},
  resourceOrganizationId:org,runRef:{type:'abh.run' as const,id:parentRunId,version:1},nodeKey:'recovery.node',kind:'Agent' as const,
  inputRefs:[ref('abh.artifact')],status,required:true,attemptOrdinal:1,createdAt:now,updatedAt:now});
 for(const value of [mission(missionId,recoveredRun.runRef),mission(activeRun.missionRef.id,activeRun.runRef)])await f.admin`
 INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,goal_revision,status,stop_epoch,created_by,updated_by)
  VALUES (${org},${value.missionRef.id},NULL,${['abh.mission.manage']},${JSON.stringify(value)}::text::jsonb,1,${value.status},0,
   ${value.createdBy.id},${value.createdBy.id})`;
 for(const value of [recoveredRun,activeRun])await f.admin`
 INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
  VALUES (${org},${value.runRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(value)}::text::jsonb,
   ${value.missionRef.id},${value.triggerKey},${value.status},1,0,${value.createdBy.id},${value.createdBy.id})`;
 for(const value of [task(taskId,'Running'),task(succeededTaskId,'Succeeded')])await f.admin`
 INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
  VALUES (${org},${value.taskRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(value)}::text::jsonb,
   ${value.runRef.id},${value.nodeKey},${value.status},${c.tenant.actor.id},${c.tenant.actor.id})`;

 const command=(runRef:RunRecord['runRef'],workerId:string=serviceId):RecoverRunCommand=>contract('RecoverRunCommand',{
  type:'abh.runs.recover',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.run',id:runRef.id},expectedVersion:runRef.version,payload:{workerId,causeRef:ref('abh.artifact'),
  leaseRef:{type:'abh.work-lease',id:randomUUID(),version:1},leaseFencingToken:1}});
 const firstCommand=command(recoveredRun.runRef);
 const first=await recoverRun(f.database,c,options(),firstCommand,recoveredRun.runRef,[grant.grantRef]);
 assert.equal(first.cancelledTasks,1);assert.equal(first.missionUpdated,true);assert.equal(first.replayed,false);
 const [missionAfter]=await f.admin`SELECT record FROM core.missions WHERE id=${missionId}`;
 assert.equal(contract('MissionRecord',missionAfter!.record).activeRunRef,undefined);
 const [taskAfter]=await f.admin`SELECT record,status FROM core.tasks WHERE id=${taskId}`;
 assert.equal(contract('TaskRecord',taskAfter!.record).status,'Cancelled');assert.equal(taskAfter!.status,'Cancelled');
 const replay=await recoverRun(f.database,c,options(),firstCommand,recoveredRun.runRef,[grant.grantRef]);
 assert.deepEqual(replay.runRef,recoveredRun.runRef);assert.equal(replay.cancelledTasks,0);assert.equal(replay.replayed,true);
 const [ledger]=await f.admin`SELECT
  (SELECT count(*) FROM data.outbox WHERE aggregate_id=${runId} AND record->>'type'='abh.run.recovered') AS runs,
  (SELECT count(*) FROM data.outbox WHERE aggregate_id=${taskId} AND record->>'type'='abh.task.cancelled') AS tasks`;
 assert.deepEqual(ledger,{runs:'1',tasks:'1'});

 await assert.rejects(recoverRun(f.database,c,options(),command(activeRun.runRef),activeRun.runRef,[grant.grantRef]),{code:'PRECONDITION_FAILED'});
 await assert.rejects(recoverRun(f.database,c,options(),command(activeRun.runRef,randomUUID()),activeRun.runRef,[grant.grantRef]),{code:'PRECONDITION_FAILED'});

 const workerRunId=randomUUID(),workerMissionId=randomUUID(),workerTaskId=randomUUID();
 const workerRun=run(workerRunId,'Failed',workerMissionId),workerTask=task(workerTaskId,'Pending',workerRunId);
 const workerMission=mission(workerMissionId,workerRun.runRef);
 await f.admin`INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,goal_revision,status,stop_epoch,created_by,updated_by)
  VALUES (${org},${workerMissionId},NULL,${['abh.mission.manage']},${JSON.stringify(workerMission)}::text::jsonb,1,'Active',0,${workerMission.createdBy.id},${workerMission.createdBy.id})`;
 await f.admin`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
  VALUES (${org},${workerRunId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(workerRun)}::text::jsonb,
   ${workerMissionId},${workerRun.triggerKey},'Failed',1,0,${workerRun.createdBy.id},${workerRun.createdBy.id})`;
 await f.admin`INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
  VALUES (${org},${workerTaskId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(workerTask)}::text::jsonb,
   ${workerRunId},${workerTask.nodeKey},'Pending',${c.tenant.actor.id},${c.tenant.actor.id})`;
 const stop=new AbortController();
 const worker=runRunRecoveryWorker(f.database,{workerId:randomUUID(),context:async()=>c,grantRefs:[grant.grantRef],
  signal:stop.signal,intervalMs:1000,onPage:async result=>{if(result.scanned)stop.abort();}});
 await worker;
 const [workerTaskAfter]=await f.admin`SELECT status FROM core.tasks WHERE id=${workerTaskId}`;
 assert.equal(workerTaskAfter!.status,'Cancelled');
});
