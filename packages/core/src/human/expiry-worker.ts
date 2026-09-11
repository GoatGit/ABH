import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {DecisionOwner} from './decisions.ts';

/** Independent current Service Grant is required, including replay. No Human response or execution authority is issued. */
export async function expireResponsibilityRequest(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  requestRef:EntityRef,grantRefs:readonly EntityRef[]){
  contract('RequestRef',requestRef);
  if(context.tenant.actor.type!=='Service'||context.tenant.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
  if(command.type!=='abh.responsibility-requests.expire'||command.digest!==await inputDigest(requestRef))throw new CoreError('INVALID_ARGUMENT');
  const reference={...requestRef},grants=structuredClone([...grantRefs]);
  return database.transaction(context,options,async tx=>{
    const scope={type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1};
    const result=await executeCommand(tx,command,async()=>{await assertCurrentGrants(tx,{objectRef:reference,scopeRefs:[scope],action:command.type},grants);},
      async()=>(await new DecisionOwner().expire(tx,command,reference)).requestRef);
    return {requestRef:result.receipt.resultRef,replayed:result.replayed};
  });
}

export interface ResponsibilityExpiryWorkerOptions {
  context:ContextSource;signal:AbortSignal;grantRefs:readonly EntityRef[];
  pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;expired:number},options:TransactionOptions):Promise<void>;
}

/** Database deadlines are authoritative. Re-read each request under its Owner lock before expiring it. */
export async function runResponsibilityExpiryWorker(database:Database,input:ResponsibilityExpiryWorkerOptions):Promise<void>{
  const size=input.pageSize??100,interval=input.intervalMs??500;
  if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
  const grants=structuredClone([...input.grantRefs]);let binding:string|undefined,cursor:string|undefined;
  const options=()=>({deadline:Date.now()+10000,signal:input.signal});
  const current=async()=>{
    const context=await requestVerifiedContext(request=>input.context(request),options()),c=context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.actingOrganizationId,c.workspaceId??null,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return context;
  };
  while(!input.signal.aborted){
    try{
      const page=await database.transaction(await current(),options(),tx=>new DecisionOwner().pendingExpiry(tx,size,cursor));let expired=0;
      for(const reference of page){
        if(input.signal.aborted)return;
        const command={type:'abh.responsibility-requests.expire',commandId:randomUUID(),idempotencyKey:`expire/${reference.id}/${reference.version}`,digest:await inputDigest(reference)};
        try{await expireResponsibilityRequest(database,await current(),options(),command,reference,grants);expired++;}
        catch(error){if(error instanceof CoreError&&error.code==='VERSION_CONFLICT')continue;throw error;}
      }
      if(input.signal.aborted)return;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,expired},options),{deadline:Date.now()+10000,signal:input.signal});
      cursor=page.length===size?page.at(-1)!.id:undefined;
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
