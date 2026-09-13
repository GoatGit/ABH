import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { PgBossDeliveryAdapter } from '../src/index.ts';
import type { EnqueueJobRequest } from '@abh/contracts';
import type { QueueDelivery } from '../src/index.ts';

const postgresImage = 'postgres@sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51';

/** Mirrors the deployment layout: the queue schema exists before start and is owned by the queue role. */
async function createQueueFixture() {
  const container = await new PostgreSqlContainer(postgresImage).withDatabase('abh_test').start();
  const queuePassword = randomBytesHex();
  const url = new URL(container.getConnectionUri());
  const setup = postgres(container.getConnectionUri(), { max: 1 });
  await setup.unsafe(`CREATE ROLE abh_queue LOGIN PASSWORD '${queuePassword}'`);
  await setup.unsafe('CREATE SCHEMA abh_pgboss AUTHORIZATION abh_queue');
  await setup.end();
  const queueUrl = new URL(url);
  queueUrl.username = 'abh_queue';
  queueUrl.password = queuePassword;
  return { queueUrl: queueUrl.toString(), async close() { await container.stop(); } };
}

function randomBytesHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

const ref = <T extends string>(type: T, id: string = randomUUID()) => ({ type, id, version: 1 as const });

test('adapter delivers, completes, inspects and replays one real queue job',{timeout:120_000},async t=>{
  const f=await createQueueFixture();t.after(()=>f.close());
  const org=randomUUID();
  const adapter=await PgBossDeliveryAdapter.start({
    connectionString:f.queueUrl,
    admission:{resolve:async()=>({resourceOrganizationId:org,consumerId:'adapter.smoke'})},
    onError:()=>{}});
  t.after(()=>adapter.close());
  const now=new Date().toISOString(),later=new Date(Date.now()+30_000).toISOString();
  const target=ref('abh.action');
  const request:EnqueueJobRequest={
    context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:target,scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.enqueue'},deadline:later},
    job:{jobType:'abh.action.advance',targetRef:target,commandRef:ref('abh.command'),dedupeKey:'adapter-smoke',notBefore:now,deadline:later,causeRef:ref('abh.event')}};
  const options={signal:new AbortController().signal};
  const [first,second]=await Promise.all([adapter.enqueue(request,options),adapter.enqueue({...request,context:{...request.context,callId:randomUUID()}},options)]);
  assert.equal(first.status,'Completed');assert.deepEqual(first,second,'same dedupe key must return the same stable jobRef');
  const conflicting=await adapter.enqueue({...request,job:{...request.job,deadline:new Date(Date.now()+40_000).toISOString()}},options);
  assert.equal(conflicting.status,'Rejected');
  let delivery:QueueDelivery|undefined;
  const until=Date.now()+5_000;
  for(;;){
    delivery=await adapter.fetch('control',options.signal);
    if(delivery||Date.now()>=until)break;
    await delay(10,undefined,{signal:options.signal});
  }
  assert.ok(delivery);assert.deepEqual(delivery.job,request.job);assert.equal(delivery.deliveryCount,1);
  assert.equal(await adapter.fetch('control',options.signal),undefined,'an active job is not delivered twice');
  const result=ref('abh.inbox');
  await adapter.complete(delivery,result);
  const replay=await adapter.enqueue(request,options);
  assert.deepEqual(replay,first,'completed queue job is retained for stable enqueue replay');
});
