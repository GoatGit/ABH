import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,ExceptionResolutionRecord} from '@abh/contracts';
import {contract} from '../data/journal.ts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {ExceptionOwner,ExceptionSuccessorOwner} from './exceptions.ts';

export interface ExceptionSuccessorContext {
  resolution:ExceptionResolutionRecord;
  options:TransactionOptions;
}

export type ExceptionSuccessorHandler=(
  context:ExceptionSuccessorContext
)=>Promise<EntityRef>;

export interface ExceptionSuccessorWorkerOptions {
  context:ContextSource;signal:AbortSignal;
  handlers:Partial<Record<ExceptionResolutionRecord['resolutionKind'],ExceptionSuccessorHandler>>;
  pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;dispatched:number;unhandled:number},options:TransactionOptions):Promise<void>;
}

async function invokeHandler(handler:ExceptionSuccessorHandler,context:ExceptionSuccessorContext,
  signal:AbortSignal):Promise<EntityRef>{
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),10_000);
  try{
    const successorRef=await Promise.race([
      handler(context),
      new Promise<never>((_,reject)=>{
        controller.signal.addEventListener('abort',()=>reject(new CoreError('DEPENDENCY_TIMEOUT')),{once:true});
      }),
    ]);
    contract('EntityRef',successorRef);
    if(successorRef.type!=='abh.command')throw new CoreError('INVALID_ARGUMENT');
    return successorRef;
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
}

export async function runExceptionSuccessorWorker(database:Database,input:ExceptionSuccessorWorkerOptions):Promise<void>{
  const size=input.pageSize??100,interval=input.intervalMs??500;
  if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)
    throw new CoreError('INVALID_ARGUMENT');
  let binding:string|undefined,cursor:string|undefined;
  const options=()=>({deadline:Date.now()+10000,signal:input.signal});
  const current=async()=>{
    const context=await requestVerifiedContext(request=>input.context(request),options()),c=context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.actingOrganizationId,c.workspaceId??null,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return context;
  };
  const owner=new ExceptionSuccessorOwner();
  while(!input.signal.aborted){
    try{
      const page=await database.transaction(await current(),options(),tx=>owner.pending(tx,size,cursor));
      let dispatched=0,unhandled=0;
      for(const resolutionRef of page){
        if(input.signal.aborted)return;
        const context=await current();
        const resolution=await database.transaction(context,options(),async tx=>new ExceptionOwner().getResolution(tx,resolutionRef));
        const handler=input.handlers[resolution.resolutionKind];
        if(!handler){unhandled++;continue;}
        const successorRef=await invokeHandler(handler,{resolution,options:options()},input.signal);
        await database.transaction(await current(),options(),async tx=>owner.dispatch(tx,resolutionRef,successorRef));
        dispatched++;
      }
      if(input.signal.aborted)return;
      cursor=page.length===size?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,dispatched,unhandled},options),
        {deadline:Date.now()+10000,signal:input.signal});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
