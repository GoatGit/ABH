import type {EntityRef,EvaluationGateArtifactRecord,EvaluationRunListResult,LearningCandidateListResult,
  LearningCaseListResult,LearningGateListResult,LearningSignalListResult,ListEvaluationRunsQuery,
  ListLearningCandidatesQuery,ListLearningCasesQuery,ListLearningGatesQuery,
  ListLearningSignalsQuery} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {ListAssignmentsQuery} from '@abh/contracts';
import type {VerifiedContext} from '../internal/context.ts';
import type {ActivateMissionAdmission} from '../mission/activate-mission.ts';
import type {MissionDefinitionChecks} from '../mission/missions.ts';
import {activateMission} from '../mission/activate-mission.ts';
import {submitTrigger} from '../mission/submit-trigger.ts';
import {pauseMission,cancelMission,resumeMission,blockMission,closeMission} from '../mission/lifecycle.ts';
import {startRun,completeRun,cancelRun} from '../mission/run-commands.ts';
import {invokeTool,type InvokeToolPorts} from '../mission/tool-commands.ts';
import {createMission} from '../mission/create-mission.ts';
import {MissionOwner} from '../mission/missions.ts';
import {RunOwner} from '../mission/runs.ts';
import {VerificationOwner} from '../mission/verification.ts';
import {submitVerification} from '../mission/submit-verification.ts';
import {captureSignal} from '../mission/capture-signal.ts';
import {contract} from '../data/journal.ts';
import {digestCommandIntent} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';
import {ContextOwner} from '../mission/context.ts';
import {ToolGatewayOwner} from '../mission/gateway.ts';
import {LearningOwner} from '../mission/learning.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {ProjectionOwner,redactMissionSummaryData,requestMissionSummaryRefresh} from '../workbench/projections.ts';
import type {ProjectionMetrics} from '../workbench/projection-metrics.ts';
import type {ProjectionCursorCodec} from './projection-cursor.ts';
import {MissionCursorCodec,type MissionListFilter} from './mission-cursor.ts';
import {RunCursorCodec,type RunListFilter} from './run-cursor.ts';
import type {LearningCursorCodec} from './learning-cursor.ts';
import {StaticReleaseOwner} from '../release/static.ts';

type LearningRouteAuthority={
  cursor:LearningCursorCodec;
  grants(context:VerifiedContext,filter:Record<string,unknown>,options:TransactionOptions):Promise<readonly EntityRef[]>;
};

export interface MissionHttpInstallation {
  /** Trusted grant resolution per command; the Owner revalidates in every transaction. */
  grants(context:VerifiedContext,command:{type:string;target:EntityRef},options:TransactionOptions):Promise<readonly EntityRef[]>;
  definition:MissionDefinitionChecks;
  activation:ActivateMissionAdmission;
  fenceRefs(tx:import('../data/uow.ts').TenantTransaction,payload:unknown,options:TransactionOptions):Promise<readonly EntityRef[]>;
  tool?:InvokeToolPorts;
  projectionList?:{
    cursor:ProjectionCursorCodec;
    grants(context:VerifiedContext,options:TransactionOptions):Promise<readonly EntityRef[]>;
  };
  list?:{
    cursor:MissionCursorCodec;
    grants(context:VerifiedContext,filter:MissionListFilter,options:TransactionOptions):Promise<readonly EntityRef[]>;
  };
  runList?:{
    cursor:RunCursorCodec;
    grants(context:VerifiedContext,filter:RunListFilter,options:TransactionOptions):Promise<readonly EntityRef[]>;
  };
  learningLists?:{
    signals?:LearningRouteAuthority;
    cases?:LearningRouteAuthority;
    candidates?:LearningRouteAuthority;
    evaluationRuns?:LearningRouteAuthority;
    gates?:LearningRouteAuthority;
  };
  assignmentGet?:{
    grants(context:VerifiedContext,id:string,options:TransactionOptions):Promise<readonly EntityRef[]>;
  }|undefined;
  assignmentList?:LearningRouteAuthority|undefined;
  contextGet?:{
    grants(context:VerifiedContext,id:string,options:TransactionOptions):Promise<readonly EntityRef[]>;
  };
  projectionMetrics?:ProjectionMetrics;
}

export type MissionCommandResult={missionRef:EntityRef;commandId:string;replayed:boolean};

const missionActionCommands={
  activate:'abh.missions.activate',pause:'abh.missions.pause',cancel:'abh.missions.cancel',
  resume:'abh.missions.resume',block:'abh.missions.block',
  'revise-goal':'abh.missions.revise-goal',close:'abh.missions.close',
} as const;

function missionActions(status:string):string[]{
 return status==='Active'?['pause','cancel','block','revise-goal','close']:
  status==='Draft'?['activate']:status==='Paused'?['resume','cancel']:[];
}

async function permittedMissionActions(install:MissionHttpInstallation,tx:import('../data/uow.ts').TenantTransaction,
  options:TransactionOptions,record:import('@abh/contracts').MissionRecord):Promise<string[]>{
 const organization={type:'abh.organization' as const,id:tx.context.tenant.resourceOrganizationId,version:1};
 const actions:string[]=[];
 for(const action of missionActions(record.status)){
  const actionType=missionActionCommands[action as keyof typeof missionActionCommands];
  try{
   const refs=await install.grants(tx.context,{type:actionType,target:record.missionRef},options);
   await assertCurrentGrants(tx,{objectRef:record.missionRef,
     scopeRefs:[organization],action:actionType},refs);
   actions.push(action);
  }catch(error){
   if(!(error instanceof CoreError))throw error;
  }
 }
 return actions;
}

export function createMissionHandlers(database:Database,install:MissionHttpInstallation){
 const grants=install.grants.bind(install);
 if(!install.tool)throw new TypeError('Tool adapter, output validator, and result storage installation required');
 const tool={...install.tool};
 return {
  'abh.missions.create':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const typed=command as Parameters<typeof createMission>[3];
   const refs=await grants(context,{type:'abh.missions.create',target:{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1}},options);
   return createMission(database,context,options,typed,refs,{
    fenceRefs:(tx,payload,opts)=>install.fenceRefs(tx,payload,opts),
    definition:install.definition.definition.bind(install.definition),
   });
  },
  'abh.missions.activate':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.activate',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return activateMission(database,context,options,command as Parameters<typeof activateMission>[3],refs,install.activation);
  },
  'abh.missions.pause':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.pause',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return pauseMission(database,context,options,command as Parameters<typeof pauseMission>[3],refs);
  },
  'abh.missions.cancel':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.cancel',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return cancelMission(database,context,options,command as Parameters<typeof cancelMission>[3],refs);
  },
  'abh.missions.resume':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.resume',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return resumeMission(database,context,options,command as Parameters<typeof resumeMission>[3],refs);
  },
  'abh.missions.block':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.block',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return blockMission(database,context,options,command as Parameters<typeof blockMission>[3],refs);
  },
  'abh.missions.close':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.close',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return closeMission(database,context,options,command as Parameters<typeof closeMission>[3],refs);
  },
 'abh.missions.submit-trigger':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.submit-trigger',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return submitTrigger(database,context,options,command as Parameters<typeof submitTrigger>[3],refs);
 },
  'abh.runs.start':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.runs.start',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   return startRun(database,context,options,command as Parameters<typeof startRun>[3],refs);
  },
 'abh.runs.complete':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.runs.complete',target:(command as {payload:{runRef:EntityRef}}).payload.runRef},options);
   return completeRun(database,context,options,command as Parameters<typeof completeRun>[3],refs);
  },
 'abh.runs.cancel':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.runs.cancel',target:(command as {payload:{runRef:EntityRef}}).payload.runRef},options);
   return cancelRun(database,context,options,command as Parameters<typeof cancelRun>[3],refs);
  },
 'abh.learning.capture-signal':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.learning.capture-signal',target:{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1}},options);
   return captureSignal(database,context,options,command as Parameters<typeof captureSignal>[3],refs);
  },
 'abh.verification.submit':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.verification.submit',target:(command as {payload:{taskRef:EntityRef}}).payload.taskRef},options);
   return submitVerification(database,context,options,command as Parameters<typeof submitVerification>[3],refs);
 },
  'abh.tools.invoke':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const typed=command as Parameters<typeof invokeTool>[3];
   const refs=await grants(context,{type:typed.type,target:{...typed.target,version:1}},options);
   return invokeTool(database,context,options,typed,refs,tool);
  },
  'abh.missions.revise-goal':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.revise-goal',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   const owner=new MissionOwner();
   return database.transaction(context,options,async tx=>{
    const input=command as {payload:import('@abh/contracts').ReviseMissionGoalPayload};
    const mission=await owner.reviseGoal(tx,input.payload.missionRef,input.payload.goalArtifactRef,input.payload.conditions,input.payload.authorityRef);
    return mission;
   });
  },
  'abh.missions.resolve-blocker':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const refs=await grants(context,{type:'abh.missions.resolve-blocker',target:(command as {payload:{missionRef:EntityRef}}).payload.missionRef},options);
   const input=contract('ResolveBlockerCommand',command);
   return database.transaction(context,options,async tx=>{
    const identity={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
      digest:await digestCommandIntent(input)};
    const mission=await new MissionOwner().resume(tx,input.payload.missionRef,[input.payload.blockerRef],identity);
    return mission;
   });
  },
  'abh.projections.refresh-mission-summary':async(context:VerifiedContext,options:TransactionOptions,command:unknown)=>{
   const typed=command as Parameters<typeof requestMissionSummaryRefresh>[3];
   const refs=await grants(context,{type:typed.type,target:typed.payload.missionRef},options);
   return requestMissionSummaryRefresh(database,context,options,typed,refs);
  },
 } as const;
}

export function createMissionQueryHandlers(database:Database,install:MissionHttpInstallation){
 const projectionMetrics=install.projectionMetrics;
 return {
 'abh.assignments.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
  const authority=install.assignmentGet;if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  contract('UUID',id);
  const refs=structuredClone(await authority.grants(context,id,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:{type:'abh.assignment',id,version:1},scopeRefs:[organization],
     action:'abh.release.manage'},refs);
   return await new StaticReleaseOwner().getAssignment(tx,{type:'abh.assignment',id,version:1});
  });
 },
 'abh.assignments.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
  const authority=install.assignmentList;if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  const {cursor,limit=25,...filterInput}=contract('ListAssignmentsQuery',supplied);
  const filter:Omit<ListAssignmentsQuery,'cursor'|'limit'>=structuredClone(filterInput);
  const after=cursor?authority.cursor.decode(cursor,context.request,filter):undefined;
  const refs=structuredClone(await authority.grants(context,filter,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.release.manage'},refs);
   const page=await new StaticReleaseOwner().listAssignments(tx,{...filter,limit,...(after?{after}:{})});
   return contract('StaticAssignmentListResult',{assignments:page.records,counts:page.counts,
     ...(page.next?{cursor:authority.cursor.encode(page.next,context.request,filter)}:{}),
     asOf:new Date().toISOString()});
  });
 },
 'abh.missions.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
   const owner=new MissionOwner();
   return database.transaction(context,options,async tx=>{
    const record=await owner.get(tx,id);
    const conditions=await owner.conditions(tx,record.conditionRef);
    return {mission:record,conditions,pendingTriggers:await owner.pendingTriggers(tx,id),
      blockers:await owner.blockers(tx,id,false),
      availableActions:await permittedMissionActions(install,tx,options,record),asOf:new Date().toISOString()};
   });
  },
 'abh.runs.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
   const owner=new RunOwner();
   return database.transaction(context,options,async tx=>{
    const run=await owner.get(tx,id);
    const tasks=await owner.tasks(tx,run.runRef);
    return {run,tasks,asOf:new Date().toISOString()};
  });
 },
 'abh.tools.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
  const owner=new ToolGatewayOwner(),inspectionGrants=install.tool?.inspectionGrants;
  if(!inspectionGrants)throw new CoreError('AUTHORITY_REQUIRED');
  const refs=structuredClone(await inspectionGrants(context,id,options));
  return database.transaction(context,options,async tx=>{
   if(context.tenant.purposeOfUse!=='abh.mission.manage')throw new CoreError('PURPOSE_DENIED');
   const call=await owner.get(tx,id);
   const organization={type:'abh.organization' as const,id:context.tenant.resourceOrganizationId,version:1};
   const locked=await lockFences(tx,[organization,...refs]);
   if(locked.some(value=>value.stopFlag))throw new CoreError('EPOCH_REVOKED');
   await assertCurrentGrants(tx,{objectRef:{...call.callRef,version:1},scopeRefs:[organization],action:'abh.tools.read'},refs);
   return {call,trackingRef:call.callRef,cost:await owner.cost(tx,call.callRef.id),asOf:new Date().toISOString()};
  });
 },
  'abh.missions.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
   const owner=new MissionOwner(),missionList=install.list;
   if(!missionList)throw new CoreError('AUTHORITY_REQUIRED');
   const {cursor,limit=25,...filterInput}=contract('ListMissionsQuery',supplied);
   const filter:MissionListFilter=structuredClone(filterInput);
   const after=cursor?missionList.cursor.decode(cursor,context.request,filter):undefined;
   const readRefs=structuredClone(await missionList.grants(context,filter,options));
   return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant;
    const organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
    await assertCurrentGrants(tx,{objectRef:{type:'abh.mission',id:c.resourceOrganizationId,version:1},
      scopeRefs:[organization],action:'abh.missions.read'},readRefs);
    const rows=await tx.owner('MissionController')`SELECT id,record,version,status,
        to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
      FROM core.missions
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${filter.missionStatus??null}::text IS NULL OR status=${filter.missionStatus??null})
        AND (${filter.domainType??null}::text IS NULL OR record->>'domainType'=${filter.domainType??null})
        AND (${filter.workspaceId??null}::uuid IS NULL OR workspace_id=${filter.workspaceId??null}::uuid)
        AND (${after?.id??null}::uuid IS NULL OR (updated_at,id)<(${after?.updatedAt??null}::text::timestamptz,${after?.id??null}::uuid))
      ORDER BY updated_at DESC,id DESC LIMIT ${limit+1}`;
    const page=rows.slice(0,limit),missions=page.map(row=>contract('MissionRecord',row.record));
    for(const mission of missions)if(mission.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
    const last=page.at(-1),next=rows.length>limit&&last?{
      updatedAt:String(last.updated_at),id:String(last.id)}:undefined;
    return {missions,...(next?{cursor:missionList.cursor.encode(next,context.request,filter)}:{}),
      asOf:new Date().toISOString()};
   });
  },
  'abh.runs.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
   const owner=new RunOwner(),runList=install.runList;
   if(!runList)throw new CoreError('AUTHORITY_REQUIRED');
   const {cursor,limit=25,...filterInput}=contract('ListRunsQuery',supplied);
   const filter:RunListFilter=structuredClone(filterInput);
   const after=cursor?runList.cursor.decode(cursor,context.request,filter):undefined;
   const readRefs=structuredClone(await runList.grants(context,filter,options));
   return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant;
    const organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
    await assertCurrentGrants(tx,{objectRef:{type:'abh.run',id:c.resourceOrganizationId,version:1},
      scopeRefs:[organization],action:'abh.runs.read'},readRefs);
    const rows=await tx.owner('MissionController')`SELECT id,record,
        to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
      FROM core.runs
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${filter.missionStatus??null}::text IS NULL OR status=${filter.missionStatus??null})
        AND (${filter.missionId??null}::uuid IS NULL OR mission_id=${filter.missionId??null}::uuid)
        AND (${after?.id??null}::uuid IS NULL OR (updated_at,id)<(${after?.updatedAt??null}::text::timestamptz,${after?.id??null}::uuid))
      ORDER BY updated_at DESC,id DESC LIMIT ${limit+1}`;
    const page=rows.slice(0,limit),runs=page.map(row=>contract('RunRecord',row.record));
    for(const run of runs)if(run.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
    const last=page.at(-1),next=rows.length>limit&&last?{
      updatedAt:String(last.updated_at),id:String(last.id)}:undefined;
    return {runs,...(next?{cursor:runList.cursor.encode(next,context.request,filter)}:{}),
      asOf:new Date().toISOString()};
   });
  },
  'abh.contexts.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
   const owner=new ContextOwner(),contextGet=install.contextGet;
   if(!contextGet)throw new CoreError('AUTHORITY_REQUIRED');
   contract('GetContextQuery',{id});
   const readRefs=structuredClone(await contextGet.grants(context,id,options));
   return database.transaction(context,options,async tx=>{
    const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
    await assertCurrentGrants(tx,{objectRef:{type:'abh.context',id,version:1},
      scopeRefs:[organization],action:'abh.missions.read'},readRefs);
    return owner.getById(tx,id);
   });
  },
  'abh.projections.get':async(context:VerifiedContext,options:TransactionOptions,id:string,query?:unknown)=>{
   const parsed=contract('GetProjectionQuery',query??{});
   if(parsed.type!=='abh.projection.mission-summary')throw new CoreError('RESOURCE_NOT_FOUND');
   return database.transaction(context,options,async tx=>{
    const stored=await new ProjectionOwner().get(tx,'abh.projection.mission-summary',
      {type:'abh.mission',id,version:1});
    return {projection:redactMissionSummaryData(stored,parsed.fieldSet,projectionMetrics),
      asOf:new Date().toISOString()};
   });
  },
  'abh.projections.build-mission-summary':async(context:VerifiedContext,options:TransactionOptions,missionId:string)=>{
   return database.transaction(context,options,async tx=>{
    const envelope=await new ProjectionOwner().refreshMissionSummary(tx,missionId);
    return {projection:envelope,asOf:new Date().toISOString()};
   });
  },
 'abh.projections.list':async(context:VerifiedContext,options:TransactionOptions,query:unknown)=>{
   const projectionList=install.projectionList;
   if(!projectionList)throw new CoreError('AUTHORITY_REQUIRED');
   const {cursor,limit=25,...filterInput}=contract('ListProjectionQuery',query);
   const filter=structuredClone(filterInput);
   const after=cursor?projectionList.cursor.decode(cursor,context.request,filter):undefined;
    const readRefs=structuredClone(await projectionList.grants(context,options));
    return database.transaction(context,options,async tx=>{
    const result=await new ProjectionOwner().listMissionSummaries(tx,{
      ...filter,limit,
      ...(after?{after}:{})},readRefs);
    return contract('ProjectionListResult',{projections:result.projections,
      ...(result.next?{cursor:projectionList.cursor.encode(result.next,context.request,filter)}:{}),
      asOf:result.asOf});
   });
  },
 'abh.evaluation-runs.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
   return database.transaction(context,options,async tx=>{
    const [row]=await tx.owner('LearningController')`SELECT version FROM core.evaluation_runs
      WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND id=${id}
        AND deleted_at IS NULL AND ${tx.context.tenant.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${tx.context.tenant.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    return await new LearningOwner().getEvaluationRun(tx,
      {type:'abh.evaluation-run',id,version:Number(row.version)});
   });
 },
 'abh.learning-signals.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
  const authority=install.learningLists?.signals;
  if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  const {cursor,limit=25,...filterInput}=contract('ListLearningSignalsQuery',supplied);
  const filter:Omit<ListLearningSignalsQuery,'cursor'|'limit'>=structuredClone(filterInput);
  const after=cursor?authority.cursor.decode(cursor,context.request,filter):undefined;
  const refs=structuredClone(await authority.grants(context,filter,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.learning.read'},refs);
   const page=await new LearningOwner().listSignals(tx,{...filter,limit,...(after?{after}:{})});
   return contract('LearningSignalListResult',{signals:page.records,counts:page.counts,
     ...(page.next?{cursor:authority.cursor.encode(page.next,context.request,filter)}:{}),
     asOf:new Date().toISOString()});
  });
},
 'abh.learning-cases.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
  const authority=install.learningLists?.cases;
  if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  const {cursor,limit=25,...filterInput}=contract('ListLearningCasesQuery',supplied);
  const filter:Omit<ListLearningCasesQuery,'cursor'|'limit'>=structuredClone(filterInput);
  const after=cursor?authority.cursor.decode(cursor,context.request,filter):undefined;
  const refs=structuredClone(await authority.grants(context,filter,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.learning.read'},refs);
   const page=await new LearningOwner().listCases(tx,{...filter,limit,...(after?{after}:{})});
   return contract('LearningCaseListResult',{cases:page.records,counts:page.counts,
     ...(page.next?{cursor:authority.cursor.encode(page.next,context.request,filter)}:{}),
     asOf:new Date().toISOString()});
  });
 },
 'abh.learning-candidates.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
  const authority=install.learningLists?.candidates;
  if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  const {cursor,limit=25,...filterInput}=contract('ListLearningCandidatesQuery',supplied);
  const filter:Omit<ListLearningCandidatesQuery,'cursor'|'limit'>=structuredClone(filterInput);
  const after=cursor?authority.cursor.decode(cursor,context.request,filter):undefined;
  const refs=structuredClone(await authority.grants(context,filter,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.learning.read'},refs);
   const page=await new LearningOwner().listCandidates(tx,{...filter,limit,...(after?{after}:{})});
   return contract('LearningCandidateListResult',{candidates:page.records,counts:page.counts,
     ...(page.next?{cursor:authority.cursor.encode(page.next,context.request,filter)}:{}),
     asOf:new Date().toISOString()});
  });
 },
 'abh.evaluation-results.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
   return database.transaction(context,options,async tx=>
     await new LearningOwner().getEvaluationResult(tx,{type:'abh.evaluation-result',id,version:1}));
 },
 'abh.evaluation-runs.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
  const authority=install.learningLists?.evaluationRuns;
  if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  const {cursor,limit=25,...filterInput}=contract('ListEvaluationRunsQuery',supplied);
  const filter:Omit<ListEvaluationRunsQuery,'cursor'|'limit'>=structuredClone(filterInput);
  const after=cursor?authority.cursor.decode(cursor,context.request,filter):undefined;
  const refs=structuredClone(await authority.grants(context,filter,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.learning.read'},refs);
   const page=await new LearningOwner().listEvaluationRuns(tx,{...filter,limit,...(after?{after}:{})});
   return contract('EvaluationRunListResult',{runs:page.records,counts:page.counts,
     ...(page.next?{cursor:authority.cursor.encode(page.next,context.request,filter)}:{}),
     asOf:new Date().toISOString()});
  });
 },
 'abh.learning-gates.list':async(context:VerifiedContext,options:TransactionOptions,supplied:unknown={})=>{
  const authority=install.learningLists?.gates;
  if(!authority)throw new CoreError('AUTHORITY_REQUIRED');
  const {cursor,limit=25,...filterInput}=contract('ListLearningGatesQuery',supplied);
  const filter:Omit<ListLearningGatesQuery,'cursor'|'limit'>=structuredClone(filterInput);
  const after=cursor?authority.cursor.decode(cursor,context.request,filter):undefined;
  const refs=structuredClone(await authority.grants(context,filter,options));
  return database.transaction(context,options,async tx=>{
   const c=tx.context.tenant,organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],action:'abh.learning.read'},refs);
   const page=await new LearningOwner().listGates(tx,{...filter,limit,...(after?{after}:{})});
   return contract('LearningGateListResult',{gates:page.records,counts:page.counts,
     ...(page.next?{cursor:authority.cursor.encode(page.next,context.request,filter)}:{}),
     asOf:new Date().toISOString()});
  });
 },
  'abh.learning-gates.get':async(context:VerifiedContext,options:TransactionOptions,id:string)=>{
   return database.transaction(context,options,async tx=>
     await new LearningOwner().getEvaluationGate(tx,{type:'abh.learning-gate',id,version:1}));
  },
 } as const;
}
