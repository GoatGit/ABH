'use server';

import {revalidatePath} from 'next/cache';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import type {SubmitDecisionPayload} from '@abh/contracts';
import {currentSession} from './session';
import {cancelActionIdempotencyKey,createWorkbenchClient,decisionIdempotencyKey,missionIdempotencyKey} from './client';
import {errorText} from './errors';
import {isOrganizationChoice,organizationCookieNames} from './organization';
import {currentCompensationAdapter} from './compensation-install';
import {validateCompensationInput,validateCompensationTemplate} from './compensation-validation';
import {compensationIdempotencyKey,pauseAssignmentIdempotencyKey,releaseLearningCandidateIdempotencyKey,rollbackAssignmentIdempotencyKey,requestEvaluationIdempotencyKey,retryEvaluationIdempotencyKey} from './keys';
import {cancelRunIdempotencyKey as cancelRunIntentKey} from './keys';
import {currentSettingsAdapter} from './settings-install';
import {validateSettingsInput,validateSettingsView} from './settings-validation';
import {currentDecisionFormsAdapter} from './decision-forms';
import {validateDecisionFormInput,validateDecisionFormTemplate} from './decision-forms-validation';

export type ActionState={status:'idle'}|{status:'submitting'|'success'|'error';message:string};

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitDecisionAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const decisionId=String(formData.get('decisionId')??'');
  const version=Number(formData.get('version')??0);
  const packageDigest=String(formData.get('packageDigest')??'');
  const formKey=String(formData.get('formKey')??'');
  const responseValue=String(formData.get('response')??'');
  const response=responseValue==='Approved'?'Approved' as const:responseValue==='Rejected'?'Rejected' as const:'';
  const inputText=String(formData.get('input')??'');
  if(!uuidPattern.test(decisionId)||!Number.isInteger(version)||version<1
    ||!(response==='Approved'||response==='Rejected')
    ||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(formKey)
    ||new TextEncoder().encode(inputText).byteLength>65536)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.decisions.get({id:decisionId,consistency:'Strong'});
    if(current.data.decisionRef.version!==version)return {status:'error',message:'CONFLICT'};
    if(current.data.status!=='Pending')return {status:'error',message:'INVALID_STATE'};
    if(current.data.package.packageDigest!==packageDigest)return {status:'error',message:'CONFLICT'};
    if(!current.data.package.allowedResponses.includes(response))
      return {status:'error',message:'FORBIDDEN'};
    const forms=await currentDecisionFormsAdapter().resolve({session,decision:current.data});
    if(!forms||!Array.isArray(forms)||forms.length>20)return {status:'error',message:'FORBIDDEN'};
    const matching=forms.filter(item=>validateDecisionFormTemplate(item)
      &&item.key===formKey&&item.response===response);
    if(matching.length!==1)return {status:'error',message:'FORBIDDEN'};
    const form=matching[0]!;
    let userInput:unknown;
    try{userInput=JSON.parse(inputText);}
    catch{return {status:'error',message:'INVALID_ARGUMENT'};}
    const validated=validateDecisionFormInput(form.inputSchema,userInput);
    if(!validated.success)return {status:'error',message:'INVALID_ARGUMENT'};
    const reason=typeof validated.data.reason==='string'?validated.data.reason.trim():undefined;
    const conditionRefs=validated.data.conditionRefs??[];
    const reauthProofRef=validated.data.reauthProofRef;
    if(response==='Rejected'&&(!reason||!Array.isArray(conditionRefs)||conditionRefs.length>0))
      return {status:'error',message:'INVALID_ARGUMENT'};
    const payload:SubmitDecisionPayload=response==='Approved'
      ?{response:'Approved' as const,packageDigest,
        conditionRefs:conditionRefs as {type:'abh.condition';id:string;version:number}[],
        ...(reason?{reason}:{}),...(reauthProofRef?{reauthProofRef:
          reauthProofRef as {type:'abh.reauth-proof';id:string;version:number}}:{})}
      :{response:'Rejected' as const,packageDigest,conditionRefs:[],reason:reason!};
    await client.decisions.submit({
      id:decisionId,expectedVersion:version,
      idempotencyKey:decisionIdempotencyKey({decisionId,version,response,packageDigest,
        reason:reason??'',conditionRefs:payload.conditionRefs,
        reauthProofRef:'reauthProofRef' in payload?payload.reauthProofRef:undefined}),
      payload,
    });
    revalidatePath('/');revalidatePath('/inbox');revalidatePath(`/decisions/${decisionId}`);
    return {status:'success',message:'决定已受理；生效与后续效果请等待服务端结果确认。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function pauseMissionAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('missionId')??''),version=Number(formData.get('version')??0);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!Number.isInteger(version)||version<1)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.missions.get(id);
    if(current.mission.missionRef.version!==version)return {status:'error',message:'CONFLICT'};
    if(current.mission.status!=='Active')return {status:'error',message:'INVALID_STATE'};
    await client.missions.pause({idempotencyKey:missionIdempotencyKey({missionId:id,version,action:'pause'}),
      payload:{missionRef:{type:'abh.mission',id,version},reasonCode:'abh.workbench.user.pause'}});
    revalidatePath('/');
    return {status:'success',message:'暂停请求已受理。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function resumeMissionAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('missionId')??''),version=Number(formData.get('version')??0);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!Number.isInteger(version)||version<1)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.missions.get(id);
    if(current.mission.missionRef.version!==version)return {status:'error',message:'CONFLICT'};
    if(current.mission.status!=='Paused')return {status:'error',message:'INVALID_STATE'};
    await client.missions.resume({idempotencyKey:missionIdempotencyKey({missionId:id,version,action:'resume'}),
      payload:{missionRef:{type:'abh.mission',id,version}}});
    revalidatePath('/');revalidatePath(`/missions/${id}`);
    return {status:'success',message:'恢复请求已受理。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function cancelMissionAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('missionId')??''),version=Number(formData.get('version')??0);
  const reason=String(formData.get('reason')??'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ||!Number.isInteger(version)||version<1||reason.length===0||reason.length>2000)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.missions.get(id);
    if(current.mission.missionRef.version!==version)return {status:'error',message:'CONFLICT'};
    if(!['Draft','Active','Paused','Blocked'].includes(current.mission.status))
      return {status:'error',message:'INVALID_STATE'};
    await client.missions.cancel({idempotencyKey:missionIdempotencyKey({
      missionId:id,version,action:'cancel',reason}),
      payload:{missionRef:{type:'abh.mission',id,version},
        reasonCode:'abh.workbench.user.cancel'}});
    return {status:'success',message:'取消请求已受理；清理状态请等待服务端确认。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function cancelActionAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('actionId')??'');
  const version=Number(formData.get('version')??0);
  const reason=String(formData.get('reason')??'').trim();
  if(!uuidPattern.test(id)||!Number.isInteger(version)||version<1
    ||reason.length===0||reason.length>2000)return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    await client.actions.cancel({id,expectedVersion:version,
      idempotencyKey:cancelActionIdempotencyKey({actionId:id,version,reason}),
      payload:{reason}});
    revalidatePath('/');revalidatePath('/actions');revalidatePath(`/actions/${id}`);
    return {status:'success',message:'取消请求已受理；最终状态请等待服务端确认或对账。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function cancelRunAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('runId')??''),version=Number(formData.get('version')??0);
  const reason=String(formData.get('reason')??'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ||!Number.isInteger(version)||version<1||reason.length===0||reason.length>2000)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.runs.get(id);
    if(current.run.runRef.version!==version)return {status:'error',message:'CONFLICT'};
    if(!['Running','Waiting','Paused'].includes(current.run.status))
      return {status:'error',message:'INVALID_STATE'};
    const evidenceRefs=[current.run.assignmentSnapshotRef];
    await client.runs.cancel({id,expectedVersion:version,
      idempotencyKey:cancelRunIntentKey({runId:id,version,reason,evidenceRefs}),
      payload:{runRef:{type:'abh.run',id,version},
        reasonCode:'abh.workbench.user.cancel',evidenceRefs}});
    return {status:'success',message:'Run 取消已受理；任务停止状态请等待服务端确认。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function requestEvaluationAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const candidateId=String(formData.get('candidateId')??'');
  const candidateVersion=Number(formData.get('candidateVersion')??0);
  const baselineArtifactId=String(formData.get('baselineArtifactId')??'');
  const baselineVersion=Number(formData.get('baselineVersion')??0);
  if(!uuidPattern.test(candidateId)||!Number.isInteger(candidateVersion)||candidateVersion<1
    ||!uuidPattern.test(baselineArtifactId)||!Number.isInteger(baselineVersion)||baselineVersion<1)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const candidates=await client.learning.listCandidates({candidateStatus:'Draft',limit:100});
    const candidate=candidates.candidates.find(item=>item.candidateRef.id===candidateId
      &&item.candidateRef.version===candidateVersion);
    if(!candidate)return {status:'error',message:'RESOURCE_NOT_FOUND'};
    await client.learning.requestEvaluation({
      organizationId:session.resourceOrganizationId,
      idempotencyKey:requestEvaluationIdempotencyKey({
        candidateId,candidateVersion,baselineArtifactId,baselineVersion}),
      payload:{candidateRef:candidate.candidateRef,
        baselineRef:{type:'abh.artifact',id:baselineArtifactId,version:baselineVersion}},
    });
    revalidatePath('/learning');
    return {status:'success',message:'评测请求已受理'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function retryEvaluationAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const runId=String(formData.get('runId')??'');
  const version=Number(formData.get('version')??0);
  if(!uuidPattern.test(runId)||!Number.isInteger(version)||version<1)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.learning.getEvaluationRun(runId);
    if(current.runRef.version!==version||current.status!=='Inconclusive')
      return {status:'error',message:'INVALID_STATE'};
    await client.learning.retryEvaluation({
      organizationId:session.resourceOrganizationId,
      idempotencyKey:retryEvaluationIdempotencyKey({runId,version}),
      payload:{runRef:{type:'abh.evaluation-run',id:runId,version}},
    });
    revalidatePath('/learning');
    return {status:'success',message:'评测重试已受理'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

function formValue(formData:FormData,name:string,minimum=1,maximum=200):string|null{
  const value=String(formData.get(name)??'').trim();
  return value.length>=minimum&&value.length<=maximum?value:null;
}

export async function releaseLearningCandidateAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const candidateId=String(formData.get('candidateId')??''),candidateVersion=Number(formData.get('candidateVersion')??0);
  const gateId=String(formData.get('gateId')??''),gateVersion=Number(formData.get('gateVersion')??0);
  const compatibilityArtifactId=String(formData.get('compatibilityArtifactId')??'');
  const compatibilityArtifactVersion=Number(formData.get('compatibilityArtifactVersion')??0);
  const behaviorSlot=formValue(formData,'behaviorSlot',3,100);
  const capabilityId=formValue(formData,'capabilityId',3,100);
  const capabilityVersion=formValue(formData,'capabilityVersion',1,50);
  const capabilityDigest=formValue(formData,'capabilityDigest',71,71);
  if(!uuidPattern.test(candidateId)||!Number.isInteger(candidateVersion)||candidateVersion<1
    ||!uuidPattern.test(gateId)||!Number.isInteger(gateVersion)||gateVersion<1
    ||!uuidPattern.test(compatibilityArtifactId)||!Number.isInteger(compatibilityArtifactVersion)
    ||compatibilityArtifactVersion<1||!behaviorSlot||!capabilityId||!capabilityVersion
    ||!capabilityDigest||!/^sha256:[0-9a-f]{64}$/.test(capabilityDigest))
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const gate=await client.learning.getLearningGate(gateId);
    if(gate.gateRef.version!==gateVersion||gate.verdict!=='Pass'
      ||gate.candidateRef.id!==candidateId||gate.candidateRef.version!==candidateVersion)
      return {status:'error',message:'INVALID_STATE'};
    const releaseId=crypto.randomUUID();
    await client.releases.configureLearningCandidate({
      releaseId,
      idempotencyKey:releaseLearningCandidateIdempotencyKey({
        candidateId,candidateVersion,gateId,gateVersion,behaviorSlot,capabilityId,
        capabilityVersion,capabilityDigest,compatibilityArtifactId,compatibilityArtifactVersion,
      }),
      payload:{
        candidateRef:{type:'abh.learning-candidate',id:candidateId,version:candidateVersion},
        gateRef:{type:'abh.learning-gate',id:gateId,version:gateVersion},
        release:{
          releaseRef:{type:'abh.release',id:releaseId,version:1},
          resourceOrganizationId:session.resourceOrganizationId,
          assets:[{behaviorSlot,capabilityExactRefs:[{kind:'BehaviorPolicy',id:capabilityId,
            version:capabilityVersion,digest:capabilityDigest}]}],
          gateRefs:[{type:'abh.learning-gate',id:gateId,version:gateVersion}],
          compatibilityRef:{type:'abh.artifact',id:compatibilityArtifactId,
            version:compatibilityArtifactVersion},status:'Ready',
        },
        assignment:{
          assignmentRef:{type:'abh.assignment',id:crypto.randomUUID(),version:1},
          resourceOrganizationId:session.resourceOrganizationId,
          releaseRef:{type:'abh.release',id:releaseId,version:1},
          scopeRefs:[{type:'abh.organization',id:session.resourceOrganizationId,version:1}],
          scopeTier:'Organization',status:'Active',selectable:true,executionAllowed:true,
          evidenceRefs:[{type:'abh.learning-gate',id:gateId,version:gateVersion},
            {type:'abh.artifact',id:compatibilityArtifactId,version:compatibilityArtifactVersion}],
        },
      },
    });
    revalidatePath('/learning');
    return {status:'success',message:'Learning Release 已受理'};
}catch(error){return {status:'error',message:errorText(error)};}
}

export async function pauseAssignmentAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('assignmentId')??''),version=Number(formData.get('version')??0);
  const reason=String(formData.get('reason')??'').trim();
  if(!uuidPattern.test(id)||!Number.isInteger(version)||version<1
    ||reason.length===0||new TextEncoder().encode(reason).byteLength>2000)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.assignments.get(id);
    if(current.resourceOrganizationId!==session.resourceOrganizationId
      ||current.assignmentRef.id!==id||current.assignmentRef.version!==version
      ||current.status!=='Active'||!current.selectable||!current.executionAllowed)
      return current.assignmentRef.version!==version
        ?{status:'error',message:'CONFLICT'}:{status:'error',message:'INVALID_STATE'};
    const evidenceRef=current.evidenceRefs.at(-1);
    if(!evidenceRef)return {status:'error',message:'INVALID_STATE'};
    await client.assignments.pause({
      id,expectedVersion:version,
      idempotencyKey:pauseAssignmentIdempotencyKey({
        assignmentId:id,version,reason,evidenceRef}),
      payload:{reason,evidenceRef},
    });
    revalidatePath('/learning');
    return {status:'success',message:'Assignment 暂停已受理；已在途执行不由该操作取消。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function rollbackAssignmentAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('assignmentId')??''),version=Number(formData.get('version')??0);
  const previousReleaseId=String(formData.get('previousReleaseId')??'');
  const reason=String(formData.get('reason')??'').trim();
  if(!uuidPattern.test(id)||!Number.isInteger(version)||version<1
    ||!uuidPattern.test(previousReleaseId)
    ||reason.length===0||new TextEncoder().encode(reason).byteLength>2000)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.assignments.get(id);
    if(current.resourceOrganizationId!==session.resourceOrganizationId
      ||current.assignmentRef.id!==id||current.assignmentRef.version!==version
      ||current.releaseRef.id===previousReleaseId
      ||current.status!=='Active'||!current.selectable||!current.executionAllowed)
      return current.assignmentRef.version!==version
        ?{status:'error',message:'CONFLICT'}:{status:'error',message:'INVALID_STATE'};
    const previousPage=await client.assignments.list({releaseId:previousReleaseId,limit:1});
    const previous=previousPage.assignments[0];
    if(!previous||previous.resourceOrganizationId!==session.resourceOrganizationId
      ||previous.releaseRef.id!==previousReleaseId
      ||!Number.isInteger(previous.releaseRef.version)||previous.releaseRef.version<1)
      return {status:'error',message:'INVALID_STATE'};
    const gateRefs=previous.evidenceRefs.filter(item=>item.type==='abh.learning-gate');
    const compatibilityRefs=previous.evidenceRefs.filter(item=>item.type==='abh.artifact');
    if(gateRefs.length===0||compatibilityRefs.length!==1)
      return {status:'error',message:'INVALID_STATE'};
    const compatibilityRef=compatibilityRefs[0]!;
    await client.assignments.rollback({
      id,expectedVersion:version,
      idempotencyKey:rollbackAssignmentIdempotencyKey({
        assignmentId:id,version,reason,previousReleaseRef:previous.releaseRef,
        gateRefs,compatibilityRef}),
      payload:{previousReleaseRef:previous.releaseRef,gateRefs,compatibilityRef,reason},
    });
    revalidatePath('/learning');
    return {status:'success',message:'Assignment 回滚已受理；仅恢复新的选择资格，不改写已固定 Pin。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function switchOrganizationAction(formData:FormData):Promise<void>{
  const session=await currentSession();
  if(!session)return;
  const selectionKey=String(formData.get('selectionKey')??'');
  const choice=session.switchableOrganizations.find(item=>item.key===selectionKey);
  if(!choice||!isOrganizationChoice(choice))return;
  const cookieStore=await cookies();
  const options={httpOnly:true,sameSite:'lax' as const,path:'/',maxAge:12*60*60,
    secure:process.env.NODE_ENV==='production'};
  cookieStore.set(organizationCookieNames.actingOrganizationId,choice.actingOrganizationId,options);
  cookieStore.set(organizationCookieNames.resourceOrganizationId,choice.resourceOrganizationId,options);
  if(choice.workspaceId)cookieStore.set(organizationCookieNames.workspaceId,choice.workspaceId,options);
  else cookieStore.delete(organizationCookieNames.workspaceId);
  revalidatePath('/','layout');
  redirect('/');
}

export async function submitCompensationAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const id=String(formData.get('actionId')??'');
  const version=Number(formData.get('version')??0);
  const templateKey=String(formData.get('templateKey')??'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ||!Number.isInteger(version)||version<1)return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const client=createWorkbenchClient(session);
    const current=await client.actions.get(id,{consistency:'Strong'},{signal:undefined});
    if(current.data.actionRef.version!==version)return {status:'error',message:'CONFLICT'};
    const position=current.data.position;
    if(position.lifecycle!=='Closed'||!['Failed','PartiallySucceeded'].includes(position.outcome))
      return {status:'error',message:'INVALID_STATE'};
    const supplied=await currentCompensationAdapter().resolve(session,{action:current.data});
    if(!supplied||supplied.key!==templateKey||!validateCompensationTemplate(supplied))
      return {status:'error',message:'FORBIDDEN'};
    if(!supplied.sourceVersionRefs.some(ref=>ref.type==='abh.action'&&ref.id===current.data.actionRef.id
      &&ref.version===current.data.actionRef.version))return {status:'error',message:'INVALID_SOURCE'};
    if(!supplied.artifact.sourceRefs.some(ref=>ref.type==='abh.action'&&ref.id===current.data.actionRef.id
      &&ref.version===current.data.actionRef.version))return {status:'error',message:'INVALID_SOURCE'};
    let userInput:unknown;
    try{userInput=JSON.parse(String(formData.get('input')??''));}
    catch{return {status:'error',message:'INVALID_ARGUMENT'};}
    const validated=validateCompensationInput(supplied.inputSchema,userInput);
    if(!validated.success)return {status:'error',message:'INVALID_ARGUMENT'};
    await client.actions.propose({
      organizationId:session.resourceOrganizationId,
      idempotencyKey:compensationIdempotencyKey({
        sourceActionId:id,sourceActionVersion:version,templateKey:supplied.key,
        intent:{actionType:supplied.actionType,targetRefs:supplied.targetRefs,
          sourceVersionRefs:supplied.sourceVersionRefs,input:validated.data,
          artifact:supplied.artifact},
      }),
      input:validated.data,
      artifact:{
        ownerRef:supplied.artifact.ownerRef,dataClass:supplied.artifact.dataClass,
        purposeNames:supplied.artifact.purposeNames,sourceRefs:supplied.artifact.sourceRefs,
        region:supplied.artifact.region,retentionPolicyRef:supplied.artifact.retentionPolicyRef,
      },
      action:{
        actionType:supplied.actionType,targetRefs:supplied.targetRefs,
        sourceVersionRefs:supplied.sourceVersionRefs,
      },
    });
    revalidatePath('/actions');revalidatePath(`/actions/${id}`);
    return {status:'success',message:'补偿提案已受理；后续审批和生效状态请等待服务端确认。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}

export async function executeSettingsAction(_previous:ActionState,formData:FormData):Promise<ActionState>{
  const session=await currentSession();
  if(!session)return {status:'error',message:'UNAUTHENTICATED'};
  const commandKey=String(formData.get('commandKey')??'');
  const requestId=String(formData.get('requestId')??'');
  const inputText=String(formData.get('input')??'');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(commandKey)
    ||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(requestId)
    ||new TextEncoder().encode(inputText).byteLength>65536)
    return {status:'error',message:'INVALID_ARGUMENT'};
  try{
    const adapter=currentSettingsAdapter();
    const view=await adapter.resolve({session});
    if(!view||!validateSettingsView(view))return {status:'error',message:'FORBIDDEN'};
    const command=view.commands.find(item=>item.key===commandKey);
    if(!command)return {status:'error',message:'FORBIDDEN'};
    let userInput:unknown;
    try{userInput=JSON.parse(inputText);}
    catch{return {status:'error',message:'INVALID_ARGUMENT'};}
    const validated=validateSettingsInput(command.inputSchema,userInput);
    if(!validated.success)return {status:'error',message:'INVALID_ARGUMENT'};
    await adapter.execute({session,commandKey,requestId,input:validated.data});
    revalidatePath('/');
    revalidatePath('/settings');
    return {status:'success',message:'治理命令已提交；最终状态请等待服务端确认。'};
  }catch(error){return {status:'error',message:errorText(error)};}
}
