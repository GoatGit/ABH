import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {CommitmentRecord,LedgerRecord,ReservationRecord,SettlementRecord} from '@abh/contracts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('commitments atomically replace holds and deduplicate verified settlements',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=f.database,c=context(),owner=new LedgerOwner();
  const configure=async(limit='20',meteringMode:LedgerRecord['meteringMode']='cumulative')=>{
    const input={id:randomUUID(),scopeRef:ref('abh.organization',c.tenant.resourceOrganizationId),resourceType:'abh.resource.cost',meteringMode,unit:'abh.unit.credit',periodRef:ref('abh.period'),limit};
    const cmd=await command('abh.ledgers.configure',input);let ledger:LedgerRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{ledger=await owner.configure(tx,cmd,input);return ledger.ledgerRef;}));return ledger!;
  };
  const reserve=async(ledger:LedgerRecord,amount='5')=>{
    const subject=ref('abh.action'),input={requestRef:ref('abh.command'),bindingRef:subject,expiresAt:new Date(Date.now()+60_000).toISOString(),requirements:[{ledgerRef:ledger.ledgerRef,amount}]};
    const cmd=await command('abh.reservations.reserve',input);let reservations:ReservationRecord[];
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{reservations=await owner.reserveAll(tx,cmd,input);return reservations[0]!.reservationRef;}));return {subject,reservation:reservations![0]!};
  };
  const open=async(ledger:LedgerRecord,reserved:Awaited<ReturnType<typeof reserve>>,upperBound='5')=>{
    const current=await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id));
    const input={reservationRefs:[reserved.reservation.reservationRef],ledgerRef:current.ledgerRef,subjectRef:reserved.subject,policyRef:ref('abh.artifact'),upperBound,evidenceRefs:[ref('abh.artifact')]};
    const cmd=await command('abh.commitments.open',input);let commitment:CommitmentRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{commitment=await owner.openCommitment(tx,cmd,input);return commitment.commitmentRef;}));return commitment!;
  };
  const settle=async(commitment:CommitmentRecord,actualUsage:string,sourceRef=ref('abh.operation-receipt'))=>{
    const input={commitmentRef:commitment.commitmentRef,actualUsage,sourceRef},cmd=await command('abh.commitments.settle',input);let result:SettlementRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await owner.settleCommitment(tx,cmd,input);return result.settlementRef;}));return result!;
  };
  await t.test('Hold becomes Commitment in one transaction with no double charge',async()=>{
    const ledger=await configure(),reserved=await reserve(ledger),commitment=await open(ledger,reserved);
    const balance=await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id));
    assert.equal(balance.heldReservation,'0');assert.equal(balance.openCommitment,'5');assert.equal(balance.confirmedUsage,'0');
    const historical=await db.transaction(c,options(),tx=>owner.getReservation(tx,reserved.reservation.reservationRef.id));
    assert.equal(historical.status,'Committed');assert.equal(historical.amount,'5');
    assert.equal(commitment.remaining,'5');
    const releaseCmd=await command('abh.reservations.release',historical);
    await assert.rejects(db.transaction(c,options(),tx=>owner.release(tx,releaseCmd,{reservationRef:historical.reservationRef,evidence:{verdict:'ConfirmedNoEffect',evidenceRef:ref('abh.artifact')}})),{code:'OBLIGATION_CONFLICT'});
  });
  await t.test('insufficient conversion bound and capacity mode preserve the original Hold',async()=>{
    const ledger=await configure('6'),reserved=await reserve(ledger);
    await assert.rejects(open(ledger,reserved,'7'),{code:'RESOURCE_EXHAUSTED'});
    assert.equal((await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id))).heldReservation,'5');
    const capacity=await configure('6','capacity'),capacityHold=await reserve(capacity);
    await assert.rejects(open(capacity,capacityHold),{code:'OBLIGATION_CONFLICT'});
  });
  await t.test('source-version replay is charged once; mismatching amounts cannot replace a settlement',async()=>{
    const ledger=await configure(),commitment=await open(ledger,await reserve(ledger));const source=ref('abh.operation-receipt');
    const first=await settle(commitment,'2',source),again=await settle(commitment,'2',source);
    assert.deepEqual(first,again);await assert.rejects(settle(commitment,'3',source),{code:'IDEMPOTENCY_CONFLICT'});
    const current=await db.transaction(c,options(),tx=>owner.getCommitment(tx,commitment.commitmentRef.id));
    assert.equal(current.remaining,'3');const balance=await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id));
    assert.equal(balance.confirmedUsage,'2');assert.equal(balance.openCommitment,'3');
  });
  await t.test('settlement beyond the verified bound records all actual usage, zero remaining and explicit overrun',async()=>{
    const ledger=await configure('20'),commitment=await open(ledger,await reserve(ledger));
    const settlement=await settle(commitment,'7');assert.equal(settlement.overrunAmount,'2');assert.equal(settlement.usageAmount,'7');assert.equal(settlement.commitmentDelta,'-5');
    const balance=await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id));assert.equal(balance.status,'Frozen');assert.equal(balance.openCommitment,'0');assert.equal(balance.confirmedUsage,'7');
    const current=await db.transaction(c,options(),tx=>owner.getCommitment(tx,commitment.commitmentRef.id));assert.equal(current.remaining,'0');
    const late=await settle(current,'1');assert.equal(late.overrunAmount,'1');
    const final=await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id));assert.equal(final.confirmedUsage,'8');assert.equal(final.status,'Frozen');
    const rebuilt=await db.transaction(c,options(),tx=>tx.owner('ResourceLedger')`SELECT sum((record->>'heldDelta')::numeric)::text AS held,
      sum((record->>'commitmentDelta')::numeric)::text AS commitment,sum((record->>'usageDelta')::numeric)::text AS usage FROM resource.entries WHERE ledger_id=${ledger.ledgerRef.id}`);
    assert.deepEqual({...rebuilt[0]},{held:'0',commitment:'0',usage:'8'});
  });
  await t.test('closing retains finite tail liability until settlement and current evidence allow final closure',async()=>{
    const ledger=await configure('10'),commitment=await open(ledger,await reserve(ledger));
    const evidenceRef=ref('abh.artifact');
    const beginInput={commitmentRef:commitment.commitmentRef,tailBound:'2',evidenceRef},beginCmd=await command('abh.commitments.begin-close',beginInput);
    const closing=await db.transaction(c,options(),tx=>owner.beginCloseCommitment(tx,beginCmd,beginInput,async()=>{}));
    assert.equal(closing.status,'Closing');assert.equal(closing.remaining,'2');
    const closeCmd=await command('abh.commitments.close',closing);
    await assert.rejects(db.transaction(c,options(),tx=>owner.closeCommitment(tx,closeCmd,{commitmentRef:closing.commitmentRef,evidenceRef},async()=>{})),{code:'OBLIGATION_CONFLICT'});
    await settle(closing,'2');
    const cleared=await db.transaction(c,options(),tx=>owner.getCommitment(tx,closing.commitmentRef.id));
    await assert.rejects(db.transaction(c,options(),tx=>owner.closeCommitment(tx,closeCmd,{commitmentRef:cleared.commitmentRef,evidenceRef},async()=>{throw new Error('unstable watermark');})),/unstable watermark/);
    const closed=await db.transaction(c,options(),tx=>owner.closeCommitment(tx,closeCmd,{commitmentRef:cleared.commitmentRef,evidenceRef},async()=>{}));
    assert.equal(closed.status,'Closed');assert.equal(closed.remaining,'0');
    await assert.rejects(settle(closed,'1'),{code:'OBLIGATION_CONFLICT'});
    const balance=await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id));assert.equal(balance.openCommitment,'0');assert.equal(balance.confirmedUsage,'2');
  });
  await t.test('bound adjustment reserves only the difference and fails atomically when over capacity',async()=>{
    const ledger=await configure('8'),commitment=await open(ledger,await reserve(ledger));
    const input={commitmentRef:commitment.commitmentRef,newUpperBound:'7',evidenceRef:ref('abh.artifact')},cmd=await command('abh.commitments.adjust',input);
    const adjusted=await db.transaction(c,options(),tx=>owner.adjustCommitment(tx,cmd,input,async()=>{}));
    assert.equal(adjusted.remaining,'7');
    const secondCmd=await command('abh.commitments.adjust',{...input,newUpperBound:'9'});
    await assert.rejects(db.transaction(c,options(),tx=>owner.adjustCommitment(tx,secondCmd,{...input,commitmentRef:adjusted.commitmentRef,newUpperBound:'9'},async()=>{})),{code:'RESOURCE_EXHAUSTED'});
    assert.equal((await db.transaction(c,options(),tx=>owner.get(tx,ledger.ledgerRef.id))).openCommitment,'7');
  });

});
