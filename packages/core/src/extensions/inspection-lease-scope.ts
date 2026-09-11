import {WorkLeaseNotCurrentError} from '../durable/work-leases.ts';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {claimPackInspectionLease,renewPackInspectionLease,releasePackInspectionLease,requirePackInspectionLease,snapshotPackInspectionLease,type PackInspectionLeaseBinding} from './inspection-leases.ts';
export interface PackInspectionLeaseScope {
 options():TransactionOptions;
 binding():PackInspectionLeaseBinding;
}
/** One candidate lifetime. Heartbeat failure/expiry cancels all scoped work;
 * finalization joins renewal before releasing the latest fenced ownership. Work
 * must use scoped bounded operations, never detached calls. Lease ownership does
 * not extend an operation's deadline or replace result-transaction fencing.
 */
export async function withPackInspectionLease<T>(database:Database,input:{context:ContextSource;signal:AbortSignal;installation:InstalledPackRecord;grants:readonly EntityRef[];workerId:string;heartbeatMs?:number;timeoutMs?:number},work:(scope:PackInspectionLeaseScope)=>Promise<T>):Promise<T>{
 const pack=structuredClone(input.installation),grants=structuredClone(input.grants),workerId=input.workerId,source=input.context.bind(input),parent=input.signal;
 const heartbeat=input.heartbeatMs??10000,timeout=input.timeoutMs??30000;
 if(!Number.isInteger(heartbeat)||heartbeat<10||heartbeat>10000||!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
 let identity:string|undefined;
 const context=async(options:TransactionOptions)=>{
  const value=await requestVerifiedContext(source,options),c=value.tenant,key=canonicalJson([c.resourceOrganizationId,c.actingOrganizationId,c.workspaceId??null,c.actor.type,c.actor.id]);
  if(identity!==undefined&&identity!==key)throw new CoreError('FORBIDDEN');identity=key;return value;
 };
 const initial={deadline:Date.now()+timeout,signal:parent};
 let lease=await claimPackInspectionLease(database,await context(initial),initial,pack,grants,workerId);
 const stop=new AbortController(),heartbeatStop=new AbortController();let lost:unknown,hasLoss=false,closed=false;
 const cancel=()=>stop.abort(parent.reason);parent.addEventListener('abort',cancel,{once:true});if(parent.aborted)cancel();
 const fail=(error:unknown)=>{if(!hasLoss)lost=error;hasLoss=true;stop.abort(error);};
 let expiry:ReturnType<typeof setTimeout>;
 const arm=()=>{clearTimeout(expiry);expiry=setTimeout(()=>fail(new CoreError('PRECONDITION_FAILED')),Math.max(1,Date.parse(lease.leaseUntil)-Date.now()));};arm();
 const options=():TransactionOptions=>{
  if(closed||stop.signal.aborted)throw hasLoss?lost:new CoreError('DEPENDENCY_TIMEOUT');
  return {deadline:Math.min(Date.now()+timeout,Date.parse(lease.leaseUntil)),signal:stop.signal};
 };
 const scope:PackInspectionLeaseScope={options,binding:()=>{options();return snapshotPackInspectionLease({installation:pack,grants,token:lease});}};
 const renewal=(async()=>{
  try{
   while(!heartbeatStop.signal.aborted&&!stop.signal.aborted){
    await delay(heartbeat,undefined,{signal:AbortSignal.any([heartbeatStop.signal,stop.signal])});
    const current=options(),limits={...current,signal:AbortSignal.any([current.signal,heartbeatStop.signal])};
    lease=await renewPackInspectionLease(database,await context(limits),limits,pack,grants,lease);
    if(!heartbeatStop.signal.aborted&&!stop.signal.aborted)arm();
   }
  }catch(error){if(!heartbeatStop.signal.aborted&&!parent.aborted)fail(error);}
 })();
 let result:T|undefined,failure:unknown,failed=false;
 try{result=await work(scope);if(hasLoss)throw lost;}
 catch(error){failure=error;failed=true;}
 finally{
  closed=true;heartbeatStop.abort();clearTimeout(expiry!);await renewal;stop.abort();parent.removeEventListener('abort',cancel);
  // Cleanup has a fresh bounded context and signal, even during process shutdown.
  const limits={deadline:Date.now()+10000,signal:AbortSignal.timeout(10000)};
  try{
   const current=await context(limits);
   // A renewal may have committed just as it was cancelled. Read the current Ref
   // under its unchanged token before performing versioned release.
   const latest=await database.transaction(current,limits,tx=>requirePackInspectionLease(tx,limits,pack,grants,lease));
   await releasePackInspectionLease(database,current,limits,pack,grants,latest);
  }catch(error){
   // Expired/taken-over ownership needs no release; never release another token.
   if(!(error instanceof WorkLeaseNotCurrentError)){failure=failed?new AggregateError([failure,error],'Inspection and lease cleanup failed'):error;failed=true;}
  }
 }
 if(failed)throw failure;return result as T;
}
