import {createHash} from 'node:crypto';
import {PgBoss} from 'pg-boss';
import postgres from 'postgres';
import type {DeliveryInspection,DrainQueueRequest,DrainReport,DurableExecutionDrainResult,DurableExecutionEnqueueResult,DurableExecutionInspectResult,EnqueueJobRequest,EntityRef,InspectDeliveryRequest,JobEnvelope,PortCallContext} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {createErrorResponse} from '@abh/contracts/errors';
import {validateContract} from '@abh/contracts/schema';
import {validatePortRequest,type DurableExecutionPort,type PortCallOptions} from '@abh/contracts/ports';

type QueueClass='control'|'reconcile'|'interactive'|'background';
const classes:QueueClass[]=['control','reconcile','interactive','background'];
const queues=Object.fromEntries(classes.map(name=>[name,`abh.${name}`])) as Record<QueueClass,string>;
const jobClass=(job:JobEnvelope):QueueClass=>job.jobType==='abh.operation.reconcile'?'reconcile':job.jobType==='abh.pack-inspection-job.advance'?'background':'control';
export interface DeliveryScope {readonly resourceOrganizationId:string;readonly consumerId:string}
export interface DeliveryAdmission {
  /** Resolve a current server ContextRef/target. Caller JSON never chooses the tenant or installed consumer. */
  resolve(context:PortCallContext,signal:AbortSignal):Promise<DeliveryScope>;
}
interface StoredDelivery {resourceOrganizationId:string;consumerId:string;job:JobEnvelope;digest:string}
export interface QueueDelivery {readonly jobRef:EntityRef;readonly resourceOrganizationId:string;readonly consumerId:string;readonly job:JobEnvelope;readonly deliveryCount:number;readonly queueClass:QueueClass}
export interface QueueDeliveryPolicy {
  readonly expireSeconds:number;
  readonly retentionSeconds:number;
  /** Zero retains completed jobs for dedupe replay; a positive value enables native cleanup. */
  readonly deleteAfterSeconds:number;
  readonly retryLimit:number;
  readonly retryDelay:number;
  readonly retryBackoff:boolean;
  readonly retryDelayMax:number;
}
export type QueuePolicyOverrides=Partial<Record<QueueClass,Partial<QueueDeliveryPolicy>>>;
type MutableQueueDeliveryPolicy={-readonly [Key in keyof QueueDeliveryPolicy]:QueueDeliveryPolicy[Key]};
export interface PgBossDeliveryOptions {
  readonly connectionString:string;
  readonly admission:DeliveryAdmission;
  readonly onError:(category:'Dependency')=>void;
  readonly queuePolicies?:QueuePolicyOverrides;
  readonly maintenanceIntervalSeconds?:number;
}
const stableId=(scope:DeliveryScope,key:string)=>{
  const hex=createHash('sha256').update(canonicalJson([scope.resourceOrganizationId,scope.consumerId,key])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
const jobRef=(id:string)=>({type:'abh.job' as const,id,version:1});
const defaultPolicy:QueueDeliveryPolicy={expireSeconds:30,retentionSeconds:604_800,deleteAfterSeconds:0,
  retryLimit:3,retryDelay:1,retryBackoff:true,retryDelayMax:30};
const defaults=Object.fromEntries(classes.map(name=>[name,defaultPolicy])) as Record<QueueClass,QueueDeliveryPolicy>;
const integer=(value:unknown,name:string,min:number,max:number):number=>{
  if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new Error(`QUEUE_POLICY_${name}`);
  return value;
};
function resolvePolicies(overrides:QueuePolicyOverrides={}):Record<QueueClass,QueueDeliveryPolicy>{
  return Object.fromEntries(classes.map(name=>{
    const input=overrides[name]??{},source=defaultPolicy;
    const policy:MutableQueueDeliveryPolicy={...source};
    if('expireSeconds' in input)policy.expireSeconds=integer(input.expireSeconds,'EXPIRE',1,3_600);
    if('retentionSeconds' in input)policy.retentionSeconds=integer(input.retentionSeconds,'RETENTION',60,31_536_000);
    if('deleteAfterSeconds' in input)policy.deleteAfterSeconds=integer(input.deleteAfterSeconds,'DELETE',0,31_536_000);
    if('retryLimit' in input)policy.retryLimit=integer(input.retryLimit,'RETRY_LIMIT',0,10);
    if('retryDelay' in input)policy.retryDelay=integer(input.retryDelay,'RETRY_DELAY',0,3_600);
    if('retryBackoff' in input){if(typeof input.retryBackoff!=='boolean')throw new Error('QUEUE_POLICY_RETRY_BACKOFF');policy.retryBackoff=input.retryBackoff;}
    if('retryDelayMax' in input)policy.retryDelayMax=integer(input.retryDelayMax,'RETRY_DELAY_MAX',0,86_400);
    if(policy.retryDelayMax<policy.retryDelay)throw new Error('QUEUE_POLICY_RETRY_DELAY_MAX');
    if(!policy.retryBackoff&&('retryDelayMax' in input||policy.retryDelayMax!==defaultPolicy.retryDelayMax))throw new Error('QUEUE_POLICY_RETRY_DELAY_MAX');
    return [name,policy];
  })) as Record<QueueClass,QueueDeliveryPolicy>;
}
/** Documented pg-boss connection bridge, restricted to the isolated Queue role. JSON strings are already encoded by pg-boss. */
const queueDatabase=(tx:postgres.TransactionSql)=>({executeSql:async(text:string,values:unknown[]=[])=>({rows:await tx.unsafe(text,values as postgres.ParameterOrJSON<never>[])})});
class CallStopped extends Error {}
async function bounded<T>(deadline:number,signal:AbortSignal,work:()=>Promise<T>):Promise<T>{
  if(signal.aborted||deadline<=Date.now())throw new CallStopped();
  return new Promise<T>((resolve,reject)=>{
    const done=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};
    const abort=()=>done(()=>reject(new CallStopped()));
    const timer=setTimeout(abort,Math.min(2_147_483_647,Math.max(1,deadline-Date.now())));
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(work).then(value=>done(()=>resolve(value)),error=>done(()=>reject(error)));
  });
}


/** Native queue delivery only. Wait semantics remain in the Durable Owner, not pg-boss cron or local memory. */
export class PgBossDeliveryAdapter implements Pick<DurableExecutionPort,'enqueue'|'inspect'|'drain'> {
  #queue:postgres.Sql;
  #generations=new Map<string,{startedOn:number;createdOn:number}>();
  #boss:PgBoss;#admission:DeliveryAdmission;#accepting=new Set(classes);#active=new Map<string,QueueDelivery>();
  #pending=new Map<symbol,{queueClass:QueueClass;ref:EntityRef}>();
  #changed=new Set<()=>void>();
  #notify():void{for(const listener of [...this.#changed])listener();}
  async #track<T>(queueClass:QueueClass,ref:EntityRef,work:()=>Promise<T>):Promise<T>{
    const key=Symbol();this.#pending.set(key,{queueClass,ref});
    try{return await work();}finally{this.#pending.delete(key);this.#notify();}
  }
  private constructor(boss:PgBoss,admission:DeliveryAdmission,queue:postgres.Sql){this.#boss=boss;this.#admission=admission;this.#queue=queue;}
  static async start(options:PgBossDeliveryOptions):Promise<PgBossDeliveryAdapter>{
    const policies=resolvePolicies(options.queuePolicies);
    const maintenanceIntervalSeconds=options.maintenanceIntervalSeconds===undefined?undefined:
      integer(options.maintenanceIntervalSeconds,'MAINTENANCE',1,86_400);
    const boss=new PgBoss({connectionString:options.connectionString,schema:'abh_pgboss',createSchema:false,application_name:'abh-pg-boss',
      connectionTimeoutMillis:5000,max:4,schedule:false,supervise:true,
      ...(maintenanceIntervalSeconds===undefined?{}:{maintenanceIntervalSeconds})});
    boss.on('error',()=>options.onError('Dependency'));
    try{
      await boss.start();
      for(const queueClass of classes){const policy=policies[queueClass],retryDelayMax=policy.retryBackoff?policy.retryDelayMax:undefined;
        await boss.createQueue(queues[queueClass],{policy:'standard',partition:false,retryLimit:policy.retryLimit,
          retryDelay:policy.retryDelay,retryBackoff:policy.retryBackoff,
          ...(retryDelayMax===undefined?{}:{retryDelayMax}),expireInSeconds:policy.expireSeconds,
          retentionSeconds:policy.retentionSeconds,deleteAfterSeconds:policy.deleteAfterSeconds});}
      if(await boss.schemaVersion()!==40||!(await boss.detectSchemaDrift()).ok)throw new Error('QUEUE_SCHEMA_MISMATCH');
      return new PgBossDeliveryAdapter(boss,options.admission,postgres(options.connectionString,{max:4,connect_timeout:5,onnotice:()=>{},types:{encodedJson:{to:114,from:[114,3802],serialize:(value:unknown)=>typeof value==='string'?value:JSON.stringify(value),parse:JSON.parse}}}));
    }catch{await boss.stop({graceful:false});throw new Error('QUEUE_UNAVAILABLE');}
  }
  async close():Promise<void>{this.#accepting.clear();try{await this.#boss.stop({graceful:true,timeout:5000});}finally{await this.#queue.end({timeout:5});}}
  async enqueue(request:EnqueueJobRequest,options:PortCallOptions):Promise<DurableExecutionEnqueueResult>{
    const reject=(code:Parameters<typeof createErrorResponse>[0]):DurableExecutionEnqueueResult=>({status:'Rejected',error:createErrorResponse(code,request.context.callId)});
    if(!validatePortRequest('DurableExecutionPort.enqueue',request).success)return reject('INVALID_ARGUMENT');
    request=structuredClone(request);
    if(options.signal.aborted)return {status:'Cancelled',effect:'None'};
    const deadline=Date.parse(request.context.deadline),queueClass=jobClass(request.job);
    if(deadline<=Date.now()||Date.parse(request.job.deadline)<=Date.now())return reject('DEPENDENCY_TIMEOUT');
    if(!this.#accepting.has(queueClass))return reject('PRECONDITION_FAILED');
    let scope:DeliveryScope;
    try{scope=await bounded(Date.parse(request.context.deadline),options.signal,()=>this.#admission.resolve(structuredClone(request.context),options.signal));}
    catch(error){return options.signal.aborted?{status:'Cancelled',effect:'None'}:reject(error instanceof CallStopped?'DEPENDENCY_TIMEOUT':'FORBIDDEN');}
    if(!validateContract('UUID',scope.resourceOrganizationId).success||!validateContract('RegisteredName',scope.consumerId).success)return reject('FORBIDDEN');
    const id=stableId(scope,request.job.dedupeKey),ref=jobRef(id),job=structuredClone(request.job),digest=await digestBytes(new TextEncoder().encode(canonicalJson({scope,job})));
    const data:StoredDelivery={...scope,job,digest},name=queues[queueClass];
    // Queue-only transaction: the advisory key spans queue classes and adapter processes.
    // All queue mutations still use the pinned pg-boss public API via its documented db option.
    try{return await bounded(deadline,options.signal,()=>this.#track(queueClass,ref,()=>this.#queue.begin(async tx=>{
      await tx`SET LOCAL statement_timeout='10s'`;
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`abh.enqueue/${id}`},0))`;
      const db=queueDatabase(tx);
      for(const candidate of classes){
        const existing=(await this.#boss.findJobs<StoredDelivery>(queues[candidate],{id,db}))[0];
        if(existing){if(canonicalJson(existing.data)!==canonicalJson(data))return reject('IDEMPOTENCY_CONFLICT');return {status:'Completed',data:{jobRef:ref}} as DurableExecutionEnqueueResult;}
      }
      if(!this.#accepting.has(queueClass))return reject('PRECONDITION_FAILED');
      if(options.signal.aborted)return {status:'Cancelled',effect:'None'} as DurableExecutionEnqueueResult;
      if(deadline<=Date.now())return reject('DEPENDENCY_TIMEOUT');
      const sent=await this.#boss.send(name,data,{id,startAfter:new Date(job.notBefore),db});
      if(sent===id)return {status:'Completed',data:{jobRef:ref}} as DurableExecutionEnqueueResult;
      const current=(await this.#boss.findJobs<StoredDelivery>(name,{id,db}))[0];
      if(current&&canonicalJson(current.data)===canonicalJson(data))return {status:'Completed',data:{jobRef:ref}} as DurableExecutionEnqueueResult;
      return {status:'Tracked',trackingRef:ref} as DurableExecutionEnqueueResult;
    })));}catch{return {status:'Tracked',trackingRef:ref};}
  }

  /** Installed Worker calls its current Owner. This method never calls a Provider or grants execution rights. */
  async fetch(queueClass:QueueClass,signal:AbortSignal):Promise<QueueDelivery|undefined>{
    if(!classes.includes(queueClass)||signal.aborted||!this.#accepting.has(queueClass))return undefined;
    // Before fetch returns, the installed queue itself is the only known tracking subject.
    return this.#track(queueClass,{type:'abh.queue',id:stableId({resourceOrganizationId:'00000000-0000-4000-8000-000000000000',consumerId:'abh.queue'},queueClass),version:1},async()=>{
    const rows=await this.#boss.fetch<StoredDelivery>(queues[queueClass],{batchSize:1,includeMetadata:true}),row=rows[0];if(!row)return undefined;
    const generation={startedOn:row.startedOn!.getTime(),createdOn:row.createdOn.getTime()};
    const data=row.data,scope={resourceOrganizationId:data?.resourceOrganizationId,consumerId:data?.consumerId};
    if(!data||!validateContract('JobEnvelope',data.job).success||!validateContract('UUID',scope.resourceOrganizationId).success||!validateContract('RegisteredName',scope.consumerId).success
      ||stableId(scope,data.job.dedupeKey)!==row.id||jobClass(data.job)!==queueClass||await digestBytes(new TextEncoder().encode(canonicalJson({scope,job:data.job})))!==data.digest){
      await this.#nativeAck(queueClass,row.id,row.retryCount+1,generation,{lastErrorCategory:'Validation'},false);throw new Error('INVALID_QUEUED_DELIVERY');
    }
    if(signal.aborted||!this.#accepting.has(queueClass)){
      await this.#nativeAck(queueClass,row.id,row.retryCount+1,generation,{lastErrorCategory:'Dependency'},false);return undefined;
    }
    const delivery={jobRef:jobRef(row.id),...scope,job:structuredClone(data.job),deliveryCount:row.retryCount+1,queueClass};this.#active.set(row.id,delivery);this.#generations.set(row.id,generation);return structuredClone(delivery);
    });
  }
  #forget(delivery:QueueDelivery):void{
    const active=this.#active.get(delivery.jobRef.id);
    if(!active||canonicalJson(active)!==canonicalJson(delivery))return;
    this.#active.delete(delivery.jobRef.id);this.#generations.delete(delivery.jobRef.id);this.#notify();
  }
  async #nativeAck(queueClass:QueueClass,id:string,deliveryCount:number,generation:{startedOn:number;createdOn:number},output:object,success:boolean):Promise<void>{
    await this.#queue.begin(async tx=>{
        await tx`SET LOCAL statement_timeout='10s'`;
        // Read/lock only. This schema-40 guard serializes with native expiry and takeover.
        const [row]=await tx`SELECT state,retry_count,started_on,created_on,expire_seconds FROM abh_pgboss.job
          WHERE name=${queues[queueClass]} AND id=${id} FOR UPDATE`;
        const [clock]=await tx`SELECT clock_timestamp() AS now`;
        if(!row||row.state!=='active'||Number(row.retry_count)+1!==deliveryCount
          ||row.started_on?.getTime()!==generation.startedOn||row.created_on.getTime()!==generation.createdOn
          ||generation.startedOn+Number(row.expire_seconds)*1000<=clock!.now.getTime())throw new Error('STALE_DELIVERY');
        const result=success?await this.#boss.complete(queues[queueClass],id,output,{db:queueDatabase(tx)})
          :await this.#boss.fail(queues[queueClass],id,output,{db:queueDatabase(tx)});
        if(!('affected' in result)||result.affected!==1)throw new Error('STALE_DELIVERY');
      });
  }
  async #ack(delivery:QueueDelivery,output:object,success:boolean):Promise<void>{
    const generation=this.#generations.get(delivery.jobRef.id);
    if(!generation||canonicalJson(this.#active.get(delivery.jobRef.id))!==canonicalJson(delivery))throw new Error('INVALID_DELIVERY');
    try{
      await this.#nativeAck(delivery.queueClass,delivery.jobRef.id,delivery.deliveryCount,generation,output,success);
    }catch(error){
      if(error instanceof Error&&error.message==='STALE_DELIVERY'){this.#forget(delivery);}
      throw error;
    }
    this.#forget(delivery);
  }
  async complete(delivery:QueueDelivery,resultRef:EntityRef):Promise<void>{
    if(!validateContract('EntityRef',resultRef).success)throw new Error('INVALID_DELIVERY');
    await this.#ack(delivery,{ownerResultRef:resultRef},true);
  }
  async fail(delivery:QueueDelivery,category:NonNullable<DeliveryInspection['lastErrorCategory']>):Promise<void>{
    await this.#ack(delivery,{lastErrorCategory:category},false);
  }
  async inspect(request:InspectDeliveryRequest,options:PortCallOptions):Promise<DurableExecutionInspectResult>{
    const reject=(code:Parameters<typeof createErrorResponse>[0]):DurableExecutionInspectResult=>({status:'Rejected',error:createErrorResponse(code,request.context.callId)});
    if(!validatePortRequest('DurableExecutionPort.inspect',request).success||request.subjectRef.type!=='abh.job'||request.subjectRef.version!==1)return reject('INVALID_ARGUMENT');
    if(options.signal.aborted)return {status:'Cancelled',effect:'None'};
    let scope:DeliveryScope;try{scope=await bounded(Date.parse(request.context.deadline),options.signal,()=>this.#admission.resolve(structuredClone(request.context),options.signal));}
    catch(error){return options.signal.aborted?{status:'Cancelled',effect:'None'}:reject(error instanceof CallStopped?'DEPENDENCY_TIMEOUT':'FORBIDDEN');}
    try{for(const queueClass of classes){
      const row=(await bounded(Date.parse(request.context.deadline),options.signal,()=>this.#boss.findJobs<StoredDelivery>(queues[queueClass],{id:request.subjectRef.id})))[0];if(!row)continue;
      if(row.data.resourceOrganizationId!==scope.resourceOrganizationId||row.data.consumerId!==scope.consumerId)return reject('RESOURCE_NOT_FOUND');
      const output=row.output as {ownerResultRef?:EntityRef;lastErrorCategory?:DeliveryInspection['lastErrorCategory']}|null;
      const data={subjectRef:jobRef(row.id),queueAgeMs:Math.max(0,Date.now()-row.createdOn.getTime()),deliveryCount:row.startedOn?row.retryCount+1:0,
        ...(output?.ownerResultRef?{ownerResultRef:output.ownerResultRef}:{}),...(output?.lastErrorCategory?{lastErrorCategory:output.lastErrorCategory}:{})};
      if(!validateContract('DeliveryInspection',data).success)return reject('INTERNAL_ERROR');return {status:'Completed',data};
    }return reject('RESOURCE_NOT_FOUND');}catch(error){return options.signal.aborted?{status:'Cancelled',effect:'None'}:reject(error instanceof CallStopped?'DEPENDENCY_TIMEOUT':'DEPENDENCY_UNAVAILABLE');}
  }
  async drain(request:DrainQueueRequest,options:PortCallOptions):Promise<DurableExecutionDrainResult>{
    const reject=(code:Parameters<typeof createErrorResponse>[0]):DurableExecutionDrainResult=>({status:'Rejected',error:createErrorResponse(code,request.context.callId)});
    if(!validatePortRequest('DurableExecutionPort.drain',request).success)return reject('INVALID_ARGUMENT');
    if(options.signal.aborted)return {status:'Cancelled',effect:'None'};
    try{await bounded(Date.parse(request.context.deadline),options.signal,()=>this.#admission.resolve(structuredClone(request.context),options.signal));}catch(error){return options.signal.aborted?{status:'Cancelled',effect:'None'}:reject(error instanceof CallStopped?'DEPENDENCY_TIMEOUT':'FORBIDDEN');}
    for(const queueClass of request.queueClasses)this.#accepting.delete(queueClass);
    const remaining=():EntityRef[]=>{
      const refs=[...this.#active.values()].filter(delivery=>request.queueClasses.includes(delivery.queueClass)).map(delivery=>delivery.jobRef);
      refs.push(...[...this.#pending.values()].filter(work=>request.queueClasses.includes(work.queueClass)).map(work=>work.ref));
      return [...new Map(refs.map(ref=>[canonicalJson(ref),ref])).values()];
    };
    const deadline=Date.parse(request.context.deadline);
    while(remaining().length&&Date.now()<deadline&&!options.signal.aborted){
      await new Promise<void>(resolve=>{
        const done=()=>{clearTimeout(timer);this.#changed.delete(done);options.signal.removeEventListener('abort',done);resolve();};
        const timer=setTimeout(done,Math.min(2_147_483_647,Math.max(1,deadline-Date.now())));
        this.#changed.add(done);options.signal.addEventListener('abort',done,{once:true});
        if(options.signal.aborted)done();
      });
    }
    // Cancellation after stopping admission cannot truthfully return Cancelled/None.
    const remainingRefs=remaining();
    if(remainingRefs.length>1000)return reject('RESOURCE_EXHAUSTED');
    const report:DrainReport={drained:remainingRefs.length===0,remainingRefs,completedAt:new Date().toISOString()};return {status:'Completed',data:report};
  }
}
