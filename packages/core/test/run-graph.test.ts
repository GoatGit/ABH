import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import type {GrantRecord,ProposeGraphPatchCommand,RunRecord} from '@abh/contracts';
import {contract} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {proposeGraphPatch} from '../src/mission/run-commands.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});
const workflow={kind:'Workflow' as const,id:'graph.workflow',version:'1.0.0',digest:`sha256:${'0'.repeat(64)}`};

test('Run graph patches validate dependencies, fence stale bases, and replay stably',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const base=context(),org=base.tenant.resourceOrganizationId,serviceId=randomUUID();
 const c=deriveVerifiedContext({...base.request,actor:{type:'Service' as const,id:serviceId},
  purposeOfUse:'abh.runtime.deliver' as const});
 const scope={type:'abh.organization' as const,id:org,version:1};
 const principal={type:'abh.principal' as const,id:serviceId,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.graph-patches.propose'],purposeNames:['abh.runtime.deliver' as const],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'}) satisfies GrantRecord;
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
   VALUES (${org},${org},'Run graph fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
   VALUES (${org},${serviceId},'Graph coordinator','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
   VALUES (${org},${randomUUID()},${serviceId},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
   VALUES (${org},${grant.grantRef.id},${serviceId},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')`
   INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
   VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const now=new Date().toISOString(),runId=randomUUID();
 const run=contract('RunRecord',{runRef:{type:'abh.run' as const,id:runId,version:1},resourceOrganizationId:org,
  missionRef:{type:'abh.mission' as const,id:randomUUID(),version:1},triggerKey:'graph.trigger',goalRevision:1,
  stopEpoch:0,progressBudgetSeconds:3600,progressDeadline:new Date(Date.now()+600_000).toISOString(),
  workflowRef:workflow,assignmentSnapshotRef:ref('abh.artifact'),executionMode:'Production' as const,
  status:'Running' as const,createdBy:c.tenant.actor,createdAt:now,updatedAt:now});
 await f.admin`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
  VALUES (${org},${runId},NULL,${['abh.mission.manage','abh.runtime.deliver']},${JSON.stringify(run)}::text::jsonb,
   ${run.missionRef.id},${run.triggerKey},${run.status},1,0,${c.tenant.actor.id},${c.tenant.actor.id})`;
 const node=(key:string,kind:'Agent'|'Compute'|'DomainCommand')=>({nodeKey:key,kind,inputRefs:[ref('abh.artifact')],required:true});
 const payload=(baseRevision:number,addEdges:{from:string;to:string}[],supersedePendingNodes:string[]=[],
  idempotencyKey=randomUUID(),addNodes=[node('graph.one','Compute'),node('graph.two','Agent')]):ProposeGraphPatchCommand=>contract('ProposeGraphPatchCommand',{
   type:'abh.graph-patches.propose',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey,
   target:{type:'abh.run',id:runId},expectedVersion:1,
   payload:{runRef:{...run.runRef},baseRevision,
    addNodes,
    addEdges,supersedePendingNodes,rationaleRef:ref('abh.artifact')}});
 const first=payload(0,[{from:'graph.one',to:'graph.two'}]);
 await assert.rejects(proposeGraphPatch(f.database,c,options(),payload(9,[]),[grant.grantRef]),{code:'PRECONDITION_FAILED'});
 await assert.rejects(proposeGraphPatch(f.database,c,options(),payload(0,[
  {from:'graph.one',to:'graph.two'},{from:'graph.two',to:'graph.one'}]),[grant.grantRef]),{code:'INVALID_ARGUMENT'});
 const [before]=await f.admin`SELECT count(*)::int AS count FROM core.graph_revisions WHERE run_id=${runId}`;
 assert.equal(before!.count,0);
 const revision=await proposeGraphPatch(f.database,c,options(),first,[grant.grantRef]);
 assert.equal(revision.revision,1);assert.equal(revision.nodes.length,2);assert.equal(revision.edges.length,1);
 assert.deepEqual(await proposeGraphPatch(f.database,c,options(),first,[grant.grantRef]),revision);
 const [materialized]=await f.admin`SELECT id,record FROM core.tasks
  WHERE run_id=${runId} AND node_key='graph.one'`;
 const readyTask=contract('TaskRecord',materialized!.record);
 assert.equal(readyTask.status,'Ready');
 const runningTask=contract('TaskRecord',{...readyTask,status:'Running',
  taskRef:{...readyTask.taskRef,version:readyTask.taskRef.version+1}});
 await f.admin`UPDATE core.tasks SET version=${runningTask.taskRef.version},status='Running',
  record=${JSON.stringify(runningTask)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
  WHERE resource_organization_id=${org} AND id=${runningTask.taskRef.id} AND version=${readyTask.taskRef.version}`;
 await assert.rejects(proposeGraphPatch(f.database,c,options(),payload(1,[],['graph.one']),[grant.grantRef]),
  {code:'PRECONDITION_FAILED'});
 const pendingTask=contract('TaskRecord',{...runningTask,status:'Pending',
  taskRef:{...runningTask.taskRef,version:runningTask.taskRef.version+1}});
 await f.admin`UPDATE core.tasks SET version=${pendingTask.taskRef.version},status='Pending',
  record=${JSON.stringify(pendingTask)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
  WHERE resource_organization_id=${org} AND id=${pendingTask.taskRef.id} AND version=${runningTask.taskRef.version}`;
 await proposeGraphPatch(f.database,c,options(),payload(1,[],['graph.one'],randomUUID(),[]),[grant.grantRef]);
 const [ledger]=await f.admin`SELECT
  (SELECT count(*)::int FROM data.audit_records WHERE record->>'action'='abh.graph-patches.propose') AS audits,
 (SELECT count(*)::int FROM data.outbox WHERE aggregate_type='abh.graph-revision') AS events`;
 assert.deepEqual(ledger,{audits:5,events:2});
 const [taskLedger]=await f.admin`SELECT
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.task.ready') AS ready,
  (SELECT count(*)::int FROM data.outbox WHERE record->>'type'='abh.task.skipped') AS skipped,
  (SELECT status FROM core.tasks WHERE run_id=${runId} AND node_key='graph.one') AS superseded,
  (SELECT status FROM core.tasks WHERE run_id=${runId} AND node_key='graph.two') AS downstream`;
 assert.deepEqual(taskLedger,{ready:2,skipped:1,superseded:'Skipped',downstream:'Ready'});
});
