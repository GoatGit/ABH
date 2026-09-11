import {randomUUID} from 'node:crypto';
import type {CompleteRunPayload,EntityRef,MissionRecord,RecoverRunPayload,RunRecord,StartRunPayload,TaskRecord,WorkLeaseRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,executeCommand,type CommandIdentity} from '../data/journal.ts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {StaticReleaseOwner} from '../release/static.ts';

const missionPurposeNames=['abh.mission.manage'];
const runPurposeNames=['abh.mission.manage','abh.runtime.deliver'];

export interface RunRecoveryEffect {
  record:RunRecord;
  cancelledTasks:number;
  missionUpdated:boolean;
  replayed:boolean;
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
   workflowRef:input.workflowRef,assignmentSnapshotRef,executionMode:input.executionMode,
   status:'Queued',createdBy:c.actor,createdAt:clock!.now.toISOString(),updatedAt:clock!.now.toISOString()});
  await tx.owner('MissionController')`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch)
   VALUES (${c.resourceOrganizationId},${runRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(record)}::text::jsonb,${input.missionRef.id},${input.triggerKey},'Queued',${mission.goalRevision},${mission.stopEpoch})`;
  const activeRunRef={...runRef};
  const updatedMission=contract('MissionRecord',{...mission,activeRunRef,updatedAt:new Date().toISOString(),
   missionRef:{...input.missionRef,version:mission.missionRef.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${mission.missionRef.version+1},record=${JSON.stringify(updatedMission)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${mission.missionRef.id} AND version=${mission.missionRef.version}`;
  await appendChange(tx,{command,target:runRef,eventType:'abh.run.start',changedFields:['status'],
   relatedRefs:[input.missionRef,input.authorityRef,record.assignmentSnapshotRef]});
  return record;
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
