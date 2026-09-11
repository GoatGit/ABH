import {failLostPackInspection,type PackInspectionLeaseLossAdmission} from './fail-lost-pack-inspection.ts';
import {PackInspectionLeaseStillCurrentError} from './inspection-lease-loss.ts';
import {PackInspectionDeliveryOwner} from './inspection-deliveries.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,PackInspectionJobRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requestVerifiedContext} from '../identity/context-source.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {WorkLeaseBusyError} from '../durable/work-leases.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
import {resolvePackInspectionDelivery} from './resolve-pack-inspection-delivery.ts';
import {runPackInspectionJob,snapshotPackInspectionGrantSets,type PackInspectionJobExecution} from './run-pack-inspection-job.ts';
import {expirePackInspection,type PackInspectionExpiryAdmission} from './expire-pack-inspection.ts';

export interface PackInspectionJobWorkerOptions extends Omit<PackInspectionJobExecution,'jobRef'> {
 expiry:PackInspectionExpiryAdmission;
 /** Explicitly install early lease-loss cleanup with its independent Grant. */
 leaseLoss?:PackInspectionLeaseLossAdmission;
 discovery:{
  fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
  /** Deployment-wide discovery policy, required even on empty pages. */
  admit(tx:TenantTransaction):Promise<void>;
  /** Hidden records consume scan slots and cannot be executed by this worker. */
  canRead(tx:TenantTransaction,job:PackInspectionJobRecord):Promise<boolean>;
 };
 /** Defaults to true: require committed Inbox acceptance for Pending/Waiting.
  * Set false only for explicitly installed management recovery; expiry remains independent. */
 requireDelivery?:boolean;
 pageSize?:number;intervalMs?:number;
 onPage?(result:{scanned:number;executed:number;expired:number;running:number;changed:number;busy:number;leaseLost:number},options:TransactionOptions):Promise<void>;
}
/** Capture before a host starts any loops; preserve method receivers. */
export function snapshotPackInspectionJobWorker(input:Omit<PackInspectionJobWorkerOptions,'signal'>&{signal?:AbortSignal}):PackInspectionJobWorkerOptions {
 const d=input.discovery,s=input.start,w=input.waiting,c=input.completion,e=input.expiry,l=input.leaseLoss,f=input.failure;
 return {...input,signal:input.signal??AbortSignal.abort(),context:input.context.bind(input),grants:structuredClone(input.grants),grantSets:snapshotPackInspectionGrantSets(input.grantSets),diagnostic:structuredClone(input.diagnostic),
  read:input.read.bind(input),prepare:input.prepare.bind(input),
  discovery:{fenceRefs:d.fenceRefs.bind(d),admit:d.admit.bind(d),canRead:d.canRead.bind(d)},
  start:{fenceRefs:s.fenceRefs.bind(s),current:s.current.bind(s)},
  waiting:{fenceRefs:w.fenceRefs.bind(w),current:w.current.bind(w),references:w.references.bind(w),read:w.read.bind(w)},
  completion:{fenceRefs:c.fenceRefs.bind(c),current:c.current.bind(c),read:c.read.bind(c)},
  expiry:{fenceRefs:e.fenceRefs.bind(e),current:e.current.bind(e),references:e.references.bind(e),read:e.read.bind(e)},
  ...(f?{failure:{fenceRefs:f.fenceRefs.bind(f),current:f.current.bind(f),references:f.references.bind(f),read:f.read.bind(f)}}:{}),
  ...(l?{leaseLoss:{fenceRefs:l.fenceRefs.bind(l),current:l.current.bind(l),references:l.references.bind(l),read:l.read.bind(l)}}:{}),
  ...(input.onPage?{onPage:input.onPage.bind(input)}:{}),
 };
}
/** Management recovery of persisted Jobs. Cursor and counters are disposable;
 * only Owner commits persist progress. One attempt per discovered exact version,
 * with a delay between pages/sweeps; Running is never reopened. Queue transport
 * and its acknowledgement remain separate from this recovery loop. */
export async function runPackInspectionJobWorker(database:Database,supplied:PackInspectionJobWorkerOptions):Promise<void>{
 const input=snapshotPackInspectionJobWorker(supplied),signal=input.signal,size=input.pageSize??20,interval=input.intervalMs??1000,timeout=input.timeoutMs??30000;
 if(!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000||!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new CoreError('INVALID_ARGUMENT');
 contract('UUID',input.workerId);
 if(input.requireDelivery!==undefined&&typeof input.requireDelivery!=='boolean')throw new CoreError('INVALID_ARGUMENT');
 const requireDelivery=input.requireDelivery??true;
 const authority=(action:'discovery'|'expiry'|'leaseLoss')=>input.grantSets?.[action]??input.grants;
 const heartbeat=input.heartbeatMs??10000;if(!Number.isInteger(heartbeat)||heartbeat<10||heartbeat>10000)throw new CoreError('INVALID_ARGUMENT');
 const limits=():TransactionOptions=>({deadline:Date.now()+timeout,signal});let identity:string|undefined,cursor:string|undefined;
 const context=async(options=limits())=>{
  const value=await requestVerifiedContext(input.context,options),c=value.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const key=canonicalJson([c.resourceOrganizationId,c.actingOrganizationId,c.actor.id]);
  if(identity!==undefined&&identity!==key)throw new CoreError('FORBIDDEN');identity=key;return value;
 };
 const resolve=async(ref:EntityRef)=>database.transaction(await context(),limits(),tx=>resolvePackInspectionDelivery(tx,ref,async job=>{
  const scope={type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1};
  // Discovery is not execution admission. Cleanup-only services must be able to
  // resolve progress without receiving permission to start another attempt.
  const authorize=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},authority('discovery'));
  await authorize();await input.read(tx,job);await authorize();
 }));
 const expire=async(ref:EntityRef)=>expirePackInspection(database,await context(),limits(),{
  type:'abh.pack-inspection-jobs.expire',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:ref.version,payload:input.diagnostic,
 },authority('expiry'),input.expiry);
 while(!signal.aborted){try{
  const page=await database.transaction(await context(),limits(),async tx=>{
   const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...authority('discovery'),...await input.discovery.fenceRefs(tx)]);
   const authorize=async()=>{
    const grant=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},authority('discovery'));
    await grant();await input.discovery.admit(tx);await grant();tx.assertActive();
   };
   const owner=new PackInspectionJobOwner(),page=await owner.scanPending(tx,size,cursor,authorize),refs:EntityRef[]=[];
   for(const ref of page.refs){
    const job=await owner.readCurrent(tx,ref,async()=>{});
    if(await input.discovery.canRead(tx,structuredClone(job))){
     if(!requireDelivery||job.status==='Running'||await new PackInspectionDeliveryOwner().findAccepted(tx,ref,async()=>{})||
      (await resolvePackInspectionDelivery(tx,ref,async()=>{})).disposition==='Expire')refs.push(ref);
    }
    tx.assertActive();
   }
   await authorize();return {...page,scanned:page.refs.length,refs};
  });
  const stats={scanned:page.scanned,executed:0,expired:0,running:0,changed:0,busy:0,leaseLost:0};
  for(const ref of page.refs){
   if(signal.aborted)return;
   try{
    const current=await resolve(ref);
    if(current.disposition==='Expire'){await expire(current.job.jobRef);stats.expired++;}
    else if(current.disposition==='Execute'){await runPackInspectionJob(database,{...input,context,jobRef:current.job.jobRef});stats.executed++;}
    else if(current.disposition==='Running'){
     if(!input.leaseLoss)stats.running++;
     else try{
      await failLostPackInspection(database,await context(),limits(),{type:'abh.pack-inspection-jobs.fail-lost-lease',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.pack-inspection-job',id:ref.id},expectedVersion:current.job.jobRef.version,payload:input.diagnostic},authority('leaseLoss'),input.leaseLoss);
      stats.leaseLost++;
     }catch(error){if(error instanceof PackInspectionLeaseStillCurrentError)stats.running++;else throw error;}
    }
    else stats.changed++;
   }catch(error){
    if(signal.aborted)return;
    if(error instanceof WorkLeaseBusyError){stats.busy++;continue;}
    if(error instanceof CoreError&&(error.code==='VERSION_CONFLICT'||error.code==='DEPENDENCY_TIMEOUT')){
     const current=await resolve(ref);
     if(current.disposition==='Expire'){await expire(current.job.jobRef);stats.expired++;continue;}
     if(error.code==='VERSION_CONFLICT'&&current.job.jobRef.version>ref.version){stats.changed++;continue;}
    }
    throw error;
   }
  }
  cursor=page.next;
  if(input.onPage&&!signal.aborted)await boundedCallback(options=>input.onPage!({...stats},options),limits());
  if(!signal.aborted)await delay(interval,undefined,{signal});
 }catch(error){if(signal.aborted)return;throw error;}}
}
