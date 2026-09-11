import {randomUUID} from 'node:crypto';
import type {DrainQueueRequest,EntityRef,PortCallContext} from '@abh/contracts';
import type {Database} from '../data/uow.ts';
import {digestContract} from '@abh/contracts/digest';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import type {RuntimeServiceOptions} from './runtime-service.ts';
import type {OutboxPublisher} from './publisher.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';

/** Installed consumer identities, not arbitrary caller-selected routing scopes. */
export class QueueAdmissionDirectory {
  readonly #consumers:Set<string>;
  readonly #entries=new Map<string,{context:VerifiedContext;consumerId:string;grantRefs:EntityRef[]}>();
  readonly #database:Database;
  constructor(database:Database,consumerIds:readonly string[]){
    this.#database=database;
    for(const id of consumerIds)contract('RegisteredName',id);
    if(consumerIds.length>1000||new Set(consumerIds).size!==consumerIds.length)throw new CoreError('INVALID_ARGUMENT');
    this.#consumers=new Set(consumerIds);
  }
  register(context:VerifiedContext,consumerId:string,grantRefs:readonly EntityRef[]):PortCallContext['requestContextRef']{
    requireVerifiedContext(context);
    if(context.tenant.actor.type!=='Service'||context.tenant.purposeOfUse!=='abh.runtime.deliver'||!this.#consumers.has(consumerId))throw new CoreError('FORBIDDEN');
    if(!grantRefs.length||grantRefs.length>100)throw new CoreError('AUTHORITY_REQUIRED');
    for(const grant of grantRefs){contract('EntityRef',grant);if(grant.type!=='abh.grant')throw new CoreError('INVALID_ARGUMENT');}
    for(const [id,entry] of this.#entries)if(Date.parse(entry.context.tenant.contextExpiresAt)<=Date.now())this.#entries.delete(id);
    if(this.#entries.size>=1000)throw new CoreError('LIMIT_EXCEEDED');
    const id=randomUUID();this.#entries.set(id,{context,consumerId,grantRefs:structuredClone([...grantRefs])});
    return {type:'abh.request-context',id,version:1};
  }
  /** Publisher-specific scope derives solely from its persisted frozen job; every call owns its handle. */
  publisherContexts(grantRefs:readonly EntityRef[]):Pick<OutboxPublisher,'enqueueContext'|'releaseEnqueueContext'>{
    const grants=structuredClone([...grantRefs]),issued=new Set<string>();
    return {
      enqueueContext:async(context,routing,consumerId)=>{
        contract('OutboxRoutingRecord',routing);
        if(routing.resourceOrganizationId!==context.tenant.resourceOrganizationId||await digestContract('OutboxRoutingRecord',routing)!==routing.digest)throw new CoreError('FORBIDDEN');
        const delivery=routing.deliveries.find(item=>item.consumerId===consumerId);if(!delivery)throw new CoreError('FORBIDDEN');
        const requestContextRef=this.register(context,consumerId,grants);issued.add(requestContextRef.id);
        return {callId:randomUUID(),requestContextRef,target:{objectRef:structuredClone(delivery.job.targetRef),
          scopeRefs:[{type:'abh.organization',id:context.tenant.resourceOrganizationId,version:1}],action:'abh.runtime.enqueue'},
          deadline:new Date(Math.min(Date.now()+10000,Date.parse(context.tenant.contextExpiresAt))).toISOString()};
      },
      releaseEnqueueContext:call=>{if(issued.delete(call.requestContextRef.id))this.revoke(call.requestContextRef);},
    };
  }
  /** Drain receives a fresh Context after Worker cancellation, with a separately bounded lifetime. */
  drainContexts(input:{context:ContextSource;consumerId:string;grantRefs:readonly EntityRef[];identityTimeoutMs?:number;queueClasses:DrainQueueRequest['queueClasses'];timeoutMs?:number}):Pick<RuntimeServiceOptions,'drainRequest'|'releaseDrainRequest'>{
    const identityTimeout=input.identityTimeoutMs??10000,timeout=input.timeoutMs??10000,grants=structuredClone([...input.grantRefs]),classes=[...input.queueClasses],issued=new Set<string>();
    if(!Number.isInteger(identityTimeout)||identityTimeout<1||identityTimeout>30000||!Number.isInteger(timeout)||timeout<1||timeout>60000||!classes.length||new Set(classes).size!==classes.length
      ||classes.some(value=>!['control','reconcile','interactive','background'].includes(value)))throw new CoreError('INVALID_ARGUMENT');
    const consumerId=input.consumerId,context=input.context;
    return {
      drainRequest:async()=>{
        const current=await requestVerifiedContext(context,{deadline:Date.now()+identityTimeout,signal:new AbortController().signal,readOnly:true}),requestContextRef=this.register(current,consumerId,grants);issued.add(requestContextRef.id);
        const organization={type:'abh.organization',id:current.tenant.resourceOrganizationId,version:1};
        return {context:{callId:randomUUID(),requestContextRef,target:{objectRef:organization,scopeRefs:[organization],action:'abh.runtime.drain'},
          deadline:new Date(Math.min(Date.now()+timeout,Date.parse(current.tenant.contextExpiresAt))).toISOString()},queueClasses:[...classes]};
      },
      releaseDrainRequest:request=>{if(issued.delete(request.context.requestContextRef.id))this.revoke(request.context.requestContextRef);},
    };
  }
  revoke(ref:EntityRef):void{this.#entries.delete(ref.id);}
  async resolve(call:PortCallContext,signal:AbortSignal):Promise<{resourceOrganizationId:string;consumerId:string}>{
    contract('PortCallContext',call);
    const entry=this.#entries.get(call.requestContextRef.id);
    if(!entry||call.requestContextRef.type!=='abh.request-context'||call.requestContextRef.version!==1)throw new CoreError('FORBIDDEN');
    requireVerifiedContext(entry.context);
    if(!['abh.runtime.enqueue','abh.runtime.inspect','abh.runtime.drain'].includes(call.target.action))throw new CoreError('FORBIDDEN');
    const deadline=Math.min(Date.parse(call.deadline),Date.parse(entry.context.tenant.contextExpiresAt));
    await this.#database.transaction(entry.context,{deadline,signal},async tx=>{
      await assertCurrentGrants(tx,call.target,entry.grantRefs);
      if(this.#entries.get(call.requestContextRef.id)!==entry)throw new CoreError('FORBIDDEN');
    });
    return {resourceOrganizationId:entry.context.tenant.resourceOrganizationId,consumerId:entry.consumerId};
  }
}
