import {randomUUID} from 'node:crypto';
import type {CancelRunPayload,CheckpointRecord,ClaimTaskPayload,CommitVerifiedTaskPayload,CompleteInvocationPayload,CompleteRunPayload,EntityRef,FinalizeInvocationPayload,GraphPatchEdge,GraphPatchNode,GraphRevisionRecord,InvocationRecord,LateInvocationAdjudicationRecord,LateInvocationObservationRecord,MissionRecord,ObserveLateInvocationPayload,PrepareInvocationPayload,ProposeGraphPatchPayload,RecoverRunPayload,RunRecord,StartRunPayload,StopStalledRunPayload,TaskRecord,WakeRunPayload,WorkLeaseRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,executeCommand,type CommandIdentity} from '../data/journal.ts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {DurableWaitOwner} from '../durable/waits.ts';

const missionPurposeNames=['abh.mission.manage'];
const runPurposeNames=['abh.mission.manage','abh.runtime.deliver'];

export interface RunRecoveryEffect {
  record:RunRecord;
  cancelledTasks:number;
  missionUpdated:boolean;
  replayed:boolean;
}

interface GraphValidation{nodes:GraphPatchNode[];edges:GraphPatchEdge[];superseded:string[]}

export interface PendingWakeRun{
 runRef:EntityRef&{type:'abh.run'};
 waitRef:EntityRef&{type:'abh.durable-wait'};
 wakeupRef:EntityRef&{type:'abh.durable-wakeup'};
}

/** Run Owner is exercised by Mission Controller commands in M0; public direct invocation arrives with HTTP wiring. */
export class RunOwner {
 async get(tx:TenantTransaction,id:string):Promise<RunRecord>{
  contract('UUID',id);const c=tx.context.tenant;
   const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(${runPurposeNames})`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('RunRecord',row.record);
  if(record.runRef.id!==id||record.resourceOrganizationId!==c.resourceOrganizationId||record.runRef.version!==Number(row.version)
   ||record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  return record;
 }
 async start(tx:TenantTransaction,command:CommandIdentity,input:StartRunPayload):Promise<RunRecord>{
  contract('StartRunPayload',structuredClone(input));const c=tx.context.tenant;
  if(input.missionRef.type!=='abh.mission')throw new CoreError('INVALID_ARGUMENT');
  if(input.authorityRef.type!=='abh.mission-authority')throw new CoreError('MISSION_AUTHORITY_MISSING');
  const [missionRow]=await tx.owner('MissionController')`SELECT record,version,status,goal_revision,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.missionRef.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!missionRow)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(missionRow.version)!==input.missionRef.version)throw new CoreError('VERSION_CONFLICT');
  if(missionRow.status!=='Active')throw new CoreError('PRECONDITION_FAILED');
  const mission=contract('MissionRecord',missionRow.record);
  if(mission.authorityRef?.id!==input.authorityRef.id||mission.authorityRef?.version!==input.authorityRef.version
    ||canonicalJson(mission.workflowRef)!==canonicalJson(input.workflowRef))throw new CoreError('PRECONDITION_FAILED');
  const [active]=await tx.owner('MissionController')`SELECT record FROM core.runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${input.missionRef.id}
      AND deleted_at IS NULL AND status NOT IN ('Completed','Failed','Cancelled')
    ORDER BY created_at DESC FOR UPDATE`;
  if(active)throw new CoreError('RUN_ALREADY_ACTIVE');
  const runRef={type:'abh.run' as const,id:randomUUID(),version:1};
  const [clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const progressBudgetSeconds=input.progressBudgetSeconds??3600;
  const progressDeadline=new Date(clock!.now.getTime()+progressBudgetSeconds*1000).toISOString();
  const releases=new StaticReleaseOwner();
  const pinSet=await releases.resolveAndPin(tx,command,{
   subjectRef:runRef,subjectInputDigest:await digestBytes(new TextEncoder().encode(canonicalJson({
    missionRef:input.missionRef,triggerKey:input.triggerKey,workflowRef:input.workflowRef,
    authorityRef:input.authorityRef,executionMode:input.executionMode,
    goalRevision:mission.goalRevision,stopEpoch:mission.stopEpoch}))),
   requiredBehaviorSlots:[input.workflowRef.id],verifiedScope:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],
   requestContextRef:{type:'abh.request-context',id:c.requestId,version:1},preparationAuthorityRefs:[input.authorityRef]});
  const assignmentSnapshotRef=pinSet.pinSetRef;
  const record=contract('RunRecord',{runRef,resourceOrganizationId:c.resourceOrganizationId,
   missionRef:input.missionRef,triggerKey:input.triggerKey,goalRevision:mission.goalRevision,stopEpoch:mission.stopEpoch,
   progressBudgetSeconds,progressDeadline,
   workflowRef:input.workflowRef,assignmentSnapshotRef,executionMode:input.executionMode,
   status:'Queued',createdBy:c.actor,createdAt:clock!.now.toISOString(),updatedAt:clock!.now.toISOString()});
  await tx.owner('MissionController')`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,
    progress_budget_seconds,progress_deadline)
   VALUES (${c.resourceOrganizationId},${runRef.id},${c.workspaceId??null},${runPurposeNames},${JSON.stringify(record)}::text::jsonb,${input.missionRef.id},${input.triggerKey},'Queued',${mission.goalRevision},${mission.stopEpoch},
    ${progressBudgetSeconds},${progressDeadline})`;
  const activeRunRef={...runRef};
  const updatedMission=contract('MissionRecord',{...mission,activeRunRef,updatedAt:new Date().toISOString(),
   missionRef:{...input.missionRef,version:mission.missionRef.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${mission.missionRef.version+1},record=${JSON.stringify(updatedMission)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id} AND version=${mission.missionRef.version}`;
  await appendChange(tx,{command,target:runRef,eventType:'abh.run.start',changedFields:['status'],
   relatedRefs:[input.missionRef,input.authorityRef,record.assignmentSnapshotRef]});
  await this.createGraphRevision(tx,command,record,0,1,
   await digestBytes(new TextEncoder().encode(canonicalJson({runRef,baseRevision:0,revision:1,nodes:[],edges:[],superseded:[]}))),
   {nodes:[],edges:[],superseded:[]},record.assignmentSnapshotRef,input.authorityRef);
  return record;
}

 private async createGraphRevision(tx:TenantTransaction,command:CommandIdentity,current:RunRecord,
   baseRevision:number,revision:number,patchDigest:string,graph:GraphValidation,proposerRef:EntityRef,
   rationaleRef:EntityRef):Promise<GraphRevisionRecord>{
  const c=tx.context.tenant,now=new Date().toISOString();
  const record=contract('GraphRevisionRecord',{revisionRef:{type:'abh.graph-revision',id:randomUUID(),version:revision},
   resourceOrganizationId:c.resourceOrganizationId,runRef:current.runRef,baseRevision,revision,patchDigest,
   proposerRef,nodes:graph.nodes,edges:graph.edges,supersededNodeKeys:graph.superseded,rationaleRef,
   createdBy:c.actor,createdAt:now,updatedAt:now});
  await tx.owner('MissionController')`INSERT INTO core.graph_revisions
   (resource_organization_id,id,workspace_id,purpose_names,record,run_id,revision,base_revision,patch_digest)
   VALUES (${c.resourceOrganizationId},${record.revisionRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
    ${JSON.stringify(record)}::text::jsonb,${current.runRef.id},${revision},${baseRevision},${patchDigest})`;
  await appendChange(tx,{command,target:record.revisionRef,eventType:'abh.graph-revision.created',
   changedFields:['nodes','edges',...(graph.superseded.length?['supersededNodeKeys']:[])],
   relatedRefs:[current.runRef,rationaleRef]});
  await this.#materializeTasks(tx,command,current,record);
  return record;
 }

 async #materializeTasks(tx:TenantTransaction,command:CommandIdentity,current:RunRecord,
   revision:GraphRevisionRecord):Promise<void>{
  const c=tx.context.tenant,clock=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const taskRows=await tx.owner('MissionController')`SELECT id,record,version,status,node_key FROM core.tasks
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${current.runRef.id}
     AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
  const tasks=new Map(taskRows.map(row=>[String(row.node_key),row]));
  const dependencyKeys=new Map(revision.edges.filter(edge=>!revision.supersededNodeKeys.includes(edge.from)
    &&!revision.supersededNodeKeys.includes(edge.to)).reduce((map,edge)=>{
    if(!map.has(edge.to))map.set(edge.to,[]);
    map.get(edge.to)!.push(edge.from);return map;
  },new Map<string,string[]>()));
  const satisfied=(key:string)=>(dependencyKeys.get(key)??[]).every(dependency=>{
    const row=tasks.get(dependency);return row?.status==='Succeeded';
  });
  for(const key of revision.supersededNodeKeys){
   const row=tasks.get(key);
   if(!row||row.status!=='Pending')continue;
   const task=contract('TaskRecord',row.record),now=clock[0]!.now.toISOString();
   const updated=contract('TaskRecord',{...task,status:'Skipped',updatedAt:now,
    taskRef:{...task.taskRef,version:task.taskRef.version+1}});
   await tx.owner('MissionController')`UPDATE core.tasks SET version=${updated.taskRef.version},status='Skipped',
     record=${JSON.stringify(updated)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${task.taskRef.id}
       AND version=${task.taskRef.version}`;
   tasks.set(key,{...row,status:'Skipped'});
   await appendChange(tx,{command,target:updated.taskRef,eventType:'abh.task.skipped',changedFields:['status'],
    relatedRefs:[current.runRef,revision.revisionRef]});
  }
  for(const node of revision.nodes){
   const row=tasks.get(node.nodeKey);
   if(row){
    if(row.status!=='Pending'||!satisfied(node.nodeKey))continue;
    const task=contract('TaskRecord',row.record),now=clock[0]!.now.toISOString();
    const updated=contract('TaskRecord',{...task,status:'Ready',updatedAt:now,
     taskRef:{...task.taskRef,version:task.taskRef.version+1}});
    await tx.owner('MissionController')`UPDATE core.tasks SET version=${updated.taskRef.version},status='Ready',
      record=${JSON.stringify(updated)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${task.taskRef.id}
        AND version=${task.taskRef.version}`;
    tasks.set(node.nodeKey,{...row,status:'Ready'});
    await appendChange(tx,{command,target:updated.taskRef,eventType:'abh.task.ready',changedFields:['status'],
     relatedRefs:[current.runRef,revision.revisionRef]});
    continue;
   }
   const now=clock[0]!.now.toISOString(),status=satisfied(node.nodeKey)?'Ready':'Pending';
   const task=contract('TaskRecord',{taskRef:{type:'abh.task',id:randomUUID(),version:1},
    resourceOrganizationId:c.resourceOrganizationId,runRef:current.runRef,nodeKey:node.nodeKey,kind:node.kind,
    inputRefs:node.inputRefs,status,required:node.required,attemptOrdinal:1,createdAt:now,updatedAt:now});
   await tx.owner('MissionController')`INSERT INTO core.tasks
    (resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
    VALUES (${c.resourceOrganizationId},${task.taskRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
     ${JSON.stringify(task)}::text::jsonb,${current.runRef.id},${node.nodeKey},${status},${c.actor.id},${c.actor.id})`;
   tasks.set(node.nodeKey,{id:task.taskRef.id,version:1,status});
   if(status==='Ready')await appendChange(tx,{command,target:task.taskRef,eventType:'abh.task.ready',
    changedFields:['status'],relatedRefs:[current.runRef,revision.revisionRef]});
  }
 }

 private validateGraph(current:GraphRevisionRecord|undefined,payload:ProposeGraphPatchPayload):GraphValidation{
  const nodes=structuredClone(current?.nodes??[]),edges=structuredClone(current?.edges??[]);
  const superseded=structuredClone(current?.supersededNodeKeys??[]);
  const activeKeys=new Set(nodes.map(node=>node.nodeKey));
  for(const node of payload.addNodes){
   if(activeKeys.has(node.nodeKey))throw new CoreError('INVALID_ARGUMENT');
   nodes.push(structuredClone(node));activeKeys.add(node.nodeKey);
  }
  for(const key of payload.supersedePendingNodes){
   if(!activeKeys.has(key)||superseded.includes(key))throw new CoreError('INVALID_ARGUMENT');
   superseded.push(key);
  }
  const liveKeys=new Set(nodes.map(node=>node.nodeKey).filter(key=>!superseded.includes(key)));
  const nextEdges=[...edges];
  for(const edge of payload.addEdges){
   if(edge.from===edge.to||!liveKeys.has(edge.from)||!liveKeys.has(edge.to))throw new CoreError('INVALID_ARGUMENT');
   nextEdges.push(structuredClone(edge));
  }
  const activeEdges=nextEdges.filter(edge=>liveKeys.has(edge.from)&&liveKeys.has(edge.to));
  if(activeEdges.length>300)throw new CoreError('INVALID_ARGUMENT');
  const dependencies=new Map<string,string[]>();
  for(const key of liveKeys)dependencies.set(key,[]);
  for(const edge of activeEdges)dependencies.get(edge.to)!.push(edge.from);
  let pending=[...liveKeys],depth=0;
  while(pending.length){
   if(++depth>20)throw new CoreError('INVALID_ARGUMENT');
   const ready=new Set(pending.filter(key=>dependencies.get(key)!.every(from=>!pending.includes(from))));
   if(ready.size===0)throw new CoreError('INVALID_ARGUMENT');
   pending=pending.filter(key=>!ready.has(key));
  }
  const activeNodes=nodes.filter(node=>!superseded.includes(node.nodeKey));
  if(activeNodes.length>100)throw new CoreError('INVALID_ARGUMENT');
  return {nodes:activeNodes,edges:activeEdges,superseded};
 }

 async proposeGraphPatch(tx:TenantTransaction,command:CommandIdentity,runRef:EntityRef,
   payload:ProposeGraphPatchPayload):Promise<GraphRevisionRecord>{
  contract('ProposeGraphPatchPayload',structuredClone(payload));const c=tx.context.tenant;
  if(runRef.type!=='abh.run')throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.runs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${runRef.id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==runRef.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Running','Waiting','Paused'].includes(row.status as string))throw new CoreError('PRECONDITION_FAILED');
  const current=contract('RunRecord',row.record);
  if(current.runRef.id!==runRef.id||current.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  const [latest]=await tx.owner('MissionController')`SELECT record FROM core.graph_revisions
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${runRef.id} AND deleted_at IS NULL
   ORDER BY revision DESC LIMIT 1`;
  const previous=latest?contract('GraphRevisionRecord',latest.record):undefined;
  if((previous?.revision??0)!==payload.baseRevision)throw new CoreError('PRECONDITION_FAILED');
  for(const key of payload.supersedePendingNodes){
   const rows=await tx.owner('MissionController')`SELECT status FROM core.tasks
    WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${runRef.id}
      AND node_key=${key} AND deleted_at IS NULL AND status<>'Pending' LIMIT 1`;
   if(rows.length)throw new CoreError('PRECONDITION_FAILED');
  }
  const graph=this.validateGraph(previous,payload),revision=(previous?.revision??0)+1;
  const digest=await digestBytes(new TextEncoder().encode(canonicalJson({runRef,baseRevision:payload.baseRevision,
   revision,addNodes:payload.addNodes,addEdges:payload.addEdges,supersedePendingNodes:payload.supersedePendingNodes})));
  return this.createGraphRevision(tx,command,current,payload.baseRevision,revision,digest,
   graph,{type:'abh.principal',id:c.actor.id,version:1},payload.rationaleRef);
 }
 async getGraphRevision(tx:TenantTransaction,id:string):Promise<GraphRevisionRecord>{
  contract('UUID',id);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record FROM core.graph_revisions
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('GraphRevisionRecord',row.record);
  if(record.revisionRef.id!==id||record.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 /** Tenant-local discovery only; every claim repeats authorization inside the Owner transaction. */
 async readyTasks(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  contract('UUID',afterId??randomUUID());const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT task.id,task.version FROM core.tasks task
   JOIN core.runs run ON run.resource_organization_id=task.resource_organization_id
     AND run.id=task.run_id AND run.deleted_at IS NULL AND run.status='Running'
   WHERE task.resource_organization_id=${c.resourceOrganizationId} AND task.deleted_at IS NULL AND task.status='Ready'
     AND ${c.purposeOfUse}=ANY(task.purpose_names)
     AND (${c.workspaceId??null}::uuid IS NULL OR task.workspace_id IS NULL OR task.workspace_id=${c.workspaceId??null}::uuid)
     AND (${afterId??null}::uuid IS NULL OR task.id>${afterId??null}::uuid)
   ORDER BY task.id LIMIT ${limit}`;
  return rows.map(row=>({type:'abh.task' as const,id:String(row.id),version:Number(row.version)}));
 }

 /** Tenant-local expired Running discovery; takeover still revalidates expiry under the lease lock. */
 async interruptedTasks(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  contract('UUID',afterId??randomUUID());const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT task.id,task.version FROM core.tasks task
   JOIN core.runs run ON run.resource_organization_id=task.resource_organization_id
     AND run.id=task.run_id AND run.deleted_at IS NULL AND run.status='Running'
   JOIN core.invocations invocation ON invocation.resource_organization_id=task.resource_organization_id
     AND invocation.task_id=task.id AND invocation.deleted_at IS NULL AND invocation.status='Running'
   JOIN runtime.work_leases lease ON lease.resource_organization_id=task.resource_organization_id
     AND lease.target_type='abh.task' AND lease.target_id=task.id AND lease.deleted_at IS NULL
   WHERE task.resource_organization_id=${c.resourceOrganizationId} AND task.deleted_at IS NULL AND task.status='Running'
     AND ${c.purposeOfUse}=ANY(task.purpose_names)
     AND (${c.workspaceId??null}::uuid IS NULL OR task.workspace_id IS NULL OR task.workspace_id=${c.workspaceId??null}::uuid)
     AND lease.lease_until<=clock_timestamp()
     AND (${afterId??null}::uuid IS NULL OR task.id>${afterId??null}::uuid)
   ORDER BY task.id LIMIT ${limit}`;
  return rows.map(row=>({type:'abh.task' as const,id:String(row.id),version:Number(row.version)}));
 }

 async getInvocation(tx:TenantTransaction,id:string):Promise<InvocationRecord>{
  contract('UUID',id);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.invocations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${runPurposeNames})`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('InvocationRecord',row.record);
  if(record.invocationRef.id!==id||record.invocationRef.version!==Number(row.version)
    ||record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async getTask(tx:TenantTransaction,id:string):Promise<TaskRecord>{
  return this.#loadTask(tx,{type:'abh.task',id,version:1});
 }

 async getCheckpoint(tx:TenantTransaction,id:string):Promise<CheckpointRecord>{
  contract('UUID',id);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record FROM core.checkpoints
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('CheckpointRecord',row.record);
  if(record.checkpointRef.id!==id||record.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async #loadRun(tx:TenantTransaction,id:string):Promise<RunRecord>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,stop_epoch FROM core.runs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('RunRecord',row.record);
  if(record.runRef.id!==id||record.resourceOrganizationId!==c.resourceOrganizationId
    ||record.runRef.version!==Number(row.version)||record.status!==row.status
    ||record.stopEpoch!==Number(row.stop_epoch))throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async #loadTask(tx:TenantTransaction,ref:EntityRef):Promise<TaskRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.task')throw new CoreError('INVALID_ARGUMENT');
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.tasks
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('TaskRecord',row.record);
  if(record.taskRef.id!==ref.id||record.resourceOrganizationId!==c.resourceOrganizationId
    ||record.taskRef.version!==Number(row.version)||record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async #saveTask(tx:TenantTransaction,command:CommandIdentity,current:TaskRecord,status:TaskRecord['status'],
   relatedRefs:EntityRef[],eventType:'abh.task.started'|'abh.task.verifying'|'abh.task.failed'|'abh.task.verified'|'abh.task.ready'):Promise<TaskRecord>{
  const updated=contract('TaskRecord',{...current,status,updatedAt:new Date().toISOString(),
   taskRef:{...current.taskRef,version:current.taskRef.version+1}});
  const rows=await tx.owner('MissionController')`UPDATE core.tasks SET version=${updated.taskRef.version},status=${status},
    record=${JSON.stringify(updated)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${current.taskRef.id}
      AND version=${current.taskRef.version} AND status=${current.status} RETURNING id`;
  if(!rows[0])throw new CoreError('VERSION_CONFLICT');
  await appendChange(tx,{command,target:updated.taskRef,eventType,changedFields:['status'],relatedRefs:[...relatedRefs]});
  return updated;
 }

 async #loadInvocation(tx:TenantTransaction,ref:EntityRef):Promise<InvocationRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.invocation')throw new CoreError('INVALID_ARGUMENT');
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.invocations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('InvocationRecord',row.record);
  if(record.invocationRef.id!==ref.id||record.resourceOrganizationId!==c.resourceOrganizationId
    ||record.invocationRef.version!==Number(row.version)||record.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async #loadLateObservation(tx:TenantTransaction,invocationId:string):Promise<LateInvocationObservationRecord|undefined>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record FROM core.invocation_observations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND invocation_id=${invocationId}
     AND deleted_at IS NULL`;
  return row?contract('LateInvocationObservationRecord',row.record):undefined;
 }

 async #adjudicateLateObservation(tx:TenantTransaction,command:CommandIdentity,observation:LateInvocationObservationRecord,
   ownerLease:WorkLeaseRecord,decision:'Adopted'|'Rejected',reason:'CompletedEvidence'|'NotCompletedEvidence'|'TaskAlreadyAdvanced'):Promise<LateInvocationAdjudicationRecord>{
  const c=tx.context.tenant,[clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const adjudicationRef={type:'abh.invocation-adjudication' as const,id:randomUUID(),version:1};
  const record=contract('LateInvocationAdjudicationRecord',{adjudicationRef,
   resourceOrganizationId:c.resourceOrganizationId,runRef:observation.runRef,taskRef:observation.taskRef,
   invocationRef:observation.invocationRef,observationRef:observation.observationRef,decision,reason,
   observedLeaseRef:observation.leaseRef,observedWorkerId:observation.workerId,
   observedFencingToken:observation.leaseFencingToken,ownerLeaseRef:ownerLease.leaseRef,
   ownerFencingToken:ownerLease.fencingToken,createdBy:c.actor,createdAt:String(clock!.now.toISOString())});
  await tx.owner('MissionController')`INSERT INTO core.invocation_adjudications(resource_organization_id,id,workspace_id,purpose_names,record,
    run_id,task_id,invocation_id,observation_id,decision,status)
   VALUES (${c.resourceOrganizationId},${adjudicationRef.id},${c.workspaceId??null},${runPurposeNames},
    ${JSON.stringify(record)}::text::jsonb,${observation.runRef.id},${observation.taskRef.id},${observation.invocationRef.id},
    ${observation.observationRef.id},${decision},'Decided')`;
  await appendChange(tx,{command,target:adjudicationRef,eventType:'abh.invocation-adjudication.created',
   changedFields:['decision','reason'],relatedRefs:[observation.runRef,observation.taskRef,
     observation.invocationRef,observation.observationRef,ownerLease.leaseRef]});
  return record;
 }

 async claim(tx:TenantTransaction,command:CommandIdentity,payload:ClaimTaskPayload):Promise<WorkLeaseRecord>{
  contract('ClaimTaskPayload',structuredClone(payload));
  const task=await this.#loadTask(tx,payload.taskRef);
  let interrupted:InvocationRecord|undefined;
  if(task.status==='Running'){
   const [row]=await tx.owner('MissionController')`SELECT id FROM core.invocations
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND task_id=${task.taskRef.id}
      AND deleted_at IS NULL AND status='Running' ORDER BY attempt_ordinal DESC LIMIT 1 FOR UPDATE`;
   if(!row)throw new CoreError('PRECONDITION_FAILED');
   interrupted=await this.#loadInvocation(tx,{type:'abh.invocation',id:String(row.id),version:1});
  }else if(task.status!=='Ready'||task.runRef.version<1)throw new CoreError('PRECONDITION_FAILED');
  const run=await this.#loadRun(tx,task.runRef.id);
  if(run.runRef.id!==task.runRef.id||run.status!=='Running')throw new CoreError('PRECONDITION_FAILED');
  const leases=new WorkLeaseOwner();
  let observation:LateInvocationObservationRecord|undefined;
  if(interrupted){
   const observed=await leases.observe(tx,task.taskRef);
   if(Date.parse(observed.record.leaseUntil)>Date.parse(observed.assessedAt))throw new CoreError('PRECONDITION_FAILED');
   observation=await this.#loadLateObservation(tx,interrupted.invocationRef.id);
  }
  const lease=await leases.claim(tx,command,
   {targetRef:task.taskRef,workerId:payload.workerId,leaseSeconds:payload.leaseSeconds},async(tx,target)=>{
    const current=await this.#loadTask(tx,target);
    return current.status==='Ready'||current.status==='Running'?runPurposeNames:undefined;
  });
  if(interrupted){
   const current=await this.#loadTask(tx,task.taskRef);
   if(current.status!=='Running'||current.runRef.id!==interrupted.runRef.id)throw new CoreError('PRECONDITION_FAILED');
   if(observation?.stopReason==='Completed'&&observation.resultArtifactRef){
    const adopted=contract('InvocationRecord',{...interrupted,status:'Succeeded',stopReason:'Completed',
     resultArtifactRef:observation.resultArtifactRef,
     ...(observation.usageRef?{usageRef:observation.usageRef}:{}),updatedAt:new Date().toISOString(),
     invocationRef:{...interrupted.invocationRef,version:interrupted.invocationRef.version+1}});
    const rows=await tx.owner('MissionController')`UPDATE core.invocations SET version=${adopted.invocationRef.version},status='Succeeded',
      record=${JSON.stringify(adopted)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${interrupted.invocationRef.id}
        AND version=${interrupted.invocationRef.version} AND status='Running' RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:adopted.invocationRef,eventType:'abh.invocation.completed',
     changedFields:['status','stopReason','resultArtifactRef'],relatedRefs:[current.taskRef,observation.observationRef,lease.leaseRef]});
    await this.#saveTask(tx,command,current,'Verifying',[adopted.invocationRef,observation.observationRef,lease.leaseRef],
     'abh.task.verifying');
    await this.#adjudicateLateObservation(tx,command,observation,lease,'Adopted','CompletedEvidence');
    return lease;
   }
   if(observation)await this.#adjudicateLateObservation(tx,command,observation,lease,'Rejected','NotCompletedEvidence');
   const cancelled=contract('InvocationRecord',{...interrupted,status:'Cancelled',stopReason:'Deadline',
    updatedAt:new Date().toISOString(),invocationRef:{...interrupted.invocationRef,version:interrupted.invocationRef.version+1}});
   const rows=await tx.owner('MissionController')`UPDATE core.invocations SET version=${cancelled.invocationRef.version},status='Cancelled',
     record=${JSON.stringify(cancelled)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${interrupted.invocationRef.id}
       AND version=${interrupted.invocationRef.version} AND status='Running' RETURNING id`;
   if(!rows[0])throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command,target:cancelled.invocationRef,eventType:'abh.invocation.completed',
    changedFields:['status','stopReason'],relatedRefs:[task.taskRef,lease.leaseRef]});
   const requeued=contract('TaskRecord',{...current,status:'Ready',attemptOrdinal:current.attemptOrdinal+1,
    updatedAt:new Date().toISOString(),taskRef:{...current.taskRef,version:current.taskRef.version+1}});
   const requeuedRows=await tx.owner('MissionController')`UPDATE core.tasks SET version=${requeued.taskRef.version},status='Ready',
     record=${JSON.stringify(requeued)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${current.taskRef.id}
       AND version=${current.taskRef.version} AND status='Running' RETURNING id`;
   if(!requeuedRows[0])throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command,target:requeued.taskRef,eventType:'abh.task.ready',
    changedFields:['status','attemptOrdinal'],relatedRefs:[cancelled.invocationRef,lease.leaseRef]});
  }
  return lease;
 }

 async prepareInvocation(tx:TenantTransaction,command:CommandIdentity,payload:PrepareInvocationPayload):Promise<InvocationRecord>{
  contract('PrepareInvocationPayload',structuredClone(payload));const c=tx.context.tenant;
  const task=await this.#loadTask(tx,payload.taskRef);
  if(task.status!=='Ready')throw new CoreError('PRECONDITION_FAILED');
  const run=await this.#loadRun(tx,task.runRef.id);
  if(run.runRef.id!==task.runRef.id||run.status!=='Running')throw new CoreError('PRECONDITION_FAILED');
  await new WorkLeaseOwner().requireCurrent(tx,payload.leaseRef,
   payload.workerId,payload.leaseFencingToken,task.taskRef);
  const taskSpecDigest=await digestBytes(new TextEncoder().encode(canonicalJson(payload.taskSpec)));
  const [row]=await tx.owner('MissionController')`SELECT count(*)::int AS count,max(attempt_ordinal)::int AS ordinal FROM core.invocations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND task_id=${task.taskRef.id} AND deleted_at IS NULL`;
  const attemptOrdinal=(row?.ordinal??0)+1;
  if(attemptOrdinal>1000)throw new CoreError('LIMIT_EXCEEDED');
  const now=new Date().toISOString(),invocationRef={type:'abh.invocation' as const,id:randomUUID(),version:1};
  const record=contract('InvocationRecord',{invocationRef,resourceOrganizationId:c.resourceOrganizationId,runRef:task.runRef,
   taskRef:task.taskRef,attemptOrdinal,taskSpecDigest,taskSpec:payload.taskSpec,
   principalRef:{type:'abh.principal',id:c.actor.id,version:1},status:'Created',createdBy:c.actor,createdAt:now,updatedAt:now});
  await tx.owner('MissionController')`INSERT INTO core.invocations(resource_organization_id,id,workspace_id,purpose_names,record,
    run_id,task_id,attempt_ordinal,task_spec_digest,status)
   VALUES (${c.resourceOrganizationId},${invocationRef.id},${c.workspaceId??null},${runPurposeNames},
    ${JSON.stringify(record)}::text::jsonb,${task.runRef.id},${task.taskRef.id},${attemptOrdinal},${taskSpecDigest},'Created')`;
  await appendChange(tx,{command,target:invocationRef,eventType:'abh.invocation.created',changedFields:['status'],
   relatedRefs:[run.runRef,task.taskRef,...payload.identityBasisRefs]});
  return record;
 }

 async finalizeInvocation(tx:TenantTransaction,command:CommandIdentity,payload:FinalizeInvocationPayload):Promise<InvocationRecord>{
  contract('FinalizeInvocationPayload',structuredClone(payload));
  const invocation=await this.#loadInvocation(tx,payload.invocationRef);
  if(invocation.status!=='Created')throw new CoreError('PRECONDITION_FAILED');
  const task=await this.#loadTask(tx,invocation.taskRef);
  if(task.status!=='Ready'||task.runRef.id!==invocation.runRef.id)throw new CoreError('PRECONDITION_FAILED');
  await new WorkLeaseOwner().requireCurrent(tx,payload.leaseRef,
   payload.workerId,payload.leaseFencingToken,task.taskRef);
  const contractDigest=await digestBytes(new TextEncoder().encode(canonicalJson({
   taskSpecDigest:invocation.taskSpecDigest,manifestRef:payload.manifestRef,bindingRefs:payload.bindingRefs})));
  if(payload.contractDigest!==contractDigest)throw new CoreError('INVALID_ARGUMENT');
  const updated=contract('InvocationRecord',{...invocation,status:'Running',manifestRef:payload.manifestRef,
   bindingRefs:payload.bindingRefs,contractDigest,updatedAt:new Date().toISOString(),
   invocationRef:{...invocation.invocationRef,version:invocation.invocationRef.version+1}});
  const rows=await tx.owner('MissionController')`UPDATE core.invocations SET version=${updated.invocationRef.version},status='Running',
    record=${JSON.stringify(updated)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${invocation.invocationRef.id}
      AND version=${invocation.invocationRef.version} AND status='Created' RETURNING id`;
  if(!rows[0])throw new CoreError('VERSION_CONFLICT');
  await this.#saveTask(tx,command,task,'Running',[invocation.invocationRef],'abh.task.started');
  await appendChange(tx,{command,
   target:updated.invocationRef,eventType:'abh.invocation.running',changedFields:['status','manifestRef','bindingRefs','contractDigest'],
   relatedRefs:[task.taskRef]});
  return updated;
 }

 async completeInvocation(tx:TenantTransaction,command:CommandIdentity,payload:CompleteInvocationPayload):Promise<InvocationRecord>{
  contract('CompleteInvocationPayload',structuredClone(payload));
  const invocation=await this.#loadInvocation(tx,payload.invocationRef);
  if(invocation.status!=='Running')throw new CoreError('PRECONDITION_FAILED');
  const task=await this.#loadTask(tx,invocation.taskRef);
  if(task.status!=='Running'||task.runRef.id!==invocation.runRef.id)throw new CoreError('PRECONDITION_FAILED');
  await new WorkLeaseOwner().requireCurrent(tx,payload.leaseRef,
   payload.workerId,payload.leaseFencingToken,task.taskRef);
  if(payload.stopReason==='Completed'&&!payload.resultArtifactRef)throw new CoreError('INVALID_ARGUMENT');
  const status=payload.stopReason==='Completed'?'Succeeded':payload.stopReason==='Cancelled'?'Cancelled':'Failed';
  const updated=contract('InvocationRecord',{...invocation,status,stopReason:payload.stopReason,
   ...(payload.resultArtifactRef?{resultArtifactRef:payload.resultArtifactRef}:{}),
   ...(payload.usageRef?{usageRef:payload.usageRef}:{}),updatedAt:new Date().toISOString(),
   invocationRef:{...invocation.invocationRef,version:invocation.invocationRef.version+1}});
  const rows=await tx.owner('MissionController')`UPDATE core.invocations SET version=${updated.invocationRef.version},status=${status},
    record=${JSON.stringify(updated)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${invocation.invocationRef.id}
      AND version=${invocation.invocationRef.version} AND status='Running' RETURNING id`;
  if(!rows[0])throw new CoreError('VERSION_CONFLICT');
  await appendChange(tx,{command,target:updated.invocationRef,
   eventType:'abh.invocation.completed',changedFields:['status','stopReason'],relatedRefs:[task.taskRef]});
  if(status==='Succeeded')await this.#saveTask(tx,command,task,'Verifying',[updated.invocationRef],'abh.task.verifying');
  else if(status==='Failed')await this.#saveTask(tx,command,task,'Failed',[updated.invocationRef],'abh.task.failed');
  return updated;
 }

 async observeLateInvocation(tx:TenantTransaction,command:CommandIdentity,
   payload:ObserveLateInvocationPayload):Promise<LateInvocationObservationRecord>{
  contract('ObserveLateInvocationPayload',structuredClone(payload));const c=tx.context.tenant;
  if(payload.invocationRef.type!=='abh.invocation')throw new CoreError('INVALID_ARGUMENT');
  if(payload.resultArtifactRef&&payload.resultArtifactRef.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
  const [invocationLocation]=await tx.owner('MissionController')`SELECT task_id FROM core.invocations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${payload.invocationRef.id}
     AND deleted_at IS NULL`;
  if(!invocationLocation)throw new CoreError('RESOURCE_NOT_FOUND');
  const lockedTask=await this.#loadTask(tx,{type:'abh.task',id:String(invocationLocation.task_id),version:1});
  if(lockedTask.taskRef.id!==String(invocationLocation.task_id))throw new CoreError('INTERNAL_ERROR');
  const invocation=await this.#loadInvocation(tx,payload.invocationRef);
  if(!['Running','Cancelled'].includes(invocation.status))throw new CoreError('PRECONDITION_FAILED');
  const task=await this.#loadTask(tx,invocation.taskRef);
  if(task.taskRef.id!==invocation.taskRef.id||task.runRef.id!==invocation.runRef.id)throw new CoreError('INTERNAL_ERROR');
  const observed=await new WorkLeaseOwner().observe(tx,task.taskRef);
  if(observed.record.leaseRef.id!==payload.leaseRef.id||observed.record.workerId!==payload.workerId
    ||observed.record.fencingToken<payload.leaseFencingToken)throw new CoreError('PRECONDITION_FAILED');
  const sameLease=observed.record.workerId===payload.workerId
    &&observed.record.fencingToken===payload.leaseFencingToken;
  if(sameLease&&Date.parse(observed.record.leaseUntil)>Date.parse(observed.assessedAt))
    throw new CoreError('PRECONDITION_FAILED');
  const [existingRow]=await tx.owner('MissionController')`SELECT record FROM core.invocation_observations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND invocation_id=${invocation.invocationRef.id}
     AND deleted_at IS NULL`;
  if(existingRow){
   const existing=contract('LateInvocationObservationRecord',existingRow.record);
   const sameEvidence=payload.invocationRef.id===existing.invocationRef.id
     &&payload.leaseRef.id===existing.leaseRef.id&&payload.workerId===existing.workerId
     &&payload.leaseFencingToken===existing.leaseFencingToken&&payload.stopReason===existing.stopReason
     &&canonicalJson(payload.resultArtifactRef??null)===canonicalJson(existing.resultArtifactRef??null)
     &&canonicalJson(payload.usageRef??null)===canonicalJson(existing.usageRef??null);
   if(!sameEvidence)throw new CoreError('IDEMPOTENCY_CONFLICT');
   return existing;
  }
  const [clock]=await tx.owner('MissionController')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
  const observationRef={type:'abh.invocation-observation' as const,id:randomUUID(),version:1};
  const record=contract('LateInvocationObservationRecord',{observationRef,
   resourceOrganizationId:c.resourceOrganizationId,runRef:invocation.runRef,taskRef:invocation.taskRef,
   invocationRef:invocation.invocationRef,leaseRef:payload.leaseRef,workerId:payload.workerId,
   leaseFencingToken:payload.leaseFencingToken,status:'Observed',stopReason:payload.stopReason,
   ...(payload.resultArtifactRef?{resultArtifactRef:payload.resultArtifactRef}:{}),
   ...(payload.usageRef?{usageRef:payload.usageRef}:{}),observedAt:String(clock!.now),createdBy:c.actor});
  await tx.owner('MissionController')`INSERT INTO core.invocation_observations(resource_organization_id,id,workspace_id,purpose_names,record,
    run_id,task_id,invocation_id,lease_id,worker_id,fencing_token,status)
   VALUES (${c.resourceOrganizationId},${observationRef.id},${c.workspaceId??null},${runPurposeNames},
    ${JSON.stringify(record)}::text::jsonb,${invocation.runRef.id},${invocation.taskRef.id},${invocation.invocationRef.id},
    ${payload.leaseRef.id},${payload.workerId},${payload.leaseFencingToken},'Observed')`;
  await appendChange(tx,{command,target:observationRef,eventType:'abh.invocation-observation.created',
   changedFields:['status','stopReason'],relatedRefs:[invocation.runRef,task.taskRef,invocation.invocationRef,payload.leaseRef]});
  if(invocation.status==='Cancelled'){
   const observedLease=await new WorkLeaseOwner().observe(tx,task.taskRef);
   await this.#adjudicateLateObservation(tx,command,record,observedLease.record,'Rejected','TaskAlreadyAdvanced');
  }
  return record;
 }

 async commitVerifiedTask(tx:TenantTransaction,command:CommandIdentity,payload:CommitVerifiedTaskPayload):Promise<CheckpointRecord>{
  contract('CommitVerifiedTaskPayload',structuredClone(payload));const c=tx.context.tenant;
  const task=await this.#loadTask(tx,payload.taskRef);
  if(task.status!=='Verifying')throw new CoreError('PRECONDITION_FAILED');
  const run=await this.#loadRun(tx,task.runRef.id);
  const invocation=await this.#loadInvocation(tx,payload.invocationRef);
  if(invocation.taskRef.id!==task.taskRef.id||invocation.runRef.id!==run.runRef.id||invocation.status!=='Succeeded'
    ||!invocation.resultArtifactRef)throw new CoreError('PRECONDITION_FAILED');
  const [verificationRow]=await tx.owner('MissionController')`SELECT record FROM core.verification_reports
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${payload.verificationRef.id} AND deleted_at IS NULL`;
  const verificationRowValue=verificationRow?contract('VerificationReport',verificationRow.record):undefined;
  if(!verificationRowValue||verificationRowValue.taskRef.id!==task.taskRef.id
    ||verificationRowValue.invocationRef.id!==invocation.invocationRef.id||verificationRowValue.verdict!=='Pass')
    throw new CoreError('PRECONDITION_FAILED');
  if(task.kind==='DomainCommand'&&!payload.domainCommandReceiptRefs.length)throw new CoreError('TASK_COMMIT_INCOMPLETE');
  const [latest]=await tx.owner('MissionController')`SELECT record FROM core.graph_revisions
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${run.runRef.id} AND deleted_at IS NULL
   ORDER BY revision DESC LIMIT 1`;
  if(!latest)throw new CoreError('INTERNAL_ERROR');
  const graph=contract('GraphRevisionRecord',latest.record);
  const [clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const [sequenceRow]=await tx.owner('MissionController')`SELECT count(*)::int AS count,max(sequence)::int AS sequence
   FROM core.checkpoints WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${run.runRef.id} AND deleted_at IS NULL`;
  const sequence=(sequenceRow?.sequence??0)+1;
  const completedRows=await tx.owner('MissionController')`SELECT id FROM core.tasks
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${run.runRef.id}
   AND deleted_at IS NULL AND status='Succeeded' ORDER BY id LIMIT 100`;
  const committedTaskRef={...task.taskRef,version:task.taskRef.version+1};
  const completedTaskRefs=completedRows.map(row=>({type:'abh.task' as const,id:String(row.id),version:1}));
  if(!completedTaskRefs.some(ref=>ref.id===committedTaskRef.id))completedTaskRefs.push(committedTaskRef);
  const watermark=await digestBytes(new TextEncoder().encode(canonicalJson({runRef:run.runRef,
   graphRevisionRef:graph.revisionRef,taskRef:task.taskRef,invocationRef:invocation.invocationRef,
   resultArtifactRef:invocation.resultArtifactRef,verificationRef:verificationRowValue.reportRef,
   domainCommandReceiptRefs:payload.domainCommandReceiptRefs,sequence})));
  const checkpointRef={type:'abh.checkpoint' as const,id:randomUUID(),version:1};
  const record=contract('CheckpointRecord',{checkpointRef,resourceOrganizationId:c.resourceOrganizationId,
   runRef:run.runRef,taskRef:task.taskRef,graphRevisionRef:graph.revisionRef,sequence,completedTaskRefs,
   verifiedOutputRefs:[invocation.resultArtifactRef],waitRefs:[],domainCommandReceiptRefs:payload.domainCommandReceiptRefs,
   watermark,createdAt:clock!.now.toISOString()});
  await tx.owner('MissionController')`INSERT INTO core.checkpoints(resource_organization_id,id,workspace_id,purpose_names,record,
    run_id,task_id,sequence)
   VALUES (${c.resourceOrganizationId},${checkpointRef.id},${c.workspaceId??null},${runPurposeNames},
    ${JSON.stringify(record)}::text::jsonb,${run.runRef.id},${task.taskRef.id},${sequence})`;
  const progressRun:RunRecord={...run,progressDeadline:new Date(clock!.now.getTime()+run.progressBudgetSeconds*1000).toISOString(),
   updatedAt:clock!.now.toISOString()};
  await tx.owner('MissionController')`UPDATE core.runs SET record=${JSON.stringify(progressRun)}::text::jsonb,
    progress_deadline=${progressRun.progressDeadline},updated_at=CURRENT_TIMESTAMP
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${run.runRef.id}
     AND version=${run.runRef.version}`;
  const updatedTask=await this.#saveTask(tx,command,task,'Succeeded',[record.checkpointRef,verificationRowValue.reportRef],'abh.task.verified');
  await appendChange(tx,{command,
   target:record.checkpointRef,eventType:'abh.checkpoint.committed',changedFields:['completedTaskRefs','verifiedOutputRefs'],
   relatedRefs:[run.runRef,updatedTask.taskRef,invocation.invocationRef]});
  await this.#dispatchAfterTask(tx,command,progressRun,graph);
  return record;
 }

 async #dispatchAfterTask(tx:TenantTransaction,command:CommandIdentity,run:RunRecord,graph:GraphRevisionRecord):Promise<void>{
  const c=tx.context.tenant;
  const taskRows=await tx.owner('MissionController')`SELECT id,record,version,status,node_key FROM core.tasks
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${run.runRef.id}
     AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
  const tasks=new Map(taskRows.map(row=>[String(row.node_key),row]));
  const dependencies=new Map<string,string[]>();
  for(const edge of graph.edges){
   if(graph.supersededNodeKeys.includes(edge.from)||graph.supersededNodeKeys.includes(edge.to))continue;
   dependencies.set(edge.to,[...(dependencies.get(edge.to)??[]),edge.from]);
  }
  for(const node of graph.nodes){
   if(graph.supersededNodeKeys.includes(node.nodeKey))continue;
   const row=tasks.get(node.nodeKey);
   if(row?.status!=='Pending')continue;
   const ready=(dependencies.get(node.nodeKey)??[]).every(key=>tasks.get(key)?.status==='Succeeded');
   if(!ready)continue;
   const task=contract('TaskRecord',row.record);
   tasks.set(node.nodeKey,{...row,status:'Ready'});
   await this.#saveTask(tx,command,task,'Ready',[run.runRef,graph.revisionRef],'abh.task.ready');
  }
  const current=[...tasks.values()],active=current.some(row=>['Ready','Running','Verifying'].includes(row.status as string));
  if(active)return;
  const requiredNodes=graph.nodes.filter(node=>node.required&&!graph.supersededNodeKeys.includes(node.nodeKey));
  if(requiredNodes.length&&requiredNodes.every(node=>tasks.get(node.nodeKey)?.status==='Succeeded')){
   const record=contract('RunRecord',{...run,status:'Completed',updatedAt:new Date().toISOString(),
    runRef:{...run.runRef,version:run.runRef.version+1}});
   const rows=await tx.owner('MissionController')`UPDATE core.runs SET version=${record.runRef.version},status='Completed',
     record=${JSON.stringify(record)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${run.runRef.id}
       AND version=${run.runRef.version} AND status='Running' RETURNING id`;
   if(!rows[0])throw new CoreError('VERSION_CONFLICT');
   const [missionRow]=await tx.owner('MissionController')`SELECT record,version FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${run.missionRef.id} AND deleted_at IS NULL FOR UPDATE`;
   if(missionRow){
    const mission=contract('MissionRecord',missionRow.record);
    if(mission.activeRunRef?.id===run.runRef.id){
     const updatedMission=contract('MissionRecord',{...mission,activeRunRef:undefined,updatedAt:new Date().toISOString(),
      missionRef:{...mission.missionRef,version:mission.missionRef.version+1}});
     await tx.owner('MissionController')`UPDATE core.missions SET version=${updatedMission.missionRef.version},
       record=${JSON.stringify(updatedMission)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
       WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id}
         AND version=${mission.missionRef.version}`;
    }
   }
   await appendChange(tx,{command,target:record.runRef,eventType:'abh.run.complete',changedFields:['status','activeRunRef'],
    relatedRefs:[run.missionRef]});
  }
 }
 async wake(tx:TenantTransaction,command:CommandIdentity,payload:WakeRunPayload):Promise<RunRecord>{
  contract('WakeRunPayload',structuredClone(payload));const ref=payload.runRef,c=tx.context.tenant;
  if(ref.type!=='abh.run'||payload.waitRef.type!=='abh.durable-wait'
    ||(payload.causeRef.type===ref.type&&payload.causeRef.id===ref.id))throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,stop_epoch FROM core.runs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(row.status!=='Waiting')throw new CoreError('PRECONDITION_FAILED');
  const current=contract('RunRecord',row.record);
  if(current.runRef.id!==ref.id||current.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  const wait=await new DurableWaitOwner().get(tx,payload.waitRef);
  if(canonicalJson(wait.ownerRef)!==canonicalJson(ref)
    ||wait.waitingIntentRef.type!==ref.type||wait.waitingIntentRef.id!==ref.id
    ||wait.status!=='Succeeded'||!wait.source.satisfied||!wait.wakeupRef)throw new CoreError('PRECONDITION_FAILED');
  const [missionRow]=await tx.owner('MissionController')`SELECT record,version,status FROM core.missions
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.missionRef.id}
     AND deleted_at IS NULL AND status='Active' FOR UPDATE`;
  if(!missionRow)throw new CoreError('PRECONDITION_FAILED');
  const mission=contract('MissionRecord',missionRow.record);
  if(mission.activeRunRef?.id!==ref.id||Number(missionRow.version)!==mission.missionRef.version)throw new CoreError('PRECONDITION_FAILED');
  const [clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const record=contract('RunRecord',{...current,status:'Running',updatedAt:clock!.now.toISOString(),
   runRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.runs SET version=${ref.version+1},status='Running',stop_epoch=${Number(row.stop_epoch)},
    record=${JSON.stringify(record)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
   await appendChange(tx,{command,target:record.runRef,eventType:'abh.run.resume',changedFields:['status'],
   relatedRefs:[current.missionRef,payload.causeRef,wait.wakeupRef]});
  return record;
 }

 /** Tenant-local successful condition discovery; deadline wakeups are never Run resume commands. */
 async pendingWakeRuns(tx:TenantTransaction,limit=100,afterId?:string):Promise<PendingWakeRun[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  contract('UUID',afterId??randomUUID());const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT DISTINCT ON (run.id)
    run.id AS run_id,run.version AS run_version,wait.id AS wait_id,wait.version AS wait_version,
    wakeup.id AS wakeup_id,wakeup.version AS wakeup_version
   FROM core.runs run
   JOIN runtime.waits wait ON wait.resource_organization_id=run.resource_organization_id
     AND wait.owner_type='abh.run' AND wait.owner_id=run.id AND wait.deleted_at IS NULL
     AND wait.status='Succeeded' AND wait.record->'source'->>'satisfied'='true'
   JOIN runtime.wakeups wakeup ON wakeup.resource_organization_id=wait.resource_organization_id
     AND wakeup.wait_id=wait.id AND wakeup.deleted_at IS NULL
   WHERE run.resource_organization_id=${c.resourceOrganizationId} AND run.deleted_at IS NULL
     AND run.status='Waiting' AND ${c.purposeOfUse}=ANY(run.purpose_names)
     AND (${c.workspaceId??null}::uuid IS NULL OR run.workspace_id IS NULL OR run.workspace_id=${c.workspaceId??null}::uuid)
     AND (${afterId??null}::uuid IS NULL OR run.id>${afterId??null}::uuid)
   ORDER BY run.id,wait.created_at,wakeup.created_at
   LIMIT ${limit}`;
  return rows.map(row=>({
   runRef:{type:'abh.run' as const,id:String(row.run_id),version:Number(row.run_version)},
   waitRef:{type:'abh.durable-wait' as const,id:String(row.wait_id),version:Number(row.wait_version)},
   wakeupRef:{type:'abh.durable-wakeup' as const,id:String(row.wakeup_id),version:Number(row.wakeup_version)}}));
 }
 async complete(tx:TenantTransaction,command:CommandIdentity,payload:CompleteRunPayload):Promise<RunRecord>{
  contract('CompleteRunPayload',payload);const ref=payload.runRef,c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Running','Waiting','Paused','Queued'].includes(row.status as string))throw new CoreError('VERSION_CONFLICT');
  const [clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const record=contract('RunRecord',{...contract('RunRecord',row.record),
   status:payload.outcome,updatedAt:clock!.now.toISOString(),runRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.runs SET version=${ref.version+1},status=${payload.outcome},record=${JSON.stringify(record)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  const [missionRow]=await tx.owner('MissionController')`SELECT record,version,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${record.missionRef.id} FOR UPDATE`;
  if(missionRow){
   const mission=contract('MissionRecord',missionRow.record);
   if(mission.activeRunRef?.id===record.runRef.id){
    const updatedMission=contract('MissionRecord',{...mission,activeRunRef:undefined,
     updatedAt:new Date().toISOString(),missionRef:{...mission.missionRef,version:mission.missionRef.version+1}});
    await tx.owner('MissionController')`UPDATE core.missions SET version=${mission.missionRef.version+1},record=${JSON.stringify(updatedMission)}::text::jsonb,
      updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id} AND version=${mission.missionRef.version}`;
   }
  }
  await appendChange(tx,{command,target:{...ref,version:ref.version+1},eventType:'abh.run.complete',
   changedFields:['status'],relatedRefs:[record.missionRef,...(payload.resultRefs??[])]});
  return record;
}
 async cancel(tx:TenantTransaction,command:CommandIdentity,payload:CancelRunPayload):Promise<RunRecord>{
  contract('CancelRunPayload',payload);const ref=payload.runRef,c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Running','Waiting','Paused'].includes(row.status as string))throw new CoreError('PRECONDITION_FAILED');
  const current=contract('RunRecord',row.record);
  if(current.runRef.id!==ref.id||current.status!==row.status)throw new CoreError('INTERNAL_ERROR');
  const [missionRow]=await tx.owner('MissionController')`SELECT record,version,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.missionRef.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!missionRow)throw new CoreError('RESOURCE_NOT_FOUND');
  const mission=contract('MissionRecord',missionRow.record);
  const stopEpoch=Number(missionRow.stop_epoch)+1,now=new Date().toISOString();
  const record=contract('RunRecord',{...current,status:'Cancelled',stopEpoch,updatedAt:now,
   runRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.runs SET version=${ref.version+1},status='Cancelled',stop_epoch=${stopEpoch},
    record=${JSON.stringify(record)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  const taskRows=await tx.owner('MissionController')`SELECT id,record,version,status FROM core.tasks
    WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${ref.id} AND deleted_at IS NULL
      AND status NOT IN ('Succeeded','Failed','Skipped','Cancelled') ORDER BY id FOR UPDATE`;
  for(const taskRow of taskRows){
   const task=contract('TaskRecord',taskRow.record);
   if(task.taskRef.id!==taskRow.id||task.runRef.id!==ref.id||task.status!==taskRow.status)throw new CoreError('INTERNAL_ERROR');
   const taskRef={...task.taskRef,version:task.taskRef.version+1};
   const updated=contract('TaskRecord',{...task,status:'Cancelled',updatedAt:now,taskRef});
   await tx.owner('MissionController')`UPDATE core.tasks SET version=${taskRef.version},status='Cancelled',record=${JSON.stringify(updated)}::text::jsonb,
     updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${task.taskRef.id} AND version=${task.taskRef.version}`;
   await appendChange(tx,{command,target:taskRef,eventType:'abh.task.cancelled',changedFields:['status'],
    relatedRefs:[ref,...(payload.evidenceRefs??[])]});
  }
  if(['Active','Paused','Blocked'].includes(mission.status)){
   const updatedMission=contract('MissionRecord',{...mission,activeRunRef:mission.activeRunRef?.id===ref.id?undefined:mission.activeRunRef,
    stopEpoch,updatedAt:now,missionRef:{...mission.missionRef,version:mission.missionRef.version+1}});
   await tx.owner('MissionController')`UPDATE core.missions SET version=${mission.missionRef.version+1},stop_epoch=${stopEpoch},
     record=${JSON.stringify(updatedMission)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id} AND version=${mission.missionRef.version}`;
  }else if(mission.activeRunRef?.id===ref.id){
   const updatedMission=contract('MissionRecord',{...mission,activeRunRef:undefined,updatedAt:now,
    missionRef:{...mission.missionRef,version:mission.missionRef.version+1}});
   await tx.owner('MissionController')`UPDATE core.missions SET version=${mission.missionRef.version+1},
     record=${JSON.stringify(updatedMission)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id} AND version=${mission.missionRef.version}`;
  }
  await appendChange(tx,{command,target:record.runRef,eventType:'abh.run.cancel',
   changedFields:taskRows.length?['status','stopEpoch','tasks']:['status','stopEpoch'],
   relatedRefs:[mission.missionRef,...(payload.evidenceRefs??[])]});
  return record;
 }
 async tasks(tx:TenantTransaction,runRef:import('@abh/contracts').EntityRef):Promise<TaskRecord[]>{
  contract('EntityRef',runRef);const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT record FROM core.tasks
  WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${runRef.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(${runPurposeNames}) ORDER BY created_at`;
  return rows.map(row=>contract('TaskRecord',row.record));
}

 /** Discovery returns candidates only; each recovery must be grant-authorized under a current lease. */
 async pendingRecovery(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  contract('UUID',afterId??randomUUID());const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT id,version FROM core.runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
      AND status IN ('Completed','Failed','Cancelled')
      AND (${c.workspaceId??null}::uuid IS NULL OR workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND (
        EXISTS (SELECT 1 FROM core.tasks task WHERE task.resource_organization_id=core.runs.resource_organization_id
          AND task.run_id=core.runs.id AND task.deleted_at IS NULL
          AND task.status NOT IN ('Succeeded','Failed','Skipped','Cancelled'))
        OR EXISTS (SELECT 1 FROM core.missions mission WHERE mission.resource_organization_id=core.runs.resource_organization_id
          AND mission.id=core.runs.mission_id AND mission.deleted_at IS NULL
          AND mission.record->'activeRunRef'->>'id'=core.runs.id::text)
      )
      AND (${afterId??null}::uuid IS NULL OR id>${afterId??null}::uuid)
    ORDER BY id LIMIT ${limit}`;
  return rows.map(row=>({type:'abh.run' as const,id:String(row.id),version:Number(row.version)}));
 }

 /** Tenant-local deadline discovery; stopStalled revalidates the database deadline under the Run lock. */
 async stalledRuns(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  contract('UUID',afterId??randomUUID());const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT id,version FROM core.runs
   WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
     AND status IN ('Queued','Running') AND progress_deadline<=clock_timestamp()
     AND ${c.purposeOfUse}=ANY(purpose_names)
     AND (${c.workspaceId??null}::uuid IS NULL OR workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
     AND (${afterId??null}::uuid IS NULL OR id>${afterId??null}::uuid)
   ORDER BY progress_deadline,id LIMIT ${limit}`;
  return rows.map(row=>({type:'abh.run' as const,id:String(row.id),version:Number(row.version)}));
 }

 async stopStalled(tx:TenantTransaction,command:CommandIdentity,payload:StopStalledRunPayload):Promise<RunRecord>{
  contract('StopStalledRunPayload',payload);const ref=payload.runRef,c=tx.context.tenant;
  if(ref.type!=='abh.run')throw new CoreError('INVALID_ARGUMENT');
  const run=await this.#loadRun(tx,ref.id);
  if(run.runRef.id!==ref.id||run.runRef.version!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Queued','Running'].includes(run.status))throw new CoreError('PRECONDITION_FAILED');
  const [clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  if(Date.parse(run.progressDeadline)>Date.parse(clock!.now.toISOString()))throw new CoreError('PRECONDITION_FAILED');
  const now=clock!.now.toISOString(),stopped=contract('RunRecord',{...run,status:'Failed',stopReason:'NoProgress',
   updatedAt:now,runRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.runs SET version=${stopped.runRef.version},status='Failed',
    record=${JSON.stringify(stopped)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND version=${ref.version} AND status IN ('Queued','Running')`;
  const invocationRows=await tx.owner('MissionController')`SELECT id,record,version FROM core.invocations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${ref.id} AND deleted_at IS NULL
     AND status IN ('Created','Running') ORDER BY attempt_ordinal FOR UPDATE`;
  for(const invocationRow of invocationRows){
   const invocation=contract('InvocationRecord',invocationRow.record);
   const invocationRef={...invocation.invocationRef,version:invocation.invocationRef.version+1};
   const closed=contract('InvocationRecord',{...invocation,status:'Cancelled',stopReason:'Deadline',
    updatedAt:now,invocationRef});
   const closedRows=await tx.owner('MissionController')`UPDATE core.invocations SET version=${invocationRef.version},status='Cancelled',
     record=${JSON.stringify(closed)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${invocation.invocationRef.id}
       AND version=${invocation.invocationRef.version} AND status=${invocation.status} RETURNING id`;
   if(!closedRows[0])throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command,target:invocationRef,eventType:'abh.invocation.completed',
    changedFields:['status','stopReason'],relatedRefs:[ref,invocation.taskRef,payload.causeRef]});
  }
  const taskRows=await tx.owner('MissionController')`SELECT id,record,version,status FROM core.tasks
   WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${ref.id} AND deleted_at IS NULL
     AND status NOT IN ('Succeeded','Failed','Skipped','Cancelled') ORDER BY id FOR UPDATE`;
  for(const taskRow of taskRows){
   const task=contract('TaskRecord',taskRow.record);
   const taskRef={...task.taskRef,version:task.taskRef.version+1};
   const cancelled=contract('TaskRecord',{...task,status:'Cancelled',updatedAt:now,taskRef});
   const cancelledRows=await tx.owner('MissionController')`UPDATE core.tasks SET version=${taskRef.version},status='Cancelled',
     record=${JSON.stringify(cancelled)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${task.taskRef.id}
       AND version=${task.taskRef.version} RETURNING id`;
   if(!cancelledRows[0])throw new CoreError('VERSION_CONFLICT');
   await appendChange(tx,{command,target:taskRef,eventType:'abh.task.cancelled',changedFields:['status'],
    relatedRefs:[ref,payload.causeRef]});
  }
  const [missionRow]=await tx.owner('MissionController')`SELECT record,version,stop_epoch FROM core.missions
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${run.missionRef.id}
     AND deleted_at IS NULL FOR UPDATE`;
  if(missionRow){
   const mission=contract('MissionRecord',missionRow.record);
   const stopEpoch=['Active','Paused','Blocked'].includes(mission.status)?Number(missionRow.stop_epoch)+1:stopped.stopEpoch;
   const updatedMission=contract('MissionRecord',{...mission,
    activeRunRef:mission.activeRunRef?.id===ref.id?undefined:mission.activeRunRef,
    ...(stopEpoch!==mission.stopEpoch?{stopEpoch}:{}),updatedAt:now,
    missionRef:{...mission.missionRef,version:mission.missionRef.version+1}});
   await tx.owner('MissionController')`UPDATE core.missions SET version=${updatedMission.missionRef.version},
     stop_epoch=${stopEpoch},record=${JSON.stringify(updatedMission)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id}
       AND version=${mission.missionRef.version}`;
  }
  await appendChange(tx,{command,target:stopped.runRef,eventType:'abh.run.stalled',
   changedFields:['status','stopReason',...(taskRows.length?['tasks']:[])],
   relatedRefs:[run.missionRef,payload.causeRef]});
  return stopped;
 }

 async recover(tx:TenantTransaction,command:CommandIdentity,runRef:EntityRef,payload:RecoverRunPayload,
   grants:readonly EntityRef[]):Promise<RunRecoveryEffect>{
  contract('RecoverRunPayload',structuredClone(payload));const c=tx.context.tenant;
  if(runRef.type!=='abh.run'||payload.causeRef.type===runRef.type&&payload.causeRef.id===runRef.id)throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${runRef.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(${runPurposeNames}) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==runRef.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Completed','Failed','Cancelled'].includes(row.status as string))throw new CoreError('PRECONDITION_FAILED');
  let effect:RunRecoveryEffect|undefined,replayed=false;
  await executeCommand(tx,command,async()=>{
   await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},...grants]);
   await assertCurrentGrants(tx,{objectRef:runRef,
    scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.runs.recover'},grants);
  },async()=>{
   const leases=new WorkLeaseOwner();
   const lease=await leases.requireCurrent(tx,payload.leaseRef,payload.workerId,payload.leaseFencingToken,runRef);
   if(payload.workerId!==lease.workerId||payload.leaseRef.id!==lease.leaseRef.id
     ||payload.leaseFencingToken!==lease.fencingToken)throw new CoreError('PRECONDITION_FAILED');
   const current=contract('RunRecord',row.record);
   if(current.runRef.id!==runRef.id||current.status!==row.status)throw new CoreError('INTERNAL_ERROR');
   const taskRows=await tx.owner('MissionController')`SELECT id,record,version,status FROM core.tasks
     WHERE resource_organization_id=${c.resourceOrganizationId} AND run_id=${runRef.id} AND deleted_at IS NULL
       AND status NOT IN ('Succeeded','Failed','Skipped','Cancelled') ORDER BY id FOR UPDATE`;
   let cancelledTasks=0;
   for(const taskRow of taskRows){
    const task=contract('TaskRecord',taskRow.record);
    if(task.taskRef.id!==taskRow.id||task.runRef.id!==runRef.id||task.status!==taskRow.status)throw new CoreError('INTERNAL_ERROR');
    const taskRef={...task.taskRef,version:task.taskRef.version+1};
    const updated=contract('TaskRecord',{...task,status:'Cancelled',updatedAt:new Date().toISOString(),taskRef});
    await tx.owner('MissionController')`UPDATE core.tasks SET version=${taskRef.version},status='Cancelled',record=${JSON.stringify(updated)}::text::jsonb,
      updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${task.taskRef.id} AND version=${task.taskRef.version}`;
    await appendChange(tx,{command,target:taskRef,eventType:'abh.task.cancelled',changedFields:['status'],
     relatedRefs:[runRef,payload.causeRef,payload.leaseRef]});
    cancelledTasks++;
   }
   const [missionRow]=await tx.owner('MissionController')`SELECT record,version FROM core.missions
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.missionRef.id} AND deleted_at IS NULL FOR UPDATE`;
   let missionUpdated=false;
   if(missionRow){
    const mission=contract('MissionRecord',missionRow.record);
    if(mission.activeRunRef?.id===runRef.id){
     const updatedMission=contract('MissionRecord',{...mission,activeRunRef:undefined,updatedAt:new Date().toISOString(),
      missionRef:{...mission.missionRef,version:mission.missionRef.version+1}});
     await tx.owner('MissionController')`UPDATE core.missions SET version=${mission.missionRef.version+1},record=${JSON.stringify(updatedMission)}::text::jsonb,
       updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id} AND version=${mission.missionRef.version}`;
     missionUpdated=true;
    }
   }
   const record=contract('RunRecord',{...current,runRef:{...runRef,version:runRef.version},updatedAt:current.updatedAt});
   if(cancelledTasks||missionUpdated){
    await appendChange(tx,{command,target:record.runRef,eventType:'abh.run.recovered',
     changedFields:missionUpdated?['activeRunRef','tasks']:['tasks'],
     relatedRefs:[current.missionRef,payload.causeRef,payload.leaseRef]});
   }
   effect={record,cancelledTasks,missionUpdated,replayed:false};
   return record.runRef;
  });
  if(effect)return effect;replayed=true;
  return {record:await this.get(tx,runRef.id),cancelledTasks:0,missionUpdated:false,replayed};
 }
}
