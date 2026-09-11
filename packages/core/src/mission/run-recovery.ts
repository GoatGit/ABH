import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,RecoverRunCommand,RecoverRunPayload} from '@abh/contracts';
import {digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {RunOwner,type RunRecoveryEffect} from './runs.ts';

const runtimePurpose='abh.runtime.deliver';

function assertRecoveryContext(context:VerifiedContext):void{
 if(context.tenant.actor.type!=='Service'||context.tenant.purposeOfUse!==runtimePurpose)throw new CoreError('FORBIDDEN');
}

async function commandIdentity(type:string,payload:unknown):Promise<CommandIdentity>{
 return {type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
}

export interface RecoverRunOptions extends TransactionOptions {
  leaseSeconds?:number;
}

export interface RecoverRunResult {
  runRef:EntityRef;
  cancelledTasks:number;
  missionUpdated:boolean;
  replayed:boolean;
}

/** A lease claim proves worker ownership only; the recovery UoW separately evaluates current grants and run state. */
export async function recoverRun(database:Database,context:VerifiedContext,suppliedOptions:RecoverRunOptions,
 supplied:RecoverRunCommand,runRef:EntityRef,grants:readonly EntityRef[]):Promise<RecoverRunResult>{
 requireVerifiedContext(context);assertRecoveryContext(context);
const input=contract('RecoverRunCommand',structuredClone(supplied)),leaseSeconds=suppliedOptions.leaseSeconds??30;
 if(input.type!=='abh.runs.recover'||input.target.id!==runRef.id||runRef.type!=='abh.run'
   ||input.expectedVersion!==runRef.version)throw new CoreError('INVALID_ARGUMENT');
 if(input.type!=='abh.runs.recover')console.error({input,runRef});
 if(!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>300)throw new CoreError('INVALID_ARGUMENT');
 const options=():TransactionOptions=>({deadline:suppliedOptions.deadline,signal:suppliedOptions.signal});
 const target={type:'abh.run' as const,id:runRef.id,version:runRef.version};
 const claimPayload={targetRef:target,workerId:input.payload.workerId,leaseSeconds};
 const claimCommand=await commandIdentity('abh.runs.recover',claimPayload);
 const lease=await database.transaction(context,options(),async tx=>await new WorkLeaseOwner().claim(tx,claimCommand,claimPayload,
  async(tx,target)=>{await new RunOwner().get(tx,target.id);return [runtimePurpose];}));
 const payload:RecoverRunPayload={...input.payload,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken};
 const identity={...input,payload},command={type:input.type,commandId:input.commandId,
  idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 const effect=await database.transaction(context,options(),tx=>new RunOwner().recover(tx,command,target,payload,grants));
 const releasePayload={workerId:payload.workerId,fencingToken:lease.fencingToken};
 const releaseCommand=await commandIdentity('abh.runs.recover',releasePayload);
 await database.transaction(context,options(),tx=>new WorkLeaseOwner().release(tx,releaseCommand,lease.leaseRef,payload.workerId,lease.fencingToken));
 return {runRef:effect.record.runRef,cancelledTasks:effect.cancelledTasks,missionUpdated:effect.missionUpdated,replayed:effect.replayed};
}

export interface RunRecoveryWorkerOptions {
  workerId:string;
  context:ContextSource;
  grantRefs:readonly EntityRef[];
  signal:AbortSignal;
  pageSize?:number;
  intervalMs?:number;
  transactionTimeoutMs?:number;
  onPage?(result:{scanned:number;recovered:number},options:TransactionOptions):Promise<void>;
}

/** Tenant-local bounded sweeps. Hosting supplies admitted tenants; recovery authority is grant-backed per command. */
export async function runRunRecoveryWorker(database:Database,input:RunRecoveryWorkerOptions):Promise<void>{
 const pageSize=input.pageSize??100,intervalMs=input.intervalMs??1000,timeout=input.transactionTimeoutMs??10000;
 contract('UUID',input.workerId);
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(intervalMs)||intervalMs<1||intervalMs>60000
   ||!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
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
  try{
   const current=await currentContext();
   const page=await database.transaction(current,options(),tx=>new RunOwner().pendingRecovery(tx,pageSize,cursor));
   let recovered=0;
   for(const candidate of page){
    if(input.signal.aborted)break;
    try{
     const context=await currentContext(),target={type:'abh.run' as const,id:candidate.id,version:candidate.version};
     const command:RecoverRunCommand={type:'abh.runs.recover',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
      target:{type:'abh.run',id:candidate.id},expectedVersion:candidate.version,payload:{workerId:input.workerId,
      causeRef:{type:'abh.artifact',id:randomUUID(),version:1},leaseRef:{type:'abh.work-lease',id:randomUUID(),version:1},leaseFencingToken:1}};
     const result=await recoverRun(database,context,options(),command,target,grantRefs);
     if(result.cancelledTasks||result.missionUpdated)recovered++;
    }catch(error){
     if(error instanceof CoreError&&['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND'].includes(error.code))continue;
     throw error;
    }
   }
   if(input.signal.aborted)return;
   cursor=page.length===pageSize?page.at(-1)!.id:undefined;
   if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,recovered},options),{deadline:Date.now()+10000,signal:input.signal});
   await delay(intervalMs,undefined,{signal:input.signal});
  }catch(error){if(input.signal.aborted)return;throw error;}
 }
}
