import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {PackCapabilityReference,PackManifest} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {BusinessDefinition} from './business.ts';
import {defineBusiness} from './business.ts';
import {buildPackManifest} from './pack-build.ts';
import type {TransactionOptions} from './data/uow.ts';
import {CoreError} from './internal/errors.ts';

export interface BusinessConformanceCase {
  caseId:string;
  actionType:string;
  status:'NotRun';
}

export interface BusinessConformancePlan {
  kind:'abh.business-ctk-plan';
  schemaVersion:'0.1.0';
  suiteVersion:'1.0.0';
  status:'NotRun';
  subjectDigest:string;
  cases:readonly BusinessConformanceCase[];
  claimedCapabilities:readonly PackCapabilityReference[];
  digest:string;
}

export interface CompiledBusinessPack {
  manifest:PackManifest;
  declarationRef:'business.json';
  declaration:Uint8Array;
  ctk:BusinessConformancePlan;
}

const capability=(definition:BusinessDefinition):readonly PackCapabilityReference[]=>[
  {kind:'abh.business',id:`${definition.name}.definition`,version:definition.version},
  ...definition.actions.map(action=>({kind:'abh.action',id:action.actionType,version:definition.version})),
];

async function validatedBusiness(value:unknown):Promise<BusinessDefinition>{
  if(typeof value!=='object'||value===null||Array.isArray(value))throw new CoreError('INVALID_ARGUMENT');
  const raw=value as Record<string,unknown>;
  if(Object.keys(raw).sort().join(',')!=='actions,digest,kind,mode,name,schemaVersion,version'
    ||raw.kind!=='abh.business-definition'||raw.schemaVersion!=='0.1.0'||typeof raw.digest!=='string')
    throw new CoreError('INVALID_ARGUMENT');
  const digest=raw.digest;
  const definitionInput={name:raw.name,version:raw.version,mode:raw.mode,actions:raw.actions};
  const definition=await defineBusiness(definitionInput as unknown as Parameters<typeof defineBusiness>[0]);
  if(digest!==definition.digest)throw new CoreError('INVALID_ARGUMENT');
  return {...definition,digest};
}

/** Compile a validated declaration into an unsigned local candidate and an explicitly unexecuted CTK plan. */
export async function compileBusinessPack(input:{business:BusinessDefinition},
  options:TransactionOptions):Promise<CompiledBusinessPack>{
  if(typeof options!=='object'||options===null||options.signal.aborted
    ||!Number.isSafeInteger(options.deadline)||options.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  const definition=await validatedBusiness(input.business);
  const encoded=new TextEncoder().encode(canonicalJson(definition)+'\n');
  const base=await realpathSafe(),root=await mkdtemp(join(base,'abh-business-pack-'));
  try{
    await writeFile(join(root,'business.json'),encoded,{flag:'wx',mode:0o600});
    const built=await buildPackManifest({root,draft:{
      apiVersion:'abh.open/v1',kind:'DomainPack',metadata:{id:definition.name,version:definition.version,license:'UNLICENSED'},
      compatibility:{abh:'>=0.1.0 <1.0.0'},trust:{mode:'Declarative'},
      capabilities:{provides:capability(definition),requires:[]},
      permissions:{dataClasses:[],purposes:[...new Set(definition.actions.flatMap(action=>action.purposeNames))],
        commands:definition.actions.map(action=>action.actionType),toolCapabilities:[],networkEgress:[],secretClasses:[]},
      resources:{enforcement:'None'},
      artifacts:[{ref:'business.json',mediaType:'application/json'}],migrations:[],
      conformance:{suiteVersion:'1.0.0'}}},options);
    const unsignedPlan={kind:'abh.business-ctk-plan' as const,schemaVersion:'0.1.0' as const,
      suiteVersion:'1.0.0' as const,status:'NotRun' as const,subjectDigest:built.manifest.integrity.packageDigest,
      cases:definition.actions.map(action=>({caseId:`abh.test.business.input.${action.actionType}`,
        actionType:action.actionType,status:'NotRun' as const})),
      claimedCapabilities:capability(definition)};
    const ctk:BusinessConformancePlan={...unsignedPlan,
      digest:await digestBytes(new TextEncoder().encode(canonicalJson(unsignedPlan)))};
    return Object.freeze({manifest:built.manifest,declarationRef:'business.json' as const,
      declaration:encoded,ctk:Object.freeze(ctk)});
  }finally{await rm(root,{recursive:true,force:true,maxRetries:3});}
}

async function realpathSafe():Promise<string>{
  try{return await realpath(tmpdir());}catch{throw new CoreError('DEPENDENCY_UNAVAILABLE');}
}
