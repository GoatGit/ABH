import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {ClaimTaskCommand,CommitVerifiedTaskCommand,CompleteInvocationCommand,EntityRef,FinalizeInvocationCommand,
  GrantRecord,PrepareInvocationCommand,RunRecord,TaskRecord,UUID} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {contract,inputDigest} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {claimTask,commitVerifiedTask,completeInvocation,finalizeInvocation,observeLateInvocation,prepareInvocation} from '../src/mission/run-commands.ts';
import {RunOwner} from '../src/mission/runs.ts';
import {runReadyTaskWorker} from '../src/mission/run-task-worker.ts';
import {VerificationOwner} from '../src/mission/verification.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';

const ref=(type:string):EntityRef=>({type,id:randomUUID(),version:1});
const newArtifactRef=():EntityRef&{type:'abh.artifact'}=>({type:'abh.artifact',id:randomUUID(),version:1});
const digest=async(value:unknown)=>'sha256:'+(await digestBytes(new TextEncoder().encode(canonicalJson(value)))).slice(7);
const workflow={kind:'Workflow' as const,id:'execution.workflow',version:'1.0.0',digest:`sha256:${'0'.repeat(64)}`};

test('Run execution claims, assembles, verifies, checkpoints and dispatches a Task Graph',{timeout:180_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const base=context(),org=base.tenant.resourceOrganizationId,serviceId=randomUUID(),runId=randomUUID();
 const c=deriveVerifiedContext({...base.request,actor:{type:'Service' as const,id:serviceId},purposeOfUse:'abh.runtime.deliver' as const});
 const scope={type:'abh.organization' as const,id:org,version:1},principal={type:'abh.principal' as const,id:serviceId,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.tasks.claim','abh.invocations.prepare','abh.invocations.finalize',
   'abh.invocations.complete','abh.invocations.observe-late','abh.tasks.commit-verified'],purposeNames:['abh.runtime.deliver' as const],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+120_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'}) satisfies GrantRecord;
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
   VALUES (${org},${org},'Run execution fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
   VALUES (${org},${serviceId},'Task worker','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
   VALUES (${org},${randomUUID()},${serviceId},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
   VALUES (${org},${grant.grantRef.id},${serviceId},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`
   INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
   VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const now=new Date().toISOString();
 const run=contract('RunRecord',{runRef:{type:'abh.run' as const,id:runId,version:1},resourceOrganizationId:org,
  missionRef:{type:'abh.mission' as const,id:randomUUID(),version:1},triggerKey:'execution.trigger',goalRevision:1,
  stopEpoch:0,progressBudgetSeconds:3600,progressDeadline:new Date(Date.now()+600_000).toISOString(),
  workflowRef:workflow,assignmentSnapshotRef:ref('abh.artifact'),executionMode:'Production' as const,
  status:'Running' as const,createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 const graphRef={type:'abh.graph-revision' as const,id:randomUUID(),version:1};
 await f.admin`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
  VALUES (${org},${runId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(run)}::text::jsonb,
   ${run.missionRef.id},${run.triggerKey},${run.status},1,0,${c.tenant.actor.id},${c.tenant.actor.id})`;
 const task=(key:'execution.one'|'execution.two',status:TaskRecord['status']):TaskRecord=>contract('TaskRecord',{
  taskRef:{type:'abh.task' as const,id:randomUUID(),version:1},resourceOrganizationId:org,runRef:run.runRef,
  nodeKey:key,kind:key==='execution.one'?'Compute':'Agent',inputRefs:[ref('abh.artifact')],status,required:true,
  attemptOrdinal:1,createdAt:now,updatedAt:now});
 const first=task('execution.one','Ready'),second=task('execution.two','Pending');
 const revision=contract('GraphRevisionRecord',{revisionRef:graphRef,resourceOrganizationId:org,runRef:run.runRef,
  baseRevision:0,revision:1,patchDigest:await digest({runId}),proposerRef:principal,
  nodes:[{nodeKey:'execution.one',kind:'Compute',inputRefs:first.inputRefs,required:true},
   {nodeKey:'execution.two',kind:'Agent',inputRefs:first.inputRefs,required:true}],
  edges:[{from:'execution.one',to:'execution.two'}],supersededNodeKeys:[],rationaleRef:ref('abh.artifact'),
  createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 await f.admin`INSERT INTO core.graph_revisions(resource_organization_id,id,workspace_id,purpose_names,record,run_id,revision,base_revision,patch_digest,created_by,updated_by)
  VALUES (${org},${graphRef.id},NULL,${['abh.runtime.deliver']},${JSON.stringify(revision)}::text::jsonb,${runId},1,0,${revision.patchDigest},${c.tenant.actor.id},${c.tenant.actor.id})`;
 for(const value of [first,second])await f.admin`INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
  VALUES (${org},${value.taskRef.id},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(value)}::text::jsonb,
   ${runId},${value.nodeKey},${value.status},${c.tenant.actor.id},${c.tenant.actor.id})`;

 const taskRef=()=>f.admin`SELECT record,version,status FROM core.tasks WHERE id=${first.taskRef.id}`;
 const ready=await f.database.transaction(c,options(),tx=>new RunOwner().readyTasks(tx));
 assert.deepEqual(ready,[first.taskRef]);
 const claim=(workerId:string,idempotencyKey:UUID=randomUUID()):ClaimTaskCommand=>contract('ClaimTaskCommand',{
  type:'abh.tasks.claim',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
  target:{type:'abh.task',id:first.taskRef.id},expectedVersion:first.taskRef.version,
  payload:{taskRef:first.taskRef,workerId,leaseSeconds:workerId===workerA?1:10}});
 const workerA:UUID=randomUUID(),workerB:UUID=randomUUID();
 const oldLease=await claimTask(f.database,c,options(),claim(workerA),[grant.grantRef]);
 assert.equal(oldLease.fencingToken,1);
 await new Promise(resolve=>setTimeout(resolve,1100));
 const currentLeaseCommand=claim(workerB);
 const currentLease=await claimTask(f.database,c,options(),currentLeaseCommand,[grant.grantRef]);
 assert.equal(currentLease.fencingToken,2);
 const taskSpec={goal:'Produce the verified first node output',inputRefs:first.inputRefs,
  outputSchemaRef:ref('abh.schema'),resourceLimits:{tokens:'1200'}};
 const prepare=(lease=currentLease,idempotencyKey:UUID=randomUUID()):PrepareInvocationCommand=>contract('PrepareInvocationCommand',{
  type:'abh.invocations.prepare',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
  target:{type:'abh.task',id:first.taskRef.id},expectedVersion:first.taskRef.version,
  payload:{taskRef:first.taskRef,leaseRef:lease.leaseRef,workerId:lease.workerId,
   leaseFencingToken:lease.fencingToken,taskSpec,identityBasisRefs:[scope,principal]}});
 await assert.rejects(()=>prepareInvocation(f.database,c,options(),prepare(oldLease),[grant.grantRef]),{code:'PRECONDITION_FAILED'});
 const prepareCommand=prepare(currentLease);
 const invocation=await prepareInvocation(f.database,c,options(),prepareCommand,[grant.grantRef]);
 assert.equal(invocation.status,'Created');assert.equal(invocation.attemptOrdinal,1);
 const manifestRef=ref('abh.artifact'),bindingRefs=[ref('abh.tool-binding')];
 const expectedDigest=await digest({taskSpecDigest:invocation.taskSpecDigest,manifestRef,bindingRefs});
 const finalize=(idempotencyKey:UUID=randomUUID()):FinalizeInvocationCommand=>contract('FinalizeInvocationCommand',{
  type:'abh.invocations.finalize',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
  target:{type:'abh.invocation',id:invocation.invocationRef.id},expectedVersion:invocation.invocationRef.version,
  payload:{invocationRef:invocation.invocationRef,leaseRef:currentLease.leaseRef,workerId:currentLease.workerId,
   leaseFencingToken:currentLease.fencingToken,manifestRef,bindingRefs,contractDigest:expectedDigest}});
 const finalizeCommand=finalize();
 const running=await finalizeInvocation(f.database,c,options(),finalizeCommand,[grant.grantRef]);
 assert.equal(running.status,'Running');assert.deepEqual(running.bindingRefs,bindingRefs);
 let taskRow=await taskRef();
 assert.equal(taskRow[0]!.status,'Running');assert.equal(Number(taskRow[0]!.version),2);
 const artifactRef={type:'abh.artifact' as const,id:randomUUID(),version:1};
 const complete=(idempotencyKey:UUID=randomUUID()):CompleteInvocationCommand=>contract('CompleteInvocationCommand',{
  type:'abh.invocations.complete',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
  target:{type:'abh.invocation',id:running.invocationRef.id},expectedVersion:running.invocationRef.version,
  payload:{invocationRef:running.invocationRef,leaseRef:currentLease.leaseRef,workerId:currentLease.workerId,
   leaseFencingToken:currentLease.fencingToken,stopReason:'Completed',resultArtifactRef:artifactRef,usageRef:ref('abh.reservation')}});
 const completeCommand=complete();
 const succeeded=await completeInvocation(f.database,c,options(),completeCommand,[grant.grantRef]);
 assert.equal(succeeded.status,'Succeeded');
taskRow=await taskRef();assert.equal(taskRow[0]!.status,'Verifying');
 const verificationCommand={type:'abh.verification.submit',commandId:randomUUID(),idempotencyKey:randomUUID(),
  digest:await inputDigest({taskRef:first.taskRef,invocationRef:running.invocationRef})};
 await f.database.transaction(c,options(),tx=>new VerificationOwner().submit(tx,verificationCommand,{
  taskRef:{...first.taskRef,version:3},invocationRef:running.invocationRef,resultArtifactRef:artifactRef,verdict:'Pass'}));
 const commit=(idempotencyKey:UUID=randomUUID()):CommitVerifiedTaskCommand=>contract('CommitVerifiedTaskCommand',{
  type:'abh.tasks.commit-verified',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
  target:{type:'abh.task',id:first.taskRef.id},expectedVersion:3,
  payload:{taskRef:{...first.taskRef,version:3},invocationRef:running.invocationRef,
   verificationRef:{type:'abh.verification-report',id:randomUUID(),version:1},domainCommandReceiptRefs:[ref('abh.command')]}});
 await assert.rejects(commitVerifiedTask(f.database,c,options(),commit(),[grant.grantRef]),{code:'PRECONDITION_FAILED'});
 const [report]=await f.admin`SELECT id FROM core.verification_reports WHERE task_id=${first.taskRef.id}`;
 const validCommitCommand=contract('CommitVerifiedTaskCommand',{
  type:'abh.tasks.commit-verified',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.task',id:first.taskRef.id},expectedVersion:3,
  payload:{taskRef:{...first.taskRef,version:3},invocationRef:running.invocationRef,
   verificationRef:{type:'abh.verification-report',id:String(report!.id),version:1},
   domainCommandReceiptRefs:[ref('abh.command')]}});
 const checkpoint=await commitVerifiedTask(f.database,c,options(),validCommitCommand,[grant.grantRef]);
 assert.equal(checkpoint.sequence,1);assert.equal(checkpoint.completedTaskRefs.length,1);
 taskRow=await taskRef();assert.equal(taskRow[0]!.status,'Succeeded');
 const [runAfterCheckpoint]=await f.admin`
  SELECT progress_deadline,record FROM core.runs WHERE id=${runId}`;
 const runRecordAfterCheckpoint=contract('RunRecord',runAfterCheckpoint!.record);
 assert.ok(Date.parse(runRecordAfterCheckpoint.progressDeadline)>Date.parse(run.progressDeadline));
 assert.ok(Math.abs(Date.parse(runAfterCheckpoint!.progress_deadline)
   -Date.parse(runRecordAfterCheckpoint.progressDeadline))<1000);
 const [downstream]=await f.admin`SELECT record FROM core.tasks WHERE id=${second.taskRef.id}`;
 assert.equal(contract('TaskRecord',downstream!.record).status,'Ready');

 assert.deepEqual(await claimTask(f.database,c,options(),currentLeaseCommand,[grant.grantRef]),currentLease);
 assert.deepEqual(await prepareInvocation(f.database,c,options(),prepareCommand,[grant.grantRef]),succeeded);
 assert.deepEqual(await finalizeInvocation(f.database,c,options(),finalizeCommand,[grant.grantRef]),succeeded);
 assert.deepEqual(await completeInvocation(f.database,c,options(),completeCommand,[grant.grantRef]),succeeded);
 assert.deepEqual(await commitVerifiedTask(f.database,c,options(),validCommitCommand,[grant.grantRef]),checkpoint);
 const ledger=await f.admin`SELECT
  (SELECT count(*)::int FROM data.audit_records WHERE record->>'action'='abh.invocations.finalize') AS finalizeAudits,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.invocation.running') AS runningEvents,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.task.ready') AS readyEvents,
  (SELECT count(*)::int FROM core.checkpoints WHERE run_id=${runId}) AS checkpoints`;
 assert.deepEqual(ledger[0],{finalizeaudits:2,runningevents:1,readyevents:1,checkpoints:1});

 const workerResult=newArtifactRef(),workerUsageId=ref('abh.reservation'),workerId=randomUUID();
 const workerPage=await new Promise<{scanned:number;claimed:number;completed:number;unknown:number}>((resolve,reject)=>{
  const controller=new AbortController();
  void runReadyTaskWorker(f.database,{
   workerId,context:async()=>c,grantRefs:[grant.grantRef],signal:controller.signal,
   leaseSeconds:30,intervalMs:1000,transactionTimeoutMs:10000,
   plan:async()=>({taskSpec:{goal:'Worker executed downstream task',inputRefs:second.inputRefs,
     outputSchemaRef:ref('abh.schema'),resourceLimits:{tokens:'800'}},
    manifestRef:newArtifactRef(),bindingRefs:[ref('abh.tool-binding')],identityBasisRefs:[scope,principal]}),
   executor:{execute:async context=>{
    assert.equal(context.task.taskRef.id,second.taskRef.id);
    assert.equal(context.invocation.status,'Running');
    return {kind:'Completed' as const,resultArtifactRef:workerResult,usageRef:workerUsageId};
   }},
   onPage:async result=>{controller.abort();resolve(result);},
  }).catch(reject);
 });
 assert.deepEqual(workerPage,{scanned:1,claimed:1,completed:1,unknown:0});
 const [workerInvocation]=await f.admin`SELECT record FROM core.invocations WHERE task_id=${second.taskRef.id}`;
 assert.equal(contract('InvocationRecord',workerInvocation!.record).status,'Succeeded');
 const [workerTask]=await f.admin`SELECT record,status FROM core.tasks WHERE id=${second.taskRef.id}`;
 assert.equal(workerTask!.status,'Verifying');
 assert.equal(contract('TaskRecord',workerTask!.record).status,'Verifying');

 const unknownTaskId=randomUUID(),unknownRun={type:'abh.run' as const,id:runId,version:1};
 const unknownTask=contract('TaskRecord',{taskRef:{type:'abh.task',id:unknownTaskId,version:1},
  resourceOrganizationId:org,runRef:unknownRun,nodeKey:'execution.unknown',kind:'Compute',inputRefs:[ref('abh.artifact')],
  status:'Ready',required:false,attemptOrdinal:1,createdAt:now,updatedAt:now});
 await f.admin`INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
  VALUES (${org},${unknownTaskId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(unknownTask)}::text::jsonb,
   ${runId},'execution.unknown','Ready',${c.tenant.actor.id},${c.tenant.actor.id})`;
 const unknownPage=await new Promise<{scanned:number;claimed:number;completed:number;unknown:number}>((resolve,reject)=>{
  const controller=new AbortController();
  void runReadyTaskWorker(f.database,{
   workerId,context:async()=>c,grantRefs:[grant.grantRef],signal:controller.signal,
   leaseSeconds:30,intervalMs:1000,transactionTimeoutMs:10000,
   plan:async()=>({taskSpec:{goal:'Ambiguous external effect'},manifestRef:newArtifactRef(),
    bindingRefs:[],identityBasisRefs:[scope,principal]}),
   executor:{execute:async()=>({kind:'Unknown' as const,observationRef:newArtifactRef()})},
   onPage:async result=>{controller.abort();resolve(result);},
  }).catch(reject);
 });
 assert.deepEqual(unknownPage,{scanned:1,claimed:1,completed:0,unknown:1});
 const [unknownInvocation]=await f.admin`SELECT record FROM core.invocations WHERE task_id=${unknownTaskId}`;
 assert.equal(contract('InvocationRecord',unknownInvocation!.record).status,'Running');
 const [unknownTaskRow]=await f.admin`SELECT status FROM core.tasks WHERE id=${unknownTaskId}`;
 assert.equal(unknownTaskRow!.status,'Running');

 const activeInterrupted=await f.database.transaction(c,options(),tx=>new RunOwner().interruptedTasks(tx));
 assert.deepEqual(activeInterrupted,[]);
 const oldInvocation=contract('InvocationRecord',unknownInvocation!.record);
 const [leaseRow]=await f.admin`SELECT record FROM runtime.work_leases
  WHERE resource_organization_id=${org} AND target_type='abh.task' AND target_id=${unknownTaskId}`;
 const expiredLeaseRecord=contract('WorkLeaseRecord',leaseRow!.record);
 expiredLeaseRecord.leaseRef={...expiredLeaseRecord.leaseRef,version:expiredLeaseRecord.leaseRef.version};
 await assert.rejects(observeLateInvocation(f.database,c,options(),contract('ObserveLateInvocationCommand',{
  type:'abh.invocations.observe-late',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.invocation',id:oldInvocation.invocationRef.id},
  payload:{invocationRef:oldInvocation.invocationRef,leaseRef:expiredLeaseRecord.leaseRef,workerId,
   leaseFencingToken:1,stopReason:'Completed',resultArtifactRef:newArtifactRef()}}),[grant.grantRef]),
   {code:'PRECONDITION_FAILED'});
 const expiredAt=new Date(Date.now()-1000);
 expiredLeaseRecord.leaseUntil=expiredAt.toISOString();
 await f.admin`UPDATE runtime.work_leases SET lease_until=${expiredAt}
  ,record=${JSON.stringify(expiredLeaseRecord)}::text::jsonb
  WHERE resource_organization_id=${org} AND target_type='abh.task' AND target_id=${unknownTaskId}`;
 const lateArtifact=newArtifactRef(),lateUsageId=ref('abh.reservation');
 const latePayload={invocationRef:oldInvocation.invocationRef,
  leaseRef:expiredLeaseRecord.leaseRef,workerId,leaseFencingToken:1,
  stopReason:'Completed' as const,resultArtifactRef:lateArtifact,usageRef:lateUsageId};
 const lateComplete=contract('CompleteInvocationCommand',{
  type:'abh.invocations.complete',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.invocation',id:oldInvocation.invocationRef.id},expectedVersion:oldInvocation.invocationRef.version,
  payload:latePayload});
 await assert.rejects(completeInvocation(f.database,c,options(),lateComplete,[grant.grantRef]),
   {code:'PRECONDITION_FAILED'});
 const recoveryResult=newArtifactRef();
 const recoveryPage=await new Promise<{scanned:number;claimed:number;completed:number;unknown:number}>((resolve,reject)=>{
  const controller=new AbortController();
  void runReadyTaskWorker(f.database,{
   workerId,context:async()=>c,grantRefs:[grant.grantRef],signal:controller.signal,
   leaseSeconds:30,intervalMs:1000,transactionTimeoutMs:10000,
   plan:async()=>({taskSpec:{goal:'Recovered after lease expiry'},manifestRef:newArtifactRef(),
    bindingRefs:[],identityBasisRefs:[scope,principal]}),
   executor:{execute:async context=>{
    assert.equal(context.task.taskRef.id,unknownTaskId);
    assert.equal(context.task.attemptOrdinal,2);
    return {kind:'Completed' as const,resultArtifactRef:recoveryResult};
   }},
   onPage:async result=>{controller.abort();resolve(result);},
  }).catch(reject);
 });
 assert.deepEqual(recoveryPage,{scanned:1,claimed:1,completed:1,unknown:0});
 const [oldAfterRecovery]=await f.admin`SELECT record,version,status FROM core.invocations WHERE id=${oldInvocation.invocationRef.id}`;
 const oldRecord=contract('InvocationRecord',oldAfterRecovery!.record);
 assert.equal(oldAfterRecovery!.status,'Cancelled');assert.equal(oldRecord.status,'Cancelled');
 assert.equal(oldRecord.stopReason,'Deadline');
 const [newInvocation]=await f.admin`SELECT record,status FROM core.invocations WHERE task_id=${unknownTaskId}
  AND attempt_ordinal=2`;
 assert.equal(newInvocation!.status,'Succeeded');
 assert.equal(contract('InvocationRecord',newInvocation!.record).attemptOrdinal,2);
 const [recoveredTask]=await f.admin`SELECT record,status FROM core.tasks WHERE id=${unknownTaskId}`;
 assert.equal(recoveredTask!.status,'Verifying');
 assert.equal(contract('TaskRecord',recoveredTask!.record).attemptOrdinal,2);

 const lateCommand=contract('ObserveLateInvocationCommand',{
  type:'abh.invocations.observe-late',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.invocation',id:oldInvocation.invocationRef.id},payload:latePayload});
 const observation=await observeLateInvocation(f.database,c,options(),lateCommand,[grant.grantRef]);
 assert.equal(observation.status,'Observed');assert.equal(observation.stopReason,'Completed');
 assert.deepEqual(observation.resultArtifactRef,lateArtifact);
 const [observationRow]=await f.admin`SELECT record,version,status FROM core.invocation_observations
  WHERE invocation_id=${oldInvocation.invocationRef.id}`;
 assert.equal(observationRow!.status,'Observed');
 assert.deepEqual(contract('LateInvocationObservationRecord',observationRow!.record),observation);
 const [oldInvocationAfterObservation]=await f.admin`SELECT record,status FROM core.invocations
  WHERE id=${oldInvocation.invocationRef.id}`;
 assert.equal(oldInvocationAfterObservation!.status,'Cancelled');
 assert.equal(contract('InvocationRecord',oldInvocationAfterObservation!.record).resultArtifactRef,undefined);
 const [taskAfterObservation]=await f.admin`SELECT record,status FROM core.tasks WHERE id=${unknownTaskId}`;
 assert.equal(taskAfterObservation!.status,'Verifying');
 const observationCount=await f.admin`SELECT count(*)::int AS count FROM core.invocation_observations
  WHERE invocation_id=${oldInvocation.invocationRef.id}`;
 assert.equal(observationCount[0]!.count,1);
 const [rejectedRow]=await f.admin`SELECT record FROM core.invocation_adjudications
  WHERE invocation_id=${oldInvocation.invocationRef.id}`;
 const rejected=contract('LateInvocationAdjudicationRecord',rejectedRow!.record);
 assert.equal(rejected.decision,'Rejected');assert.equal(rejected.reason,'TaskAlreadyAdvanced');

 const adoptTaskId=randomUUID(),adoptTaskRef={type:'abh.task' as const,id:adoptTaskId,version:1};
 const adoptTask=contract('TaskRecord',{taskRef:adoptTaskRef,resourceOrganizationId:org,runRef:unknownRun,
  nodeKey:'execution.adopt',kind:'Compute',inputRefs:[ref('abh.artifact')],status:'Ready',required:false,
  attemptOrdinal:1,createdAt:now,updatedAt:now});
 await f.admin`INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
  VALUES (${org},${adoptTaskId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(adoptTask)}::text::jsonb,
   ${runId},'execution.adopt','Ready',${c.tenant.actor.id},${c.tenant.actor.id})`;
 const adoptClaimPayload={taskRef:adoptTaskRef,workerId,leaseSeconds:30};
 const adoptLease=await claimTask(f.database,c,options(),contract('ClaimTaskCommand',{
  type:'abh.tasks.claim',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.task',id:adoptTaskId},expectedVersion:1,payload:adoptClaimPayload}),[grant.grantRef]);
 const adoptSpec={goal:'Adopt completed late evidence',inputRefs:adoptTask.inputRefs,
  outputSchemaRef:ref('abh.schema'),resourceLimits:{tokens:'100'}};
 const adoptCreated=await prepareInvocation(f.database,c,options(),contract('PrepareInvocationCommand',{
  type:'abh.invocations.prepare',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.task',id:adoptTaskId},expectedVersion:1,
  payload:{taskRef:adoptTaskRef,leaseRef:adoptLease.leaseRef,workerId,
   leaseFencingToken:adoptLease.fencingToken,taskSpec:adoptSpec,identityBasisRefs:[scope,principal]}}),[grant.grantRef]);
 const adoptManifest=ref('abh.artifact'),adoptBindings=[ref('abh.tool-binding')];
 const adoptDigest=await digest({taskSpecDigest:adoptCreated.taskSpecDigest,manifestRef:adoptManifest,bindingRefs:adoptBindings});
 const adoptRunning=await finalizeInvocation(f.database,c,options(),contract('FinalizeInvocationCommand',{
  type:'abh.invocations.finalize',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.invocation',id:adoptCreated.invocationRef.id},expectedVersion:1,
  payload:{invocationRef:adoptCreated.invocationRef,leaseRef:adoptLease.leaseRef,workerId,
   leaseFencingToken:adoptLease.fencingToken,manifestRef:adoptManifest,bindingRefs:adoptBindings,
   contractDigest:adoptDigest}}),[grant.grantRef]);
 const [adoptLeaseRow]=await f.admin`SELECT record FROM runtime.work_leases
  WHERE resource_organization_id=${org} AND target_type='abh.task' AND target_id=${adoptTaskId}`;
 const adoptExpired=contract('WorkLeaseRecord',adoptLeaseRow!.record);
 adoptExpired.leaseRef={...adoptExpired.leaseRef,version:adoptExpired.leaseRef.version};
 const adoptExpiredAt=new Date(Date.now()-1000);
 adoptExpired.leaseUntil=adoptExpiredAt.toISOString();
 await f.admin`UPDATE runtime.work_leases SET lease_until=${adoptExpiredAt}
  ,record=${JSON.stringify(adoptExpired)}::text::jsonb
  WHERE resource_organization_id=${org} AND target_type='abh.task' AND target_id=${adoptTaskId}`;
 const adoptArtifact=newArtifactRef();
 await observeLateInvocation(f.database,c,options(),contract('ObserveLateInvocationCommand',{
  type:'abh.invocations.observe-late',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.invocation',id:adoptRunning.invocationRef.id},
  payload:{invocationRef:adoptRunning.invocationRef,leaseRef:adoptExpired.leaseRef,workerId,
   leaseFencingToken:adoptLease.fencingToken,stopReason:'Completed',resultArtifactRef:adoptArtifact}}),[grant.grantRef]);
 const takeoverClaimPayload={...adoptClaimPayload,taskRef:{...adoptTaskRef,version:2}};
 const takeoverLease=await claimTask(f.database,c,options(),contract('ClaimTaskCommand',{
  type:'abh.tasks.claim',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
  target:{type:'abh.task',id:adoptTaskId},expectedVersion:2,payload:takeoverClaimPayload}),[grant.grantRef]);
 assert.equal(takeoverLease.fencingToken,2);
 const [adoptedInvocationRow]=await f.admin`SELECT record,status FROM core.invocations WHERE id=${adoptRunning.invocationRef.id}`;
 const adoptedInvocation=contract('InvocationRecord',adoptedInvocationRow!.record);
 assert.equal(adoptedInvocationRow!.status,'Succeeded');assert.equal(adoptedInvocation.status,'Succeeded');
 assert.deepEqual(adoptedInvocation.resultArtifactRef,adoptArtifact);
 const [adoptedTaskRow]=await f.admin`SELECT record,status FROM core.tasks WHERE id=${adoptTaskId}`;
 assert.equal(adoptedTaskRow!.status,'Verifying');
 assert.equal(contract('TaskRecord',adoptedTaskRow!.record).attemptOrdinal,1);
 const adoptAttempts=await f.admin`SELECT count(*)::int AS count FROM core.invocations WHERE task_id=${adoptTaskId}`;
 assert.equal(adoptAttempts[0]?.count,1);
 const [adoptedAdjudicationRow]=await f.admin`SELECT record FROM core.invocation_adjudications
  WHERE invocation_id=${adoptRunning.invocationRef.id}`;
 const adoptedAdjudication=contract('LateInvocationAdjudicationRecord',adoptedAdjudicationRow!.record);
 assert.equal(adoptedAdjudication.decision,'Adopted');assert.equal(adoptedAdjudication.reason,'CompletedEvidence');
 assert.equal(adoptedAdjudication.ownerFencingToken,2);
});
