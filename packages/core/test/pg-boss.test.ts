import {runRuntimeService} from '../src/durable/runtime-service.ts';
import {Database} from '../src/data/uow.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {consumeCommittedEvent,readCommittedEvent,type InstalledEventConsumer} from '../src/durable/inbox.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {context,options as txOptions} from './database-fixture.ts';
import type {GrantRecord,LedgerRecord} from '@abh/contracts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import {PgBossDeliveryAdapter} from '@abh/adapter-pg-boss';
import type {EnqueueJobRequest} from '@abh/contracts';
import {validatePortResult} from '@abh/contracts/ports';
import {createDatabaseFixture,seedLedgerCatalog} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID())=>({type,id,version:1 as const});
const fetchReady=async(adapter:Awaited<ReturnType<typeof PgBossDeliveryAdapter.start>>,queue:'control'|'reconcile'|'background',
  signal:AbortSignal)=>{
  const until=Date.now()+2000;
  for(;;){
    const delivery=await adapter.fetch(queue,signal);
    if(delivery||Date.now()>=until)return delivery;
    await delay(10,undefined,{signal});
  }
};
test('real pg-boss owns isolated queue storage and preserves deterministic delivery identities',{timeout:60_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const org=randomUUID(),scope={resourceOrganizationId:org,consumerId:'hello.consumer'};
  const errors:string[]=[];let currentScope=scope;
  const adapter=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>currentScope},onError:category=>errors.push(category)});t.after(()=>adapter.close());
  await f.database.verify();
  await assert.rejects(f.raw`SELECT * FROM abh_pgboss.job`,{code:'42501'});
  await assert.rejects(f.queue`SELECT * FROM data.outbox`,{code:'42501'});
  await assert.rejects(f.queue`SELECT * FROM execution.operations`,{code:'42501'});
  const target=ref('abh.action'),now=new Date().toISOString(),later=new Date(Date.now()+30_000).toISOString();
  const request:EnqueueJobRequest={context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:target,scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.enqueue'},deadline:later},
    job:{jobType:'abh.action.advance',targetRef:target,commandRef:ref('abh.command'),dedupeKey:'fixture-native-delivery',notBefore:now,deadline:later,causeRef:ref('abh.event')}};
  const options={signal:new AbortController().signal};
  const [first,second]=await Promise.all([adapter.enqueue(request,options),adapter.enqueue({...request,context:{...request.context,callId:randomUUID()}},options)]);
  assert.equal(first.status,'Completed');assert.equal(second.status,'Completed');assert.deepEqual(first,second);
  if(first.status!=='Completed')throw new Error('expected queue result');assert.equal(validatePortResult('DurableExecutionPort.enqueue',first).success,true);
  const conflicting=await adapter.enqueue({...request,job:{...request.job,deadline:new Date(Date.now()+40_000).toISOString()}},options);assert.equal(conflicting.status,'Rejected');
  if(conflicting.status==='Rejected')assert.equal(conflicting.error.error.code,'IDEMPOTENCY_CONFLICT');
  const delivery=await fetchReady(adapter,'control',options.signal);assert.ok(delivery);assert.deepEqual(delivery.jobRef,first.data.jobRef);assert.deepEqual(delivery.job,request.job);
  assert.equal(delivery.deliveryCount,1);assert.equal(await adapter.fetch('control',options.signal),undefined);
  const result=ref('abh.inbox');await adapter.complete(delivery,result);
  const inspection=await adapter.inspect({context:{...request.context,target:{...request.context.target,objectRef:first.data.jobRef,action:'abh.runtime.inspect'}},subjectRef:first.data.jobRef},options);
  assert.equal(inspection.status,'Completed');if(inspection.status==='Completed'){assert.equal(inspection.data.deliveryCount,1);assert.deepEqual(inspection.data.ownerResultRef,result);}
  assert.deepEqual(await adapter.enqueue(request,options),first,'completed queue job is retained for stable enqueue replay');
  await t.test('Operation notification uses control delivery without inventing query authority',async()=>{
    const operation=ref('abh.operation');
    const notification:EnqueueJobRequest={...request,context:{...request.context,target:{...request.context.target,objectRef:operation}},
      job:{...request.job,jobType:'abh.operation.notify-wait',targetRef:operation,dedupeKey:'operation-wait-notification'}};
    const queued=await adapter.enqueue(notification,options);assert.equal(queued.status,'Completed');
    assert.equal(await adapter.fetch('reconcile',options.signal),undefined);
    const delivery=await adapter.fetch('control',options.signal);assert.ok(delivery);assert.equal(delivery.job.jobType,'abh.operation.notify-wait');assert.equal(delivery.job.authorityRef,undefined);
    await adapter.complete(delivery,ref('abh.inbox'));
  });
  await t.test('inspection progress deliveries use background capacity and retain exact versions on replay',async()=>{
    const jobRef={...ref('abh.pack-inspection-job'),version:3};
    const inspection:EnqueueJobRequest={...request,context:{...request.context,target:{...request.context.target,objectRef:jobRef}},
      job:{...request.job,jobType:'abh.pack-inspection-job.advance',targetRef:jobRef,dedupeKey:'pack-inspection-background'}};
    const queued=await adapter.enqueue(inspection,options);assert.equal(queued.status,'Completed');
    assert.equal(await adapter.fetch('control',options.signal),undefined);assert.equal(await adapter.fetch('reconcile',options.signal),undefined);
    const delivery=await adapter.fetch('background',options.signal);assert.ok(delivery);assert.deepEqual(delivery.job,inspection.job);
    await adapter.complete(delivery,ref('abh.inbox'));
    assert.deepEqual(await adapter.enqueue(inspection,options),queued);
    const forged=await adapter.enqueue({...inspection,job:{...inspection.job,authorityRef:ref('abh.execution-authority')}},options);
    assert.equal(forged.status,'Rejected');
  });
  await t.test('different adapters serialize conflicting keys across native queue classes',async()=>{
    const peer=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>scope},onError:category=>errors.push(category)});
    try{
      const operation=ref('abh.operation'),key=`cross-queue/${randomUUID()}`;
      const a={...request,job:{...request.job,dedupeKey:key}};
      const b:EnqueueJobRequest={...request,context:{...request.context,target:{...request.context.target,objectRef:operation}},
        job:{...request.job,jobType:'abh.operation.reconcile',targetRef:operation,authorityRef:ref('abh.execution-authority'),dedupeKey:key}};
      const results=await Promise.all([adapter.enqueue(a,options),peer.enqueue(b,options)]);
      assert.equal(results.filter(item=>item.status==='Completed').length,1);
      const rejected=results.find(item=>item.status==='Rejected');assert.ok(rejected);assert.equal(rejected.error.error.code,'IDEMPOTENCY_CONFLICT');
      const winner=results.find(item=>item.status==='Completed')!;
      assert.equal((await f.queue`SELECT count(*) FROM abh_pgboss.job WHERE id=${winner.data.jobRef.id}`)[0]!.count,'1');
      const queue=results[0]!.status==='Completed'?'control':'reconcile',delivery=await adapter.fetch(queue,options.signal);assert.ok(delivery);await adapter.complete(delivery,ref('abh.inbox'));
    }finally{await peer.close();}
  });
  await t.test('old adapter cannot acknowledge a native retry owned by another Worker',async()=>{
    const peer=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>scope},onError:category=>errors.push(category)});
    try{
      for(const mode of ['complete','fail'] as const){
        await adapter.enqueue({...request,job:{...request.job,dedupeKey:`stale/${mode}`}},options);
        const old=await adapter.fetch('control',options.signal);assert.ok(old);
        // Fault fixture simulates native expiry/retry without informing the old process.
        await f.admin`UPDATE abh_pgboss.job SET state='retry',start_after=clock_timestamp()-interval '1 second' WHERE name='abh.control' AND id=${old.jobRef.id}`;
        const replacement=await peer.fetch('control',options.signal);assert.ok(replacement);assert.equal(replacement.deliveryCount,old.deliveryCount+1);
        await assert.rejects(mode==='complete'?adapter.complete(old,ref('abh.inbox')):adapter.fail(old,'Dependency'),/STALE_DELIVERY/);
        const [row]=await f.queue`SELECT state,retry_count,output FROM abh_pgboss.job WHERE name='abh.control' AND id=${old.jobRef.id}`;
        assert.equal(row!.state,'active');assert.equal(Number(row!.retry_count)+1,replacement.deliveryCount);assert.equal(row!.output,null);
        await peer.complete(replacement,ref('abh.inbox'));
      }
      await adapter.enqueue({...request,job:{...request.job,dedupeKey:'concurrent-ack'}},options);
      const same=await adapter.fetch('control',options.signal);assert.ok(same);
      const acked=await Promise.allSettled([adapter.complete(same,ref('abh.inbox')),adapter.complete(same,ref('abh.inbox'))]);
      assert.equal(acked.filter(item=>item.status==='fulfilled').length,1);
      const loser=acked.find(item=>item.status==='rejected');assert.ok(loser);assert.match(String(loser.reason),/STALE_DELIVERY/);
      await adapter.enqueue({...request,job:{...request.job,dedupeKey:'expired-before-supervisor'}},options);
      const expired=await adapter.fetch('control',options.signal);assert.ok(expired);
      await f.admin`UPDATE abh_pgboss.job SET expire_seconds=0 WHERE name='abh.control' AND id=${expired.jobRef.id}`;
      await assert.rejects(adapter.complete(expired,ref('abh.inbox')),/STALE_DELIVERY/);
      await f.admin`DELETE FROM abh_pgboss.job WHERE name='abh.control' AND id=${expired.jobRef.id}`;
    }finally{await peer.close();}
  });
  await t.test('tenant admission, cancellation and native queue function drift remain isolated',async()=>{
    currentScope={...scope,resourceOrganizationId:randomUUID()};
    const denied=await adapter.inspect({context:{...request.context,target:{...request.context.target,objectRef:first.data.jobRef,action:'abh.runtime.inspect'}},subjectRef:first.data.jobRef},options);
    assert.equal(denied.status,'Rejected');if(denied.status==='Rejected')assert.equal(denied.error.error.code,'RESOURCE_NOT_FOUND');currentScope=scope;
    const signal=AbortSignal.abort();assert.deepEqual(await adapter.enqueue({...request,job:{...request.job,dedupeKey:'never-enqueued'}},{signal}),{status:'Cancelled',effect:'None'});
    const alternate=ref('abh.operation');const swapped=await adapter.enqueue({...request,context:{...request.context,target:{...request.context.target,objectRef:alternate}},job:{...request.job,jobType:'abh.operation.reconcile',targetRef:alternate,authorityRef:ref('abh.execution-authority')}},options);
    assert.equal(swapped.status,'Rejected');if(swapped.status==='Rejected')assert.equal(swapped.error.error.code,'IDEMPOTENCY_CONFLICT');
    await f.admin`GRANT EXECUTE ON FUNCTION abh_pgboss.job_table_format(text,text) TO PUBLIC`;
    try{await assert.rejects(f.database.verify(),error=>(error as {violations:string[]}).violations.includes('queue-function:job_table_format'));}
    finally{await f.admin`REVOKE EXECUTE ON FUNCTION abh_pgboss.job_table_format(text,text) FROM PUBLIC`;}
    await f.admin`GRANT SELECT (id) ON abh_pgboss.job TO abh_runtime`;
    try{await assert.rejects(f.database.verify(),error=>(error as {violations:string[]}).violations.includes('queue-table:job'));}
    finally{await f.admin`REVOKE SELECT (id) ON abh_pgboss.job FROM abh_runtime`;}
    await f.database.verify();
  });
  await t.test('deadline after native send starts returns Tracked while the eventual job stays recoverable',async()=>{
    let locked!:()=>void,release!:()=>void;
    const lockReady=new Promise<void>(resolve=>{locked=resolve;}),releaseLock=new Promise<void>(resolve=>{release=resolve;});
    const holding=f.admin.begin(async tx=>{await tx`LOCK TABLE abh_pgboss.job_common IN SHARE MODE`;locked();await releaseLock;});await lockReady;
    const target=ref('abh.operation'),uncertain:EnqueueJobRequest={...request,context:{...request.context,target:{...request.context.target,objectRef:target},deadline:new Date(Date.now()+200).toISOString()},
      job:{...request.job,jobType:'abh.operation.reconcile',targetRef:target,authorityRef:ref('abh.execution-authority'),dedupeKey:'uncertain-native-send'}};
    let tracked;
    try{tracked=await adapter.enqueue(uncertain,options);assert.equal(tracked.status,'Tracked');}
    finally{release();await holding;}
    const recovered=await adapter.enqueue({...uncertain,context:{...uncertain.context,deadline:later}},options);assert.equal(recovered.status,'Completed');
    if(tracked!.status==='Tracked'&&recovered.status==='Completed')assert.deepEqual(recovered.data.jobRef,tracked!.trackingRef);
    const job=await adapter.fetch('reconcile',options.signal);assert.ok(job);await adapter.complete(job,ref('abh.inbox'));
  });
  await t.test('actual Owner commit survives queue redelivery after acknowledgement loss',async()=>{
    const human=context(org),principal=ref('abh.principal'),organization=ref('abh.organization',org),owner=new LedgerOwner();
    const worker=deriveVerifiedContext({...human.request,actor:{type:'Service',id:principal.id},purposeOfUse:'abh.runtime.deliver'});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[organization],actionTypes:['abh.runtime.consume-event'],purposeNames:['abh.runtime.deliver'],
      validFrom:new Date(Date.now()-1000).toISOString(),validUntil:later,issuanceEvidenceRef:organization,status:'Active'};
    await f.database.transaction(human,txOptions(),async tx=>{
      await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'queue fixture','local','Active')`;
      await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'queue consumer','Service',1,'Active')`;
      await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
      for(const subject of [organization,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${subject.type},${subject.id},1)`;
    });
    const catalog=await seedLedgerCatalog(f.database,human,'hello.credit');
    const config=()=>({id:randomUUID(),scopeRef:organization,resourceType:'hello.queue-effect',meteringMode:'cumulative' as const,unit:'hello.credit',periodRef:catalog.periodRef,limit:'1'});
    const source=config(),command:CommandIdentity={type:'abh.ledgers.configure',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(source)};let sourceLedger:LedgerRecord;
    await f.database.transaction(human,txOptions(),tx=>executeCommand(tx,command,async()=>{},async()=>{sourceLedger=await owner.configure(tx,command,source);return sourceLedger.ledgerRef;}));
    const event=await f.database.transaction(worker,txOptions(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${sourceLedger!.ledgerRef.id} AND record->>'type'='abh.ledger.created'`;return readCommittedEvent(tx,ref('abh.event',row!.id));});
    let calls=0;const consumer:InstalledEventConsumer={id:scope.consumerId,eventTypes:['abh.ledger.created'],fenceRefs:async()=>[grant.grantRef],
      admit:async(tx,event)=>{await assertCurrentGrants(tx,{objectRef:ref('abh.event',event.eventId),scopeRefs:[organization],action:'abh.runtime.consume-event'},[grant.grantRef]);},
      handle:async(tx,command)=>{calls++;return (await owner.configure(tx,command,config())).ledgerRef;}};
    const actualRequest={...request,context:{...request.context,callId:randomUUID()},job:{...request.job,dedupeKey:`event/${event.eventId}/${consumer.id}`,causeRef:ref('abh.event',event.eventId),commandRef:ref('abh.command',event.causationId)}};
    const queued=await adapter.enqueue(actualRequest,options);assert.equal(queued.status,'Completed');
    const first=await adapter.fetch('control',options.signal);assert.ok(first);
    const input={consumerId:consumer.id,eventRef:ref('abh.event',first.job.causeRef.id),eventDigest:await inputDigest(event)};
    const committed=await consumeCommittedEvent(f.database,worker,txOptions(),input,consumer);assert.equal(calls,1);
    assert.equal((await f.database.transaction(worker,txOptions(),tx=>owner.get(tx,committed.resultRef.id))).limit,'1');
    // Owner committed, but the Worker lost the queue acknowledgement. Native retry is delivery only.
    await adapter.fail(first,'Dependency');await f.raw`SELECT pg_sleep(2.1)`;
    const replay=await adapter.fetch('control',options.signal);assert.ok(replay);assert.equal(replay.deliveryCount,2);assert.deepEqual(replay.jobRef,first.jobRef);
    const recovered=await consumeCommittedEvent(f.database,worker,txOptions(),input,consumer);assert.deepEqual(recovered,committed);assert.equal(calls,1);
    await adapter.complete(replay,recovered.inboxRef);
    assert.equal((await f.database.transaction(worker,txOptions(),tx=>tx.owner('DurableExecution')`SELECT count(*) FROM runtime.inbox WHERE event_id=${event.eventId}`))[0]!.count,'1');
  });
  await t.test('runtime service records native remaining deliveries before closing queue and database',async()=>{
    const worker=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>scope},onError:category=>errors.push(category)});
    const database=await Database.connect(f.runtimeUrl,{max:1});let saved=false;
    try{
      await worker.enqueue({...request,job:{...request.job,dedupeKey:'service-shutdown'}},options);
      const active=await worker.fetch('control',options.signal);assert.ok(active);
      const report=await runRuntimeService({signal:AbortSignal.abort(),loops:[],queue:worker,database,
        drainRequest:async()=>({context:{...request.context,deadline:new Date(Date.now()+100).toISOString(),target:{objectRef:ref('abh.organization',org),scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.drain'}},queueClasses:['control']}),
        recordDrain:async value=>{assert.equal(value.drained,false);assert.deepEqual(value.remainingRefs,[active.jobRef]);await database.verify();saved=true;}});
      assert.equal(saved,true);assert.equal(report.drained,false);
      assert.equal((await f.queue`SELECT state FROM abh_pgboss.job WHERE name='abh.control' AND id=${active.jobRef.id}`)[0]!.state,'active','shutdown does not fabricate an acknowledgement');
    }finally{await worker.close();await database.close();}
  });
  await t.test('drain waits for Owner acknowledgement and reports unfinished work at its deadline',async()=>{
    const worker=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>scope},onError:category=>errors.push(category)});
    try{
      const queued=await worker.enqueue({...request,job:{...request.job,dedupeKey:'drain-active'}},options);assert.equal(queued.status,'Completed');
      const delivery=await worker.fetch('control',options.signal);assert.ok(delivery);
      const drainRequest={context:{...request.context,deadline:new Date(Date.now()+100).toISOString(),target:{objectRef:ref('abh.organization',org),scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.drain'}},queueClasses:['control' as const]};
      const unfinished=await worker.drain(drainRequest,options);
      assert.equal(unfinished.status,'Completed');if(unfinished.status==='Completed'){assert.equal(unfinished.data.drained,false);assert.deepEqual(unfinished.data.remainingRefs,[delivery.jobRef]);}
      assert.equal(await worker.fetch('control',options.signal),undefined);
      let returned=false;
      const draining=worker.drain({...drainRequest,context:{...drainRequest.context,deadline:later}},options).then(result=>{returned=true;return result;});
      await new Promise(resolve=>setTimeout(resolve,30));assert.equal(returned,false);
      await worker.complete(delivery,ref('abh.inbox'));
      const finished=await draining;assert.equal(finished.status,'Completed');if(finished.status==='Completed')assert.equal(finished.data.drained,true);
    }finally{await worker.close();}
  });
  await t.test('drain tracks a blocked fetch and prevents handing new work to the Owner',async()=>{
    const worker=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>scope},onError:category=>errors.push(category)});
    let locked!:()=>void,release!:()=>void;
    const ready=new Promise<void>(resolve=>{locked=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
    const queued=await worker.enqueue({...request,job:{...request.job,dedupeKey:'drain-pending-fetch'}},options);assert.equal(queued.status,'Completed');
    const holding=f.admin.begin(async tx=>{await tx`LOCK TABLE abh_pgboss.job_common IN SHARE MODE`;locked();await released;});await ready;
    const fetching=worker.fetch('control',options.signal);
    try{
      const report=await worker.drain({context:{...request.context,deadline:new Date(Date.now()+100).toISOString(),target:{objectRef:ref('abh.organization',org),scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.drain'}},queueClasses:['control']},options);
      assert.equal(report.status,'Completed');if(report.status==='Completed'){assert.equal(report.data.drained,false);assert.equal(report.data.remainingRefs[0]!.type,'abh.queue');}
    }finally{release();await holding;}
    try{assert.equal(await fetching,undefined,'a fetch returning after admission stopped must not run the Owner');}
    finally{await worker.close();}
  });
  await t.test('drain includes a native send that outlives its enqueue deadline',async()=>{
    const worker=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>scope},onError:category=>errors.push(category)});
    let locked!:()=>void,release!:()=>void;
    const ready=new Promise<void>(resolve=>{locked=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
    const holding=f.admin.begin(async tx=>{await tx`LOCK TABLE abh_pgboss.job_common IN SHARE MODE`;locked();await released;});await ready;
    try{
      const queued=await worker.enqueue({...request,context:{...request.context,deadline:new Date(Date.now()+150).toISOString()},job:{...request.job,dedupeKey:'drain-pending-send'}},options);
      assert.equal(queued.status,'Tracked');
      const report=await worker.drain({context:{...request.context,deadline:new Date(Date.now()+100).toISOString(),target:{objectRef:ref('abh.organization',org),scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.drain'}},queueClasses:['control']},options);
      assert.equal(report.status,'Completed');if(report.status==='Completed'&&queued.status==='Tracked'){assert.equal(report.data.drained,false);assert.deepEqual(report.data.remainingRefs,[queued.trackingRef]);}
    }finally{release();await holding;await worker.close();}
  });
  const drained=await adapter.drain({context:{...request.context,target:{objectRef:ref('abh.organization',org),scopeRefs:[ref('abh.organization',org)],action:'abh.runtime.drain'}},queueClasses:['control']},options);
  assert.equal(drained.status,'Completed');if(drained.status==='Completed')assert.equal(drained.data.drained,true);
  const stopped=await adapter.enqueue({...request,job:{...request.job,dedupeKey:'after-drain'}},options);assert.equal(stopped.status,'Rejected');
  assert.deepEqual(errors,[]);
});

test('pg-boss delivery policies are validated and persisted per queue class',{timeout:30_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  await assert.rejects(PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>{throw new Error('unused');}},onError:()=>{},
    queuePolicies:{control:{expireSeconds:0}}}),{message:'QUEUE_POLICY_EXPIRE'});
  await assert.rejects(PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>{throw new Error('unused');}},onError:()=>{},
    queuePolicies:{control:{retryBackoff:false,retryDelayMax:10}}}),{message:'QUEUE_POLICY_RETRY_DELAY_MAX'});
  const adapter=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async()=>{throw new Error('unused');}},onError:()=>{},
    maintenanceIntervalSeconds:60,queuePolicies:{control:{expireSeconds:45,retentionSeconds:3_600,deleteAfterSeconds:120,
      retryLimit:5,retryDelay:2,retryBackoff:false}}});
  t.after(()=>adapter.close());
  const rows=await f.queue`SELECT name,expire_seconds,retention_seconds,deletion_seconds,retry_limit,retry_delay,retry_backoff,retry_delay_max
    FROM abh_pgboss.queue ORDER BY name`;
  const byName=Object.fromEntries(rows.map(row=>[row.name,row]));
  const control=byName['abh.control']!,reconcile=byName['abh.reconcile']!;
  assert.equal(control.expire_seconds,45);assert.equal(control.retention_seconds,3_600);assert.equal(control.deletion_seconds,120);
  assert.equal(control.retry_limit,5);assert.equal(control.retry_delay,2);assert.equal(control.retry_backoff,false);assert.equal(control.retry_delay_max,null);
  assert.equal(reconcile.expire_seconds,30);assert.equal(reconcile.retention_seconds,604_800);assert.equal(reconcile.deletion_seconds,0);
  assert.equal(reconcile.retry_backoff,true);
});
