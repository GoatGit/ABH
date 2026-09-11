import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runProcessService} from '../src/durable/process-service.ts';
import type {RuntimeServiceOptions} from '../src/durable/runtime-service.ts';
const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1 as const});
const config=():RuntimeServiceOptions=>({signal:new AbortController().signal,loops:[async signal=>{
  if(!signal.aborted)await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
}],queue:{drain:async()=>({status:'Completed',data:{drained:true,remainingRefs:[],completedAt:new Date().toISOString()}}),close:async()=>{}},database:{close:async()=>{}},
  drainRequest:async()=>({context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:ref('abh.organization'),scopeRefs:[ref('abh.organization')],action:'abh.runtime.drain'},deadline:new Date(Date.now()+1000).toISOString()},queueClasses:['control']}),recordDrain:async()=>{}});

test('process signals initiate exactly one shutdown and listeners are released',async()=>{
  for(const signal of ['SIGTERM','SIGINT']){
    const events=new EventEmitter(),input=config();let stops=0,closed=0;
    input.stopIngress=async()=>{stops++;};input.database.close=async()=>{closed++;};
    const running=runProcessService(input,events);assert.equal(events.listenerCount('SIGTERM'),1);
    events.emit(signal);events.emit(signal);await running;
    assert.equal(stops,1);assert.equal(closed,1);assert.equal(events.listenerCount('SIGTERM'),0);assert.equal(events.listenerCount('SIGINT'),0);
  }
});

test('loop failure stops ingress and releases process listeners even when ingress fails',async()=>{
  const events=new EventEmitter(),input=config();let stops=0,closed=0;
  input.loops=[async()=>{throw new Error('worker failure');}];input.stopIngress=async()=>{stops++;throw new Error('ingress failure');};input.database.close=async()=>{closed++;};
  await assert.rejects(runProcessService(input,events),error=>error instanceof AggregateError&&error.errors.length===2);
  assert.equal(stops,1);assert.equal(closed,1);assert.equal(events.listenerCount('SIGTERM'),0);
});
