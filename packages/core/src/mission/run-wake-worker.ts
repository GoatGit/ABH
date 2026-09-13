import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,WakeRunCommand} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {wakeRun} from './run-commands.ts';
import {RunOwner,type PendingWakeRun} from './runs.ts';

const runtimePurpose='abh.runtime.deliver';
const transientCodes=new Set(['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND']);

export interface RunWakeWorkerOptions {
 workerId:string;
 context:ContextSource;
 grantRefs:readonly EntityRef[];
 signal:AbortSignal;
 pageSize?:number;
 intervalMs?:number;
 transactionTimeoutMs?:number;
 onPage?(result:{scanned:number;awakened:number},options:TransactionOptions):Promise<void>;
}

/** Tenant-local coordinator. Hosting supplies the admitted tenant and current wake Grant. */
export async function runRunWakeWorker(database:Database,input:RunWakeWorkerOptions):Promise<void>{
 const pageSize=input.pageSize??100,intervalMs=input.intervalMs??1000,timeout=input.transactionTimeoutMs??10000;
 if(!Number.isSafeInteger(input.pageSize??100)||pageSize<1||pageSize>100
   ||!Number.isSafeInteger(input.intervalMs??1000)||intervalMs<1||intervalMs>60000
   ||!Number.isSafeInteger(input.transactionTimeoutMs??10000)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
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
  let scanned=0,awakened=0;
  try{
   const current=await currentContext();
   const page=await database.transaction(current,options(),tx=>new RunOwner().pendingWakeRuns(tx,pageSize,cursor));
   scanned=page.length;cursor=page.length===pageSize?page.at(-1)!.runRef.id:undefined;
   for(const candidate of page){
    if(input.signal.aborted)break;
    const context=await currentContext(),command:WakeRunCommand={
     type:'abh.runs.wake',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
     target:{type:'abh.run',id:candidate.runRef.id},expectedVersion:candidate.runRef.version,
     payload:{runRef:candidate.runRef,causeRef:candidate.waitRef,waitRef:candidate.waitRef}};
    try{
     const record=await wakeRun(database,context,options(),command,grantRefs);
     if(record.runRef.version>candidate.runRef.version&&record.status==='Running')awakened++;
    }catch(error){
     if(!(error instanceof CoreError&&transientCodes.has(error.code)))throw error;
    }
   }
   if(input.signal.aborted)return;
   if(input.onPage)await boundedCallback(options=>input.onPage!({scanned,awakened},options),{deadline:Date.now()+10000,signal:input.signal});
   await delay(intervalMs,undefined,{signal:input.signal});
  }catch(error){if(input.signal.aborted)return;throw error;}
 }
}
