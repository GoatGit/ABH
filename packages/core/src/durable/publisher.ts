import {retryDatabaseConflict} from '../data/retry-conflict.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EnqueueJobRequest,EntityRef,OutboxPublicationRecord,OutboxRoutingRecord} from '@abh/contracts';
import type {DurableExecutionPort} from '@abh/contracts/ports';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {readCommittedEvent} from './inbox.ts';
import {OutboxOwner,enqueueOutbox,type InstalledOutboxRouter,type OutboxChecks} from './outbox.ts';
import {WorkLeaseOwner} from './work-leases.ts';

export interface OutboxPublisher {
  workerId:string;
  context:ContextSource;
  signal:AbortSignal;
  checks:OutboxChecks;
  router:InstalledOutboxRouter;
  port:Pick<DurableExecutionPort,'enqueue'>;
  /** Installed Port admission supplies a current opaque ContextRef; the publisher fixes the persisted job. */
  enqueueContext(context:VerifiedContext,routing:OutboxRoutingRecord,consumerId:string):Promise<EnqueueJobRequest['context']>;
  releaseEnqueueContext?(context:EnqueueJobRequest['context']):void;
}

/** One bounded frozen fanout. Committed deliveries survive faults; queue success before acknowledgement is safely redelivered. */
export async function publishCommittedEvent(database:Database,eventRef:EntityRef,input:OutboxPublisher):Promise<{
  routingRef:EntityRef;pendingConsumerIds:string[];publication?:OutboxPublicationRecord;
}>{
  contract('EntityRef',eventRef);contract('UUID',input.workerId);
  let binding:string|undefined;
  const context=async()=>{
    if(input.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    const current=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+10000,signal:input.signal}),c=current.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver')throw new CoreError('FORBIDDEN');
    const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return current;
  };
  const options=():TransactionOptions=>({deadline:Date.now()+10000,signal:input.signal});
  const command=async(type:string,payload:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)});
  const owner=new OutboxOwner(),leases=new WorkLeaseOwner(),initial=await context();
  const routing=await database.transaction(initial,options(),async tx=>{
    const event=await readCommittedEvent(tx,eventRef),payload=contract('PrepareOutboxPayload',{eventRef,eventDigest:await inputDigest(event)}),cmd={...await command('abh.runtime.prepare-outbox',payload),idempotencyKey:`outbox/prepare/${eventRef.id}`};
    const result=await executeCommand(tx,cmd,async()=>{await owner.admitPreparation(tx,payload,input.checks);},async()=>(await owner.prepare(tx,cmd,payload,input.router,input.checks)).routingRef);
    return owner.getRouting(tx,result.receipt.resultRef);
  });
  const completed=await database.transaction(await context(),options(),async tx=>{
    await owner.admitPublication(tx,routing.routingRef,input.checks);
    const pending=await owner.pendingDeliveries(tx,routing.routingRef);
    return pending.length?undefined:owner.publication(tx,routing.routingRef);
  });
  if(completed)return {routingRef:routing.routingRef,pendingConsumerIds:[],publication:completed};
  const claim={targetRef:routing.routingRef,workerId:input.workerId,leaseSeconds:30},claimCommand=await command('abh.work-leases.claim',claim);
  let lease=await database.transaction(await context(),options(),async tx=>{
    const result=await executeCommand(tx,claimCommand,async()=>{await owner.admitPublication(tx,routing.routingRef,input.checks);},async()=>
      (await leases.claim(tx,claimCommand,claim,async()=>['abh.runtime.deliver'])).leaseRef);
    return leases.get(tx,result.receipt.resultRef);
  });
  const pending=await database.transaction(await context(),options(),tx=>owner.pendingDeliveries(tx,routing.routingRef));
  for(const delivery of pending){
    // Renew and reauthorize before every bounded queue call; heartbeat is never a business permission.
    const current=await context(),renew=await command('abh.work-leases.renew',{leaseRef:lease.leaseRef,workerId:lease.workerId,fencingToken:lease.fencingToken,leaseSeconds:30});
    lease=await database.transaction(current,options(),async tx=>{
      await owner.admitPublication(tx,routing.routingRef,input.checks);
      return leases.renew(tx,renew,lease.leaseRef,lease.workerId,lease.fencingToken,30);
    });
    const requestContext=await input.enqueueContext(current,structuredClone(routing),delivery.consumerId);
    let result;
    try{
    const remaining=Math.min(10000,Date.parse(requestContext.deadline)-Date.now(),Date.parse(lease.leaseUntil)-Date.now());
    if(!Number.isFinite(remaining)||remaining<=0||input.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    const signal=AbortSignal.any([input.signal,AbortSignal.timeout(Math.max(1,Math.floor(remaining)))]);
    let aborted:()=>void=()=>{};
    const stopped=new Promise<never>((_resolve,reject)=>{aborted=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();});
    try{result=await Promise.race([enqueueOutbox(input.port,{context:requestContext,job:structuredClone(delivery.job)},{signal},routing,delivery.consumerId),stopped]);}
    finally{signal.removeEventListener('abort',aborted);}
    }finally{input.releaseEnqueueContext?.(requestContext);}
    if(result.status!=='Completed')continue;
    const payload={routingRef:routing.routingRef,consumerId:delivery.consumerId,leaseRef:lease.leaseRef,workerId:lease.workerId,leaseFencingToken:lease.fencingToken};
    const cmd=await command('abh.runtime.record-outbox-delivery',payload);
    await database.transaction(await context(),options(),tx=>executeCommand(tx,cmd,async()=>{await owner.admitPublication(tx,routing.routingRef,input.checks);},async()=>
      (await owner.recordDelivery(tx,cmd,payload,result.proof,input.checks)).delivery.deliveryRef));
  }
  return database.transaction(await context(),options(),async tx=>{
    await owner.admitPublication(tx,routing.routingRef,input.checks);
    const pending=await owner.pendingDeliveries(tx,routing.routingRef),publication=await owner.publication(tx,routing.routingRef);
    return {routingRef:routing.routingRef,pendingConsumerIds:pending.map(item=>item.consumerId),...(publication?{publication}:{})};
  });
}


/** Hosting supplies one admitted tenant. Batches have bounded size and reset their cursor after a sweep. */
export async function runOutboxPublisher(database:Database,input:OutboxPublisher&{
  pageSize?:number;intervalMs?:number;
  onPage?(result:{scanned:number;published:number;pending:number},options:TransactionOptions):Promise<void>;
}):Promise<void>{
  const size=input.pageSize??100,interval=input.intervalMs??500;
  if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
  contract('UUID',input.workerId);
  let binding:string|undefined,cursor:string|undefined;
  const context=async()=>{
    const current=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+10000,signal:input.signal}),c=current.tenant,key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor.type,c.actor.id]);
    if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return current;
  };
  while(!input.signal.aborted){
    try{
      const current=await context();
      const page=await database.transaction(current,{deadline:Date.now()+10000,signal:input.signal},tx=>new OutboxOwner().pendingEvents(tx,input.router.eventTypes,size,cursor));
      let published=0,pending=0;
      for(const event of page){
        if(input.signal.aborted)return;
        try{
          const result=await retryDatabaseConflict({deadline:Date.now()+30000,signal:input.signal},options=>publishCommittedEvent(database,event,{...input,context,signal:options.signal}));
          if(result.publication)published++;else pending++;
        }catch(error){
          if(error instanceof CoreError&&error.code==='PRECONDITION_FAILED'){pending++;continue;}
          throw error;
        }
      }
      if(input.signal.aborted)return;
      cursor=page.length===size?page.at(-1)!.id:undefined;
      if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,published,pending},options),{deadline:Date.now()+10000,signal:input.signal});
      await delay(interval,undefined,{signal:input.signal});
    }catch(error){if(input.signal.aborted)return;throw error;}
  }
}
