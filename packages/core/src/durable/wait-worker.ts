import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {DurableWaitPort,WaitContextDirectory,type WaitPortInstallation} from './wait-port.ts';

/** Poll one installed condition. Opaque contexts are short-lived and removed after each page. */
export async function runWaitRecoveryWorker(database:Database,input:{
  context:ContextSource;
  grantRefs:readonly EntityRef[];
  installation:WaitPortInstallation;
  signal:AbortSignal;
  intervalMs?:number;
  onPage?(result:{checkedRefs:EntityRef[];nextAfterId?:string},options:TransactionOptions):Promise<void>;
}):Promise<void>{
  const interval=input.intervalMs??500;
  if(!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
  const contexts=new WaitContextDirectory(),port=new DurableWaitPort(database,contexts,input.installation),grants=input.grantRefs.map(ref=>({...ref}));
  let binding:string|undefined,cursor:string|undefined;
  while(!input.signal.aborted){
    try{
      const context=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+10000,signal:input.signal}),c=context.tenant;
      if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
      const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
      if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;
      const requestContextRef=contexts.register(context,grants);
      let result;
      try{result=await port.recoverPending({callId:randomUUID(),requestContextRef,
        target:{objectRef:{type:'abh.durable-wait',id:requestContextRef.id,version:1},scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.runtime.recheck-wait'},
        deadline:new Date(Math.min(Date.now()+10000,Date.parse(c.contextExpiresAt))).toISOString()}, {signal:input.signal},cursor);}
      finally{contexts.revoke(requestContextRef);}
      cursor=result.nextAfterId;
      if(input.signal.aborted)return;
      if(input.onPage)await boundedCallback(options=>input.onPage!(result,options),{deadline:Date.now()+10000,signal:input.signal});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
