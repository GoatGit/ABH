import {createHash} from 'node:crypto';

export function decisionIdempotencyKey(input:{decisionId:string;version:number;response:string;
  packageDigest:string;reason:string;conditionRefs?:readonly unknown[];
  reauthProofRef?:unknown}):string{
  const intent=createHash('sha256').update(JSON.stringify({
    reason:input.reason,conditionRefs:input.conditionRefs??[],
    reauthProofRef:input.reauthProofRef??null,
  }),'utf8').digest('hex');
  return `wb/${input.decisionId}/${input.version}/${input.response}/${input.packageDigest}/${intent}`;
}

export function missionIdempotencyKey(input:{missionId:string;version:number;action:string;
  reason?:string;evidenceRefs?:readonly unknown[]}):string{
  if(!['pause','resume'].includes(input.action)&&input.reason===undefined)return `wb/${input.missionId}/${input.version}/${input.action}`;
  const intent=createHash('sha256').update(canonicalJson({
    reason:input.reason??null,evidenceRefs:input.evidenceRefs??[],
  } as unknown as JsonValue),'utf8').digest('hex');
  return `wb/${input.missionId}/${input.version}/${input.action}/${intent}`;
}

export function cancelActionIdempotencyKey(input:{actionId:string;version:number;reason:string}):string{
  const reasonDigest=createHash('sha256').update(JSON.stringify({reason:input.reason}),'utf8').digest('hex');
  return `wb/${input.actionId}/${input.version}/cancel/${reasonDigest}`;
}

export function cancelRunIdempotencyKey(input:{runId:string;version:number;reason:string;
  evidenceRefs?:readonly unknown[]}):string{
  const intent=createHash('sha256').update(JSON.stringify({
    reason:input.reason,evidenceRefs:input.evidenceRefs??[],
  }),'utf8').digest('hex');
  return `wb/${input.runId}/${input.version}/cancel/${intent}`;
}

export function requestEvaluationIdempotencyKey(input:{
  candidateId:string;candidateVersion:number;baselineArtifactId:string;baselineVersion:number;
}):string{
  const digest=createHash('sha256').update(canonicalJson(input as unknown as JsonValue),'utf8')
    .digest('hex');
  return `wb/${input.candidateId}/${input.candidateVersion}/evaluation/${digest}`;
}

export function retryEvaluationIdempotencyKey(input:{runId:string;version:number}):string{
  return `wb/${input.runId}/${input.version}/retry`;
}

export function releaseLearningCandidateIdempotencyKey(input:{
  candidateId:string;candidateVersion:number;gateId:string;gateVersion:number;
  behaviorSlot:string;capabilityId:string;capabilityVersion:string;capabilityDigest:string;
  compatibilityArtifactId:string;compatibilityArtifactVersion:number;
}):string{
  const digest=createHash('sha256').update(canonicalJson(input as unknown as JsonValue),'utf8').digest('hex');
  return `wb/${input.candidateId}/${input.candidateVersion}/release/${digest}`;
}

export function pauseAssignmentIdempotencyKey(input:{
  assignmentId:string;version:number;reason:string;evidenceRef:unknown;
}):string{
  const digest=createHash('sha256').update(canonicalJson({
    reason:input.reason,evidenceRef:input.evidenceRef,
  } as unknown as JsonValue),'utf8').digest('hex');
  return `wb/${input.assignmentId}/${input.version}/pause/${digest}`;
}

export function rollbackAssignmentIdempotencyKey(input:{
  assignmentId:string;version:number;reason:string;
  previousReleaseRef:unknown;gateRefs:readonly unknown[];compatibilityRef:unknown;
}):string{
  const digest=createHash('sha256').update(canonicalJson({
    reason:input.reason,previousReleaseRef:input.previousReleaseRef,
    gateRefs:input.gateRefs,compatibilityRef:input.compatibilityRef,
  } as unknown as JsonValue),'utf8').digest('hex');
  return `wb/${input.assignmentId}/${input.version}/rollback/${digest}`;
}

type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};

function canonicalJson(value:JsonValue):string{
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object'){
    return `{${Object.entries(value).sort(([left],[right])=>left<right?-1:left>right?1:0)
      .map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function compensationIdempotencyKey(input:{
  sourceActionId:string;sourceActionVersion:number;templateKey:string;intent:unknown;
}):string{
  const digest=createHash('sha256').update(canonicalJson(input.intent as JsonValue),'utf8').digest('hex');
  return `wb/${input.sourceActionId}/${input.sourceActionVersion}/compensation/${input.templateKey}/${digest}`;
}
