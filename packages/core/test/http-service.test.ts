import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {createHttpApp} from '@abh/adapter-fastify';
import {runHttpService,StartupCheckError,type HttpServiceOptions} from '../src/server/service.ts';

const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1 as const});
function fixture(){
  const order:string[]=[],events=new EventEmitter();
  const app=createHttpApp({authenticate:async()=>{throw new Error('no routes installed');}});
  const input:HttpServiceOptions={app,listen:{host:'127.0.0.1',port:0},signal:new AbortController().signal,loops:[],
    drainRequest:async()=>{order.push('admit');const org=ref('abh.organization');return {context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:org,scopeRefs:[org],action:'abh.runtime.drain'},deadline:new Date(Date.now()+1000).toISOString()},queueClasses:['control']};},
    queue:{drain:async()=>{order.push('drain');return {status:'Completed',data:{drained:true,remainingRefs:[],completedAt:new Date().toISOString()}};},close:async()=>{order.push('queue');}},
    database:{close:async()=>{order.push('database');}},recordDrain:async()=>{order.push('record');}};
  return {input,order,events};
}

test('HTTP service binds a real socket, runs installed loops, and SIGTERM joins before closing dependencies',async()=>{
  const {input,events,order}=fixture();let address='';
  input.loops=[async signal=>{order.push('loop');await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{order.push('joined');resolve();},{once:true}));}];
  input.onListening=async value=>{
    address=value;assert.equal(events.listenerCount('SIGTERM'),1);
    assert.equal((await fetch(value+'/missing')).status,404);
    events.emit('SIGTERM');
  };
  assert.equal((await runHttpService(input,events)).drained,true);
  assert.deepEqual(order,['loop','joined','admit','drain','record','queue','database']);
  assert.equal(events.listenerCount('SIGTERM'),0);
  assert.equal(input.app.server.listening,false);
  await assert.rejects(fetch(address+'/missing'));
});

test('listen failure never starts workers and still releases owned dependencies',async()=>{
  const blocker=fixture();await blocker.input.app.listen(blocker.input.listen);
  const {input,events,order}=fixture();
  input.listen.port=(blocker.input.app.server.address() as {port:number}).port;
  input.loops=[async()=>{throw new Error('must not start');}];
  try{
    await assert.rejects(runHttpService(input,events),error=>{const contains=(value:unknown):boolean=>value instanceof AggregateError?value.errors.some(contains):(value as {code?:string})?.code==='EADDRINUSE';return contains(error);});
    assert.deepEqual(order,['admit','drain','record','queue','database']);
    assert.equal(events.listenerCount('SIGTERM'),0);
  }finally{await blocker.input.app.close();}
});

test('already cancelled service does not listen or announce an address',async()=>{
  const {input,events,order}=fixture();input.signal=AbortSignal.abort();
  input.onListening=async()=>{throw new Error('must not announce');};
  await runHttpService(input,events);
  assert.equal(input.app.server.listening,false);
  assert.deepEqual(order,['admit','drain','record','queue','database']);
});

test('listening observer failure cancels workers and closes the bound socket',async()=>{
  const {input,events,order}=fixture();const failed=new Error('observer failed');
  input.onListening=async()=>{throw failed;};
  input.loops=[async signal=>{await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{order.push('joined');resolve();},{once:true}));}];
  await assert.rejects(runHttpService(input,events),error=>error instanceof AggregateError&&error.errors.includes(failed));
  assert.equal(order[0],'joined');assert.equal(order.at(-1),'database');
  assert.equal(input.app.server.listening,false);
});


test('SIGTERM during Fastify startup closes the eventual socket without starting workers',async()=>{
  const {input,events,order}=fixture();let release!:()=>void,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  input.app.register(async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});});
  input.loops=[async()=>{throw new Error('must not start');}];
  input.onListening=async()=>{throw new Error('must not announce');};
  const running=runHttpService(input,events);
  // A close/listen race may reject Fastify listen; the service must still join and release dependencies.
  const outcome=running.then(()=>undefined,error=>error);
  await started;events.emit('SIGTERM');release();
  const error=await outcome;assert.equal(error,undefined);
  assert.equal(input.app.server.listening,false);
  assert.equal(events.listenerCount('SIGTERM'),0);
  assert.deepEqual(order,['admit','drain','record','queue','database']);
});

test('tenant worker failure closes HTTP before a slow peer settles, then closes the shared database',async()=>{
  const {createDatabaseFixture,context:databaseContext}=await import('./database-fixture.ts');
  const fixtureDatabase=await createDatabaseFixture();
  const {input,events,order}=fixture();
  let release!:()=>void,fail!:()=>void,announced!:()=>void;
  const cleanup=new Promise<void>(resolve=>{release=resolve;}),failed=new Promise<void>(resolve=>{fail=resolve;});
  const listening=new Promise<void>(resolve=>{announced=resolve;});
  const failure=new Error('tenant identity unavailable');let address='';
  const context=async()=>{await failed;throw failure;};
  input.database=fixtureDatabase.database;
  input.startup={checks:[{name:'database.read-only',verify:async options=>{
    assert.equal(input.app.server.listening,false);
    await fixtureDatabase.database.transaction(databaseContext(),options,async tx=>{
      const [row]=await tx.owner('ActionEngine')`SELECT current_setting('transaction_read_only') AS read_only`;
      assert.equal(row!.read_only,'on');
    });
  }}]};
  input.tenant={database:fixtureDatabase.database,options:{
    recovery:{workerId:randomUUID(),context,grantRefs:[]},
    consumption:{context,grantRefs:[]},
    publisher:{workerId:randomUUID(),context,router:{ruleRef:ref('hello.routing-rule'),eventTypes:['abh.action-authorization-request.accepted'],route:async()=>[]},
      checks:{fenceRefs:async()=>[],admit:async()=>{throw new Error('must not admit');}},
      port:{enqueue:async()=>{throw new Error('must not enqueue');}},enqueueContext:async()=>{throw new Error('must not issue context');}},
  }};
  input.onListening=async value=>{address=value;announced();};
  input.loops=[async signal=>{
    await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{order.push('cancelled');resolve();},{once:true}));
    await cleanup;order.push('joined');
  }];
  const outcome=runHttpService(input,events).then(()=>undefined,error=>error);
  try{
    await listening;assert.equal((await fetch(address+'/missing')).status,404);
    fail();
    // Transport close may require a few event-loop turns; its actual close event is authoritative.
    if(input.app.server.listening)await new Promise<void>(resolve=>input.app.server.once('close',()=>resolve()));
    assert.deepEqual(order,['cancelled']);
    await assert.rejects(fetch(address+'/missing'));
    release();const error=await outcome;assert.ok(error instanceof AggregateError);
    assert.deepEqual(order,['cancelled','joined','admit','drain','record','queue']);
    assert.equal(events.listenerCount('SIGTERM'),0);
  }finally{fail();release();await outcome;await fixtureDatabase.close();}
});


test('startup capability checks finish once before either socket binding or workers',async()=>{
  const {input,events,order}=fixture();
  input.startup={checks:[{name:'identity.current',verify:async options=>{
    assert.equal(options.readOnly,true);assert.equal(options.signal.aborted,false);
    assert.equal(events.listenerCount('SIGTERM'),1);assert.equal(input.app.server.listening,false);order.push('identity');
  }},{name:'policy.current',verify:async()=>{assert.equal(input.app.server.listening,false);order.push('policy');}}]};
  input.loops=[async signal=>{order.push('worker');await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));}];
  input.onListening=async()=>{events.emit('SIGTERM');};
  await runHttpService(input,events);
  assert.deepEqual(order,['identity','policy','worker','admit','drain','record','queue','database']);
});

test('failed capability check prevents listening and later checks, but still closes owned dependencies',async()=>{
  const {input,events,order}=fixture();const failure=new Error('required capability unavailable');
  input.startup={checks:[{name:'identity.current',verify:async()=>{throw failure;}},{name:'must.not.run',verify:async()=>{order.push('unexpected');}}]};
  input.loops=[async()=>{order.push('unexpected');}];
  const contains=(value:unknown):boolean=>value===failure||(value instanceof StartupCheckError&&contains(value.cause))||(value instanceof AggregateError&&value.errors.some(contains));
  await assert.rejects(runHttpService(input,events),error=>{assert.ok(contains(error));const find=(value:unknown):StartupCheckError|undefined=>value instanceof StartupCheckError?value:value instanceof AggregateError?value.errors.map(find).find(Boolean):undefined;assert.equal(find(error)?.checkName,'identity.current');return true;});
  assert.equal(input.app.server.listening,false);
  assert.deepEqual(order,['admit','drain','record','queue','database']);
});

test('startup timeout bounds an uncooperative read-only probe and rejects late success',async()=>{
  const {input,events,order}=fixture();let release!:()=>void;let signal!:AbortSignal;
  input.startup={timeoutMs:20,checks:[{name:'policy.current',verify:async options=>{signal=options.signal;await new Promise<void>(resolve=>{release=resolve;});}}]};
  const contains=(value:unknown):boolean=>value instanceof StartupCheckError?contains(value.cause):value instanceof AggregateError?value.errors.some(contains):(value as {code?:string})?.code==='DEPENDENCY_TIMEOUT';
  await assert.rejects(runHttpService(input,events),contains);
  assert.equal(signal.aborted,true);release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(input.app.server.listening,false);assert.equal(events.listenerCount('SIGTERM'),0);
  assert.deepEqual(order,['admit','drain','record','queue','database']);
});

test('SIGTERM aborts startup probes before their deadline and cannot announce readiness',async()=>{
  const {input,events,order}=fixture();let started!:()=>void;let signal!:AbortSignal;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  input.startup={checks:[{name:'identity.current',verify:async options=>{signal=options.signal;started();await new Promise<void>(resolve=>options.signal.addEventListener('abort',()=>resolve(),{once:true}));}}]};
  input.onListening=async()=>{order.push('unexpected');};
  const outcome=runHttpService(input,events).then(()=>undefined,error=>error);
  await entered;events.emit('SIGTERM');assert.ok(await outcome instanceof AggregateError);
  assert.equal(signal.aborted,true);assert.equal(input.app.server.listening,false);
  assert.deepEqual(order,['admit','drain','record','queue','database']);
});
