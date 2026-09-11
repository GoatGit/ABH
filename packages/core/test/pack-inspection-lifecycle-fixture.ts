import {CoreError} from '../src/internal/errors.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {EntityRef,InstalledPackRecord,WorkLeaseRecord} from '@abh/contracts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {createDatabaseFixture} from './database-fixture.ts';
import {claimPackInspectionLease,releasePackInspectionLease} from '../src/extensions/inspection-leases.ts';
import {withPackInspectionLease,type PackInspectionLeaseScope} from '../src/extensions/inspection-lease-scope.ts';
import {runPackInspectionWorker,type PackInspectionWorkerOptions} from '../src/extensions/inspection-worker.ts';
import {createTenantRuntimeLoops,joinRuntimeLoops,type TenantRuntimeOptions} from '../src/durable/runtime-host.ts';
import {WorkLeaseBusyError} from '../src/durable/work-leases.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionLifecycle(f:Awaited<ReturnType<typeof createDatabaseFixture>>,context:VerifiedContext,installation:InstalledPackRecord,grant:EntityRef,
 prepare:PackInspectionWorkerOptions['prepare'],observationRef:EntityRef){
 const grants=[grant],workerId=randomUUID(),base={context:async()=>context,grants,installation,workerId,signal:new AbortController().signal};
 const stored=async()=>{const [row]=await f.admin`SELECT record,lease_until>clock_timestamp() AS active FROM runtime.work_leases WHERE resource_organization_id=${context.tenant.resourceOrganizationId} AND target_type='abh.installed-pack' AND target_id=${installation.packRef.id}`;assert.ok(row);return {lease:row.record as WorkLeaseRecord,active:Boolean(row.active)};};
 let retired!:PackInspectionLeaseScope;
 await withPackInspectionLease(f.database,{...base,heartbeatMs:30},async scope=>{
  retired=scope;const initial=scope.binding().token.leaseRef.version,until=Date.now()+2000;
  while((await stored()).lease.leaseRef.version<=initial&&Date.now()<until)await delay(20);
  assert.ok((await stored()).lease.leaseRef.version>initial);
  await assert.rejects(claimPackInspectionLease(f.database,context,options(),installation,grants,randomUUID()),WorkLeaseBusyError);
 });
 assert.equal((await stored()).active,false);assert.throws(()=>retired.options(),{code:'DEPENDENCY_TIMEOUT'});
 await assert.rejects(withPackInspectionLease(f.database,base,async()=>{throw 0;}),error=>error===0);
 assert.equal((await stored()).active,false);
 let contexts=0;
 await assert.rejects(withPackInspectionLease(f.database,{...base,context:async()=>{if(++contexts>1)throw new CoreError('PRECONDITION_FAILED');return context;}},async()=>{}),{code:'PRECONDITION_FAILED'});
 assert.equal((await stored()).active,true);
 await releasePackInspectionLease(f.database,context,options(),installation,grants,(await stored()).lease);
 let replacement:WorkLeaseRecord|undefined,stopped=false;
 try{
  await assert.rejects(withPackInspectionLease(f.database,{...base,workerId:randomUUID(),heartbeatMs:1000},async scope=>{
   const binding=scope.binding(),signal=scope.options().signal;
   await releasePackInspectionLease(f.database,context,options(),installation,grants,binding.token);
   replacement=await claimPackInspectionLease(f.database,context,options(),installation,grants,randomUUID());
   if(!signal.aborted)await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));stopped=signal.aborted;
  }),{code:'PRECONDITION_FAILED'});
  assert.equal(stopped,true);assert.equal((await stored()).active,true);assert.equal((await stored()).lease.workerId,replacement!.workerId);
 }finally{if(replacement)await releasePackInspectionLease(f.database,context,options(),installation,grants,replacement);}
 const discovery={fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>true};
 const occupied=await claimPackInspectionLease(f.database,context,options(),installation,grants,randomUUID());
 try{
  const stop=new AbortController();let blocked=false;
  await runPackInspectionWorker(f.database,{...base,signal:stop.signal,discovery,lease:{workerId:randomUUID()},prepare:async()=>assert.fail('busy Pack must not prepare'),onBlocked:async(_candidate,reason)=>{assert.equal(reason.status,'LeaseBusy');blocked=true;},onPage:async page=>{assert.equal(page.leaseBusy,1);stop.abort();}});
  assert.equal(blocked,true);assert.equal((await stored()).lease.workerId,occupied.workerId);
 }finally{await releasePackInspectionLease(f.database,context,options(),installation,grants,occupied);}
 const cancel=new AbortController(),cancelledId=randomUUID();let scoped:AbortSignal|undefined;
 await runPackInspectionWorker(f.database,{...base,signal:cancel.signal,discovery,lease:{workerId:cancelledId},prepare:async(_candidate,limits)=>{scoped=limits.signal;cancel.abort();return new Promise<never>(()=>{});}});
 assert.equal(scoped?.aborted,true);assert.equal((await stored()).lease.workerId,cancelledId);assert.equal((await stored()).active,false);
 const stop=new AbortController(),hostedId=randomUUID();let observed=false;
 const installed:NonNullable<TenantRuntimeOptions['packInspection']>={context:base.context,grants,discovery,prepare,lease:{workerId:hostedId},onObservation:async(_candidate,value)=>{assert.equal(value.recovered,true);assert.deepEqual(value.observationRef,observationRef);observed=true;},onPage:async page=>{assert.equal(page.observed,1);stop.abort();}};
 const loops=createTenantRuntimeLoops(f.database,{packInspection:installed,recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>);
 installed.lease!.workerId=randomUUID();
 await joinRuntimeLoops(stop.signal,[loops[0]!]);assert.equal(observed,true);
 assert.equal((await stored()).lease.workerId,hostedId);assert.equal((await stored()).active,false);
}
