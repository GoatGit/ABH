import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {EntityRef,EventEnvelope} from '@abh/contracts';
import type {TenantTransaction,Database} from '../src/data/uow.ts';
import type {EventDelivery} from '../src/durable/delivery-worker.ts';
import {createTenantRuntimeLoops,joinRuntimeLoops} from '../src/durable/runtime-host.ts';
import {installPackInspectionRuntime,type PackInspectionRuntimeInstallation} from '../src/extensions/install-pack-inspection-runtime.ts';
import {context} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
const ref=(type:string):EntityRef=>({type,id:randomUUID(),version:1});
function configuration(){
 const seed=context(),c=deriveVerifiedContext({...seed.request,actor:{type:'Service',id:seed.tenant.actor.id},purposeOfUse:'abh.runtime.deliver'});
 const checks={fenceRefs:async()=>[],current:async()=>{},references:async()=>{},read:async()=>{}};
 const sourceError=new Error('management identity');let oldCalls=0;
 const input:PackInspectionRuntimeInstallation={
  runtime:{recovery:{} as never,consumption:{} as never,publisher:{workerId:randomUUID(),context:async()=>c,checks:{fenceRefs:async()=>[],admit:async()=>{}},port:{enqueue:async()=>{throw new Error('not called');}},enqueueContext:async()=>{throw new Error('not called');},router:{ruleRef:ref('hello.rule'),eventTypes:['abh.ledger.created'],route:async()=>{oldCalls++;return [];}}},
   deliveries:[{queueClass:'background',context:async()=>c,queue:{fetch:async()=>undefined,complete:async()=>{}},consumers:[{id:'hello.existing',eventTypes:['abh.ledger.created'],fenceRefs:async()=>[],admit:async()=>{},handle:async()=>ref('abh.inbox')}]}],
  },routing:{ruleRef:ref('hello.rule'),consumerRef:ref('hello.consumer')},combinedRuleRef:ref('hello.rule'),runtimeContext:async()=>c,acceptanceGrants:[ref('abh.grant')],acceptance:{fenceRefs:async()=>[],current:async()=>{}},
  worker:{workerId:randomUUID(),context:async()=>{throw sourceError;},grants:[],read:async()=>{},prepare:async()=>{throw new Error('must not prepare');},start:checks,waiting:checks,completion:checks,expiry:checks,diagnostic:{dataClass:'abh.data.internal',region:'local',retentionPolicyRef:ref('hello.retention')},discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async()=>false}},
 };
 return {input,c,sourceError,oldCalls:()=>oldCalls};
}
test('inspection installation composes one Publisher and background consumer and captures configuration',async()=>{
 const f=configuration(),installed=installPackInspectionRuntime(f.input);
 assert.equal(installed.deliveries!.length,1);assert.equal(installed.packInspectionJobs!.requireDelivery,true);
 assert.deepEqual(installed.publisher.router.eventTypes,['abh.ledger.created','abh.pack-inspection-job.requested','abh.pack-inspection-job.wait']);
 assert.deepEqual(installed.publisher.router.ruleRef,f.input.combinedRuleRef);
 assert.deepEqual(installed.deliveries![0]!.consumers.map(c=>c.id),['hello.existing','abh.pack-inspection-job.advance']);
 f.input.runtime.publisher.router.route=async()=>{throw new Error('replaced route');};
 f.input.runtime.publisher.router={...f.input.runtime.publisher.router,eventTypes:[]};f.input.worker.context=async()=>{throw new Error('replaced identity');};
 f.input.worker.grants=[];
 f.input.runtimeContext=async()=>{throw new Error('replaced runtime identity');};
 const tx={} as TenantTransaction;
 assert.deepEqual(await installed.publisher.router.route(tx,{type:'abh.ledger.created'} as EventEnvelope),[]);assert.equal(f.oldCalls(),1);
 await assert.rejects(installed.publisher.router.route(tx,{type:'abh.action.created'} as EventEnvelope),{code:'FORBIDDEN'});
 const delivery={consumerId:'abh.pack-inspection-job.advance',resourceOrganizationId:f.c.tenant.resourceOrganizationId} as EventDelivery,options={deadline:Date.now()+1000,signal:new AbortController().signal};
 assert.equal(await installed.deliveries![0]!.context(delivery,options),f.c);
 await assert.rejects(installed.deliveries![0]!.context({...delivery,resourceOrganizationId:randomUUID()},options),{code:'FORBIDDEN'});
 const loops=createTenantRuntimeLoops({} as Database,installed);
 assert.equal(loops.length,5);
 await assert.rejects(joinRuntimeLoops(new AbortController().signal,[loops[0]!]),error=>error===f.sourceError);
});
test('inspection installation rejects duplicate consumers, overlapping routing and ambiguous background ownership',()=>{
 for(const change of [
  (input:PackInspectionRuntimeInstallation)=>{input.runtime.deliveries=[];},
  (input:PackInspectionRuntimeInstallation)=>{input.runtime.deliveries=[...input.runtime.deliveries!,...input.runtime.deliveries!];},
  (input:PackInspectionRuntimeInstallation)=>{input.runtime.packInspectionJobs=input.worker;},
  (input:PackInspectionRuntimeInstallation)=>{input.runtime.publisher.router={...input.runtime.publisher.router,eventTypes:['abh.pack-inspection-job.wait']};},
  (input:PackInspectionRuntimeInstallation)=>{input.runtime.deliveries![0]!.consumers=[{...input.runtime.deliveries![0]!.consumers[0]!,id:'abh.pack-inspection-job.advance'}];},
 ]){const {input}=configuration();change(input);assert.throws(()=>installPackInspectionRuntime(input),{code:'INVALID_ARGUMENT'});}
});
test('inspection installation retains method receivers and supervisor cancels bounded context',async()=>{
 const {input,c}=configuration();let entered!:()=>void,signal:AbortSignal|undefined;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 class Identity {#value=c;async context(options:{signal:AbortSignal}){assert.ok(this.#value);signal=options.signal;entered();return new Promise<never>(()=>{});}}
 const identity=new Identity();input.worker.context=identity.context.bind(identity);
 const installed=installPackInspectionRuntime(input),loops=createTenantRuntimeLoops({} as Database,installed),stop=new AbortController();
 const running=joinRuntimeLoops(stop.signal,[loops[0]!]);await started;stop.abort();await running;assert.equal(signal!.aborted,true);
});
test('explicit failure admission is snapshotted with its original receiver',async()=>{
 const {input}=configuration();let calls=0;
 class FailureAdmission {
  #enabled=true;
  async fenceRefs(){assert.equal(this.#enabled,true);calls++;return [];}
  async current(){assert.equal(this.#enabled,true);calls++;}
  async references(){assert.equal(this.#enabled,true);calls++;}
  async read(){assert.equal(this.#enabled,true);calls++;}
 }
 const failure=new FailureAdmission();input.worker.failure=failure;
 const installed=installPackInspectionRuntime(input),captured=installed.packInspectionJobs!.failure!;
 failure.current=async()=>{throw new Error('replacement must not run');};delete input.worker.failure;
 await captured.fenceRefs({} as TenantTransaction);await captured.current({} as TenantTransaction,{} as never);
 await captured.references({} as TenantTransaction,[]);await captured.read({} as TenantTransaction,{} as never);assert.equal(calls,4);
});

test('inspection installation isolates per-action Grant arrays and preserves explicit denial',()=>{
 const {input}=configuration(),start=ref('abh.grant'),failure=ref('abh.grant');
 input.worker.grantSets={start:[start],failure:[failure],expiry:[]};
 const installed=installPackInspectionRuntime(input);
 start.version=2;input.worker.grantSets.failure=[];input.worker.grantSets.expiry=[failure];
 assert.equal(installed.packInspectionJobs!.grantSets!.start![0]!.version,1);
 assert.deepEqual(installed.packInspectionJobs!.grantSets!.failure,[failure]);
 assert.deepEqual(installed.packInspectionJobs!.grantSets!.expiry,[]);
});

test('inspection installation rejects malformed per-action Grant configuration',()=>{
 for(const grantSets of [null,{fail:[]},{failure:null},{failure:[ref('abh.artifact')]},{failure:Array(101).fill(ref('abh.grant'))}]){
  const {input}=configuration();input.worker.grantSets=grantSets as never;
  assert.throws(()=>installPackInspectionRuntime(input),{code:'INVALID_ARGUMENT'});
 }
 const {input}=configuration(),duplicate=ref('abh.grant');input.worker.grantSets={failure:[duplicate,duplicate]};
 assert.throws(()=>installPackInspectionRuntime(input),{code:'INVALID_ARGUMENT'});
});
