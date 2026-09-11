import Ajv2020 from 'ajv/dist/2020.js';
import type {WorkbenchDecisionFormTemplate} from './decision-forms';
import {isUuid} from './organization.ts';

const keyPattern=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const reservedKeys=new Set(['reason','conditionRefs','reauthProofRef']);

function boundedText(value:unknown,maxLength:number):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=maxLength;
}

function isConditionRef(value:unknown):value is EntityRefLike{
  return isExactRef(value,'abh.condition');
}

interface EntityRefLike{
  type:'abh.condition'|'abh.reauth-proof';
  id:string;
  version:number;
}

function isExactRef(value:unknown,type:'abh.condition'|'abh.reauth-proof'):value is EntityRefLike{
  if(!value||typeof value!=='object')return false;
  const candidate=value as Record<string,unknown>;
  return candidate.type===type&&typeof candidate.id==='string'&&isUuid(candidate.id)
    &&typeof candidate.version==='number'&&Number.isInteger(candidate.version)&&candidate.version>=1;
}

export function validateDecisionFormTemplate(value:unknown):value is WorkbenchDecisionFormTemplate{
  if(!value||typeof value!=='object')return false;
  const candidate=value as Record<string,unknown>;
  if(!keyPattern.test(String(candidate.key))
    ||!(candidate.response==='Approved'||candidate.response==='Rejected')
    ||!boundedText(candidate.label,200)||!boundedText(candidate.description,2000)
    ||typeof candidate.requiresConfirmation!=='boolean'
    ||!(candidate.inputSchema instanceof Object)
    ||!(candidate.uiSchema===undefined||candidate.uiSchema instanceof Object)
    ||!(candidate.initialData===undefined||candidate.initialData instanceof Object))return false;
  try{
    if(new TextEncoder().encode(JSON.stringify(candidate.inputSchema)).byteLength>32768)return false;
    if(candidate.initialData&&new TextEncoder().encode(JSON.stringify(candidate.initialData)).byteLength>16384)
      return false;
  }catch{return false;}
  return true;
}

export function validateDecisionFormInput(schema:Record<string,unknown>,value:unknown):
  {success:true;data:Record<string,unknown>}|{success:false;code:'INVALID_ARGUMENT'}{
  if(!value||typeof value!=='object'||Array.isArray(value))return {success:false,code:'INVALID_ARGUMENT'};
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some(key=>!reservedKeys.has(key)))
    return {success:false,code:'INVALID_ARGUMENT'};
  try{
    const ajv=new Ajv2020({strict:false,allErrors:false,removeAdditional:false});
    if(!ajv.compile(schema)(input))return {success:false,code:'INVALID_ARGUMENT'};
  }catch{return {success:false,code:'INVALID_ARGUMENT'};}
  const reason=input.reason;
  if(reason!==undefined&&(typeof reason!=='string'||reason.trim().length===0||reason.length>2000))
    return {success:false,code:'INVALID_ARGUMENT'};
  const conditions=input.conditionRefs;
  if(conditions!==undefined&&(!Array.isArray(conditions)||conditions.length>100
    ||!conditions.every(isConditionRef)))return {success:false,code:'INVALID_ARGUMENT'};
  const reauth=input.reauthProofRef;
  if(reauth!==undefined&&!isExactRef(reauth,'abh.reauth-proof'))
    return {success:false,code:'INVALID_ARGUMENT'};
  return {success:true,data:input};
}
