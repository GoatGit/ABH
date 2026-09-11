import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {RequestContext} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

export type RunListFilter=Omit<import('@abh/contracts').ListRunsQuery,'cursor'|'limit'>;
export interface RunListPosition { updatedAt:string;id:string }

export function validateRunListPosition(position:RunListPosition):void{
  contract('UUID',position.id);contract('Time',position.updatedAt);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(position.updatedAt))throw new CoreError('INVALID_ARGUMENT');
}

function validate(filter:RunListFilter):void{
  contract('ListRunsQuery',{...filter,limit:1});
}

/** Encrypted continuation position, bound to identity and normalized Run list filters. */
export class RunCursorCodec{
  #key:Buffer;
  #ttl:number;
  constructor(key:Uint8Array,ttlMs=900_000){
    if(!(key instanceof Uint8Array)||key.byteLength!==32||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>3_600_000)
      throw new TypeError('Invalid Run cursor configuration');
    this.#key=Buffer.from(key);this.#ttl=ttlMs;
  }
  #binding(context:Readonly<RequestContext>,filter:RunListFilter):Buffer{
    return Buffer.from(canonicalJson({route:'abh.runs.list',organization:context.resourceOrganizationId,
      actingOrganization:context.actingOrganizationId,workspace:context.workspaceId??null,actor:context.actor,
      purpose:context.purposeOfUse,sessionEpoch:context.sessionEpoch,scopeEpoch:context.scopeEpoch,
      missionStatus:filter.missionStatus??null,missionId:filter.missionId??null}));
  }
  encode(after:RunListPosition,context:Readonly<RequestContext>,filter:RunListFilter):string{
    validateRunListPosition(after);validate(filter);
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,iv);
    cipher.setAAD(this.#binding(context,filter));
    const ciphertext=Buffer.concat([cipher.update(canonicalJson({after,expiresAt:Date.now()+this.#ttl}),'utf8'),cipher.final()]);
    return `rc1.${Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url')}`;
  }
  decode(token:string,context:Readonly<RequestContext>,filter:RunListFilter):RunListPosition{
    try{
      if(typeof token!=='string'||token.length>2048||!/^rc1\.[A-Za-z0-9_-]+$/.test(token))throw new Error();
      const bytes=Buffer.from(token.slice(4),'base64url');
      if(bytes.length<29||bytes.toString('base64url')!==token.slice(4))throw new Error();
      const decipher=createDecipheriv('aes-256-gcm',this.#key,bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));decipher.setAAD(this.#binding(context,filter));
      const result=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
      if(Object.keys(result).sort().join(',')!=='after,expiresAt'||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now())throw new Error();
      if(!result.after||Object.keys(result.after).sort().join(',')!=='id,updatedAt')throw new Error();
      validateRunListPosition(result.after);return result.after;
    }catch{throw new CoreError('INVALID_ARGUMENT');}
  }
}
