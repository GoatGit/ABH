import {canonicalJson, digestBytes} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {EntityRef} from '@abh/contracts';
import {CoreError} from './internal/errors.ts';

export interface BusinessInputSchema {
  type:'object';
  properties:Record<string, BusinessInputSchemaNode>;
  required?:readonly string[];
  additionalProperties:false;
}

export type BusinessInputSchemaNode =
  |{type:'string'; minLength?:number; maxLength?:number; enum?:readonly string[]}
  |{type:'number'; minimum?:number; maximum?:number}
  |{type:'integer'; minimum?:number; maximum?:number}
  |{type:'boolean'}
  |{type:'array'; items:BusinessInputSchemaNode; minItems?:number; maxItems?:number}
  |BusinessInputSchema;

export interface BusinessAction {
  actionType:string;
  title:string;
  description:string;
  inputSchema:BusinessInputSchema;
  executionPrincipalRef:EntityRef;
  completionPolicyRef:EntityRef;
  riskClass:string;
  requiredBehaviorSlots:readonly string[];
  maxOperations:number;
  intentExpirySeconds:number;
  purposeNames:readonly string[];
}

export interface BusinessDefinitionInput {
  name:string;
  version:string;
  mode:'ActionOnly';
  actions:readonly BusinessAction[];
}

export interface BusinessDefinition extends BusinessDefinitionInput {
  kind:'abh.business-definition';
  schemaVersion:'0.1.0';
  digest:string;
}

const registered=(value:unknown):string=>{
  if(typeof value!=='string'||!validateContract('RegisteredName',value).success)throw new CoreError('INVALID_ARGUMENT');
  return value;
};
const entity=(value:unknown):EntityRef=>{
  const checked=validateContract('EntityRef',value);
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  return structuredClone(checked.data);
};
const boundedString=(value:unknown,min:number,max:number):string=>{
  if(typeof value!=='string'||value.length<min||value.length>max)throw new CoreError('INVALID_ARGUMENT');
  return value;
};
const boundedInt=(value:unknown,min:number,max:number):number=>{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new CoreError('INVALID_ARGUMENT');
  return value;
};
const boundedNames=(value:unknown,min:number,max:number):string[]=>{
  if(!Array.isArray(value)||value.length<min||value.length>max)return[]as never;
  const names=value.map(registered);
  if(new Set(names).size!==names.length)throw new CoreError('INVALID_ARGUMENT');
  return names;
};

function schemaNode(value:unknown,depth:number):BusinessInputSchemaNode{
  if(depth<0||typeof value!=='object'||value===null||Array.isArray(value))throw new CoreError('INVALID_ARGUMENT');
  const raw=value as Record<string,unknown>;
  if(raw.type!=='string'&&raw.type!=='number'&&raw.type!=='integer'&&raw.type!=='boolean'
    &&raw.type!=='array'&&raw.type!=='object')throw new CoreError('INVALID_ARGUMENT');
  if(raw.type==='boolean')return structuredClone(raw) as BusinessInputSchemaNode;
  if(raw.type==='string'){
    if(Object.keys(raw).some(key=>!['type','minLength','maxLength','enum'].includes(key)))throw new CoreError('INVALID_ARGUMENT');
    const node={type:'string' as const,...(raw.minLength===undefined?{}:{minLength:boundedInt(raw.minLength,0,65536)}),
      ...(raw.maxLength===undefined?{}:{maxLength:boundedInt(raw.maxLength,1,65536)})};
    if(node.minLength!==undefined&&node.maxLength!==undefined&&node.minLength>node.maxLength)throw new CoreError('INVALID_ARGUMENT');
    if(raw.enum!==undefined){
      if(!Array.isArray(raw.enum)||raw.enum.length<1||raw.enum.length>20||!raw.enum.every(item=>typeof item==='string'&&item.length<=256))
        throw new CoreError('INVALID_ARGUMENT');
      return {...node,enum:Object.freeze([...raw.enum])};
    }
    return node;
  }
  if(raw.type==='number'||raw.type==='integer'){
    if(Object.keys(raw).some(key=>!['type','minimum','maximum'].includes(key)))throw new CoreError('INVALID_ARGUMENT');
    for(const key of ['minimum','maximum'] as const)if(raw[key]!==undefined&&(typeof raw[key]!=='number'||!Number.isFinite(raw[key])))throw new CoreError('INVALID_ARGUMENT');
    return {...structuredClone(raw),type:raw.type} as BusinessInputSchemaNode;
  }
  if(raw.type==='array'){
    if(Object.keys(raw).some(key=>!['type','items','minItems','maxItems'].includes(key)))throw new CoreError('INVALID_ARGUMENT');
    const node={type:'array' as const,items:schemaNode(raw.items,depth-1),
      ...(raw.minItems===undefined?{}:{minItems:boundedInt(raw.minItems,0,1000)}),
      ...(raw.maxItems===undefined?{}:{maxItems:boundedInt(raw.maxItems,1,1000)})};
    if(node.minItems!==undefined&&node.maxItems!==undefined&&node.minItems>node.maxItems)throw new CoreError('INVALID_ARGUMENT');
    return node;
  }
  if(Object.keys(raw).some(key=>!['type','properties','required','additionalProperties'].includes(key))
    ||raw.additionalProperties!==false||typeof raw.properties!=='object'||raw.properties===null
    ||Array.isArray(raw.properties)||Object.keys(raw.properties).length<1||Object.keys(raw.properties).length>50)
    throw new CoreError('INVALID_ARGUMENT');
  const properties=Object.fromEntries(Object.entries(raw.properties).map(([name,item])=>{
    if(!/^[A-Za-z_$][A-Za-z0-9_$]{0,99}$/.test(name))throw new CoreError('INVALID_ARGUMENT');
    return[name,schemaNode(item,depth-1)];
  }));
  let required:readonly string[]=[];
  if(raw.required!==undefined){
    if(!Array.isArray(raw.required)||raw.required.length>50||!raw.required.every(item=>typeof item==='string'))throw new CoreError('INVALID_ARGUMENT');
    required=Object.freeze([...raw.required]);
    if(new Set(required).size!==required.length||required.some(name=>!Object.hasOwn(properties,name)))throw new CoreError('INVALID_ARGUMENT');
  }
  return {type:'object',properties,required,additionalProperties:false};
}

function validateValue(schema:BusinessInputSchemaNode,value:unknown,path:string,depth:number):void{
  if(depth<0)throw new CoreError('INVALID_ARGUMENT');
  if(schema.type==='string'){
    if(typeof value!=='string'||(schema.minLength!==undefined&&value.length<schema.minLength)
      ||(schema.maxLength!==undefined&&value.length>schema.maxLength))throw new CoreError('INVALID_ARGUMENT');
    if(schema.enum&&!schema.enum.includes(value))throw new CoreError('INVALID_ARGUMENT');
    return;
  }
  if(schema.type==='boolean'){if(typeof value!=='boolean')throw new CoreError('INVALID_ARGUMENT');return;}
  if(schema.type==='number'||schema.type==='integer'){
    if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isInteger(value))
      ||(schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum))
      throw new CoreError('INVALID_ARGUMENT');
    return;
  }
  if(schema.type==='array'){
    if(!Array.isArray(value)||(schema.minItems!==undefined&&value.length<schema.minItems)
      ||(schema.maxItems!==undefined&&value.length>schema.maxItems))throw new CoreError('INVALID_ARGUMENT');
    value.forEach((item,index)=>validateValue(schema.items,item,`${path}/${index}`,depth-1));return;
  }
  if(typeof value!=='object'||value===null||Array.isArray(value))throw new CoreError('INVALID_ARGUMENT');
  for(const [key,item] of Object.entries(value)){
    const child=schema.properties[key];
    if(!child)throw new CoreError('INVALID_ARGUMENT');
    validateValue(child,item,`${path}/${key}`,depth-1);
  }
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw new CoreError('INVALID_ARGUMENT');
}

export async function defineBusiness(input:BusinessDefinitionInput):Promise<BusinessDefinition>{
  if(typeof input!=='object'||input===null||Array.isArray(input))throw new CoreError('INVALID_ARGUMENT');
  if(Object.keys(input).some(key=>!['name','version','mode','actions'].includes(key)))throw new CoreError('INVALID_ARGUMENT');
  const name=registered(input.name),version=boundedString(input.version,5,32);
  if(!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version))throw new CoreError('INVALID_ARGUMENT');
  if(input.mode!=='ActionOnly'||!Array.isArray(input.actions)||input.actions.length<1||input.actions.length>20)
    throw new CoreError('INVALID_ARGUMENT');
  const actions=Object.freeze(input.actions.map(raw=>{
    if(typeof raw!=='object'||raw===null||Array.isArray(raw))throw new CoreError('INVALID_ARGUMENT');
    if(Object.keys(raw).some(key=>!['actionType','title','description','inputSchema','executionPrincipalRef',
      'completionPolicyRef','riskClass','requiredBehaviorSlots','maxOperations','intentExpirySeconds','purposeNames'].includes(key)))
      throw new CoreError('INVALID_ARGUMENT');
    const slots=boundedNames(raw.requiredBehaviorSlots,1,20);
    if(!slots.length)throw new CoreError('INVALID_ARGUMENT');
    const purposes=boundedNames(raw.purposeNames,1,20);
    if(!purposes.length)throw new CoreError('INVALID_ARGUMENT');
    return Object.freeze({
      actionType:registered(raw.actionType),title:boundedString(raw.title,1,120),
      description:boundedString(raw.description,1,2000),inputSchema:schemaNode(raw.inputSchema,8) as BusinessInputSchema,
      executionPrincipalRef:entity(raw.executionPrincipalRef),completionPolicyRef:entity(raw.completionPolicyRef),
      riskClass:registered(raw.riskClass),requiredBehaviorSlots:Object.freeze(slots),
      maxOperations:boundedInt(raw.maxOperations,1,1000),intentExpirySeconds:boundedInt(raw.intentExpirySeconds,1,86400),
      purposeNames:Object.freeze(purposes),
    });
  }));
  if(new Set(actions.map(action=>action.actionType)).size!==actions.length)throw new CoreError('INVALID_ARGUMENT');
  const unsigned={kind:'abh.business-definition' as const,schemaVersion:'0.1.0' as const,name,version,mode:'ActionOnly' as const,actions};
  const digest=await digestBytes(new TextEncoder().encode(canonicalJson(unsigned)));
  return Object.freeze({...unsigned,digest});
}

export function validateBusinessInput(definition:BusinessDefinition,actionType:string,input:unknown):unknown{
  const action=definition.actions.find(item=>item.actionType===actionType);
  if(!action)throw new CoreError('INVALID_ARGUMENT');
  validateValue(action.inputSchema,input,'$',8);return structuredClone(input);
}
