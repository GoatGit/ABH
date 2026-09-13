import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {CompleteInvocationPayload,EntityRef,InvocationRecord,PrepareInvocationCommand,TaskSpec,
  TaskRecord,UUID,WorkLeaseRecord} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {claimTask,completeInvocation,finalizeInvocation,observeLateInvocation,prepareInvocation} from './run-commands.ts';
import {RunOwner} from './runs.ts';

const runtimePurpose='abh.runtime.deliver';
const lostRaceCodes=new Set(['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND']);

export interface ReadyTaskPlanInput{
 task:TaskRecord;
 lease:WorkLeaseRecord;
 signal:AbortSignal;
}

export interface ReadyTaskPlan{
 taskSpec:TaskSpec;
 manifestRef:EntityRef&{type:'abh.artifact'};
 bindingRefs:readonly EntityRef[];
 identityBasisRefs:readonly EntityRef[];
}

export type ReadyTaskExecution =
 |{kind:'Completed';resultArtifactRef:EntityRef&{type:'abh.artifact'};usageRef?:EntityRef}
 |{kind:'Failed';stopReason:Exclude<CompleteInvocationPayload['stopReason'],'Completed'>;usageRef?:EntityRef}
 |{kind:'Unknown';observationRef?:EntityRef};

export interface ReadyTaskExecutionContext{
 task:TaskRecord;
 lease:WorkLeaseRecord;
 invocation:InvocationRecord;
 signal:AbortSignal;
}

export interface ReadyTaskExecutor{
 execute(context:ReadyTaskExecutionContext):Promise<ReadyTaskExecution>;
}

export interface ReadyTaskWorkerOptions{
 workerId:UUID;
 context:ContextSource;
 grantRefs:readonly EntityRef[];
 plan(input:ReadyTaskPlanInput):Promise<ReadyTaskPlan>;
 executor:ReadyTaskExecutor;
 signal:AbortSignal;
 pageSize?:number;
 leaseSeconds?:number;
 intervalMs?:number;
 transactionTimeoutMs?:number;
 onPage?(result:{scanned:number;claimed:number;completed:number;unknown:number},options:TransactionOptions):Promise<void>;
}

function deterministicIdempotencyKey(value:unknown):UUID{
 const hash=createHash('sha256').update(canonicalJson(value)).digest('hex');
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}` as UUID;
}

async function taskCommand(type:'abh.tasks.claim'|'abh.invocations.prepare'|'abh.invocations.finalize'|'abh.invocations.complete'|'abh.invocations.observe-late',
 target:EntityRef,payload:unknown,idempotencyKey:UUID):Promise<CommandIdentity>{
 return {type,commandId:randomUUID(),idempotencyKey,digest:await inputDigest(payload)};
}

/** Tenant-local bounded dispatch. Executors own uncertainty; this worker never fabricates external outcomes. */
export async function runReadyTaskWorker(database:Database,input:ReadyTaskWorkerOptions):Promise<void>{
 const pageSize=input.pageSize??100,leaseSeconds=input.leaseSeconds??30,intervalMs=input.intervalMs??1000,
   timeout=input.transactionTimeoutMs??10000;
 contract('UUID',input.workerId);
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>300
   ||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>60000
   ||!Number.isSafeInteger(timeout)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
 const grantRefs=input.grantRefs.map(ref=>({...ref}));
 let cursor:string|undefined,tenantKey:string|undefined;
 const currentContext=async()=>{
  const value=await requestVerifiedContext(options=>input.context(options),{deadline:Date.now()+timeout,signal:input.signal}),c=value.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!==runtimePurpose)throw new CoreError('FORBIDDEN');
  const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actor.id,c.actingOrganizationId]);
  if(tenantKey!==undefined&&tenantKey!==key)throw new CoreError('FORBIDDEN');tenantKey=key;return value;
 };
 const options=():TransactionOptions=>({deadline:Date.now()+timeout,signal:input.signal});
 while(!input.signal.aborted){
  let scanned=0,claimed=0,completed=0,unknown=0;
  try{
   const current=await currentContext();
   const candidates=await database.transaction(current,options(),async tx=>{
    const ready=await new RunOwner().readyTasks(tx,pageSize,cursor);
    const interrupted=await new RunOwner().interruptedTasks(tx,Math.max(1,pageSize-ready.length),cursor);
    return [...ready,...interrupted];
   });
   scanned=candidates.length;cursor=candidates.length===pageSize?candidates.at(-1)!.id:undefined;
   for(const candidate of candidates){
    if(input.signal.aborted)break;
    const context=await currentContext(),priorTask=await database.transaction(current,options(),tx=>new RunOwner().getTask(tx,candidate.id));
    const claimPayload={taskRef:priorTask.taskRef,workerId:input.workerId,leaseSeconds};
    const claimCommand=await taskCommand('abh.tasks.claim',candidate,claimPayload,
      deterministicIdempotencyKey(['claim',candidate.id,candidate.version,input.workerId]));
    let lease:WorkLeaseRecord;
    try{lease=await claimTask(database,context,options(),{
     type:'abh.tasks.claim',schemaVersion:'0.1.0',commandId:claimCommand.commandId,
     idempotencyKey:claimCommand.idempotencyKey,target:{type:'abh.task',id:candidate.id},
     expectedVersion:priorTask.taskRef.version,payload:claimPayload},grantRefs);
    }catch(error){
     if(error instanceof CoreError&&lostRaceCodes.has(error.code))continue;
     throw error;
    }
    claimed++;
    const task=await database.transaction(context,options(),tx=>new RunOwner().getTask(tx,candidate.id));
    if(task.status!=='Ready'){
     completed++;
     continue;
    }
    const plan=await input.plan({task,lease,signal:input.signal});
    const identityBasisRefs=[...plan.identityBasisRefs];
    const preparePayload={taskRef:task.taskRef,leaseRef:lease.leaseRef,
      workerId:input.workerId,leaseFencingToken:lease.fencingToken,taskSpec:plan.taskSpec,identityBasisRefs};
    const prepareCommand=await taskCommand('abh.invocations.prepare',candidate,preparePayload,
      deterministicIdempotencyKey(['prepare',lease.leaseRef.id,lease.fencingToken]));
    const created=await prepareInvocation(database,context,options(),{
     type:'abh.invocations.prepare',schemaVersion:'0.1.0',commandId:prepareCommand.commandId,
     idempotencyKey:prepareCommand.idempotencyKey,target:{type:'abh.task',id:candidate.id},
     expectedVersion:task.taskRef.version,payload:preparePayload},grantRefs);
    const contractDigest='sha256:'+(await digestBytes(new TextEncoder().encode(canonicalJson({
     taskSpecDigest:created.taskSpecDigest,manifestRef:plan.manifestRef,bindingRefs:[...plan.bindingRefs]})))).slice(7);
    const finalizePayload={invocationRef:created.invocationRef,leaseRef:lease.leaseRef,workerId:input.workerId,
      leaseFencingToken:lease.fencingToken,manifestRef:plan.manifestRef,bindingRefs:[...plan.bindingRefs],contractDigest};
    const finalizeCommand=await taskCommand('abh.invocations.finalize',created.invocationRef,finalizePayload,
      deterministicIdempotencyKey(['finalize',lease.leaseRef.id,lease.fencingToken]));
    const invocation=await finalizeInvocation(database,context,options(),{
     type:'abh.invocations.finalize',schemaVersion:'0.1.0',commandId:finalizeCommand.commandId,
     idempotencyKey:finalizeCommand.idempotencyKey,target:{type:'abh.invocation',id:created.invocationRef.id},
     expectedVersion:created.invocationRef.version,payload:finalizePayload},grantRefs);
    const execution=await input.executor.execute({task,lease,invocation,signal:input.signal});
    if(execution.kind==='Unknown'){unknown++;continue;}
    const completePayload:CompleteInvocationPayload={invocationRef:invocation.invocationRef,leaseRef:lease.leaseRef,
      workerId:input.workerId,leaseFencingToken:lease.fencingToken,
      stopReason:execution.kind==='Completed'?'Completed':execution.stopReason,
      ...(execution.kind==='Completed'?{resultArtifactRef:execution.resultArtifactRef}:{}),
      ...(execution.usageRef?{usageRef:execution.usageRef}:{})};
    const completeCommand=await taskCommand('abh.invocations.complete',invocation.invocationRef,completePayload,
      deterministicIdempotencyKey(['complete',lease.leaseRef.id,lease.fencingToken,execution.kind,
        execution.kind==='Completed'?execution.resultArtifactRef:execution.stopReason]));
    try{await completeInvocation(database,context,options(),{
     type:'abh.invocations.complete',schemaVersion:'0.1.0',commandId:completeCommand.commandId,
     idempotencyKey:completeCommand.idempotencyKey,target:{type:'abh.invocation',id:invocation.invocationRef.id},
     expectedVersion:invocation.invocationRef.version,payload:completePayload},grantRefs);
    }catch(error){
     if(!(error instanceof CoreError&&error.code==='PRECONDITION_FAILED'))throw error;
     const lateStopReason:CompleteInvocationPayload['stopReason']=execution.kind==='Completed'?'Completed':execution.stopReason;
     const latePayload={invocationRef:invocation.invocationRef,leaseRef:lease.leaseRef,workerId:input.workerId,
       leaseFencingToken:lease.fencingToken,stopReason:lateStopReason,
       ...(execution.kind==='Completed'?{resultArtifactRef:execution.resultArtifactRef}:{}),
       ...(execution.usageRef?{usageRef:execution.usageRef}:{})};
     const lateCommand=await taskCommand('abh.invocations.observe-late',invocation.invocationRef,latePayload,
       deterministicIdempotencyKey(['observe-late',lease.leaseRef.id,lease.fencingToken,
         latePayload.stopReason,latePayload.resultArtifactRef]));
     try{await observeLateInvocation(database,context,options(),{
     type:'abh.invocations.observe-late',schemaVersion:'0.1.0',commandId:lateCommand.commandId,
      idempotencyKey:lateCommand.idempotencyKey,target:{type:'abh.invocation',id:invocation.invocationRef.id},
      payload:latePayload},grantRefs);
     }catch{throw error;}
    }
    completed++;
   }
   if(input.signal.aborted)return;
   if(input.onPage)await boundedCallback(options=>input.onPage!({scanned,claimed,completed,unknown},options),
     {deadline:Date.now()+10000,signal:input.signal});
   await delay(intervalMs,undefined,{signal:input.signal});
  }catch(error){if(input.signal.aborted)return;throw error;}
 }
}
