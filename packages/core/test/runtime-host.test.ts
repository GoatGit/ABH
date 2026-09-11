import type {Database} from '../src/data/uow.ts';
import {context} from './database-fixture.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTenantRuntimeLoops,type TenantRuntimeOptions,joinRuntimeLoops} from '../src/durable/runtime-host.ts';

test('runtime failure cancels peers and waits for their cleanup before returning',async()=>{
  let fail!:()=>void,cleanup!:()=>void;const failed=new Promise<void>(resolve=>{fail=resolve;}),cleaned=new Promise<void>(resolve=>{cleanup=resolve;});
  let peerStopped=false,returned=false;const error=new Error('publisher unavailable');
  const running=joinRuntimeLoops(new AbortController().signal,[
    async()=>{await failed;throw error;},
    async signal=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));peerStopped=true;await cleaned;},
  ]).finally(()=>{returned=true;});
  const rejected=assert.rejects(running,value=>value===error);
  fail();await new Promise(resolve=>setImmediate(resolve));assert.equal(peerStopped,true);assert.equal(returned,false);
  cleanup();await rejected;assert.equal(returned,true);
});

test('runtime shutdown joins every loop and preserves concurrent failures',async()=>{
  const stop=new AbortController();let stopped=0;
  const running=joinRuntimeLoops(stop.signal,[0,1,2].map(()=>async signal=>{
    await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));stopped++;
  }));stop.abort();await running;assert.equal(stopped,3);
  let calls=0;await joinRuntimeLoops(AbortSignal.abort(),[async()=>{calls++;}]);assert.equal(calls,0);
  const errors=[new Error('one'),new Error('two')];
  await assert.rejects(joinRuntimeLoops(new AbortController().signal,errors.map(error=>async()=>{throw error;})),error=>error instanceof AggregateError&&error.errors.length===2);
});

test('unexpected normal loop exit stops peer loops instead of leaving a partial runtime',async()=>{
  let stopped=false;
  await assert.rejects(joinRuntimeLoops(new AbortController().signal,[async()=>{},async signal=>{
    if(!signal.aborted)await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));stopped=true;
  }]),/RUNTIME_LOOP_EXITED/);assert.equal(stopped,true);
});


test('optional Pack inspection loop uses bounded context and supervisor cancellation',async()=>{
 const database={} as Database;
 // Other loops are only counted here; no fake database query or owner is executed.
 const baseline={recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>;
 const count=createTenantRuntimeLoops(database,baseline).length;let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});let scoped:AbortSignal|undefined;
 const loops=createTenantRuntimeLoops(database,{...baseline,packInspection:{grants:[],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>false},prepare:async()=>{assert.fail('no preparation without identity');},context:async options=>{scoped=options.signal;entered();return new Promise<never>(()=>{});}}});
 assert.equal(loops.length,count+1);
 const stop=new AbortController(),running=joinRuntimeLoops(stop.signal,[loops[0]!]);await started;stop.abort();await running;assert.equal(scoped!.aborted,true);
 let touched=false;const rejected=createTenantRuntimeLoops(database,{...baseline,packInspection:{grants:[],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>false},prepare:async()=>{touched=true;return {status:'Missing'};},context:async()=>context()}});
 await assert.rejects(joinRuntimeLoops(new AbortController().signal,[rejected[0]!]),{code:'FORBIDDEN'});assert.equal(touched,false);
});


test('Pack installation is captured before loop start and methods keep their receiver',async()=>{
 const database={} as Database,baseline={recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>;
 const originalError=new Error('original identity source'),replacementError=new Error('replacement source');let calls=0;
 class Installation {
  #identity=originalError;
  grants:import('@abh/contracts').EntityRef[]=[];
  pageSize=1;
  discovery={fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>false};
  async context():Promise<never>{calls++;throw this.#identity;}
  async prepare():Promise<{status:'Missing'}>{return {status:'Missing'};}
 }
 const installation=new Installation(),input={...baseline,packInspection:installation};
 const loops=createTenantRuntimeLoops(database,input);
 installation.context=async()=>{throw replacementError;};installation.pageSize=0;
 installation.grants.push({type:'invalid',id:'invalid',version:1});
 input.packInspection=new Installation();
 await assert.rejects(joinRuntimeLoops(new AbortController().signal,[loops[0]!]),error=>error===originalError);assert.equal(calls,1);
});

test('ResponsibilityInbox projection loop is optional, snapshotted, and supervisor cancellable',async()=>{
 const database={} as Database;
 const baseline={recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>;
 assert.equal(createTenantRuntimeLoops(database,baseline).length,3);
 const replacement=new Error('replacement source');
 let entered=false,replaced=false;
 const installation={
  context:async(options:import('../src/data/uow.ts').TransactionOptions):Promise<never>=>{entered=true;
    return new Promise<never>(()=>{options.signal.addEventListener('abort',()=>{}, {once:true});});},
  grantRefs:[] as import('@abh/contracts').EntityRef[],
  pageSize:32,intervalMs:500,
  onPage:async()=>{throw new Error('projection callback without work');},
 };
 const input={...baseline,responsibilityInboxProjection:installation};
 const loops=createTenantRuntimeLoops(database,input);
 assert.equal(loops.length,createTenantRuntimeLoops(database,baseline).length+1);
 installation.context=async()=>{replaced=true;throw replacement;};
 installation.grantRefs.push({type:'invalid',id:'invalid',version:1});
 installation.pageSize=0;installation.intervalMs=0;
 input.responsibilityInboxProjection={...installation,context:installation.context};
 const stop=new AbortController(),running=joinRuntimeLoops(stop.signal,[loops.at(-1)!]);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);
 stop.abort();await running;
 assert.equal(entered,true);assert.equal(replaced,false);
});

test('persisted inspection Job loop snapshots installation and cancels a pending identity source',async()=>{
 const database={} as Database,baseline={recovery:{},publisher:{},consumption:{}} as Omit<TenantRuntimeOptions,'signal'>;
 const checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 let entered!:()=>void,scoped:AbortSignal|undefined;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 class Installation {
  #called=false;
  workerId='00000000-0000-4000-8000-000000000001';grants=[];pageSize=1;
  start=checks;waiting=checks;completion=checks;expiry=checks;
  diagnostic={dataClass:'abh.data.internal' as const,region:'local',retentionPolicyRef:{type:'abh.installed-pack',id:this.workerId,version:1}};
  discovery={fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>false};
  async read(){}
  async prepare():Promise<{status:'Missing'}>{assert.fail('cannot prepare without context');}
  async context(options:import('../src/data/uow.ts').TransactionOptions):Promise<never>{this.#called=true;scoped=options.signal;entered();return new Promise<never>(()=>{});}
 }
 const installation=new Installation(),loops=createTenantRuntimeLoops(database,{...baseline,packInspectionJobs:installation});
 assert.equal(loops.length,createTenantRuntimeLoops(database,baseline).length+1);
 installation.context=async()=>{throw new Error('replacement must not run');};installation.pageSize=0;
 const stop=new AbortController(),running=joinRuntimeLoops(stop.signal,[loops[0]!]);await started;stop.abort();await running;assert.equal(scoped!.aborted,true);
});
