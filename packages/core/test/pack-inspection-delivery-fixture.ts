import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {PgBossDeliveryAdapter} from '@abh/adapter-pg-boss';
import type {EntityRef} from '@abh/contracts';
import type {createDatabaseFixture} from './database-fixture.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import type {InstalledOutboxRouter,OutboxChecks} from '../src/durable/outbox.ts';
import {publishCommittedEvent} from '../src/durable/publisher.ts';
import {QueueAdmissionDirectory} from '../src/durable/queue-admission.ts';
import {consumeOutboxDelivery,runDeliveryWorker} from '../src/durable/delivery-worker.ts';
import {createPackInspectionJobConsumer,PackInspectionDeliveryOwner} from '../src/extensions/inspection-deliveries.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});
export async function checkPackInspectionDelivery(f:Awaited<ReturnType<typeof createDatabaseFixture>>,management:VerifiedContext,runtime:VerifiedContext,grant:EntityRef,router:InstalledOutboxRouter,checks:OutboxChecks,eventRef:EntityRef){
 const consumerId='abh.pack-inspection-job.advance',directory=new QueueAdmissionDirectory(f.database,[consumerId]);
 const adapter=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:directory,onError:()=>{}});
 try{
  const publication=await publishCommittedEvent(f.database,eventRef,{workerId:randomUUID(),context:async()=>runtime,signal:options().signal,checks,router,port:adapter,...directory.publisherContexts([grant])});
  assert.ok(publication.publication);assert.deepEqual(publication.pendingConsumerIds,[]);
  // Wait for the actual frozen queue notBefore, never change a native row to bypass it.
  const [routing]=await f.admin`SELECT record FROM runtime.outbox_routings WHERE id=${publication.routingRef.id}`;
  const due=Date.parse(routing!.record.deliveries[0].job.notBefore)-Date.now();if(due>0)await delay(due+10);
  const delivery=await adapter.fetch('background',options().signal);assert.ok(delivery);
  const consumer=createPackInspectionJobConsumer([grant],{fenceRefs:async()=>[],current:async()=>{}});
  const counts=async()=>{
   const [row]=await f.admin`SELECT (SELECT count(*) FROM extension.inspection_deliveries WHERE event_id=${eventRef.id}) AS deliveries,
    (SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id} AND consumer_id=${consumerId}) AS inbox`;
   return row;
  };
  const journals=async()=>{
   const org=runtime.tenant.resourceOrganizationId;
   const [row]=await f.admin`SELECT (SELECT count(*) FROM data.audit_records WHERE resource_organization_id=${org}) AS audit,
    (SELECT count(*) FROM data.outbox WHERE resource_organization_id=${org}) AS outbox,
    (SELECT count(*) FROM data.command_receipts WHERE resource_organization_id=${org}) AS receipts`;
   return {...row};
  };
  const before=await journals();
  await assert.rejects(consumeOutboxDelivery(f.database,runtime,options().signal,delivery,{...consumer,handle:async(tx,command,event)=>{
   await consumer.handle(tx,command,event);throw new Error('fault after acceptance before Inbox');
  }}),/fault after acceptance before Inbox/);
  assert.deepEqual({...await counts()},{deliveries:'0',inbox:'0'});assert.deepEqual(await journals(),before);
  const stop=new AbortController();let fetched=false,acknowledged=false;
  await runDeliveryWorker(f.database,{signal:stop.signal,queueClass:'background',context:async()=>runtime,consumers:[consumer],queue:{
   fetch:async()=>{assert.equal(fetched,false);fetched=true;return delivery;},
   complete:async(item,resultRef)=>{
    assert.deepEqual({...await counts()},{deliveries:'1',inbox:'1'});
    const saved=await f.database.transaction(management,options(),tx=>new PackInspectionDeliveryOwner().findAccepted(tx,item.job.targetRef,async()=>{}));
    assert.ok(saved);assert.equal(saved.eventRef.id,eventRef.id);
    await adapter.complete(item as typeof delivery,resultRef);acknowledged=true;
   },
  },onHandled:async()=>{stop.abort();}});
  assert.equal(acknowledged,true);
  const [left,right]=await Promise.all([consumeOutboxDelivery(f.database,runtime,options().signal,delivery,consumer),consumeOutboxDelivery(f.database,runtime,options().signal,delivery,consumer)]);
  assert.deepEqual(left,right);assert.equal(left.resultRef.type,'abh.pack-inspection-delivery');
  assert.deepEqual({...await counts()},{deliveries:'1',inbox:'1'});
  await assert.rejects(consumeOutboxDelivery(f.database,runtime,options().signal,delivery,createPackInspectionJobConsumer([],{fenceRefs:async()=>[],current:async()=>{}})),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(consumeOutboxDelivery(f.database,runtime,options().signal,delivery,createPackInspectionJobConsumer([grant],{fenceRefs:async()=>[],current:async()=>{throw new Error('acceptance revoked');}})),/acceptance revoked/);
  const [saved]=await f.admin`SELECT record FROM extension.inspection_deliveries WHERE event_id=${eventRef.id}`;
  await f.admin`UPDATE extension.inspection_deliveries SET record=jsonb_set(record,'{digest}',to_jsonb(${'sha256:'+'0'.repeat(64)}::text)) WHERE event_id=${eventRef.id}`;
  try{await assert.rejects(consumeOutboxDelivery(f.database,runtime,options().signal,delivery,consumer),{code:'INTERNAL_ERROR'});}
  finally{await f.admin`UPDATE extension.inspection_deliveries SET record=${JSON.stringify(saved!.record)}::text::jsonb WHERE event_id=${eventRef.id}`;}
  await assert.rejects(f.database.transaction(management,options(),tx=>new PackInspectionDeliveryOwner().findAccepted(tx,delivery.job.targetRef,async()=>{throw new Error('management read revoked');})),/management read revoked/);
  await assert.rejects(f.database.transaction(management,options(),tx=>tx.owner('PackLoader')`UPDATE extension.inspection_deliveries SET record=record WHERE event_id=${eventRef.id}`),{code:'42501'});
  await assert.rejects(f.queue`SELECT * FROM extension.inspection_deliveries`,{code:'42501'});
 }finally{await adapter.close();}
}
