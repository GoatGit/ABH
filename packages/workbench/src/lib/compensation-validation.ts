import Ajv2020 from 'ajv/dist/2020.js';
import type {WorkbenchCompensationTemplate} from './compensation';
import {isUuid} from './organization.ts';

const safeName=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const refPattern=/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

function boundedArray<T>(value:unknown,min:number,max:number,isItem:(item:T)=>boolean):value is T[]{
  return Array.isArray(value)&&value.length>=min&&value.length<=max&&value.every(item=>isItem(item as T));
}

function isEntityRef(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;
  const candidate=value as {type?:unknown;id?:unknown;version?:unknown};
  return typeof candidate.type==='string'&&candidate.type.startsWith('abh.')
    &&typeof candidate.id==='string'&&isUuid(candidate.id)&&typeof candidate.version==='number'
    &&Number.isInteger(candidate.version)&&candidate.version>=1;
}

function boundedText(value:unknown,maxLength:number):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=maxLength;
}

export function validateCompensationTemplate(value:unknown):value is WorkbenchCompensationTemplate{
  if(!value||typeof value!=='object')return false;
  const candidate=value as Record<string,unknown>;
  const artifact=candidate.artifact as Record<string,unknown>|undefined;
  if(!safeName.test(String(candidate.key))||!boundedText(candidate.label,200)
    ||!boundedText(candidate.description,2000)||!refPattern.test(String(candidate.actionType))
    ||!boundedArray(candidate.targetRefs,1,100,isEntityRef)
    ||!boundedArray(candidate.sourceVersionRefs,1,100,isEntityRef)
    ||!artifact||!artifact.ownerRef||!isEntityRef(artifact.ownerRef)
    ||!boundedText(artifact.dataClass,128)||!boundedText(artifact.region,64)
    ||!boundedArray(artifact.purposeNames,1,20,item=>boundedText(item,128))
    ||!boundedArray(artifact.sourceRefs,1,100,isEntityRef)
    ||!isEntityRef(artifact.retentionPolicyRef)
    ||!(candidate.inputSchema instanceof Object)||!(candidate.uiSchema===undefined||candidate.uiSchema instanceof Object)
    ||!(candidate.initialData===undefined||candidate.initialData instanceof Object))return false;
  try{
    if(new TextEncoder().encode(JSON.stringify(candidate.inputSchema)).byteLength>32768)return false;
    if(candidate.uiSchema&&new TextEncoder().encode(JSON.stringify(candidate.uiSchema)).byteLength>32768)
      return false;
    if(candidate.initialData&&new TextEncoder().encode(JSON.stringify(candidate.initialData)).byteLength>16384)return false;
  }catch{return false;}
  return true;
}

export function validateCompensationInput(schema:Record<string,unknown>,value:unknown):
  {success:true;data:Record<string,unknown>}|{success:false;code:'INVALID_ARGUMENT'}{
  try{
    const ajv=new Ajv2020({strict:false,allErrors:false,removeAdditional:false});
    const validate=ajv.compile<Record<string,unknown>>(schema);
    if(!validate(value))return {success:false,code:'INVALID_ARGUMENT'};
    return {success:true,data:value as Record<string,unknown>};
  }catch{return {success:false,code:'INVALID_ARGUMENT'};}
}
