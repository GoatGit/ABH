import {retryDatabaseConflict} from '../data/retry-conflict.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {OutboxConsumptionOwner,recordOutboxConsumption} from './outbox-consumption.ts';

export interface ConsumptionWorkerOptions {
  context:ContextSource;
  grantRefs:readonly EntityRef[];
  signal:AbortSignal;
  pageSize?:number;
  intervalMs?:number;
  onPage?(result:{scanned:number;recorded:number;pending:number},options:TransactionOptions):Promise<void>;
}

/** Rebuild processing coverage from durable facts. No consumer invocation, queue acknowledgement or deletion. */
export async function runConsumptionWorker(database:Database,input:ConsumptionWorkerOptions):Promise<void>{
  const size=input.pageSize??100,interval=input.intervalMs??500;
  if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
  const grants=input.grantRefs.map(ref=>({...ref}));let binding:string|undefined,cursor:string|undefined;
  const context=async()=>{
    const current=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+10000,signal:input.signal}),c=current.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return current;
  };
  const options=()=>({deadline:Date.now()+10000,signal:input.signal});
  while(!input.signal.aborted){
    try{
      const page=await database.transaction(await context(),options(),tx=>new OutboxConsumptionOwner().pending(tx,size,cursor));
      let recorded=0,pending=0;
      for(const ref of page){
        if(input.signal.aborted)return;
        try{await retryDatabaseConflict(options(),async limits=>recordOutboxConsumption(database,await context(),limits,ref,grants));recorded++;}
        catch(error){
          if(error instanceof CoreError&&error.code==='PRECONDITION_FAILED'){pending++;continue;}
          throw error;
        }
      }
      if(input.signal.aborted)return;
      cursor=page.length===size?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,recorded,pending},options),{deadline:Date.now()+10000,signal:input.signal});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
