import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,OpenResponsibilityRequestPayload} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {sameRef} from '../execution/shared.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {DecisionOwner} from './decisions.ts';
import {retryResponsibilityRoute} from './retry-route.ts';

export interface ResponsibilityRoutingWorkerOptions {
  context:ContextSource;signal:AbortSignal;grantRefs:readonly EntityRef[];
  installation:Parameters<typeof retryResponsibilityRoute>[6];
  /** Optional loader; its result must still exactly match the immutable proposal saved by the Owner. */
  proposal?(requestRef:EntityRef,options:TransactionOptions):Promise<OpenResponsibilityRequestPayload>;
  pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;routed:number;unresolved:number;stale:number},options:TransactionOptions):Promise<void>;
}

async function proposal(input:ResponsibilityRoutingWorkerOptions,reference:EntityRef):Promise<OpenResponsibilityRequestPayload>{
  const controller=new AbortController(),cancel=()=>controller.abort(input.signal.reason),deadline=Date.now()+10000;
  input.signal.addEventListener('abort',cancel,{once:true});if(input.signal.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(),10000);let onAbort=()=>{};
  const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));controller.signal.addEventListener('abort',onAbort,{once:true});if(controller.signal.aborted)onAbort();});
  try{
    const payload=await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');return input.proposal!({...reference},{deadline,signal:controller.signal});}),aborted]);
    if(controller.signal.aborted||Date.now()>=deadline)throw new CoreError('DEPENDENCY_TIMEOUT');
    contract('OpenResponsibilityRequestPayload',payload);if(!sameRef(payload.request.requestRef,reference))throw new CoreError('FORBIDDEN');return structuredClone(payload);
  }finally{clearTimeout(timer);input.signal.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',onAbort);}
}

/** Retry only current eligibility for unchanged frozen routes. Every sweep is a new authorized attempt. */
export async function runResponsibilityRoutingWorker(database:Database,input:ResponsibilityRoutingWorkerOptions):Promise<void>{
  const size=input.pageSize??100,interval=input.intervalMs??30000;
  if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
  const grants=structuredClone([...input.grantRefs]);let binding:string|undefined,cursor:string|undefined;
  const options=()=>({deadline:Date.now()+10000,signal:input.signal});
  const current=async()=>{
    const context=await requestVerifiedContext(request=>input.context(request),options()),c=context.tenant;
    if(c.actor.type!=='Service'||!['abh.action.prepare','abh.operation.reconcile'].includes(c.purposeOfUse))throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.actingOrganizationId,c.workspaceId??null,c.actor.id,c.purposeOfUse]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return context;
  };
  while(!input.signal.aborted){
    try{
      const page=await database.transaction(await current(),options(),tx=>new DecisionOwner().pendingRouting(tx,size,cursor));let routed=0,unresolved=0,stale=0;
      for(const reference of page){
        if(input.signal.aborted)return;
        const admission=await current();
        await database.transaction(admission,options(),async tx=>{
          const scope={type:'abh.organization',id:admission.tenant.resourceOrganizationId,version:1};
          await assertCurrentGrants(tx,{objectRef:reference,scopeRefs:[scope],action:'abh.responsibility-requests.retry-route'},grants);
        });
        let payload:OpenResponsibilityRequestPayload;
        try{payload=input.proposal?await proposal(input,reference):await database.transaction(await current(),options(),tx=>new DecisionOwner().getRoutingProposal(tx,reference));}
        catch(error){if(error instanceof CoreError&&error.code==='VERSION_CONFLICT'){stale++;continue;}throw error;}
        const context=await current();
        // A no-op receipt remains a no-op forever; renewed eligibility requires a distinct attempt key.
        const command={type:'abh.responsibility-requests.retry-route',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
        try{
          const result=await retryResponsibilityRoute(database,context,options(),command,payload,grants,input.installation);
          if(result.requestRef.version>reference.version)routed++;else unresolved++;
        }catch(error){
          if(error instanceof CoreError&&['VERSION_CONFLICT','DECISION_STALE'].includes(error.code)){stale++;continue;}
          throw error;
        }
      }
      if(input.signal.aborted)return;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,routed,unresolved,stale},options),{deadline:Date.now()+10000,signal:input.signal});
      cursor=page.length===size?page.at(-1)!.id:undefined;
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
