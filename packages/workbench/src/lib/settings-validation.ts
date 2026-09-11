import Ajv2020 from 'ajv/dist/2020.js';
import type {
  WorkbenchSettingsAutomation,WorkbenchSettingsCommand,WorkbenchSettingsConnection,
  WorkbenchSettingsMember,WorkbenchSettingsPurpose,WorkbenchSettingsView,
} from './settings';
import {isUuid} from './organization.ts';

const keyPattern=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const namePattern=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

function boundedArray<T>(value:unknown,min:number,max:number,isItem:(item:T)=>boolean):value is T[]{
  return Array.isArray(value)&&value.length>=min&&value.length<=max
    &&value.every(item=>isItem(item as T));
}

function boundedText(value:unknown,maxLength:number):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=maxLength;
}

function isoDateTime(value:unknown):value is string{
  return typeof value==='string'&&value.length<=40&&!Number.isNaN(Date.parse(value));
}

function boundedItems<T>(items:readonly T[]|undefined,isItem:(item:T)=>boolean):boolean{
  return boundedArray(items,0,500,isItem);
}

function member(item:WorkbenchSettingsMember):boolean{
  return boundedText(item.id,191)&&boundedText(item.label,200)
    &&boundedText(item.role,128)&&boundedText(item.status,64);
}

function purpose(item:WorkbenchSettingsPurpose):boolean{
  return namePattern.test(item.name)&&boundedText(item.label,200)&&typeof item.enabled==='boolean';
}

function connection(item:WorkbenchSettingsConnection):boolean{
  return boundedText(item.id,191)&&boundedText(item.label,200)&&boundedText(item.kind,128)
    &&boundedText(item.status,64)&&boundedItems(item.scopeNames,name=>boundedText(name,191));
}

function automation(item:WorkbenchSettingsAutomation):boolean{
  return keyPattern.test(item.key)&&boundedText(item.label,200)&&boundedText(item.level,128)
    &&typeof item.enabled==='boolean';
}

function command(item:WorkbenchSettingsCommand):boolean{
  if(!keyPattern.test(item.key)||!boundedText(item.label,200)
    ||!boundedText(item.description,2000)||typeof item.requiresConfirmation!=='boolean'
    ||!(item.inputSchema instanceof Object)
    ||!(item.uiSchema===undefined||item.uiSchema instanceof Object)
    ||!(item.initialData===undefined||item.initialData instanceof Object))return false;
  try{
    if(new TextEncoder().encode(JSON.stringify(item.inputSchema)).byteLength>32768)return false;
    if(item.initialData&&new TextEncoder().encode(JSON.stringify(item.initialData)).byteLength>16384)
      return false;
  }catch{return false;}
  return true;
}

export function validateSettingsView(value:unknown):value is WorkbenchSettingsView{
  if(!value||typeof value!=='object')return false;
  const candidate=value as Record<string,unknown>;
  const organization=candidate.organization as Record<string,unknown>|undefined;
  if(!isoDateTime(candidate.asOf)||!boundedText(candidate.source,200)||!organization
    ||!isUuid(organization.organizationId as string|undefined)
    ||!boundedText(organization.label,200)||!boundedText(organization.collaborationBoundary,200)
    ||!(organization.workspaceId===undefined||isUuid(organization.workspaceId as string|undefined))
    ||!boundedItems(candidate.members as readonly WorkbenchSettingsMember[]|undefined,member)
    ||!boundedItems(candidate.purposes as readonly WorkbenchSettingsPurpose[]|undefined,purpose)
    ||!boundedItems(candidate.connections as readonly WorkbenchSettingsConnection[]|undefined,connection)
    ||!boundedItems(candidate.automation as readonly WorkbenchSettingsAutomation[]|undefined,automation)
    ||!boundedItems(candidate.commands as readonly WorkbenchSettingsCommand[]|undefined,command))
    return false;
  try{
    return new TextEncoder().encode(JSON.stringify(candidate)).byteLength<=262144;
  }catch{return false;}
}

export function validateSettingsInput(schema:Record<string,unknown>,value:unknown):
  {success:true;data:Record<string,unknown>}|{success:false;code:'INVALID_ARGUMENT'}{
  try{
    const ajv=new Ajv2020({strict:false,allErrors:false,removeAdditional:false});
    const validate=ajv.compile<Record<string,unknown>>(schema);
    if(!validate(value))return {success:false,code:'INVALID_ARGUMENT'};
    return {success:true,data:value as Record<string,unknown>};
  }catch{return {success:false,code:'INVALID_ARGUMENT'};}
}
