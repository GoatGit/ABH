import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,BlockMissionPayload,CancelMissionPayload,CloseMissionPayload,CreateMissionPayload,EntityRef,MissionBlockerRecord,MissionConditionInput,MissionConditionRecord,MissionRecord,MissionTriggerRecord,PauseMissionPayload,ResolveBlockerPayload,ResumeMissionPayload,ReviseMissionGoalPayload,SubmitTriggerPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';

const missionPurposeNames=['abh.mission.manage'];

export interface MissionDefinitionChecks {
 /** Resolve exact registered Workflow and deterministic condition definitions,
  * resource envelope and responsibility scopes; reject missing/ambiguous input.
  * This validates a Draft, never activates authority or creates a Run. */
 definition(tx:TenantTransaction,input:CreateMissionPayload,goal:ArtifactRecord,bytes:Uint8Array,options:TransactionOptions):Promise<void>;
}

/** Sole writer for Mission goals and immutable condition revisions. */
export class MissionOwner {
 async get(tx:TenantTransaction,id:string):Promise<MissionRecord>{
  contract('UUID',id);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,goal_revision,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('MissionRecord',row.record);
  if(record.missionRef.id!==id||record.resourceOrganizationId!==c.resourceOrganizationId||record.missionRef.version!==Number(row.version)
   ||record.status!==row.status||record.goalRevision!==Number(row.goal_revision)||record.stopEpoch!==Number(row.stop_epoch))throw new CoreError('INTERNAL_ERROR');
  return record;
 }
 async conditions(tx:TenantTransaction,ref:EntityRef):Promise<MissionConditionRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.mission-conditions')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,mission_id,goal_revision FROM core.mission_conditions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const value=contract('MissionConditionRecord',row.record);
  if(canonicalJson(value.conditionRef)!==canonicalJson(ref)||value.resourceOrganizationId!==c.resourceOrganizationId
   ||value.conditionRef.version!==Number(row.version)||value.missionRef.id!==row.mission_id||value.goalRevision!==Number(row.goal_revision)
   ||await digestContract('MissionConditionRecord',value)!==value.digest)throw new CoreError('MISSION_DEFINITION_INVALID');
  return value;
 }
 async validate(tx:TenantTransaction,options:TransactionOptions,input:CreateMissionPayload,checks:MissionDefinitionChecks){
  const value=contract('CreateMissionPayload',structuredClone(input)),owner=new InlineArtifactOwner();
  await owner.lockSources(tx,[value.goalArtifactRef]);
  const saved=await owner.read(tx,value.goalArtifactRef,async()=>{});
  await boundedCallback(opts=>checks.definition(tx,structuredClone(value),structuredClone(saved.record),new Uint8Array(saved.bytes),opts),options);
  const current=await owner.read(tx,value.goalArtifactRef,async()=>{});
  if(canonicalJson(current.record)!==canonicalJson(saved.record))throw new CoreError('MISSION_DEFINITION_INVALID');
  return saved.record;
 }
 async create(tx:TenantTransaction,command:CommandIdentity,input:CreateMissionPayload,goal:ArtifactRecord):Promise<MissionRecord>{
  contract('CreateMissionPayload',input);const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.mission.manage'||canonicalJson(goal.artifactRef)!==canonicalJson(input.goalArtifactRef))throw new CoreError('MISSION_DEFINITION_INVALID');
  const missionRef={type:'abh.mission',id:randomUUID(),version:1},conditionRef={type:'abh.mission-conditions',id:randomUUID(),version:1},purposeNames=['abh.mission.manage'];
  const unsigned={conditionRef,resourceOrganizationId:c.resourceOrganizationId,missionRef,goalRevision:1,...input.conditions,digest:'sha256:'+'0'.repeat(64)};
  const conditions=contract('MissionConditionRecord',{...unsigned,digest:await digestContract('MissionConditionRecord',unsigned)});
  const [clock]=await tx.owner('MissionController')`SELECT clock_timestamp() AS now`;
  const record=contract('MissionRecord',{missionRef,resourceOrganizationId:c.resourceOrganizationId,goalArtifactRef:goal.artifactRef,goalDigest:goal.contentDigest,goalRevision:1,
   domainType:input.domainType,workflowRef:input.workflowRef,conditionRef,responsibilityScopeRefs:input.responsibilityScopeRefs,
   status:'Draft',stopEpoch:0,pauseRequested:false,cleanupStatus:'NotRequired',purposeNames,createdBy:c.actor,createdAt:clock!.now.toISOString(),updatedAt:clock!.now.toISOString()});
  await tx.owner('MissionController')`INSERT INTO core.missions(resource_organization_id,id,workspace_id,purpose_names,record,status,goal_revision,stop_epoch)
    VALUES (${c.resourceOrganizationId},${missionRef.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(record)}::text::jsonb,'Draft',1,0)`;
  await tx.owner('MissionController')`INSERT INTO core.mission_conditions(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,goal_revision)
    VALUES (${c.resourceOrganizationId},${conditionRef.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(conditions)}::text::jsonb,${missionRef.id},1)`;
  await appendChange(tx,{command,target:conditionRef,eventType:'abh.mission-conditions.created',changedFields:['goalRevision','digest'],relatedRefs:[missionRef,...Object.values(input.conditions)]});
  await appendChange(tx,{command,target:missionRef,eventType:'abh.mission.created',changedFields:['status','goalRevision','conditionRef'],relatedRefs:[input.goalArtifactRef,conditionRef]});
  return record;
 }
 async activate(tx:TenantTransaction,ref:EntityRef,authorityRef:EntityRef,command:CommandIdentity):Promise<MissionRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.mission')throw new CoreError('INVALID_ARGUMENT');
  contract('EntityRef',authorityRef);if(authorityRef.type!=='abh.mission-authority')throw new CoreError('MISSION_AUTHORITY_MISSING');
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,goal_revision,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(row.status!=='Draft')throw new CoreError('VERSION_CONFLICT');
  const record=contract('MissionRecord',{...contract('MissionRecord',row.record),
   status:'Active',authorityRef,updatedAt:new Date().toISOString(),missionRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},status='Active',record=${JSON.stringify(record)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP,updated_by=${c.actor.id}::uuid
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  const [updated]=await tx.owner('MissionController')`SELECT version FROM core.missions WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}`;
  if(!updated||Number(updated.version)!==ref.version+1)throw new CoreError('VERSION_CONFLICT');
  await appendChange(tx,{command,target:record.missionRef,eventType:'abh.mission.activate',
    changedFields:['status','authorityRef'],relatedRefs:[authorityRef]});
  return record;
 }
 async submitTrigger(tx:TenantTransaction,input:SubmitTriggerPayload):Promise<{disposition:'Accepted'|'Duplicate'|'Obsolete'}>{
  contract('SubmitTriggerPayload',structuredClone(input));const c=tx.context.tenant;
  const [mission]=await tx.owner('MissionController')`SELECT record,version,status,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.missionRef.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!mission)throw new CoreError('RESOURCE_NOT_FOUND');
  if(mission.status!=='Active')return {disposition:'Obsolete'};
  const [existing]=await tx.owner('MissionController')`SELECT record FROM core.mission_triggers
    WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${input.missionRef.id} AND trigger_key=${input.triggerKey}`;
  if(existing){
   const prior=contract('MissionTriggerRecord',existing.record);
   if(prior.sourceWatermark>=input.sourceWatermark)return {disposition:'Duplicate'};
   await tx.owner('MissionController')`UPDATE core.mission_triggers SET record=${JSON.stringify({...prior,sourceWatermark:input.sourceWatermark,disposition:'Obsolete'})}::text::jsonb,
     updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${input.missionRef.id} AND trigger_key=${input.triggerKey}`;
   return {disposition:'Accepted'};
  }
  const trigger:MissionTriggerRecord={triggerKey:input.triggerKey,missionRef:input.missionRef,sourceEventRef:input.sourceEventRef,
   sourceWatermark:input.sourceWatermark,kind:input.kind,disposition:'Accepted'};
  await tx.owner('MissionController')`INSERT INTO core.mission_triggers(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key)
    VALUES (${c.resourceOrganizationId},${randomUUID()},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(trigger)}::text::jsonb,${input.missionRef.id},${input.triggerKey})`;
  return {disposition:'Accepted'};
 }
 async pendingTriggers(tx:TenantTransaction,missionId:string):Promise<MissionTriggerRecord[]>{
  contract('UUID',missionId);const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT record FROM core.mission_triggers
    WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${missionId}
      AND deleted_at IS NULL AND record->>'disposition'='Accepted'
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
    ORDER BY created_at,id LIMIT 100`;
  return rows.map(row=>{
   const trigger=contract('MissionTriggerRecord',row.record);
   if(trigger.missionRef.id!==missionId)throw new CoreError('INTERNAL_ERROR');
   return trigger;
  });
 }
 async blockers(tx:TenantTransaction,missionId:string,resolved:boolean):Promise<MissionBlockerRecord[]>{
  contract('UUID',missionId);const c=tx.context.tenant;
  const rows=await tx.owner('MissionController')`SELECT record FROM core.mission_blockers
    WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${missionId}
      AND deleted_at IS NULL AND (record->>'resolved')::boolean=${resolved}
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
    ORDER BY created_at,id LIMIT 100`;
  return rows.map(row=>{
   const blocker=contract('MissionBlockerRecord',row.record);
   if(blocker.missionRef.id!==missionId||blocker.resourceOrganizationId!==c.resourceOrganizationId
     ||blocker.resolved!==resolved)throw new CoreError('INTERNAL_ERROR');
   return blocker;
  });
 }
 async pause(tx:TenantTransaction,ref:EntityRef,reasonCode:string,command:CommandIdentity):Promise<MissionRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(row.status!=='Active')throw new CoreError('VERSION_CONFLICT');
  const record=contract('MissionRecord',{...contract('MissionRecord',row.record),
   status:'Paused',pauseRequested:true,updatedAt:new Date().toISOString(),missionRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},status='Paused',record=${JSON.stringify(record)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  await appendChange(tx,{command,target:record.missionRef,eventType:'abh.mission.pause',
    changedFields:['status','pauseRequested'],relatedRefs:[]});
  return record;
 }
 async cancel(tx:TenantTransaction,ref:EntityRef,reasonCode:string,evidenceRefs:readonly EntityRef[],command:CommandIdentity):Promise<MissionRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(['Completed','Cancelled'].includes(row.status as string))throw new CoreError('VERSION_CONFLICT');
  const prior=contract('MissionRecord',row.record);
  const stopEpoch=Number(row.stop_epoch)+1;
  const record=contract('MissionRecord',{...prior,status:'Cancelled',pauseRequested:false,
   cleanupStatus:prior.status==='Active'?'Pending':'NotRequired',
   stopEpoch,updatedAt:new Date().toISOString(),missionRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},status='Cancelled',stop_epoch=${stopEpoch},
    record=${JSON.stringify(record)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  await appendChange(tx,{command,target:record.missionRef,eventType:'abh.mission.cancel',
    changedFields:['status','pauseRequested','cleanupStatus','stopEpoch'],relatedRefs:[...evidenceRefs]});
  return record;
 }
 async resume(tx:TenantTransaction,ref:EntityRef,resolvedBlockerRefs:readonly EntityRef[],command:CommandIdentity):Promise<MissionRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Paused','Blocked'].includes(row.status as string))throw new CoreError('MISSION_BLOCKED');
  if(row.status==='Blocked'){
   const blockers=resolvedBlockerRefs??[];
   if(blockers.length===0)throw new CoreError('MISSION_BLOCKED');
   for(const blockerRef of blockers){
    await tx.owner('MissionController')`UPDATE core.mission_blockers SET record=jsonb_set(record,'{resolved}','true'::jsonb),updated_at=CURRENT_TIMESTAMP
      WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${ref.id} AND id=${blockerRef.id} AND (record->>'resolved')::boolean=false`;
   }
   const [unresolved]=await tx.owner('MissionController')`SELECT count(*) AS count FROM core.mission_blockers
     WHERE resource_organization_id=${c.resourceOrganizationId} AND mission_id=${ref.id} AND (record->>'required')::boolean=true AND (record->>'resolved')::boolean=false`;
   if(Number(unresolved?.count??0)>0)throw new CoreError('MISSION_BLOCKED');
  }
  const record=contract('MissionRecord',{...contract('MissionRecord',row.record),
   status:'Active',pauseRequested:false,updatedAt:new Date().toISOString(),missionRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},status='Active',record=${JSON.stringify(record)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  await appendChange(tx,{command,target:record.missionRef,eventType:'abh.mission.resume',
    changedFields:['status','pauseRequested'],relatedRefs:[...resolvedBlockerRefs]});
  return record;
 }
 async block(tx:TenantTransaction,ref:EntityRef,input:BlockMissionPayload,command:CommandIdentity):Promise<MissionRecord>{
  contract('BlockMissionPayload',structuredClone(input));const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,stop_epoch FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(row.status!=='Active')throw new CoreError('VERSION_CONFLICT');
  const blockerRef={type:'abh.mission-blocker' as const,id:randomUUID(),version:1};
  const missionTyped={...ref,type:'abh.mission' as const};
  const blocker:MissionBlockerRecord={blockerRef,resourceOrganizationId:c.resourceOrganizationId,missionRef:missionTyped,
   blockerType:input.blockerType,sourceEvidenceRef:input.sourceEvidenceRef,required:input.required,resolved:false};
  await tx.owner('MissionController')`INSERT INTO core.mission_blockers(resource_organization_id,id,workspace_id,purpose_names,record,mission_id)
    VALUES (${c.resourceOrganizationId},${blockerRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(blocker)}::text::jsonb,${ref.id})`;
  const record=contract('MissionRecord',{...contract('MissionRecord',row.record),
   status:'Blocked',updatedAt:new Date().toISOString(),missionRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},status='Blocked',record=${JSON.stringify(record)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  await appendChange(tx,{command,target:record.missionRef,eventType:'abh.mission.block',
    changedFields:['status'],relatedRefs:[blockerRef]});
  return record;
 }
 async close(tx:TenantTransaction,ref:EntityRef,outcome:'Completed'|'Cancelled',resultRefs:readonly EntityRef[],conditionEvaluationRef:EntityRef,command:CommandIdentity):Promise<MissionRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(row.status!=='Active')throw new CoreError('VERSION_CONFLICT');
  const record=contract('MissionRecord',{...contract('MissionRecord',row.record),
   status:outcome,cleanupStatus:'NotRequired',updatedAt:new Date().toISOString(),
   missionRef:{...ref,version:ref.version+1},resultRefs});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},status=${outcome},record=${JSON.stringify(record)}::text::jsonb,
    updated_at=CURRENT_TIMESTAMP WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  await appendChange(tx,{command,target:record.missionRef,
    eventType:outcome==='Completed'?'abh.mission.complete':'abh.mission.cancel',
    changedFields:['status','cleanupStatus'],relatedRefs:[conditionEvaluationRef,...resultRefs]});
  return record;
 }
 async reviseGoal(tx:TenantTransaction,ref:EntityRef,goalArtifactRef:EntityRef,conditions:MissionConditionInput,authorityRef:EntityRef):Promise<MissionRecord>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('MissionController')`SELECT record,version,status,goal_revision FROM core.missions
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  if(Number(row.version)!==ref.version)throw new CoreError('VERSION_CONFLICT');
  if(!['Active','Paused','Blocked'].includes(row.status as string))throw new CoreError('VERSION_CONFLICT');
  const prior=contract('MissionRecord',row.record),newGoalRevision=Number(row.goal_revision)+1;
  const conditionRef={type:'abh.mission-conditions' as const,id:randomUUID(),version:1};
  const unsigned={conditionRef,resourceOrganizationId:c.resourceOrganizationId,missionRef:{...ref,version:ref.version+1},goalRevision:newGoalRevision,...conditions,digest:'sha256:'+'0'.repeat(64)};
  const newConditions=contract('MissionConditionRecord',{...unsigned,digest:await digestContract('MissionConditionRecord',unsigned)});
  await tx.owner('MissionController')`INSERT INTO core.mission_conditions(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,goal_revision)
    VALUES (${c.resourceOrganizationId},${conditionRef.id},${c.workspaceId??null},${prior.purposeNames},${JSON.stringify(newConditions)}::text::jsonb,${ref.id},${newGoalRevision})`;
  const record=contract('MissionRecord',{...prior,goalArtifactRef,goalRevision:newGoalRevision,conditionRef,
   stopEpoch:prior.stopEpoch+1,updatedAt:new Date().toISOString(),missionRef:{...ref,version:ref.version+1}});
  await tx.owner('MissionController')`UPDATE core.missions SET version=${ref.version+1},goal_revision=${newGoalRevision},
    stop_epoch=${record.stopEpoch},record=${JSON.stringify(record)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND version=${ref.version}`;
  return record;
 }
}
