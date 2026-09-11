import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {DrainQueueRequest,DrainReport} from '@abh/contracts';
import {runRuntimeService} from '../src/durable/runtime-service.ts';

const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1 as const});
const request=():DrainQueueRequest=>({context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),
  target:{objectRef:ref('abh.organization'),scopeRefs:[ref('abh.organization')],action:'abh.runtime.drain'},deadline:new Date(Date.now()+1000).toISOString()},queueClasses:['control','reconcile','interactive','background']});

test('shutdown retains unfinished delivery evidence and closes dependencies only after joined work and drain recording',async()=>{
  const stop=new AbortController(),order:string[]=[];let ready!:()=>void,finish!:()=>void;
  const started=new Promise<void>(resolve=>{ready=resolve;}),completed=new Promise<void>(resolve=>{finish=resolve;});
  const report:DrainReport={drained:false,remainingRefs:[ref('abh.job')],completedAt:new Date().toISOString()};
  const running=runRuntimeService({signal:stop.signal,loops:[async signal=>{
    ready();await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));await completed;order.push('joined');
  }],drainRequest:async()=>{order.push('admit');return request();},queue:{
    drain:async(_request,options)=>{assert.equal(options.signal.aborted,false);order.push('drain');return {status:'Completed',data:report};},
    close:async()=>{order.push('queue-close');},
  },database:{close:async()=>{order.push('database-close');}},recordDrain:async value=>{assert.deepEqual(value,report);order.push('record');},releaseDrainRequest:()=>{order.push('release');}});
  await started;stop.abort();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(order,[]);
  finish();assert.deepEqual(await running,report);assert.deepEqual(order,['joined','admit','drain','record','release','queue-close','database-close']);
});

test('shutdown preserves loop, report persistence and close failures while still closing both dependencies',async()=>{
  const errors=[new Error('loop'),new Error('record'),new Error('queue'),new Error('database')],order:string[]=[];
  const report:DrainReport={drained:true,remainingRefs:[],completedAt:new Date().toISOString()};
  await assert.rejects(runRuntimeService({signal:new AbortController().signal,loops:[async()=>{throw errors[0];}],drainRequest:async()=>request(),
    queue:{drain:async()=>({status:'Completed',data:report}),close:async()=>{order.push('queue');throw errors[2];}},
    database:{close:async()=>{order.push('database');throw errors[3];}},recordDrain:async()=>{throw errors[1];}}),error=>{
      assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors,errors);assert.deepEqual(error.cause,report);return true;
    });assert.deepEqual(order,['queue','database']);
});


test('drain timeout cannot hang shutdown when the Port ignores cancellation',async()=>{
  const closed:string[]=[];
  // Keep the test event loop alive while AbortSignal.timeout is unreferenced.
  const keepAlive=setInterval(()=>{},1000);
  try{
    await assert.rejects(runRuntimeService({signal:AbortSignal.abort(),loops:[],drainRequest:async()=>{
      const value=request();value.context.deadline=new Date(Date.now()+25).toISOString();return value;
    },queue:{drain:async()=>new Promise(()=>{}),close:async()=>{closed.push('queue');}},database:{close:async()=>{closed.push('database');}},
      recordDrain:async()=>{throw new Error('no report may be invented');}}),error=>error instanceof AggregateError&&error.errors[0].code==='DEPENDENCY_TIMEOUT');
    assert.deepEqual(closed,['queue','database']);
  }finally{clearInterval(keepAlive);}
});

test('stop ingress starts before Worker cancellation and finishes before database shutdown',async()=>{
  const stop=new AbortController(),order:string[]=[];let release!:()=>void;
  const ingress=new Promise<void>(resolve=>{release=resolve;});
  const running=runRuntimeService({signal:stop.signal,stopIngress:()=>{order.push('stop-accepting');return ingress.then(()=>{order.push('requests-finished');});},
    loops:[async signal=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{order.push('worker-stopped');resolve();},{once:true}));}],
    drainRequest:async()=>{order.push('drain');return request();},queue:{drain:async()=>({status:'Completed',data:{drained:true,remainingRefs:[],completedAt:new Date().toISOString()}}),close:async()=>{order.push('queue');}},
    database:{close:async()=>{order.push('database');}},recordDrain:async()=>{}});
  stop.abort();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(order,['stop-accepting','worker-stopped']);
  release();await running;assert.deepEqual(order,['stop-accepting','worker-stopped','requests-finished','drain','queue','database']);
});


test('drain Context is released after failure and before closing dependencies',async()=>{
  const order:string[]=[];
  await assert.rejects(runRuntimeService({signal:AbortSignal.abort(),loops:[],drainRequest:async()=>request(),
    releaseDrainRequest:()=>{order.push('release');throw new Error('release failed');},
    queue:{drain:async()=>{throw new Error('drain failed');},close:async()=>{order.push('queue');}},
    database:{close:async()=>{order.push('database');}},recordDrain:async()=>{throw new Error('no report');}}),error=>{
      assert.ok(error instanceof AggregateError);assert.deepEqual(error.errors.map(item=>item.message),['drain failed','release failed']);return true;
    });assert.deepEqual(order,['release','queue','database']);
});


test('actual HTTP ingress settles timed-out Owner work before runtime drain or dependency close',async()=>{
  const {createHttpApp,stopHttpIngress}=await import('@abh/adapter-fastify');
  const {readFile}=await import('node:fs/promises');
  const identity=JSON.parse(await readFile(new URL('../../contracts/fixtures/valid/request-context.json',import.meta.url),'utf8')).value;
  const body=JSON.parse(await readFile(new URL('../../contracts/fixtures/valid/cancel-http-request.json',import.meta.url),'utf8')).value;
  let release!:()=>void;const order:string[]=[];
  const app=createHttpApp({deadlineMs:20,authenticate:async()=>({...identity,contextExpiresAt:new Date(Date.now()+60000).toISOString()}),
    commands:{'abh.actions.cancel':async()=>{await new Promise<void>(resolve=>{release=resolve;});order.push('owner-settled');throw new Error('late failure');}}});
  const response=await app.inject({method:'POST',url:'/v1/commands/abh.actions.cancel',headers:{'idempotency-key':'shutdown','if-match':'"3"'},payload:body});
  assert.equal(response.json().error.code,'CONTEXT_EXPIRED');
  const running=runRuntimeService({signal:AbortSignal.abort(),loops:[],stopIngress:()=>stopHttpIngress(app),
    drainRequest:async()=>{order.push('admit');return request();},queue:{
      drain:async()=>({status:'Completed',data:{drained:true,remainingRefs:[],completedAt:new Date().toISOString()}}),close:async()=>{order.push('queue');}},
    recordDrain:async()=>{order.push('record');},database:{close:async()=>{order.push('database');}}});
  try{await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(order,[]);}
  finally{release();await running;}
  assert.deepEqual(order,['owner-settled','admit','record','queue','database']);
});


test('runtime closes the original bound dependencies despite caller configuration mutation',async()=>{
  const stop=new AbortController(),order:string[]=[];
  const report:DrainReport={drained:true,remainingRefs:[],completedAt:new Date().toISOString()};
  class Queue {
    #open=true;
    async drain(){assert.equal(this.#open,true);order.push('drain');return {status:'Completed' as const,data:report};}
    async close(){this.#open=false;order.push('queue');}
  }
  class Storage {#open=true;async close(){assert.equal(this.#open,true);this.#open=false;order.push('database');}}
  const queue=new Queue(),database=new Storage();
  const input={signal:stop.signal,loops:[async(signal:AbortSignal)=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));}],
    queue,database,drainRequest:async()=>{order.push('admit');return request();},recordDrain:async()=>{order.push('record');},stopIngress:async()=>{order.push('ingress');}};
  const running=runRuntimeService(input);
  const unexpected=async()=>{throw new Error('mutated installation must not be used');};
  queue.close=unexpected;database.close=unexpected;input.drainRequest=unexpected;input.recordDrain=unexpected;input.stopIngress=unexpected;
  input.signal=new AbortController().signal;input.loops.push(unexpected);
  stop.abort();assert.deepEqual(await running,report);
  assert.deepEqual(order,['ingress','admit','drain','record','queue','database']);
});


test('installed drain identity has an independent deadline and timeout still closes dependencies',async()=>{
  const {QueueAdmissionDirectory}=await import('../src/durable/queue-admission.ts');
  const {createDatabaseFixture}=await import('./database-fixture.ts');
  const f=await createDatabaseFixture();
  const directory=new QueueAdmissionDirectory(f.database,['hello.consumer']),order:string[]=[];
  let identitySignal:AbortSignal|undefined;
  const drain=directory.drainContexts({consumerId:'hello.consumer',grantRefs:[ref('abh.grant')],queueClasses:['control'],identityTimeoutMs:20,
    context:async options=>{identitySignal=options.signal;assert.equal(options.signal.aborted,false);assert.equal(options.readOnly,true);return new Promise(()=>{});}});
  try{
    await assert.rejects(runRuntimeService({signal:AbortSignal.abort(),loops:[],database:f.database,...drain,
      queue:{drain:async()=>{throw new Error('must not drain without identity');},close:async()=>{order.push('queue');}},
      recordDrain:async()=>{throw new Error('must not invent report');}}),error=>error instanceof AggregateError&&error.errors.some(value=>value.code==='DEPENDENCY_TIMEOUT'));
    assert.equal(identitySignal?.aborted,true);assert.deepEqual(order,['queue']);
    await assert.rejects(f.database.verify());
  }finally{await f.close();}
});
