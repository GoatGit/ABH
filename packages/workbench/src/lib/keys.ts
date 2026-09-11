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
