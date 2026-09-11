import {EventEmitter} from 'node:events';
import {createHttpApp} from '@abh/adapter-fastify';
import {runHttpService} from '../src/server/service.ts';
import {createTenantRuntimeLoops} from '../src/durable/runtime-host.ts';
import {QueueAdmissionDirectory} from '../src/durable/queue-admission.ts';
import {consumeOutboxDelivery,runDeliveryWorker,type EventDeliveryQueue} from '../src/durable/delivery-worker.ts';
import {runConsumptionWorker} from '../src/durable/consumption-worker.ts';
import {OutboxConsumptionOwner,recordOutboxConsumption} from '../src/durable/outbox-consumption.ts';
import {publishCommittedEvent,runOutboxPublisher,type OutboxPublisher} from '../src/durable/publisher.ts';
import {PgBossDeliveryAdapter,type DeliveryScope} from '@abh/adapter-pg-boss';
import {OutboxOwner,enqueueOutbox,type OutboxChecks,type InstalledOutboxRouter,type CompletedEnqueueProof} from '../src/durable/outbox.ts';
import {WorkLeaseOwner} from '../src/durable/work-leases.ts';
import type {OutboxRoutingRecord} from '@abh/contracts';
import type {DurableExecutionPort} from '@abh/contracts/ports';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {EntityRef,GrantRecord,LedgerRecord} from '@abh/contracts';
import {InboxOwner,readCommittedEvent,type InstalledEventConsumer} from '../src/durable/inbox.ts';
import {Database,type TenantTransaction} from '../src/data/uow.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {CoreError} from '../src/internal/errors.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {revokeGrant} from '../src/control/revoke.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID())=>({type,id,version:1 as const});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('Inbox commits the actual Owner effect once across at-least-once deliveries',{timeout:60_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,scope=ref('abh.organization',org),principal=ref('abh.principal'),inbox=new InboxOwner(),ledger=new LedgerOwner();
  const worker=deriveVerifiedContext({...c.request,actor:{type:'Service',id:principal.id},purposeOfUse:'abh.runtime.deliver'});
  const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.runtime.drain','abh.runtime.record-outbox-consumption','abh.runtime.consume-event','abh.runtime.prepare-outbox','abh.runtime.record-outbox-delivery'],purposeNames:['abh.runtime.deliver'],
    validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'fixture organization','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'fixture consumer','Service',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    for(const subject of [scope,principal,grant.grantRef,ref('abh.principal',c.tenant.actor.id)])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${subject.type},${subject.id},1)`;
  });
  const input=()=>({id:randomUUID(),scopeRef:scope,resourceType:'hello.inbox-resource',meteringMode:'cumulative' as const,unit:'hello.credit',periodRef:ref('abh.period'),limit:'10'});
  const source=async()=>{
    const value=input(),cmd=await command('abh.ledgers.configure',value);let record:LedgerRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{record=await ledger.configure(tx,cmd,value);return record.ledgerRef;}));
    return db.transaction(worker,options(),async tx=>{
      const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${record!.ledgerRef.id} AND record->>'type'='abh.ledger.created'`;
      const eventRef=ref('abh.event',row!.id),event=await readCommittedEvent(tx,eventRef);return {consumerId:'hello.accounting',eventRef,eventDigest:await inputDigest(event)};
    });
  };
  let calls=0;
  const consumer:InstalledEventConsumer={id:'hello.accounting',eventTypes:['abh.ledger.created'],fenceRefs:async()=>[grant.grantRef],
    admit:async(tx,event)=>{await assertCurrentGrants(tx,{objectRef:ref('abh.event',event.eventId),scopeRefs:[scope],action:'abh.runtime.consume-event'},[grant.grantRef]);},
    handle:async(tx,cmd)=>{calls++;return (await ledger.configure(tx,cmd,input())).ledgerRef;}};
  const consume=async(payload:Awaited<ReturnType<typeof source>>,installed=consumer,fail=false,cmdOverride?:CommandIdentity)=>{
    const cmd=cmdOverride??await command('abh.runtime.consume-event',payload);
    const result=await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{await inbox.admit(tx,payload,installed);},async()=>{
      const record=await inbox.consume(tx,cmd,payload,installed);if(fail)throw new Error('after Inbox and Owner writes');return record.inboxRef;
    }));return db.transaction(worker,options(),tx=>inbox.get(tx,result.receipt.resultRef));
  };
  const counts=()=>db.transaction(worker,options(),async tx=>{
    const [row]=await tx.owner('DurableExecution')`SELECT (SELECT count(*) FROM runtime.inbox) AS inbox,(SELECT count(*) FROM resource.ledgers) AS ledgers,
      (SELECT count(*) FROM data.audit_records) AS audit,(SELECT count(*) FROM data.outbox) AS outbox,(SELECT count(*) FROM data.command_receipts) AS commands`;return {...row};
  });
  await t.test('concurrent delivery and lost ack replay return one immutable Inbox and one Owner result',async()=>{
    const event=await source(),before=calls,[left,right]=await Promise.all([consume(event),consume(event)]);
    assert.deepEqual(left,right);assert.equal(calls,before+1);assert.equal(left.resultRef.type,'abh.ledger');
    assert.equal((await db.transaction(worker,options(),tx=>ledger.get(tx,left.resultRef.id))).limit,'10');
    assert.deepEqual(await consume(event),left);assert.equal(calls,before+1);
    await assert.rejects(db.transaction(worker,options(),tx=>tx.owner('DurableExecution')`UPDATE runtime.inbox SET record=record`),{code:'42501'});
    await assert.rejects(db.transaction(context(),options(),tx=>inbox.get(tx,left.inboxRef)),{code:'RESOURCE_NOT_FOUND'});
  });
  await t.test('failure after Owner or Inbox writes rolls back Inbox, ledger, audit, outbox and command receipt',async()=>{
    const event=await source(),before=await counts();
    await assert.rejects(consume(event,consumer,true),/after Inbox and Owner/);assert.deepEqual(await counts(),before);
    await assert.rejects(consume(event,{...consumer,handle:async(tx,cmd,event)=>{await consumer.handle(tx,cmd,event);throw new Error('after Owner');}}),/after Owner/);assert.deepEqual(await counts(),before);
    const result=await consume(event);assert.equal(result.eventRef.id,event.eventRef.id);assert.equal((await counts()).inbox,String(Number(before.inbox)+1));
  });
  await t.test('different installed consumers handle the same source independently; unregistered route and forged source digest fail',async()=>{
    const event=await source(),first=await consume(event),second=await consume({...event,consumerId:'hello.reporting'},{...consumer,id:'hello.reporting'});
    assert.notEqual(first.inboxRef.id,second.inboxRef.id);assert.notEqual(first.resultRef.id,second.resultRef.id);
    await assert.rejects(consume({...event,consumerId:'hello.invented'}),{code:'FORBIDDEN'});
    await assert.rejects(consume(event,{...consumer,eventTypes:['abh.action.authorize']}),{code:'FORBIDDEN'});
    await assert.rejects(consume({...event,eventDigest:'sha256:'+'0'.repeat(64)}),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(consume({...event,eventRef:ref('abh.event')}),{code:'RESOURCE_NOT_FOUND'});
  });
  await t.test('Outbox freezes fanout and publishes only after every consumer has confirmed enqueue',async t=>{
    const owner=new OutboxOwner(),leases=new WorkLeaseOwner();
    const checks:OutboxChecks={fenceRefs:async()=>[grant.grantRef],admit:async(tx,_event,permission,targetRef)=>{await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[grant.grantRef]);}};
    // Routing/admission are installed fixtures; publication uses the real isolated pg-boss adapter.
    const router:InstalledOutboxRouter={ruleRef:ref('hello.routing-rule'),eventTypes:['abh.ledger.created'],route:async(_tx,event)=>['hello.first','hello.second'].map(consumerId=>({consumerId,consumerRef:ref('hello.consumer'),job:{jobType:'abh.action.advance',targetRef:ref('abh.action'),commandRef:ref('abh.command',event.causationId),
      dedupeKey:`${event.eventId}/${consumerId}`,notBefore:event.occurredAt,deadline:new Date(Date.now()+60_000).toISOString(),causeRef:ref('abh.event',event.eventId)}}))};
    const prepare=async(event:Awaited<ReturnType<typeof source>>,installed=router)=>{
      const payload={eventRef:event.eventRef,eventDigest:event.eventDigest},cmd=await command('abh.runtime.prepare-outbox',payload);
      const result=await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await owner.prepare(tx,cmd,payload,installed,checks)).routingRef));
      return db.transaction(worker,options(),tx=>owner.getRouting(tx,result.receipt.resultRef));
    };
    const claim=async(routing:OutboxRoutingRecord)=>{
      const input={targetRef:routing.routingRef,workerId:randomUUID(),leaseSeconds:30},cmd=await command('abh.work-leases.claim',input);let lease;
      await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{lease=await leases.claim(tx,cmd,input,async(tx,target)=>{await owner.getRouting(tx,target);return ['abh.runtime.deliver'];});return lease.leaseRef;}));return lease!;
    };
    const admittedCalls=new Map<string,DeliveryScope>();
    const native=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async context=>{
      const admitted=admittedCalls.get(context.callId);if(!admitted)throw new Error('fixture admission missing');return admitted;
    }},onError:()=>{throw new Error('queue dependency failed');}});t.after(()=>native.close());
    const port:Pick<DurableExecutionPort,'enqueue'>=native;
    const enqueue=async(routing:OutboxRoutingRecord,index:number,adapter=port)=>{
      const delivery=routing.deliveries[index]!,request={context:{callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:delivery.job.targetRef,scopeRefs:[scope],action:'abh.runtime.enqueue'},deadline:new Date(Date.now()+5000).toISOString()},job:delivery.job};
      admittedCalls.set(request.context.callId,{resourceOrganizationId:routing.resourceOrganizationId,consumerId:delivery.consumerId});
      try{return await enqueueOutbox(adapter,request,{signal:new AbortController().signal},routing,delivery.consumerId);}
      finally{admittedCalls.delete(request.context.callId);}
    };
    const record=async(routing:OutboxRoutingRecord,lease:Awaited<ReturnType<typeof claim>>,index:number,proof:CompletedEnqueueProof,fail=false)=>{
      const input={routingRef:routing.routingRef,consumerId:routing.deliveries[index]!.consumerId,leaseRef:lease.leaseRef,workerId:lease.workerId,leaseFencingToken:lease.fencingToken},cmd=await command('abh.runtime.record-outbox-delivery',input);let result:Awaited<ReturnType<OutboxOwner['recordDelivery']>>|undefined;
      await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await owner.recordDelivery(tx,cmd,input,proof,checks);if(fail)throw new Error('after publication facts');return result.delivery.deliveryRef;}));return result!;
    };
    await t.test('real Queue admission binds installed consumer and rechecks Grant before enqueue replay',async()=>{
      const queueGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.runtime.enqueue','abh.runtime.inspect','abh.runtime.drain']};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${queueGrant.grantRef.id},${principal.id},${JSON.stringify(queueGrant)}::text::jsonb,${queueGrant.validFrom},${queueGrant.validUntil},'Active')`;
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${queueGrant.grantRef.id},1)`;
      });
      const admission=new QueueAdmissionDirectory(db,['hello.installed','hello.first','hello.second']),requestContextRef=admission.register(worker,'hello.installed',[queueGrant.grantRef]);
      assert.throws(()=>admission.register(worker,'hello.invented',[queueGrant.grantRef]),{code:'FORBIDDEN'});
      assert.throws(()=>admission.register({...worker},'hello.installed',[queueGrant.grantRef]));
      const queue=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission,onError:()=>{throw new Error('queue error');}});
      try{
        const target=ref('abh.action'),request={context:{callId:randomUUID(),requestContextRef,target:{objectRef:target,scopeRefs:[scope],action:'abh.runtime.enqueue'},deadline:new Date(Date.now()+5000).toISOString()},
          job:{jobType:'abh.action.advance' as const,targetRef:target,commandRef:ref('abh.command'),dedupeKey:randomUUID(),notBefore:new Date().toISOString(),deadline:new Date(Date.now()+30000).toISOString(),causeRef:ref('abh.event')}};
        const options={signal:new AbortController().signal};const result=await queue.enqueue(request,options);assert.equal(result.status,'Completed');
        assert.deepEqual(await queue.enqueue(request,options),result);
        const foreign=await queue.enqueue({...request,context:{...request.context,target:{...request.context.target,scopeRefs:[ref('abh.organization')]}}},options);assert.equal(foreign.status,'Rejected');
        const delivered=await queue.fetch('control',options.signal);assert.ok(delivered);assert.equal(delivered.resourceOrganizationId,org);assert.equal(delivered.consumerId,'hello.installed');await queue.complete(delivered,ref('abh.inbox'));
        const contexts=admission.publisherContexts([queueGrant.grantRef]),issuedCalls:import('@abh/contracts').PortCallContext[]=[];
        const publisher={workerId:randomUUID(),context:async()=>worker,signal:options.signal,checks,router,port:queue,...contexts,
          enqueueContext:async(...args:Parameters<NonNullable<typeof contexts.enqueueContext>>)=>{const call=await contexts.enqueueContext(...args);issuedCalls.push(call);return call;}};
        const published=await publishCommittedEvent(db,(await source()).eventRef,publisher);assert.ok(published.publication);assert.equal(issuedCalls.length,2);
        for(const call of issuedCalls)await assert.rejects(admission.resolve(call,options.signal),{code:'FORBIDDEN'},'Publisher releases each completed call handle');
        for(let index=0;index<2;index++){const job=await queue.fetch('control',options.signal);assert.ok(job);await queue.complete(job,ref('abh.inbox'));}
        issuedCalls.length=0;
        await assert.rejects(publishCommittedEvent(db,(await source()).eventRef,{...publisher,port:{enqueue:async()=>{throw new Error('transport failed');}}}),/transport failed/);
        assert.equal(issuedCalls.length,1);await assert.rejects(admission.resolve(issuedCalls[0]!,options.signal),{code:'FORBIDDEN'},'failed enqueue also releases its handle');
        issuedCalls.length=0;const cancelledCall=new AbortController();let remoteCalls=0;
        await assert.rejects(publishCommittedEvent(db,(await source()).eventRef,{...publisher,signal:cancelledCall.signal,
          enqueueContext:async(...args:Parameters<typeof publisher.enqueueContext>)=>{const call=await publisher.enqueueContext(...args);cancelledCall.abort();return call;},
          port:{enqueue:async()=>{remoteCalls++;throw new Error('must not call');}}}),{code:'DEPENDENCY_TIMEOUT'});
        assert.equal(remoteCalls,0);assert.equal(issuedCalls.length,1);await assert.rejects(admission.resolve(issuedCalls[0]!,options.signal),{code:'FORBIDDEN'});
        const inspected=await queue.inspect({context:{...request.context,target:{...request.context.target,objectRef:delivered.jobRef,action:'abh.runtime.inspect'}},subjectRef:{...delivered.jobRef,type:'abh.job'}},options);
        assert.equal(inspected.status,'Completed');if(inspected.status==='Completed')assert.equal(inspected.data.ownerResultRef!.type,'abh.inbox');
        const drainCall={...request.context,target:{objectRef:scope,scopeRefs:[scope],action:'abh.runtime.drain'}};
        let requested=0;const drainContexts=admission.drainContexts({context:async()=>{requested++;return worker;},consumerId:'hello.installed',grantRefs:[queueGrant.grantRef],queueClasses:['control']});
        const scopedDrain=await drainContexts.drainRequest();assert.equal(requested,1);
        assert.equal(scopedDrain.context.target.objectRef.id,org);
        const drained=await queue.drain(scopedDrain,options);assert.equal(drained.status,'Completed');
        drainContexts.releaseDrainRequest!(scopedDrain);await assert.rejects(admission.resolve(scopedDrain.context,options.signal),{code:'FORBIDDEN'});
        const revoke=await command('abh.grants.revoke',queueGrant.grantRef);await db.transaction(c,{deadline:Date.now()+10000,signal:options.signal},tx=>revokeGrant(tx,revoke,queueGrant.grantRef,[scope]));
        const denied=await queue.enqueue(request,options);assert.equal(denied.status,'Rejected');
        await assert.rejects(admission.resolve(request.context,options.signal),{code:'EPOCH_REVOKED'});
        await assert.rejects(admission.resolve(drainCall,options.signal),{code:'EPOCH_REVOKED'});
        admission.revoke(requestContextRef);await assert.rejects(admission.resolve(request.context,options.signal),{code:'FORBIDDEN'});
      }finally{await queue.close();}
    });
    await t.test('delivery Worker validates frozen jobs, commits actual consumers and acknowledges only after commit',async()=>{
      const routing=await prepare(await source()),first=await enqueue(routing,0);assert.equal(first.status,'Completed');
      const delivery=await native.fetch('control',new AbortController().signal);assert.ok(delivery);
      const installed={...consumer,id:'hello.first'},signal=new AbortController().signal;
      await assert.rejects(consumeOutboxDelivery(db,worker,signal,{...delivery,job:{...delivery.job,targetRef:ref('abh.action')}},installed),{code:'IDEMPOTENCY_CONFLICT'});
      await assert.rejects(consumeOutboxDelivery(db,worker,signal,{...delivery,resourceOrganizationId:randomUUID()},installed),{code:'FORBIDDEN'});
      await assert.rejects(consumeOutboxDelivery(db,worker,signal,delivery,{...installed,id:'hello.wrong'}),{code:'FORBIDDEN'});
      let acknowledgements=0;const unchanged=await counts();
      await assert.rejects(runDeliveryWorker(db,{signal,queue:{fetch:async()=>delivery,complete:async()=>{acknowledgements++;}},queueClass:'control',context:async()=>worker,
        consumers:[{...installed,handle:async()=>{throw new Error('Owner failed before commit');}}]}),/Owner failed before commit/);
      assert.equal(acknowledgements,0);assert.deepEqual(await counts(),unchanged);
      const identityStop=new AbortController();let entered!:()=>void,identitySignal:AbortSignal|undefined;
      const identityStarted=new Promise<void>(resolve=>{entered=resolve;});
      const waiting=runDeliveryWorker(db,{signal:identityStop.signal,queue:{fetch:async()=>delivery,complete:async()=>{acknowledgements++;}},queueClass:'control',
        context:async(_delivery,request)=>{identitySignal=request.signal;entered();return new Promise(()=>{});},consumers:[installed]});
      await identityStarted;identityStop.abort();await waiting;
      assert.equal(identitySignal?.aborted,true);assert.equal(acknowledgements,0);assert.deepEqual(await counts(),unchanged);
      const before=calls;let fetches=0;
      const lost:EventDeliveryQueue={fetch:async()=>++fetches===1?delivery:undefined,complete:async()=>{throw new Error('lost acknowledgement');}};
      await assert.rejects(runDeliveryWorker(db,{signal,queue:lost,queueClass:'control',context:async()=>worker,consumers:[installed]}),/lost acknowledgement/);
      assert.equal(calls,before+1);
      // Native retry simulates a Worker crash after committed Inbox but before acknowledgement.
      await native.fail(delivery,'Dependency');await f.raw`SELECT pg_sleep(2.1)`;
      const stop=new AbortController();let handled=0;
      const serviceDatabase=await Database.connect(f.runtimeUrl),processSignals=new EventEmitter();
      const admission=new QueueAdmissionDirectory(serviceDatabase,[installed.id]);
      const queueErrors:string[]=[];
      const serviceQueue=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission,onError:category=>queueErrors.push(category)});
      const drain=admission.drainContexts({context:async()=>worker,consumerId:installed.id,grantRefs:[grant.grantRef],queueClasses:['control'],timeoutMs:1000});
      const app=createHttpApp({authenticate:async()=>{throw new Error('no business routes in recovery host');}});
      let listeningAddress='';let listeningReady!:()=>void;
      const listening=new Promise<void>(resolve=>{listeningReady=resolve;});
      const tenantLoops=createTenantRuntimeLoops(serviceDatabase,{
        recovery:{workerId:randomUUID(),context:async()=>worker,grantRefs:[]},
        consumption:{context:async()=>worker,grantRefs:[]},
        publisher:{workerId:randomUUID(),context:async()=>worker,checks,router,port:native,enqueueContext:async()=>{throw new Error('not used by delivery loop');}},
        deliveries:[{queue:serviceQueue,queueClass:'control',context:async()=>worker,consumers:[installed],onHandled:async result=>{
          handled++;assert.equal(result.consumerId,installed.id);await listening;assert.equal((await fetch(listeningAddress+'/missing')).status,404);processSignals.emit('SIGTERM');
        }}],
      });
      let recorded=false;
      try{
        const report=await runHttpService({app,listen:{host:'127.0.0.1',port:0},signal:stop.signal,loops:[tenantLoops[0]!],database:serviceDatabase,queue:serviceQueue,...drain,
          onListening:async address=>{listeningAddress=address;listeningReady();},recordDrain:async report=>{
            assert.equal(report.drained,true);assert.deepEqual(report.remainingRefs,[]);await serviceDatabase.verify();recorded=true;
          }},processSignals);
        assert.equal(report.drained,true);assert.equal(recorded,true);assert.equal(app.server.listening,false);assert.equal(processSignals.listenerCount('SIGTERM'),0);
        assert.deepEqual(queueErrors,[]);await assert.rejects(serviceDatabase.transaction(worker,options(),async()=>{}));
      }finally{listeningReady();await app.close();await serviceQueue.close();await serviceDatabase.close();}
      assert.equal(handled,1);assert.equal(calls,before+1,'redelivery reuses actual committed Inbox');
      const [row]=await f.queue`SELECT state,output FROM abh_pgboss.job WHERE name='abh.control' AND id=${delivery.jobRef.id}`;
      assert.equal(row!.state,'completed');assert.equal(row!.output.ownerResultRef.type,'abh.inbox');
      const installationStop=new AbortController();let releaseFetch!:()=>void;
      const fetchGate=new Promise<void>(resolve=>{releaseFetch=resolve;});
      let installedAdmissions=0,installedAcknowledgements=0;
      const mutableConsumer={...installed,admit:async(...args:Parameters<typeof installed.admit>)=>{installedAdmissions++;await installed.admit(...args);}};
      const mutableQueue={fetch:async()=>{await fetchGate;return delivery;},complete:async()=>{installedAcknowledgements++;}};
      const installationRun=runDeliveryWorker(db,{signal:installationStop.signal,queue:mutableQueue,queueClass:'control',context:async()=>worker,consumers:[mutableConsumer],onHandled:async()=>{installationStop.abort();}});
      const replaced=async()=>{throw new Error('replaced installation');};
      mutableConsumer.admit=replaced;mutableConsumer.handle=replaced;mutableQueue.complete=replaced;
      releaseFetch();await installationRun;
      assert.equal(installedAdmissions,1);assert.equal(installedAcknowledgements,1);assert.equal(calls,before+1);
      const observerStop=new AbortController();let observerEntered!:()=>void,observerSignal:AbortSignal|undefined;
      const observerStarted=new Promise<void>(resolve=>{observerEntered=resolve;});let confirmed=0;
      const observing=runDeliveryWorker(db,{signal:observerStop.signal,queue:{fetch:async()=>delivery,complete:async()=>{confirmed++;}},queueClass:'control',context:async()=>worker,consumers:[installed],
        onHandled:async(_result,options)=>{observerSignal=options.signal;observerEntered();return new Promise(()=>{});}});
      await observerStarted;observerStop.abort();await observing;
      assert.equal(confirmed,1);assert.equal(observerSignal?.aborted,true);assert.equal(calls,before+1);
      await assert.rejects(runDeliveryWorker(db,{signal,queue:native,queueClass:'control',context:async()=>worker,consumers:[installed,installed]}),{code:'INVALID_ARGUMENT'});
    });
    await t.test('Publisher resumes only unconfirmed consumers and reauthorizes completed publication',async()=>{
      const event=await source(),workerId=randomUUID();let mode:'Partial'|'Complete'|'Crash'='Partial',calls:string[]=[];
      const publisher:OutboxPublisher={workerId,context:async()=>worker,signal:new AbortController().signal,checks,router,
        enqueueContext:async(_context,routing,consumerId)=>{
          const job=routing.deliveries.find(item=>item.consumerId===consumerId)!.job,callId=randomUUID();
          admittedCalls.set(callId,{resourceOrganizationId:org,consumerId});
          return {callId,requestContextRef:ref('abh.request-context'),target:{objectRef:job.targetRef,scopeRefs:[scope],action:'abh.runtime.enqueue'},deadline:new Date(Date.now()+5000).toISOString()};
        },port:{enqueue:async(request,options)=>{
          const consumerId=admittedCalls.get(request.context.callId)!.consumerId;calls.push(consumerId);
          try{
            if(mode==='Partial'&&consumerId==='hello.second')return {status:'Tracked',trackingRef:ref('abh.job')};
            const result=await native.enqueue(request,options);
            if(mode==='Crash'&&consumerId==='hello.second')throw new Error('crash after enqueue before acknowledgement');
            return result;
          }finally{admittedCalls.delete(request.context.callId);}
        }}};
      const partial=await publishCommittedEvent(db,event.eventRef,publisher);
      assert.deepEqual(partial.pendingConsumerIds,['hello.second']);assert.equal(partial.publication,undefined);assert.deepEqual(calls,['hello.first','hello.second']);
      assert.ok((await db.transaction(worker,options(),tx=>owner.pendingEvents(tx,[]))).some(ref=>ref.id===event.eventRef.id),'frozen routing remains discoverable after subscriptions change');
      mode='Complete';calls=[];
      const complete=await publishCommittedEvent(db,event.eventRef,publisher);assert.deepEqual(calls,['hello.second']);assert.equal(complete.publication!.deliveryRefs.length,2);
      assert.equal((await db.transaction(worker,options(),tx=>tx.owner('CommandIngress')`SELECT count(*) FROM data.command_receipts WHERE command_type='abh.runtime.prepare-outbox' AND idempotency_key=${`outbox/prepare/${event.eventRef.id}`}`))[0]!.count,'1','polling reuses one preparation Command receipt');
      assert.ok(!(await db.transaction(worker,options(),tx=>owner.pendingEvents(tx,router.eventTypes))).some(ref=>ref.id===event.eventRef.id),'fully published events leave the recovery scan');
      calls=[];assert.deepEqual(await publishCommittedEvent(db,event.eventRef,{...publisher,workerId:randomUUID()}),complete);assert.deepEqual(calls,[]);
      await assert.rejects(publishCommittedEvent(db,event.eventRef,{...publisher,checks:{...checks,admit:async()=>{throw new CoreError('FORBIDDEN');}}}),{code:'FORBIDDEN'});assert.deepEqual(calls,[]);
      const interrupted=await source();mode='Crash';
      await assert.rejects(publishCommittedEvent(db,interrupted.eventRef,publisher),/crash after enqueue/);
      mode='Complete';calls=[];const resumed=await publishCommittedEvent(db,interrupted.eventRef,publisher);
      assert.deepEqual(calls,['hello.second']);assert.equal(resumed.publication!.deliveryRefs.length,2);
      const timed=await source();calls=[];
      await assert.rejects(publishCommittedEvent(db,timed.eventRef,{...publisher,
        enqueueContext:async(ctx,routing,consumerId)=>({...await publisher.enqueueContext(ctx,routing,consumerId),deadline:new Date(Date.now()+50).toISOString()}),
        port:{enqueue:async()=>new Promise(()=>{})}}),{code:'DEPENDENCY_TIMEOUT'});
      const timedRouting=await prepare(timed);
      assert.equal(await db.transaction(worker,options(),tx=>owner.publication(tx,timedRouting.routingRef)),undefined,'non-cooperating Port cannot acknowledge publication');
      const queued=await source(),shutdown=new AbortController();let pages=0;
      await runOutboxPublisher(db,{...publisher,signal:shutdown.signal,pageSize:100,onPage:async result=>{
        pages++;assert.ok(result.scanned>0);assert.ok(result.published>0);shutdown.abort();
      }});assert.equal(pages,1);
      const queuedRouting=await prepare(queued);assert.ok(await db.transaction(worker,options(),tx=>owner.publication(tx,queuedRouting.routingRef)));
      const foreign=deriveVerifiedContext({...context().request,actor:{type:'Service',id:randomUUID()},purposeOfUse:'abh.runtime.deliver'});
      assert.deepEqual(await db.transaction(foreign,options(),tx=>owner.pendingEvents(tx,router.eventTypes)),[]);
      await assert.rejects(db.transaction(worker,options(),tx=>owner.pendingEvents(tx,router.eventTypes,101)),{code:'INVALID_ARGUMENT'});
      const stopped=new AbortController();stopped.abort();calls=[];
      await assert.rejects(publishCommittedEvent(db,event.eventRef,{...publisher,signal:stopped.signal}),{code:'DEPENDENCY_TIMEOUT'});assert.deepEqual(calls,[]);
    });
    await t.test('processing coverage requires every real Inbox; publication alone never proves consumption',async()=>{
      const event=await source(),routing=await prepare(event),lease=await claim(routing),coverage=new OutboxConsumptionOwner();
      const finish=()=>recordOutboxConsumption(db,worker,options(),routing.routingRef,[grant.grantRef]);
      await assert.rejects(finish(),{code:'PRECONDITION_FAILED'});
      for(let index=0;index<2;index++){
        const result=await enqueue(routing,index);if(result.status!=='Completed')throw new Error('missing enqueue');await record(routing,lease,index,result.proof);
      }
      await assert.rejects(finish(),{code:'PRECONDITION_FAILED'},'fully published still has no processing evidence');
      const waitingStop=new AbortController();let waitingPages=0;
      await runConsumptionWorker(db,{context:async()=>worker,grantRefs:[grant.grantRef],signal:waitingStop.signal,
        onPage:async result=>{waitingPages++;assert.ok(result.pending>=1);waitingStop.abort();}});assert.equal(waitingPages,1);
      await assert.rejects(runConsumptionWorker(db,{context:async()=>worker,grantRefs:[],signal:new AbortController().signal}),{code:'AUTHORITY_REQUIRED'});
      const changed=deriveVerifiedContext({...worker.request,actor:{type:'Service',id:randomUUID()}});let contextCalls=0;
      await assert.rejects(runConsumptionWorker(db,{context:async()=>++contextCalls===1?worker:changed,grantRefs:[grant.grantRef],signal:new AbortController().signal}),{code:'FORBIDDEN'});

      assert.ok((await db.transaction(worker,options(),tx=>coverage.pending(tx))).some(ref=>ref.id===routing.routingRef.id));
      const first=await consume({...event,consumerId:'hello.first'},{...consumer,id:'hello.first'});
      await assert.rejects(finish(),{code:'PRECONDITION_FAILED'});
      await consume({...event,consumerId:'hello.unrelated'},{...consumer,id:'hello.unrelated'});
      await assert.rejects(finish(),{code:'PRECONDITION_FAILED'},'an unrelated consumer cannot substitute for the missing frozen consumer');
      const second=await consume({...event,consumerId:'hello.second'},{...consumer,id:'hello.second'});
      const cmd=await command('abh.runtime.record-outbox-consumption',{routingRef:routing.routingRef}),before=await counts();
      await assert.rejects(db.transaction(worker,options(),async tx=>{await coverage.record(tx,cmd,routing.routingRef,[grant.grantRef]);throw new Error('after coverage');}),/after coverage/);
      assert.deepEqual(await counts(),before);
      let rounds=0,issued=0;const shutdown=new AbortController();
      await runConsumptionWorker(db,{context:async()=>{issued++;return worker;},grantRefs:[grant.grantRef],signal:shutdown.signal,
        onPage:async result=>{rounds++;assert.ok(result.recorded>=1);assert.equal(result.scanned,result.recorded+result.pending);shutdown.abort();}});
      assert.equal(rounds,1);assert.ok(issued>=2);
      const [a,b]=await Promise.all([finish(),finish()]);assert.deepEqual(a,b);
      assert.ok(!(await db.transaction(worker,options(),tx=>coverage.pending(tx))).some(ref=>ref.id===routing.routingRef.id));
      await assert.rejects(db.transaction(worker,options(),tx=>coverage.pending(tx,101)),{code:'INVALID_ARGUMENT'});
      assert.deepEqual(new Set(a.inboxRefs.map(ref=>ref.id)),new Set([first.inboxRef.id,second.inboxRef.id]));
      assert.equal((await db.transaction(worker,options(),tx=>tx.owner('DurableExecution')`SELECT count(*) FROM runtime.outbox_consumptions WHERE routing_id=${routing.routingRef.id}`))[0]!.count,'1');
      await assert.rejects(recordOutboxConsumption(db,worker,options(),routing.routingRef,[]),{code:'AUTHORITY_REQUIRED'});
      await assert.rejects(db.transaction(context(),options(),tx=>coverage.get(tx,a.consumptionRef)),{code:'RESOURCE_NOT_FOUND'});
      await assert.rejects(f.raw`UPDATE runtime.outbox_consumptions SET record=record`,{code:'42501'});
      const revocable:GrantRecord={...grant,grantRef:ref('abh.grant')};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${revocable.grantRef.id},${principal.id},${JSON.stringify(revocable)}::text::jsonb,${revocable.validFrom},${revocable.validUntil},'Active')`;
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${revocable.grantRef.id},1)`;
      });
      assert.deepEqual(await recordOutboxConsumption(db,worker,options(),routing.routingRef,[revocable.grantRef]),a);
      const revoke=await command('abh.grants.revoke',revocable.grantRef);await db.transaction(c,options(),tx=>revokeGrant(tx,revoke,revocable.grantRef,[scope]));
      await assert.rejects(recordOutboxConsumption(db,worker,options(),routing.routingRef,[revocable.grantRef]),{code:'EPOCH_REVOKED'});
    });
    await t.test('first route survives concurrent preparation and changed subscriptions; partial publication stays incomplete',async()=>{
      const event=await source(),[routing,other]=await Promise.all([prepare(event),prepare(event)]);assert.deepEqual(routing,other);
      assert.deepEqual(await prepare(event,{...router,ruleRef:ref('hello.next-rule'),route:async()=>{throw new Error('must use frozen subscriptions');}}),routing);
      const lease=await claim(routing),first=await enqueue(routing,0);assert.equal(first.status,'Completed');if(first.status!=='Completed')throw new Error('missing completed enqueue');
      const saved=await record(routing,lease,0,first.proof);assert.equal(saved.publication,undefined);
      assert.equal(await db.transaction(worker,options(),tx=>owner.publication(tx,routing.routingRef)),undefined);
      const uncertain=await enqueue(routing,1,{enqueue:async()=>({status:'Tracked',trackingRef:ref('abh.job')})});assert.equal(uncertain.status,'Tracked');assert.equal('proof' in uncertain,false);
      await assert.rejects(record(routing,lease,1,{kind:'CompletedEnqueueProof'}),{code:'AUTHORITY_REQUIRED'});
      const second=await enqueue(routing,1);if(second.status!=='Completed')throw new Error('missing second enqueue');
      const complete=await record(routing,lease,1,second.proof);assert.equal(complete.publication!.deliveryRefs.length,2);
      assert.ok(complete.publication!.deliveryRefs.some(ref=>ref.id===saved.delivery.deliveryRef.id));
      assert.deepEqual((await record(routing,lease,0,first.proof)).publication,complete.publication);
      const duplicate=await enqueue(routing,1);if(duplicate.status!=='Completed')throw new Error('missing duplicate');
      assert.deepEqual(await record(routing,lease,1,duplicate.proof),complete);
      assert.equal((await db.transaction(worker,options(),tx=>tx.owner('DurableExecution')`SELECT count(*) FROM runtime.inbox WHERE event_id=${event.eventRef.id}`))[0]!.count,'0','published does not mean consumer processed');
      await assert.rejects(db.transaction(context(),options(),tx=>owner.getRouting(tx,routing.routingRef)),{code:'RESOURCE_NOT_FOUND'});
      for(const table of ['outbox_routings','outbox_deliveries','outbox_publications'])await assert.rejects(f.raw.unsafe(`UPDATE runtime.${table} SET record=record`),{code:'42501'});
    });
    await t.test('publication commit failure rolls back the last delivery and a completed enqueue proof can be retried',async()=>{
      const routing=await prepare(await source()),lease=await claim(routing),first=await enqueue(routing,0),second=await enqueue(routing,1);
      if(first.status!=='Completed'||second.status!=='Completed')throw new Error('missing queue proofs');await record(routing,lease,0,first.proof);
      const before=await counts();await assert.rejects(record(routing,lease,1,second.proof,true),/after publication facts/);assert.deepEqual(await counts(),before);
      assert.equal(await db.transaction(worker,options(),tx=>owner.publication(tx,routing.routingRef)),undefined);
      const complete=await record(routing,lease,1,second.proof);assert.equal(complete.publication!.deliveryRefs.length,2);
      const conflict=await enqueue(routing,1,{enqueue:async()=>({status:'Completed',data:{jobRef:ref('abh.job')}})});if(conflict.status!=='Completed')throw new Error('missing changed job');
      await assert.rejects(record(routing,lease,1,conflict.proof),{code:'IDEMPOTENCY_CONFLICT'});
    });
    await t.test('enqueue success followed by lease loss cannot mark publication; source and target substitutions are rejected',async()=>{
      const routing=await prepare(await source()),lease=await claim(routing),completed=await enqueue(routing,0);if(completed.status!=='Completed')throw new Error('missing proof');
      const release=await command('abh.work-leases.release',lease.leaseRef);await db.transaction(worker,options(),tx=>executeCommand(tx,release,async()=>{},async()=>(await leases.release(tx,release,lease.leaseRef,lease.workerId,lease.fencingToken)).leaseRef));
      await assert.rejects(record(routing,lease,0,completed.proof),{code:'PRECONDITION_FAILED'});
      assert.equal(await db.transaction(worker,options(),tx=>owner.publication(tx,routing.routingRef)),undefined);
      const replacement=await claim(routing);assert.equal(replacement.fencingToken,lease.fencingToken+1);await record(routing,replacement,0,completed.proof);
      const another=await prepare(await source()),anotherLease=await claim(another);await assert.rejects(record(another,anotherLease,0,completed.proof),{code:'AUTHORITY_REQUIRED'});
      await assert.rejects(enqueue({...routing,digest:'sha256:'+'0'.repeat(64)},0),{code:'IDEMPOTENCY_CONFLICT'});
    });
  });
  await t.test('current consumer admission and Service credential epoch are checked on semantic replay',async()=>{
    const event=await source(),sameCommand=await command('abh.runtime.consume-event',event),result=await consume(event,consumer,false,sameCommand),before=calls;
    await assert.rejects(consume(event,{...consumer,admit:async()=>{throw new CoreError('FORBIDDEN');}},false,sameCommand),{code:'FORBIDDEN'});assert.equal(calls,before);
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=2 WHERE id=${principal.id}`);
    await assert.rejects(consume(event),{code:'EPOCH_REVOKED'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=1 WHERE id=${principal.id}`);
    assert.deepEqual(await consume(event),result);
    const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(c,options(),tx=>executeCommand(tx,revoke,async()=>{},async()=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef));
    await assert.rejects(consume(event),{code:'EPOCH_REVOKED'});assert.equal(calls,before);
  });
});
