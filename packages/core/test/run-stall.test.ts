import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {EntityRef,GrantRecord,InvocationRecord,MissionRecord,RunRecord,StopStalledRunCommand,
  TaskRecord,UUID} from '@abh/contracts';
import {contract} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {stopStalledRun} from '../src/mission/run-commands.ts';
import {RunOwner} from '../src/mission/runs.ts';
import {runRunStallWorker} from '../src/mission/run-stall-worker.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';

const ref=(type:string):EntityRef=>({type,id:randomUUID(),version:1});
const workflow={kind:'Workflow' as const,id:'stall.workflow',version:'1.0.0',digest:`sha256:${'0'.repeat(64)}`};
const taskSpec={goal:'Stalled work',outputSchemaRef:ref('abh.schema'),resourceLimits:{tokens:'1'}};

test('Run progress budget stops only expired work and refreshes at checkpoints',{timeout:180_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const base=context(),org=base.tenant.resourceOrganizationId,serviceId=randomUUID(),missionId=randomUUID();
 const workerId=randomUUID();
 const c=deriveVerifiedContext({...base.request,actor:{type:'Service' as const,id:serviceId},
  purposeOfUse:'abh.runtime.deliver' as const});
 const scope={type:'abh.organization' as const,id:org,version:1},
   principal={type:'abh.principal' as const,id:serviceId,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.runs.stop-stalled'],purposeNames:['abh.runtime.deliver' as const],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+120_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'}) satisfies GrantRecord;
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
   VALUES (${org},${org},'Run stall fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
   VALUES (${org},${serviceId},'Stall worker','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
   VALUES (${org},${randomUUID()},${serviceId},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
   VALUES (${org},${grant.grantRef.id},${serviceId},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`
   INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
   VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const now=new Date().toISOString(),past=new Date(Date.now()-2000).toISOString(),
   future=new Date(Date.now()+600_000).toISOString();
 const mission=(activeRun:EntityRef):MissionRecord=>contract('MissionRecord',{
  missionRef:{type:'abh.mission' as const,id:missionId,version:1},resourceOrganizationId:org,
  goalArtifactRef:ref('abh.artifact'),goalDigest:`sha256:${'0'.repeat(64)}`,goalRevision:1,domainType:'stall.mission',
  workflowRef:workflow,conditionRef:ref('abh.mission-conditions'),responsibilityScopeRefs:[scope],status:'Active',
  stopEpoch:0,pauseRequested:false,cleanupStatus:'NotRequired' as const,purposeNames:['abh.mission.manage'] as const,
  createdBy:c.tenant.actor,createdAt:now,updatedAt:now,authorityRef:ref('abh.mission-authority'),activeRunRef:activeRun});
 const run=(id:string,deadline:string,triggerKey:string):RunRecord=>contract('RunRecord',{
  runRef:{type:'abh.run' as const,id,version:1},resourceOrganizationId:org,
  missionRef:{type:'abh.mission' as const,id:missionId,version:1},triggerKey,goalRevision:1,stopEpoch:0,
  progressBudgetSeconds:1,progressDeadline:deadline,workflowRef:workflow,assignmentSnapshotRef:ref('abh.artifact'),
  executionMode:'Production' as const,status:'Running' as const,createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 const task=(id:string,run:RunRecord,status:TaskRecord['status'],nodeKey:string):TaskRecord=>contract('TaskRecord',{
  taskRef:{type:'abh.task' as const,id,version:1},resourceOrganizationId:org,runRef:run.runRef,nodeKey,kind:'Compute',
  inputRefs:[ref('abh.artifact')],status,required:true,attemptOrdinal:1,createdAt:now,updatedAt:now});
 const invocation=(id:string,parentTask:TaskRecord,status:InvocationRecord['status']):InvocationRecord=>contract('InvocationRecord',{
  invocationRef:{type:'abh.invocation' as const,id,version:1},resourceOrganizationId:org,runRef:parentTask.runRef,
  taskRef:parentTask.taskRef,attemptOrdinal:1,taskSpecDigest:`sha256:${'0'.repeat(64)}`,taskSpec,
  principalRef:principal,status,createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 const activeRunId=randomUUID(),stalledRunId=randomUUID(),secondStalledRunId=randomUUID();
 const activeRun=run(activeRunId,future,'stall.active'),stalledRun=run(stalledRunId,past,'stall.expired'),
   secondStalledRun=run(secondStalledRunId,past,'stall.worker');
 const readyTask=task(randomUUID(),stalledRun,'Ready','stall.ready'),
   runningTask=task(randomUUID(),stalledRun,'Running','stall.running'),
   workerTask=task(randomUUID(),secondStalledRun,'Ready','stall.worker');
 const createdInvocation=invocation(randomUUID(),readyTask,'Created'),
   runningInvocation=invocation(randomUUID(),runningTask,'Running');
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('MissionController')`INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,goal_revision,status,stop_epoch)
   VALUES (${org},${missionId},NULL,${['abh.mission.manage']},${JSON.stringify(mission(stalledRun.runRef))}::text::jsonb,1,'Active',0)`;
 });
 for(const value of [activeRun,stalledRun,secondStalledRun])await f.admin`
  INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,
   goal_revision,stop_epoch,progress_budget_seconds,progress_deadline,created_by,updated_by)
  VALUES (${org},${value.runRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(value)}::text::jsonb,
   ${missionId},${value.triggerKey},${value.status},1,0,${value.progressBudgetSeconds},${value.progressDeadline},
   ${c.tenant.actor.id},${c.tenant.actor.id})`;
 for(const value of [readyTask,runningTask,workerTask])await f.admin`
  INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
  VALUES (${org},${value.taskRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(value)}::text::jsonb,
   ${value.runRef.id},${value.nodeKey},${value.status},${c.tenant.actor.id},${c.tenant.actor.id})`;
 for(const value of [createdInvocation,runningInvocation])await f.admin`
  INSERT INTO core.invocations(resource_organization_id,id,workspace_id,purpose_names,record,run_id,task_id,attempt_ordinal,
   task_spec_digest,status,created_by,updated_by)
  VALUES (${org},${value.invocationRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(value)}::text::jsonb,
   ${value.runRef.id},${value.taskRef.id},${value.attemptOrdinal},${value.taskSpecDigest},${value.status},
   ${c.tenant.actor.id},${c.tenant.actor.id})`;
 const discovered=await f.database.transaction(c,options(),tx=>new RunOwner().stalledRuns(tx));
 assert.deepEqual(discovered.map(value=>value.id).sort(),[secondStalledRunId,stalledRunId].sort());
 const command=(runRef:EntityRef&{type:'abh.run'},version=runRef.version,idempotencyKey:UUID=randomUUID()):StopStalledRunCommand=>
  contract('StopStalledRunCommand',{type:'abh.runs.stop-stalled',schemaVersion:'0.1.0',commandId:randomUUID(),
   idempotencyKey,target:{type:'abh.run',id:runRef.id},expectedVersion:version,
   payload:{runRef:{...runRef,version},causeRef:ref('abh.artifact')}});
 await assert.rejects(stopStalledRun(f.database,c,options(),command(stalledRun.runRef,2),[grant.grantRef]),
  {code:'VERSION_CONFLICT'});
 const staleCommand=command(stalledRun.runRef,1);
 const stopped=await stopStalledRun(f.database,c,options(),staleCommand,[grant.grantRef]);
 assert.equal(stopped.status,'Failed');assert.equal(stopped.stopReason,'NoProgress');
 assert.equal(stopped.runRef.version,2);
 assert.deepEqual(await stopStalledRun(f.database,c,options(),staleCommand,[grant.grantRef]),stopped);
 const [runAfter]=await f.admin`SELECT version,status,record FROM core.runs WHERE id=${stalledRunId}`;
 assert.deepEqual({version:Number(runAfter!.version),status:runAfter!.status},{version:2,status:'Failed'});
 assert.equal(contract('RunRecord',runAfter!.record).stopReason,'NoProgress');
 const invocations=await f.admin`SELECT record,status FROM core.invocations WHERE run_id=${stalledRunId} ORDER BY id`;
 assert.deepEqual(invocations.map(row=>[row.status,contract('InvocationRecord',row.record).stopReason]),
  [['Cancelled','Deadline'],['Cancelled','Deadline']]);
 const tasks=await f.admin`SELECT record,status FROM core.tasks WHERE run_id=${stalledRunId} ORDER BY id`;
 assert.deepEqual(tasks.map(row=>row.status),['Cancelled','Cancelled']);
 const missionAfter=await f.admin`SELECT record,stop_epoch FROM core.missions WHERE id=${missionId}`;
 const missionRecord=contract('MissionRecord',missionAfter[0]!.record);
 assert.equal(missionRecord.activeRunRef,undefined);assert.equal(missionRecord.stopEpoch,1);
 assert.equal(Number(missionAfter[0]!.stop_epoch),1);
 const ledger=await f.admin`SELECT
  (SELECT count(*)::int FROM data.audit_records WHERE record->>'action'='abh.runs.stop-stalled') AS audits,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.run.stalled') AS runs,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.task.cancelled') AS tasks,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.invocation.completed') AS invocations`;
 assert.deepEqual(ledger[0],{audits:5,runs:1,tasks:2,invocations:2});
 const workerPage=await new Promise<{scanned:number;stopped:number}>((resolve,reject)=>{
  const controller=new AbortController();
  void runRunStallWorker(f.database,{workerId,context:async()=>c,grantRefs:[grant.grantRef],signal:controller.signal,
   intervalMs:1000,transactionTimeoutMs:10000,
   onPage:async result=>{controller.abort();resolve(result);}}).catch(reject);
 });
 assert.deepEqual(workerPage,{scanned:1,stopped:1});
 const [workerRun]=await f.admin`SELECT version,status FROM core.runs WHERE id=${secondStalledRunId}`;
 const [workerTaskAfter]=await f.admin`SELECT status FROM core.tasks WHERE id=${workerTask.taskRef.id}`;
 assert.deepEqual({version:Number(workerRun!.version),status:workerRun!.status},{version:2,status:'Failed'});
 assert.equal(workerTaskAfter!.status,'Cancelled');
 const [activeAfter]=await f.admin`SELECT version,status FROM core.runs WHERE id=${activeRunId}`;
 assert.deepEqual({version:Number(activeAfter!.version),status:activeAfter!.status},{version:1,status:'Running'});
});
