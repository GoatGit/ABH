import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,StopStalledRunCommand} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {contract} from '../data/journal.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {stopStalledRun} from './run-commands.ts';
import {RunOwner} from './runs.ts';

const runtimePurpose='abh.runtime.deliver';
const lostRaceCodes=new Set(['PRECONDITION_FAILED','VERSION_CONFLICT','RESOURCE_NOT_FOUND']);

export interface RunStallWorkerOptions {
  workerId:string;
  context:ContextSource;
  grantRefs:readonly EntityRef[];
  signal:AbortSignal;
  pageSize?:number;
  intervalMs?:number;
  transactionTimeoutMs?:number;
  onPage?(result:{scanned:number;stopped:number},options:TransactionOptions):Promise<void>;
}

/** Tenant-local bounded sweeps; each stop revalidates deadline, grants, and Run version in its own transaction. */
export async function runRunStallWorker(database:Database,input:RunStallWorkerOptions):Promise<void>{
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
   const page=await database.transaction(current,options(),tx=>new RunOwner().stalledRuns(tx,pageSize,cursor));
   let stopped=0;
   for(const candidate of page){
    if(input.signal.aborted)break;
    try{
     const context=await currentContext(),causeRef={type:'abh.artifact' as const,id:randomUUID(),version:1};
     const command:StopStalledRunCommand={type:'abh.runs.stop-stalled',schemaVersion:'0.1.0',commandId:randomUUID(),
      idempotencyKey:randomUUID(),target:{type:'abh.run',id:candidate.id},
      expectedVersion:candidate.version,payload:{runRef:candidate,causeRef}};
     await stopStalledRun(database,context,options(),command,grantRefs);
     stopped++;
    }catch(error){
     if(error instanceof CoreError&&lostRaceCodes.has(error.code))continue;
     throw error;
    }
   }
   if(input.signal.aborted)return;
   cursor=page.length===pageSize?page.at(-1)!.id:undefined;
   if(input.onPage)await boundedCallback(options=>input.onPage!({scanned:page.length,stopped},options),
     {deadline:Date.now()+10000,signal:input.signal});
   await delay(intervalMs,undefined,{signal:input.signal});
  }catch(error){if(input.signal.aborted)return;throw error;}
 }
}
