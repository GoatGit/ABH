import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {RequestContext} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

export type LearningListRoute='abh.assignments.list'|'abh.learning-signals.list'|'abh.learning-cases.list'|'abh.learning-candidates.list'|
  'abh.evaluation-runs.list'|'abh.learning-gates.list';
export type LearningListFilter=Record<string,unknown>;
export interface LearningListPosition { createdAt:string;id:string }

export function validateLearningListPosition(position:LearningListPosition):void{
  contract('UUID',position.id);contract('Time',position.createdAt);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(position.createdAt))throw new CoreError('INVALID_ARGUMENT');
}

function validate(route:LearningListRoute,filter:LearningListFilter):void{
  if(route==='abh.assignments.list')contract('ListAssignmentsQuery',{...filter,limit:1});
  else if(route==='abh.learning-signals.list')contract('ListLearningSignalsQuery',{...filter,limit:1});
  else if(route==='abh.learning-cases.list')contract('ListLearningCasesQuery',{...filter,limit:1});
  else if(route==='abh.learning-candidates.list')contract('ListLearningCandidatesQuery',{...filter,limit:1});
  else if(route==='abh.evaluation-runs.list')contract('ListEvaluationRunsQuery',{...filter,limit:1});
  else contract('ListLearningGatesQuery',{...filter,limit:1});
}

export class LearningCursorCodec{
  #key:Buffer;#route:LearningListRoute;#ttl:number;
  constructor(route:LearningListRoute,key:Uint8Array,ttlMs=900_000){
    if(!(key instanceof Uint8Array)||key.byteLength!==32||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>3_600_000)
      throw new TypeError('Invalid Learning cursor configuration');
    this.#route=route;this.#key=Buffer.from(key);this.#ttl=ttlMs;
  }
  #binding(context:Readonly<RequestContext>,filter:LearningListFilter):Buffer{
    return Buffer.from(canonicalJson({route:this.#route,organization:context.resourceOrganizationId,
      actingOrganization:context.actingOrganizationId,workspace:context.workspaceId??null,actor:context.actor,
      purpose:context.purposeOfUse,sessionEpoch:context.sessionEpoch,scopeEpoch:context.scopeEpoch,filter}));
  }
  encode(after:LearningListPosition,context:Readonly<RequestContext>,filter:LearningListFilter):string{
    validateLearningListPosition(after);validate(this.#route,filter);
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,iv);
    cipher.setAAD(this.#binding(context,filter));
    const ciphertext=Buffer.concat([cipher.update(canonicalJson({after,expiresAt:Date.now()+this.#ttl}),'utf8'),cipher.final()]);
    return `lc1.${Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url')}`;
  }
  decode(token:string,context:Readonly<RequestContext>,filter:LearningListFilter):LearningListPosition{
    try{
      if(typeof token!=='string'||token.length>2048||!/^lc1\.[A-Za-z0-9_-]+$/.test(token))throw new Error();
      const bytes=Buffer.from(token.slice(4),'base64url');
      if(bytes.length<29||bytes.toString('base64url')!==token.slice(4))throw new Error();
      const decipher=createDecipheriv('aes-256-gcm',this.#key,bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));decipher.setAAD(this.#binding(context,filter));
      const result=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
      if(Object.keys(result).sort().join(',')!=='after,expiresAt'||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now())throw new Error();
      if(!result.after||Object.keys(result.after).sort().join(',')!=='createdAt,id')throw new Error();
      validateLearningListPosition(result.after);return result.after;
    }catch{throw new CoreError('INVALID_ARGUMENT');}
  }
}
