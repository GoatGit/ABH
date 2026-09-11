import {DurableWaitPort,WaitContextDirectory,composeDurableExecutionPort} from '../src/durable/wait-port.ts';
import {validatePortResult} from '@abh/contracts/ports';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {EntityRef,GrantRecord,RegisterDurableWaitPayload,DurableWaitRecord} from '@abh/contracts';
import {DurableWaitOwner,executeDurableWait,type InstalledWaitCondition} from '../src/durable/waits.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {CoreError} from '../src/internal/errors.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
const ref=<T extends string>(type:T,id:string=randomUUID())=>({type,id,version:1 as const});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});

test('durable waits reread actual source facts and resolve once across signals, timers and cancellation',{timeout:60_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=f.database,c=context(),org=c.tenant.resourceOrganizationId,scope=ref('abh.organization',org),principal=ref('abh.principal');
  const worker=deriveVerifiedContext({...c.request,actor:{type:'Service',id:principal.id},purposeOfUse:'abh.runtime.deliver'}),owner=new DurableWaitOwner(),ledger=new LedgerOwner();
  const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],actionTypes:['abh.runtime.register-wait','abh.runtime.recheck-wait','abh.runtime.cancel-wait','abh.runtime.schedule-wakeup','abh.runtime.cancel-wakeup','abh.runtime.signal','abh.runtime.inspect'],purposeNames:['abh.runtime.deliver'],
    validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'wait fixture','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'wait service','Service',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    for(const subject of [scope,principal,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${subject.type},${subject.id},1)`;
  });
  const config=()=>({id:randomUUID(),scopeRef:scope,resourceType:'hello.wait-source',meteringMode:'cumulative' as const,unit:'hello.credit',periodRef:ref('abh.period'),limit:'10'});
  const source=async()=>{const value=config(),cmd=await command('abh.ledgers.configure',value);let result!:EntityRef;
    await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>result=(await ledger.configure(tx,cmd,value)).ledgerRef));return result;};
  let entered=0;
  const installed:InstalledWaitCondition={conditionRef:ref('hello.wait-condition'),eventTypes:['abh.ledger.balance-changed'],fenceRefs:async()=>[grant.grantRef],
    admit:async(tx,_input,target,permission)=>{await assertCurrentGrants(tx,{objectRef:target,scopeRefs:[scope],action:permission},[grant.grantRef]);},
    // Explicit Owner-intent fixture: a real durable Ledger fact shares the registration transaction.
    enterWaiting:async(tx,cmd)=>{entered++;return (await ledger.configure(tx,cmd,{...config(),resourceType:'hello.waiting-intent'})).ledgerRef;},
    readSource:async(tx,input)=>{const record=await ledger.get(tx,input.sourceRef.id);return {sourceRef:record.ledgerRef,eventOrdinal:0,satisfied:Number(record.heldReservation)>=1,evidenceRefs:[record.ledgerRef]};}};
  const input=async(dueAt=new Date(Date.now()+30_000).toISOString()):Promise<RegisterDurableWaitPayload>=>({ownerRef:ref('hello.waiting-owner'),waitKey:randomUUID(),dueAt,causeRef:scope,authorityRef:grant.grantRef,conditionRef:installed.conditionRef,sourceRef:await source()});
  const register=async(value:RegisterDurableWaitPayload,impl=installed,cmd?:CommandIdentity)=>executeDurableWait(db,worker,options(),cmd??await command('abh.runtime.register-wait',value),{kind:'Register',input:value},impl);
  const recheck=async(wait:DurableWaitRecord,event?:ReturnType<typeof ref<'abh.event'>>,impl=installed)=>{const value={waitRef:wait.waitRef,...(event?{triggerEventRef:event}:{})};return executeDurableWait(db,worker,options(),await command('abh.runtime.recheck-wait',value),{kind:'Recheck',input:value},impl);};
  const cancel=async(wait:DurableWaitRecord)=>{const value={waitRef:wait.waitRef,expectedVersion:wait.waitRef.version,reason:'Owner cancelled pending wait'};return executeDurableWait(db,worker,options(),await command('abh.runtime.cancel-wait',value),{kind:'Cancel',input:value},installed);};
  const satisfy=async(sourceRef:EntityRef)=>{
    const value={requestRef:ref('abh.action'),bindingRef:ref('abh.action'),requirements:[{ledgerRef:sourceRef,amount:'1'}],expiresAt:new Date(Date.now()+30_000).toISOString()},cmd=await command('abh.reservations.reserve',value);
    await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await ledger.reserveAll(tx,cmd,value))[0]!.reservationRef));
    return db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${sourceRef.id} ORDER BY aggregate_version DESC LIMIT 1`;return ref('abh.event',row!.id);});
  };
  const counts=()=>db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT (SELECT count(*) FROM runtime.waits) AS waits,(SELECT count(*) FROM runtime.wakeups) AS wakeups,(SELECT count(*) FROM resource.ledgers) AS ledgers,(SELECT count(*) FROM data.outbox) AS outbox,(SELECT count(*) FROM data.audit_records) AS audit,(SELECT count(*) FROM data.command_receipts) AS commands`;return {...row};});
  await t.test('signal before registration is recovered from source and same key never duplicates intent or wakeup',async()=>{
    const value=await input();await satisfy(value.sourceRef);const before=entered;
    const [first,second]=await Promise.all([register(value),register(value)]);assert.deepEqual(first,second);assert.equal(first.status,'Succeeded');assert.equal(entered,before+1);
    const wake=await db.transaction(worker,options(),tx=>owner.getWakeup(tx,first.wakeupRef!));assert.equal(wake.reason,'Condition');assert.equal(wake.source.sourceRef.version,2);
    await assert.rejects(register({...value,dueAt:new Date(Date.now()+50_000).toISOString()}),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(db.transaction(context(),options(),tx=>owner.get(tx,first.waitRef)),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(f.raw`UPDATE runtime.wakeups SET record=record`,{code:'42501'});
  });
  await t.test('pending condition stays pending; signal and timer converge on one persisted notification',async()=>{
    const value=await input(),pending=await register(value);assert.equal(pending.status,'Pending');assert.deepEqual(await recheck(pending),pending);
    const event=await satisfy(value.sourceRef),before=await counts();
    const [signal,timer]=await Promise.all([recheck(pending,event),recheck(pending)]);assert.deepEqual(signal,timer);assert.equal(signal.status,'Succeeded');
    assert.equal(Number((await counts()).wakeups),Number(before.wakeups)+1);assert.deepEqual(await recheck(pending,event),signal);
    const wake=await db.transaction(worker,options(),tx=>owner.getWakeup(tx,signal.wakeupRef!));assert.equal(wake.reason,'Condition');assert.deepEqual(wake.authorityRef,value.authorityRef);
  });
  await t.test('deadline notification does not fabricate a satisfied source or business result',async()=>{
    const value=await input(new Date(Date.now()-1000).toISOString()),result=await register(value);
    const wake=await db.transaction(worker,options(),tx=>owner.getWakeup(tx,result.wakeupRef!));assert.equal(result.status,'Succeeded');assert.equal(wake.reason,'Deadline');assert.equal(wake.source.satisfied,false);
    assert.equal((await db.transaction(worker,options(),tx=>ledger.get(tx,value.sourceRef.id))).heldReservation,'0');
  });
  await t.test('a real database deadline wakes an unsatisfied Pending wait once, and stale cancellation cannot rewrite it',async()=>{
    const value=await input();value.dueAt=new Date(Date.now()+300).toISOString();const pending=await register(value);assert.equal(pending.status,'Pending');
    const stale={waitRef:pending.waitRef,expectedVersion:2,reason:'invalid future version'},cmd=await command('abh.runtime.cancel-wait',stale);
    await assert.rejects(executeDurableWait(db,worker,options(),cmd,{kind:'Cancel',input:stale},installed),{code:'VERSION_CONFLICT'});
    await f.raw`SELECT pg_sleep(0.35)`;
    const [first,second]=await Promise.all([recheck(pending),recheck(pending)]);assert.deepEqual(first,second);
    assert.equal((await db.transaction(worker,options(),tx=>owner.getWakeup(tx,first.wakeupRef!))).reason,'Deadline');
    const payload={waitRef:pending.waitRef,expectedVersion:1,reason:'late cancellation'},late=await command('abh.runtime.cancel-wait',payload);
    let disposition;
    await db.transaction(worker,options(),tx=>executeCommand(tx,late,async()=>{},async()=>{const result=await owner.cancel(tx,late,payload,installed);disposition=result.disposition;return result.wait.waitRef;}));
    assert.equal(disposition,'AlreadyClaimed');
  });
  await t.test('cancellation and a satisfied signal race without reopening or duplicating a terminal wait',async()=>{
    const value=await input(),pending=await register(value),event=await satisfy(value.sourceRef),before=await counts();
    const results=await Promise.all([cancel(pending),recheck(pending,event)]);assert.deepEqual(results[0],results[1]);
    const current=results[0];assert.ok(['Cancelled','Succeeded'].includes(current.status));
    assert.equal(Number((await counts()).wakeups)-Number(before.wakeups),current.status==='Succeeded'?1:0);
    assert.deepEqual(await recheck(pending,event),current);assert.deepEqual(await cancel(pending),current);
    const other=await register(await input());assert.equal((await cancel(other)).status,'Cancelled');assert.equal((await recheck(other)).status,'Cancelled');
  });
  await t.test('failure after registration and resolution rolls back Owner intent, wait, wakeup, Audit and Outbox',async()=>{
    const value=await input(new Date(Date.now()-1000).toISOString()),before=await counts(),cmd=await command('abh.runtime.register-wait',value);
    await assert.rejects(db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{await owner.register(tx,cmd,value,installed);throw new Error('after wakeup');})),/after wakeup/);
    assert.deepEqual(await counts(),before);assert.equal((await register(value)).status,'Succeeded');
  });
  await t.test('source substitution, version gaps and forged signals fail closed',async()=>{
    const value=await input(),pending=await register(value);
    await assert.rejects(recheck(pending,ref('abh.event')),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(recheck(pending,undefined,{...installed,readSource:async()=>({sourceRef:ref('abh.ledger'),eventOrdinal:0,satisfied:true,evidenceRefs:[scope]})}),{code:'PRECONDITION_FAILED'});
    const event=await satisfy(value.sourceRef);
    await assert.rejects(recheck(pending,event,{...installed,readSource:async()=>pending.source}),{code:'PRECONDITION_FAILED'});
    const unrelated=await input(),unrelatedEvent=await satisfy(unrelated.sourceRef);await assert.rejects(recheck(pending,unrelatedEvent),{code:'FORBIDDEN'});
    assert.equal((await recheck(pending,event)).status,'Succeeded');
  });
  await t.test('advanced unsatisfied source watermarks persist; compensation finds missed signals without accepting regression',async()=>{
    const value=await input(),condition:InstalledWaitCondition={...installed,readSource:async(tx,input)=>{
      const fact=await installed.readSource(tx,input);return {...fact,satisfied:Number((await ledger.get(tx,input.sourceRef.id)).heldReservation)>=2};
    }},pending=await register(value,condition),event=await satisfy(value.sourceRef);
    const advanced=await recheck(pending,event,condition);assert.equal(advanced.status,'Pending');assert.equal(advanced.source.sourceRef.version,2);assert.equal(advanced.waitRef.version,2);
    await assert.rejects(recheck(advanced,undefined,{...condition,readSource:async()=>pending.source}),{code:'PRECONDITION_FAILED'});
    await satisfy(advanced.source.sourceRef);
    const candidates=await db.transaction(worker,options(),tx=>owner.pending(tx));assert.ok(candidates.some(ref=>ref.id===advanced.waitRef.id));
    assert.equal((await recheck(advanced,undefined,condition)).status,'Succeeded','source reread recovers a lost signal');
    const after=await db.transaction(worker,options(),tx=>owner.pending(tx));assert.ok(!after.some(ref=>ref.id===advanced.waitRef.id));
    const otherOrg=randomUUID(),other=deriveVerifiedContext({...worker.request,actingOrganizationId:otherOrg,resourceOrganizationId:otherOrg});
    assert.deepEqual(await db.transaction(other,options(),tx=>owner.pending(tx)),[]);
    await assert.rejects(db.transaction(worker,options(),tx=>owner.pending(tx,101)),{code:'INVALID_ARGUMENT'});
  });
  await t.test('recovery isolates exact installed authority before paging and still rechecks current admission',async()=>{
    const otherGrant:GrantRecord={...grant,grantRef:ref('abh.grant')};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${otherGrant.grantRef.id},${principal.id},${JSON.stringify(otherGrant)}::text::jsonb,${otherGrant.validFrom},${otherGrant.validUntil},'Active')`;
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${otherGrant.grantRef.id},1)`;
    });
    let allowed=true;
    const condition:InstalledWaitCondition={...installed,fenceRefs:async()=>[otherGrant.grantRef],admit:async(tx,input,target,permission)=>{
      assert.deepEqual(input.authorityRef,otherGrant.grantRef);
      await assertCurrentGrants(tx,{objectRef:target,scopeRefs:[scope],action:permission},[otherGrant.grantRef]);
      if(!allowed)throw new CoreError('FORBIDDEN');
    }};
    const foreign=await register(await input()),value={...await input(),authorityRef:otherGrant.grantRef},own=await register(value,condition);
    assert.deepEqual(await db.transaction(worker,options(),tx=>owner.pending(tx,1,undefined,condition.conditionRef,otherGrant.grantRef)),[own.waitRef]);
    assert.deepEqual(await db.transaction(worker,options(),tx=>owner.pending(tx,100,undefined,condition.conditionRef,{...otherGrant.grantRef,version:2})),[]);
    const contexts=new WaitContextDirectory(),contextRef=contexts.register(worker,[otherGrant.grantRef]),selection=structuredClone(otherGrant.grantRef);
    const port=new DurableWaitPort(db,contexts,{recoveryAuthorityRef:selection,condition,registration:async()=>value});selection.id=grant.grantRef.id;
    const call=()=>({callId:randomUUID(),requestContextRef:contextRef,target:{objectRef:own.waitRef,scopeRefs:[scope],action:'abh.runtime.recheck-wait'},deadline:new Date(Date.now()+5000).toISOString()});
    try{
      await satisfy(value.sourceRef);allowed=false;
      await assert.rejects(port.recoverPending(call(),{signal:new AbortController().signal}),{code:'FORBIDDEN'});
      assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,own.waitRef))).status,'Pending');allowed=true;
      assert.deepEqual((await port.recoverPending(call(),{signal:new AbortController().signal})).checkedRefs.map(ref=>ref.id),[own.waitRef.id]);
      assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,own.waitRef))).status,'Succeeded');
      assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,foreign.waitRef))).status,'Pending');
    }finally{contexts.revoke(contextRef);}
  });
  await t.test('failed recheck cannot leave a succeeded Wait without its wakeup',async()=>{
    const value=await input(),pending=await register(value),event=await satisfy(value.sourceRef),before=await counts(),payload={waitRef:pending.waitRef,triggerEventRef:event},cmd=await command('abh.runtime.recheck-wait',payload);
    await assert.rejects(db.transaction(worker,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{await owner.recheck(tx,cmd,payload,installed);throw new Error('after resolution');})),/after resolution/);
    assert.deepEqual(await counts(),before);assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,pending.waitRef))).status,'Pending');assert.equal((await recheck(pending,event)).status,'Succeeded');
  });
  await t.test('recovery rechecks independent ingress fences after candidate scanning',async()=>{
    const extra:GrantRecord={...grant,grantRef:ref('abh.grant')};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${extra.grantRef.id},${principal.id},${JSON.stringify(extra)}::text::jsonb,${extra.validFrom},${extra.validUntil},'Active')`;
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${extra.grantRef.id},1)`;
    });
    const wait=await register(await input());await satisfy(wait.sourceRef);
    const contexts=new WaitContextDirectory(),requestContextRef=contexts.register(worker,[extra.grantRef]);let interrupted=false;
    const port=new DurableWaitPort(db,contexts,{registration:async()=>{throw new Error('no registration');},condition:{...installed,fenceRefs:async()=>{
      // Fault injection at the scan-to-item boundary; the original condition Grant remains active.
      interrupted=true;await f.admin`UPDATE control.fences SET stop_flag=true,epoch=epoch+1 WHERE resource_organization_id=${org} AND scope_id=${extra.grantRef.id}`;
      return [grant.grantRef];
    }}});
    await assert.rejects(port.recoverPending({callId:randomUUID(),requestContextRef,target:{objectRef:wait.waitRef,scopeRefs:[scope],action:'abh.runtime.recheck-wait'},deadline:new Date(Date.now()+5000).toISOString()},
      {signal:new AbortController().signal}),{code:'EPOCH_REVOKED'});
    assert.equal(interrupted,true);assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,wait.waitRef))).status,'Pending');
  });
  await t.test('complete Wait Port persists signal/cancel receipts and revalidates opaque ContextRefs on replay',async()=>{
    const value={...await input(),ownerRef:ref('abh.action')},contexts=new WaitContextDirectory(),contextRef=contexts.register(worker,[grant.grantRef]);
    const port=new DurableWaitPort(db,contexts,{condition:{...installed,eventTypes:[...installed.eventTypes,'abh.ledger.created']},registration:async()=>value});
    const call=(action:string,objectRef:EntityRef)=>({callId:randomUUID(),requestContextRef:contextRef,target:{objectRef,scopeRefs:[scope],action},deadline:new Date(Date.now()+5000).toISOString()});
    const request={context:call('abh.runtime.schedule-wakeup',value.ownerRef),ownerRef:value.ownerRef,waitKey:value.waitKey,dueAt:value.dueAt,causeRef:value.causeRef},opts={signal:new AbortController().signal};
    const first=await port.scheduleWakeup(request,opts);assert.equal(first.status,'Completed');assert.equal(validatePortResult('DurableExecutionPort.scheduleWakeup',first).success,true);if(first.status!=='Completed')throw new Error('expected schedule');
    assert.deepEqual(await port.scheduleWakeup({...request,context:{...request.context,callId:randomUUID()}},opts),first);
    const event=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${value.sourceRef.id} ORDER BY aggregate_version LIMIT 1`;return ref('abh.event',row!.id);});
    const signal={context:call('abh.runtime.signal',value.ownerRef),ownerRef:value.ownerRef,waitKey:value.waitKey,committedEventRef:event};
    const accepted=await port.signal(signal,opts);assert.equal(accepted.status,'Completed');assert.equal(validatePortResult('DurableExecutionPort.signal',accepted).success,true);assert.deepEqual(await port.signal(signal,opts),accepted);
    assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,first.data.waitRef))).status,'Pending','accepted signal is not a satisfied condition');
    const cancellation={context:call('abh.runtime.cancel-wakeup',first.data.waitRef),waitRef:first.data.waitRef,expectedVersion:first.data.waitRef.version,reason:'caller cancelled'};
    const cancelled=await port.cancelWakeup(cancellation,opts);assert.equal(cancelled.status,'Completed');assert.equal(validatePortResult('DurableExecutionPort.cancelWakeup',cancelled).success,true);
    if(cancelled.status==='Completed')assert.equal(cancelled.data.disposition,'Prevented');assert.deepEqual(await port.cancelWakeup(cancellation,opts),cancelled);
    const inspect={context:call('abh.runtime.inspect',first.data.waitRef),subjectRef:first.data.waitRef};assert.equal((await port.inspect(inspect,opts)).status,'Completed');
    let delegated=0;const composed=composeDurableExecutionPort({enqueue:async()=>{delegated++;return {status:'Cancelled',effect:'None'};},inspect:async()=>{delegated++;return {status:'Cancelled',effect:'None'};},drain:async()=>({status:'Completed',data:{drained:true,remainingRefs:[],completedAt:new Date().toISOString()}})},port);
    assert.equal((await composed.inspect(inspect,opts)).status,'Completed');assert.equal(delegated,0);
    assert.deepEqual(await port.scheduleWakeup(request,{signal:AbortSignal.abort()}),{status:'Cancelled',effect:'None'});
    const uncertainValue={...await input(),ownerRef:ref('abh.action')},uncertainPort=new DurableWaitPort(db,contexts,{condition:installed,registration:async()=>uncertainValue});
    let locked!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>{locked=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
    const holding=f.admin.begin(async tx=>{await tx`LOCK TABLE runtime.waits IN SHARE MODE`;locked();await released;});await ready;
    const uncertainRequest={context:{...call('abh.runtime.schedule-wakeup',uncertainValue.ownerRef),deadline:new Date(Date.now()+150).toISOString()},ownerRef:uncertainValue.ownerRef,waitKey:uncertainValue.waitKey,dueAt:uncertainValue.dueAt,causeRef:uncertainValue.causeRef};
    let tracked;
    try{tracked=await uncertainPort.scheduleWakeup(uncertainRequest,opts);assert.equal(tracked.status,'Tracked');assert.equal(validatePortResult('DurableExecutionPort.scheduleWakeup',tracked).success,true);}
    finally{release();await holding;}
    const recovered=await uncertainPort.scheduleWakeup({...uncertainRequest,context:call('abh.runtime.schedule-wakeup',uncertainValue.ownerRef)},opts);assert.equal(recovered.status,'Completed');
    if(recovered.status==='Completed'&&tracked!.status==='Tracked')assert.equal(recovered.data.waitRef.id,tracked!.trackingRef.id);
    assert.equal((await port.scheduleWakeup({} as never,opts)).status,'Rejected');assert.equal((await composed.inspect({} as never,opts)).status,'Rejected');
    await satisfy(uncertainValue.sourceRef);
    const recoveredPort=new DurableWaitPort(db,contexts,{condition:installed,registration:async()=>uncertainValue});
    const sweep=await recoveredPort.recoverPending(call('abh.runtime.inspect',recovered.status==='Completed'?recovered.data.waitRef:first.data.waitRef),opts);
    assert.ok(sweep.checkedRefs.some(ref=>recovered.status==='Completed'&&ref.id===recovered.data.waitRef.id));
    if(recovered.status==='Completed')assert.equal((await db.transaction(worker,options(),tx=>owner.get(tx,recovered.data.waitRef))).status,'Succeeded');
    contexts.revoke(contextRef);assert.equal((await port.scheduleWakeup(request,opts)).status,'Rejected');
    assert.throws(()=>contexts.register({...worker},[grant.grantRef]),{code:'TENANT_CONTEXT_REQUIRED'});
    await assert.rejects(f.raw`UPDATE runtime.wait_port_receipts SET record=record`,{code:'42501'});
  });
  await t.test('saved Command replay still requires current admission and service credential epoch',async()=>{
    const value=await input(),cmd=await command('abh.runtime.register-wait',value),saved=await register(value,installed,cmd),before=entered;
    await assert.rejects(register(value,{...installed,admit:async()=>{throw new CoreError('FORBIDDEN');}},cmd),{code:'FORBIDDEN'});assert.equal(entered,before);
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=2 WHERE id=${principal.id}`);
    await assert.rejects(register(value,installed,cmd),{code:'EPOCH_REVOKED'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=1 WHERE id=${principal.id}`);
    assert.deepEqual(await register(value,installed,cmd),saved);
  });
});
