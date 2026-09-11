import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {EntityRef,LedgerRecord,ModelRoute} from '@abh/contracts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {CoreError} from '../src/internal/errors.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {ModelGatewayOwner,callModel,type ModelAdapterPort} from '../src/mission/model-gateway.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const route = (allowedModels:string[]=['hello.model']):ModelRoute=>({routeRef:{type:'abh.model-route',id:randomUUID(),version:1},
  resourceOrganizationId:'',allowedModels:allowedModels as ModelRoute['allowedModels'],purposeOfUse:'abh.mission.manage',
  dataClass:'abh.data.internal',region:'local',maxCostMicros:1000});

test('model gateway fixes route admission and persists one-way call transitions',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const base=context(),c=deriveVerifiedContext({...base.request,purposeOfUse:'abh.mission.manage'});
  const owner=new ModelGatewayOwner(),value=route();value.resourceOrganizationId=c.tenant.resourceOrganizationId;
  await f.admin`INSERT INTO core.model_routes(resource_organization_id,id,created_by,updated_by,purpose_names,record)
    VALUES (${value.resourceOrganizationId},${value.routeRef.id},${c.tenant.actor.id},${c.tenant.actor.id},
      ARRAY[${value.purposeOfUse}]::text[],${JSON.stringify(value)}::text::jsonb)`;
  const ledgerOwner=new LedgerOwner();
  const ledgerCommand=async(operation:string,input:unknown):Promise<CommandIdentity>=>
    ({commandId:randomUUID(),type:`abh.test.${operation}`,idempotencyKey:randomUUID(),digest:await inputDigest(input)});
  const configureLedger=(limit:string,mode:LedgerRecord['meteringMode']):Promise<LedgerRecord>=>{
    const id=randomUUID(),recordInput={id,scopeRef:{type:'abh.organization' as const,id:c.tenant.resourceOrganizationId,version:1 as const},
      resourceType:'abh.resource.model-usage',meteringMode:mode,unit:'abh.unit.token',periodRef:{type:'abh.period' as const,id:randomUUID(),version:1 as const},limit};
    return f.database.transaction(c,options(),async tx=>ledgerOwner.configure(tx,await ledgerCommand('configure',recordInput),recordInput));
  };
  const budget=(ledger:LedgerRecord)=>({ledgerRef:ledger.ledgerRef,amount:'2',
    expiresAt:new Date(Date.now()+60_000).toISOString()});
  const responseStorage=()=>({retentionPolicyRef:{type:'abh.retention-policy',id:randomUUID(),version:1}});
  const held=(ledger:LedgerRecord)=>f.database.transaction(c,{...options(),readOnly:true},async tx=>{
    const current=await ledgerOwner.get(tx,ledger.ledgerRef.id);
    const links=await tx.owner('ModelGateway')`SELECT * FROM core.model_call_reservations WHERE budget_ledger_id=${ledger.ledgerRef.id}`;
    return {current,links};
  });
  const input=(ledger?:LedgerRecord)=>({routeRef:value.routeRef,callerRef:{type:'abh.invocation' as const,id:randomUUID(),version:1},
    selectedModel:'hello.model',inputManifestRef:{type:'abh.context' as const,id:randomUUID(),version:1},
    inputDigest:'sha256:'+'1'.repeat(64),maxCostMicros:900,
    ...(ledger?{budget:budget(ledger)}:{})});

  await t.test('route admission rejects model, version, purpose and budget drift',async()=>{
    const first=input();
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.prepare(tx,{...first,callRef:{type:'abh.model-call',id:randomUUID(),version:1},routeRef:{...value.routeRef,version:2}})),{code:'VERSION_CONFLICT'});
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.prepare(tx,{...first,callRef:{type:'abh.model-call',id:randomUUID(),version:1},selectedModel:'hello.other'})),{code:'PRECONDITION_FAILED'});
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.prepare(tx,{...first,callRef:{type:'abh.model-call',id:randomUUID(),version:1},maxCostMicros:1001})),{code:'LIMIT_EXCEEDED'});
    const other=deriveVerifiedContext({...context().request,purposeOfUse:'abh.artifact.read'});
    await assert.rejects(f.database.transaction(other,options(),tx=>owner.prepare(tx,{...first,callRef:{type:'abh.model-call',id:randomUUID(),version:1}})),{code:'RESOURCE_NOT_FOUND'});
  });

  const cumulative=await configureLedger('10','cumulative');
  const value1=input(cumulative),call1={type:'abh.model-call' as const,id:randomUUID(),version:1};
  const callRef=call1;
  await t.test('same host call id is idempotent and conflicts only when the request changes',async()=>{
    const first=await f.database.transaction(c,options(),tx=>owner.prepare(tx,{...value1,callRef}));
    const replayed=await f.database.transaction(c,options(),tx=>owner.prepare(tx,{...value1,callRef}));
    assert.deepEqual(replayed,first);
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.prepare(tx,{...value1,callRef,inputDigest:'sha256:'+'2'.repeat(64)})),{code:'IDEMPOTENCY_CONFLICT'});
    assert.equal(first.status,'Prepared');
    const replay=await f.database.transaction(c,options(),tx=>owner.prepare(tx,{...value1,callRef}));
    assert.deepEqual(replay,first);
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.prepare(tx,{...value1,callRef,budget:{...value1.budget!,amount:'3'}})),{code:'IDEMPOTENCY_CONFLICT'});
    const {current,links}=await held(cumulative);
    assert.equal(current.heldReservation,'2'); assert.equal(links.length,1);
  });

  await t.test('adapter success completes once and exposes the frozen route request',async()=>{
    let request:unknown;
    const adapter:ModelAdapterPort={call:async(requested)=>{
      request=requested;
      return {usage:{inputTokens:12,outputTokens:34,estimated:true},rawResponse:{text:'hello'}};
    }};
    const result=await callModel(f.database,c,options(),{...value1,callRef:call1.id,signal:new AbortController().signal,outputValidator:async()=>{},responseStorage:responseStorage()},adapter);
    assert.equal(result.outcome,'Completed');assert.equal(result.record.usage?.outputTokens,34);
    assert.deepEqual((request as {route:ModelRoute}).route,value);
    const persisted=await f.database.transaction(c,options(),tx=>owner.get(tx,call1.id));
    assert.equal(persisted.status,'Completed');
    const artifactOwner=new InlineArtifactOwner();
    const response=await f.database.transaction(c,options(),tx=>artifactOwner.read(tx,persisted.rawResponseRef!,async()=>{}));
    const responseDocument=JSON.parse(new TextDecoder().decode(response.bytes));
    assert.equal(response.record.ownerRef.id,call1.id);
    assert.equal(response.record.mediaType,'application/vnd.abh.raw-transport+json');
    assert.equal(response.record.dataClass,value.dataClass);
    assert.equal(responseDocument.response.text,'hello');
    const consumed=await held(cumulative);
    assert.equal(consumed.current.heldReservation,'0'); assert.equal(consumed.current.confirmedUsage,'46');
    assert.equal(consumed.links[0]!.status,'Consumed');
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.start(tx,call1)),{code:'PRECONDITION_FAILED'});
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.complete(tx,{callRef:call1,usage:{inputTokens:1,outputTokens:1,estimated:true}})),{code:'PRECONDITION_FAILED'});
  });

  const call2={type:'abh.model-call' as const,id:randomUUID(),version:1};
  const ambiguousLedger=await configureLedger('3','cumulative');
  await t.test('adapter ambiguity leaves InFlight rather than fabricating failure',async()=>{
    const result=await callModel(f.database,c,options(),{...input(ambiguousLedger),callRef:call2.id,signal:new AbortController().signal,outputValidator:async()=>{},responseStorage:responseStorage()},
      {call:async()=>{throw new Error('private provider timeout');}});
    assert.equal(result.outcome,'Unknown');assert.equal(result.record.status,'InFlight');
    const ambiguous=await held(ambiguousLedger);
    assert.equal(ambiguous.current.heldReservation,'2'); assert.equal(ambiguous.links[0]!.status,'Linked');
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.start(tx,call2)),{code:'PRECONDITION_FAILED'});
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.reconcile(tx,{
      callRef:{...call2,version:2},verdict:'Completed',usage:{inputTokens:-1,outputTokens:9,estimated:true}
    })),{code:'INVALID_ARGUMENT'});
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.reconcile(tx,{
      callRef:{...call2,version:2},verdict:'Failed',noEffectEvidenceRef:{type:'abh.model-call',id:randomUUID(),version:1}
    })),{code:'INVALID_ARGUMENT'});
    const reconciled=await f.database.transaction(c,options(),tx=>owner.reconcile(tx,{
      callRef:{...call2,version:2},verdict:'Completed',usage:{inputTokens:2,outputTokens:6,estimated:false}
    }));
    assert.equal(reconciled.status,'Completed');
    const settled=await held(ambiguousLedger);
    assert.equal(settled.current.heldReservation,'0'); assert.equal(settled.current.confirmedUsage,'8');
    assert.equal(settled.links[0]!.status,'Consumed');
  });

  await t.test('reservation reconciliation rejects TTL-only failure but accepts confirmed no-effect',async()=>{
    const unknownLedger=await configureLedger('2','cumulative');
    const call={type:'abh.model-call' as const,id:randomUUID(),version:1};
    await f.database.transaction(c,options(),tx=>owner.prepare(tx,{...input(unknownLedger),callRef:call}));
    await f.database.transaction(c,options(),tx=>owner.start(tx,call));
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.fail(tx,call)),{code:'PRECONDITION_FAILED'});
    const unresolved=await held(unknownLedger), unresolvedCall=await f.database.transaction(c,options(),tx=>owner.get(tx,call.id));
    assert.equal(unresolvedCall.status,'InFlight'); assert.equal(unresolved.current.heldReservation,'2');
    assert.equal(unresolved.links[0]!.status,'Linked');
    const failed=await f.database.transaction(c,options(),tx=>owner.reconcile(tx,{
      callRef:{...call,version:2},verdict:'Failed',noEffectEvidenceRef:{type:'abh.artifact',id:randomUUID(),version:1}
    }));
    const resolved=await held(unknownLedger);
    assert.equal(failed.status,'Failed'); assert.equal(resolved.current.heldReservation,'0');
    assert.equal(resolved.links[0]!.status,'Released');
  });

  await t.test('explicit failure is a one-way InFlight transition and tenant reads are isolated',async()=>{
    const failureLedger=await configureLedger('3','cumulative');
    const call={type:'abh.model-call' as const,id:randomUUID(),version:1},value2=input(failureLedger);
    await f.database.transaction(c,options(),tx=>owner.prepare(tx,{...value2,callRef:call}));
    const started=await f.database.transaction(c,options(),tx=>owner.start(tx,call));
    const noEffect={type:'abh.artifact' as const,id:randomUUID(),version:1 as const};
    const failed=await f.database.transaction(c,options(),tx=>owner.fail(tx,{callRef:started.callRef,noEffectEvidenceRef:noEffect}));
    assert.equal(failed.status,'Failed');
    const released=await held(failureLedger);
    assert.equal(released.current.heldReservation,'0'); assert.equal(released.links[0]!.status,'Released');
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.fail(tx,call)),{code:'PRECONDITION_FAILED'});
    const other=deriveVerifiedContext({...context().request,purposeOfUse:'abh.mission.manage'});
    await assert.rejects(f.database.transaction(other,options(),tx=>owner.get(tx,call.id)),{code:'RESOURCE_NOT_FOUND'});
  });

  await t.test('capacity budgets release after success and exhausted budgets never reach the adapter',async()=>{
    const capacity=await configureLedger('3','capacity');
    const call={type:'abh.model-call' as const,id:randomUUID(),version:1};
    const result=await callModel(f.database,c,options(),{...input(capacity),callRef:call.id,signal:new AbortController().signal,outputValidator:async()=>{},responseStorage:responseStorage()},
      {call:async()=>({usage:{inputTokens:4,outputTokens:5,estimated:false},rawResponse:{text:'capacity'}})});
    assert.equal(result.outcome,'Completed');
    assert.equal(result.outcome,'Completed');
    const [ledgerRow]=await f.admin`SELECT held_reservation,confirmed_usage FROM resource.ledgers WHERE id=${capacity.ledgerRef.id}`;
    const [linkRow]=await f.admin`SELECT status FROM core.model_call_reservations WHERE budget_ledger_id=${capacity.ledgerRef.id}`;
    assert.equal(ledgerRow!.held_reservation,'0'); assert.equal(ledgerRow!.confirmed_usage,'0');
    assert.equal(linkRow!.status,'Released');

    const small=await configureLedger('1','cumulative');
    await assert.rejects(f.database.transaction(c,options(),tx=>owner.prepare(tx,{...input(small),callRef:{type:'abh.model-call',id:randomUUID(),version:1}})),{code:'RESOURCE_EXHAUSTED'});
    assert.equal((await held(small)).current.heldReservation,'0');
  });

  await t.test('oversized raw transport keeps the call in-flight and budget held',async()=>{
    const oversizedLedger=await configureLedger('4','cumulative');
    const call={type:'abh.model-call' as const,id:randomUUID(),version:1};
    const result=await callModel(f.database,c,options(),{...input(oversizedLedger),callRef:call.id,
      signal:new AbortController().signal,outputValidator:async()=>{},responseStorage:responseStorage()},{call:async()=>({usage:{inputTokens:1,outputTokens:1,estimated:true},
        rawResponse:{text:'x'.repeat(70_000)}})});
    const persisted=await f.database.transaction(c,options(),tx=>owner.get(tx,call.id));
    const [ledgerRow]=await f.admin`SELECT held_reservation FROM resource.ledgers WHERE id=${oversizedLedger.ledgerRef.id}`;
    assert.equal(result.outcome,'Unknown'); assert.equal(persisted.status,'InFlight');
    assert.equal(persisted.rawResponseRef,undefined); assert.equal(ledgerRow!.held_reservation,'2');
  });

  await t.test('output validation failure keeps the call in-flight and budget held',async()=>{
    const invalidLedger=await configureLedger('4','cumulative');
    const call={type:'abh.model-call' as const,id:randomUUID(),version:1};
    const result=await callModel(f.database,c,options(),{...input(invalidLedger),callRef:call.id,
      signal:new AbortController().signal,
      outputValidator:async()=>{throw new CoreError('INVALID_ARGUMENT');},responseStorage:responseStorage()},
      {call:async()=>({usage:{inputTokens:7,outputTokens:8,estimated:false},rawResponse:{invalid:true}})});
    const persisted=await f.database.transaction(c,options(),tx=>owner.get(tx,call.id));
    const [ledgerRow]=await f.admin`SELECT held_reservation,confirmed_usage FROM resource.ledgers WHERE id=${invalidLedger.ledgerRef.id}`;
    assert.equal(result.outcome,'Unknown'); assert.equal(persisted.status,'InFlight');
    assert.equal(persisted.rawResponseRef,undefined); assert.equal(ledgerRow!.held_reservation,'2');
    assert.equal(ledgerRow!.confirmed_usage,'0');
  });
});
