import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {ClaimWorkLeasePayload,EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {inputDigest} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {expireEvaluation} from './expire-evaluation.ts';
import {LearningOwner,type RecoveryEvaluationRun} from './learning.ts';
import type {EvaluationDispatchOutcome,EvaluationDispatcher} from './evaluation-dispatcher.ts';

export type {EvaluationDispatchContext,EvaluationDispatchOutcome,EvaluationDispatcher} from './evaluation-dispatcher.ts';

const evaluationPurpose='abh.learning.evaluate';
const transientCodes=new Set(['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND']);

export interface EvaluationRecoveryWorkerOptions {
  workerId:string;
  context:ContextSource;
  grantRefs:readonly EntityRef[];
  dispatcher:EvaluationDispatcher;
  signal:AbortSignal;
  pageSize?:number;
  leaseSeconds?:number;
  maxAttempts?:number;
  intervalMs?:number;
  transactionTimeoutMs?:number;
  onPage?(result:{scanned:number;dispatched:number;unknown:number;expired:number},
    options:TransactionOptions):Promise<void>;
}

export interface EvaluationRecoveryPageResult {
  scanned:number;
  dispatched:number;
  unknown:number;
  expired:number;
}

function validateInput(input:EvaluationRecoveryWorkerOptions):Required<Pick<
  EvaluationRecoveryWorkerOptions,'pageSize'|'leaseSeconds'|'maxAttempts'|'intervalMs'|'transactionTimeoutMs'>>{
  const values={pageSize:input.pageSize??100,leaseSeconds:input.leaseSeconds??30,maxAttempts:input.maxAttempts??5,
    intervalMs:input.intervalMs??1000,transactionTimeoutMs:input.transactionTimeoutMs??10000};
  if(input.workerId.length===0
    ||!Number.isSafeInteger(values.pageSize)||values.pageSize<1||values.pageSize>100
    ||!Number.isSafeInteger(values.leaseSeconds)||values.leaseSeconds<1||values.leaseSeconds>30
    ||!Number.isSafeInteger(values.maxAttempts)||values.maxAttempts<1||values.maxAttempts>100
    ||!Number.isSafeInteger(values.intervalMs)||values.intervalMs<1||values.intervalMs>60000
    ||!Number.isSafeInteger(values.transactionTimeoutMs)||values.transactionTimeoutMs<1||values.transactionTimeoutMs>30000)
    throw new CoreError('INVALID_ARGUMENT');
  return values;
}

async function currentContext(input:EvaluationRecoveryWorkerOptions,options:TransactionOptions,key:{tenantKey?:string}) {
  const value=await requestVerifiedContext(sourceOptions=>input.context(sourceOptions),options),tenant=value.tenant;
  if(tenant.actor.type!=='Service'||tenant.purposeOfUse!==evaluationPurpose)throw new CoreError('FORBIDDEN');
  const nextKey=JSON.stringify([tenant.resourceOrganizationId,tenant.workspaceId??null,tenant.actor.id,tenant.actingOrganizationId]);
  if(key.tenantKey!==undefined&&key.tenantKey!==nextKey)throw new CoreError('FORBIDDEN');
  key.tenantKey=nextKey;return value;
}

async function expireRun(database:Database,input:EvaluationRecoveryWorkerOptions,context:Awaited<ReturnType<ContextSource>>,
  options:TransactionOptions,grantRefs:readonly EntityRef[],candidate:RecoveryEvaluationRun):Promise<boolean>{
  const command={type:'abh.learning.expire-evaluation',schemaVersion:'0.1.0',commandId:randomUUID(),
    idempotencyKey:randomUUID(),target:{type:'abh.evaluation-run',id:candidate.record.runRef.id},
    expectedVersion:candidate.record.runRef.version,payload:{runRef:candidate.record.runRef}} as const;
  try{
    await expireEvaluation(database,context,options,command,grantRefs);return true;
  }catch(error){
    if(error instanceof CoreError&&transientCodes.has(error.code))return false;
    throw error;
  }
}

export async function recoverEvaluationRunsOnce(database:Database,
  input:EvaluationRecoveryWorkerOptions):Promise<EvaluationRecoveryPageResult>{
  const limits=validateInput(input),options=():TransactionOptions=>({deadline:Date.now()+limits.transactionTimeoutMs,signal:input.signal});
  const key:{tenantKey?:string}={},context=await currentContext(input,options(),key),owner=new LearningOwner();
  const candidates=await database.transaction(context,options(),tx=>owner.recoveryEvaluationRuns(tx,limits.pageSize));
  let dispatched=0,unknown=0,expired=0;
  for(const candidate of candidates){
    if(input.signal.aborted)break;
    if(Date.parse(candidate.record.expiresAt!)<=Date.now()){
      if(await expireRun(database,input,context,options(),input.grantRefs,candidate))expired++;
      continue;
    }
    if(candidate.active||candidate.fencingToken>=limits.maxAttempts){
      if(candidate.fencingToken>=limits.maxAttempts
        &&await expireRun(database,input,context,options(),input.grantRefs,candidate))expired++;
      continue;
    }
    const target={type:'abh.evaluation-run' as const,id:candidate.record.runRef.id,version:1};
    const claim:ClaimWorkLeasePayload={targetRef:target,workerId:input.workerId,leaseSeconds:limits.leaseSeconds};
    const organization={type:'abh.organization' as const,id:context.tenant.resourceOrganizationId,version:1};
    await database.transaction(context,options(),async tx=>{
      await lockFences(tx,[organization,...input.grantRefs]);
      await assertCurrentGrants(tx,{objectRef:organization,scopeRefs:[organization],
        action:'abh.learning.request-evaluation'},input.grantRefs);
    });
    try{
      const lease=await database.transaction(context,options(),async tx=>{
        const command={type:'abh.work-leases.claim',commandId:randomUUID(),idempotencyKey:randomUUID(),
          digest:await inputDigest(claim)};
        return await new WorkLeaseOwner().claim(tx,command,claim,
        async(tx,targetRef)=>{
          const current=(await owner.recoveryEvaluationRuns(tx,limits.pageSize))
            .find(value=>value.record.runRef.id===targetRef.id);
          if(!current)throw new CoreError('RESOURCE_NOT_FOUND');
          return [evaluationPurpose];
        });});
      if(lease.fencingToken>=limits.maxAttempts){
        candidate.fencingToken=lease.fencingToken;
        if(await expireRun(database,input,context,options(),input.grantRefs,candidate))expired++;
        continue;
      }
      let outcome:EvaluationDispatchOutcome;
      try{
        outcome=await boundedCallback(async callbackOptions=>input.dispatcher.dispatch({
          run:candidate.record,lease,attempt:lease.fencingToken,signal:callbackOptions.signal}),options());
      }catch{unknown++;continue;}
      if(outcome==='Accepted'){
        dispatched++;
        const releaseInput={workerId:lease.workerId,fencingToken:lease.fencingToken};
        const releaseCommand={type:'abh.work-leases.release',commandId:randomUUID(),idempotencyKey:randomUUID(),
          digest:await inputDigest(releaseInput)};
        await database.transaction(context,options(),tx=>new WorkLeaseOwner().release(tx,
          releaseCommand,lease.leaseRef,lease.workerId,lease.fencingToken));
      }else unknown++;
    }catch(error){
      if(error instanceof CoreError&&transientCodes.has(error.code))continue;
      if(input.signal.aborted)break;
      throw error;
    }
  }
  const result={scanned:candidates.length,dispatched,unknown,expired};
  if(input.signal.aborted)return result;
  if(input.onPage)await boundedCallback(callbackOptions=>input.onPage!(result,callbackOptions),
    {deadline:Date.now()+10000,signal:input.signal});
  return result;
}

export async function runEvaluationRecoveryWorker(database:Database,input:EvaluationRecoveryWorkerOptions):Promise<void>{
  validateInput(input);
  const key:{tenantKey?:string}={};
  while(!input.signal.aborted){
    try{
      await recoverEvaluationRunsOnce(database,input);
      await delay(validateInput(input).intervalMs,undefined,{signal:input.signal});
    }catch(error){
      delete key.tenantKey;
      if(input.signal.aborted)return;
      throw error;
    }
  }
}
