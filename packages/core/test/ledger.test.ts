import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { EntityRef, LedgerRecord, ReservationRecord } from '@abh/contracts';
import { Database, type TenantTransaction } from '../src/data/uow.ts';
import { CoreError } from '../src/internal/errors.ts';
import { LedgerOwner } from '../src/resources/ledger.ts';
import { executeCommand, inputDigest, type CommandIdentity } from '../src/data/journal.ts';
import { createDatabaseFixture, context, options } from './database-fixture.ts';

const ref=<T extends string='abh.action'>(type: T='abh.action' as T,id: string=randomUUID(),version=1): EntityRef & {type:T}=>({type,id,version});
const command=async(type: string,input: unknown,key=randomUUID()): Promise<CommandIdentity>=>({commandId:randomUUID(),type,idempotencyKey:key,digest:await inputDigest(input)});

test('Ledger and journal use real PostgreSQL atomicity and exact decimal admission', {timeout:120_000},async t=> {
  const f=await createDatabaseFixture(); t.after(()=>f.close());
  const db=await Database.connect(f.runtimeUrl,{max:8}); t.after(()=>db.close());
  const c=context(),other=context(),ledger=new LedgerOwner();
  // This fixture exercises internal owners. Public Identity/Control ingress is not bypassed by a public export.
  const authorized=async()=>{};
  const configure=async(limit='10',mode:LedgerRecord['meteringMode']='cumulative',id=randomUUID())=> {
    const input={id,scopeRef:ref('abh.organization',c.tenant.resourceOrganizationId),resourceType:'abh.resource.cost',meteringMode:mode,
      unit:'abh.unit.credit',periodRef:ref('abh.period'),limit};
    const cmd=await command('abh.ledgers.configure',input);
    let record:LedgerRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,authorized,async()=>{record=await ledger.configure(tx,cmd,input);return record.ledgerRef;}));
    return record!;
  };
  const reserve=async(records: LedgerRecord[],values: string[],requestRef=ref())=> {
    const input={requestRef,bindingRef:ref(),expiresAt:new Date(Date.now()+60_000).toISOString(),requirements:records.map((r,i)=>({ledgerRef:r.ledgerRef,amount:values[i]!}))};
    const cmd=await command('abh.reservations.reserve',input); let held:ReservationRecord[];
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,authorized,async()=>{held=await ledger.reserveAll(tx,cmd,input);return held[0]!.reservationRef;}));
    return held!;
  };
  const get=(id:string)=>db.transaction(c,{...options(),readOnly:true},tx=>ledger.get(tx,id));

  await t.test('identical command retries return original receipt; changed input conflicts and revoked replay is denied',async()=> {
    const input={id:randomUUID(),scopeRef:ref('abh.organization',c.tenant.resourceOrganizationId),resourceType:'abh.resource.cost',meteringMode:'cumulative' as const,unit:'abh.unit.credit',periodRef:ref('abh.period'),limit:'10'};
    const cmd=await command('abh.ledgers.configure',input);
    let calls=0;
    const execute=(tx:TenantTransaction)=>executeCommand(tx,cmd,authorized,async()=>{calls++;return (await ledger.configure(tx,cmd,input)).ledgerRef;});
    const results=await Promise.all([db.transaction(c,options(),execute),db.transaction(c,options(),execute)]);
    assert.equal(calls,1); assert.deepEqual(results[0]!.receipt,results[1]!.receipt);
    assert.equal(results.filter(r=>r.replayed).length,1);
    await assert.rejects(db.transaction(c,options(),tx=>executeCommand(tx,{...cmd,digest:'sha256:'+'a'.repeat(64)},authorized,async()=>ref())),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{throw new CoreError('FORBIDDEN');},async()=>ref())),{code:'FORBIDDEN'});
  });
  await t.test('same tenant CAS race admits only one claimant and stores no partial second reservation',async()=> {
    const l=await configure('1');
    const claims=await Promise.allSettled([reserve([l],['1']),reserve([l],['1'])]);
    assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((claims.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'VERSION_CONFLICT');
    assert.equal((await get(l.ledgerRef.id)).heldReservation,'1');
  });
  await t.test('all-or-nothing reservations roll back the first ledger when the later ledger is exhausted',async()=> {
    const a=await configure('10','cumulative','10000000-0000-4000-8000-000000000001');
    const b=await configure('1','cumulative','20000000-0000-4000-8000-000000000002');
    await assert.rejects(reserve([b,a],['2','5']),{code:'RESOURCE_EXHAUSTED'});
    assert.equal((await get(a.ledgerRef.id)).heldReservation,'0'); assert.equal((await get(b.ledgerRef.id)).heldReservation,'0');
  });
  await t.test('decimal limits remain exact above the JavaScript safe integer range',async()=> {
    const l=await configure('9007199254740993.123456789012');
    await reserve([l],['9007199254740993.123456789011']);
    const remaining=await get(l.ledgerRef.id);
    await reserve([remaining],['0.000000000001']);
    const full=await get(l.ledgerRef.id);
    assert.equal(full.heldReservation,'9007199254740993.123456789012');
    await assert.rejects(reserve([full],['0.000000000001']),{code:'RESOURCE_EXHAUSTED'});
    await assert.rejects(configure('0.0000000000001'),{code:'INVALID_ARGUMENT'});
  });
  await t.test('actual usage above estimate is recorded and freezes further expansion',async()=> {
    const l=await configure('5'); const [r]=await reserve([l],['3']);
    const input={reservationRef:r!.reservationRef,actualUsage:'7',receiptRef:ref('abh.operation-receipt')};
    const cmd=await command('abh.reservations.consume',input);
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,authorized,async()=> (await ledger.consume(tx,cmd,input)).reservationRef));
    const updated=await get(l.ledgerRef.id);
    assert.equal(updated.status,'Frozen');assert.equal(updated.heldReservation,'0');assert.equal(updated.confirmedUsage,'7');
    await assert.rejects(reserve([updated],['1']),{code:'RESOURCE_EXHAUSTED'});
    const rows=await db.transaction(c,options(),tx=>tx.owner('ResourceLedger')`SELECT record FROM resource.entries WHERE ledger_id=${l.ledgerRef.id}`);
    assert.equal(rows.length,3);const consumption=rows.find(row=>row.record.kind==='Consume')!.record;assert.equal(consumption.usageDelta,'7');assert.equal(consumption.heldDelta,'-3');
  });
  await t.test('capacity cannot be consumed, unknown effects cannot be released, completion returns capacity',async()=> {
    const l=await configure('2','capacity');const [r]=await reserve([l],['1']);
    const bad={reservationRef:r!.reservationRef,actualUsage:'1',receiptRef:ref('abh.operation-receipt')};
    const cmd=await command('abh.reservations.consume',bad);
    await assert.rejects(db.transaction(c,options(),tx=>ledger.consume(tx,cmd,bad)),{code:'INVALID_ARGUMENT'});
    const ambiguous={reservationRef:r!.reservationRef,evidence:{verdict:'Ambiguous',evidenceRef:ref()}};
    await assert.rejects(db.transaction(c,options(),tx=>ledger.release(tx,cmd,ambiguous as never)),{code:'INVALID_ARGUMENT'});
    assert.equal((await get(l.ledgerRef.id)).heldReservation,'1');
    const release={reservationRef:r!.reservationRef,evidence:{verdict:'Completed' as const,evidenceRef:ref('abh.operation-receipt')}};
    const releaseCmd=await command('abh.reservations.release',release);
    await db.transaction(c,options(),tx=>executeCommand(tx,releaseCmd,authorized,async()=> (await ledger.release(tx,releaseCmd,release)).reservationRef));
    const returned=await get(l.ledgerRef.id);assert.equal(returned.confirmedUsage,'0');assert.equal(returned.heldReservation,'0');
  });
  await t.test('Audit failure rolls back Ledger, entries, Receipt and Outbox',async()=> {
    const id=randomUUID();
    await f.admin`REVOKE INSERT ON data.audit_records FROM abh_runtime`;
    try { await assert.rejects(configure('1','cumulative',id),{code:'42501'}); }
    finally {await f.admin`GRANT INSERT ON data.audit_records TO abh_runtime`;}
    await assert.rejects(get(id),{code:'RESOURCE_NOT_FOUND'});
    const rows=await db.transaction(c,options(),tx=>tx.owner('ResourceLedger')`SELECT
      (SELECT count(*) FROM resource.entries WHERE ledger_id=${id}) AS entries,
      (SELECT count(*) FROM data.outbox WHERE aggregate_id=${id}) AS events,
      (SELECT count(*) FROM data.command_receipts WHERE record->'resultRef'->>'id'=${id}) AS receipts`);
    assert.deepEqual({...rows[0]},{entries:'0',events:'0',receipts:'0'});
  });
  await t.test('all amounts can be rebuilt from immutable entries and hidden refs share the missing-ref error',async()=> {
    const l=await configure('10');await reserve([l],['2.5']);
    const balances=await db.transaction(c,options(),tx=>tx.owner('ResourceLedger')`SELECT sum((record->>'heldDelta')::numeric)::text AS held,
      sum((record->>'limitDelta')::numeric)::text AS limit_amount FROM resource.entries WHERE ledger_id=${l.ledgerRef.id}`);
    assert.equal(balances[0]!.held,'2.5');assert.equal(balances[0]!.limit_amount,'10');
    await assert.rejects(db.transaction(other,options(),tx=>ledger.get(tx,l.ledgerRef.id)),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(db.transaction(other,options(),tx=>ledger.get(tx,randomUUID())),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('ResourceLedger')`UPDATE resource.entries SET record=record`),{code:'42501'});
  });
});
