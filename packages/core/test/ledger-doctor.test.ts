import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { EntityRef } from '@abh/contracts';
import { validateContract } from '@abh/contracts/schema';
import { inspectLedgerBalanceAudit } from '../src/diagnostics.ts';
import { LedgerOwner } from '../src/resources/ledger.ts';
import { executeCommand,inputDigest,type CommandIdentity } from '../src/data/journal.ts';
import { createDatabaseFixture,context,options,seedLedgerCatalog } from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1):EntityRef & {type:T}=>({type,id,version});
const command=async(type:string,input:unknown):Promise<CommandIdentity>=>({
  commandId:randomUUID(),type,idempotencyKey:randomUUID(),digest:await inputDigest(input)});

test('ledger doctor audits balances and unresolved liabilities without repair', {timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const c=context(),ledger=new LedgerOwner(),ledgerId=randomUUID();
  const catalog=await seedLedgerCatalog(f.database,c,'abh.unit.credit');
  const input={id:ledgerId,scopeRef:ref('abh.organization',c.tenant.resourceOrganizationId),
    resourceType:'abh.resource.cost',meteringMode:'cumulative' as const,unit:'abh.unit.credit',
    periodRef:catalog.periodRef,limit:'10',purposeNames:['abh.action.prepare','abh.resource.read']};
  const configure=await command('abh.ledgers.configure',input);
  await f.database.transaction(c,options(),tx=>executeCommand(tx,configure,async()=>{},
    async()=>(await ledger.configure(tx,configure,input)).ledgerRef));
  const reserveInput={requestRef:ref('abh.operation-plan'),bindingRef:ref('abh.action'),
    expiresAt:new Date(Date.now()+60_000).toISOString(),requirements:[{ledgerRef:{type:'abh.ledger',id:ledgerId,version:1},amount:'2.5'}]};
  const reserve=await command('abh.reservations.reserve',reserveInput);
  await f.database.transaction(c,options(),tx=>executeCommand(tx,reserve,async()=>{},
    async()=>(await ledger.reserveAll(tx,reserve,reserveInput))[0]!.reservationRef));
  const invoke=async(ledgerIdx=randomUUID(),organizationId=c.tenant.resourceOrganizationId,timeoutMs=10_000)=>
    inspectLedgerBalanceAudit({connectionString:f.runtimeUrl,signal:new AbortController().signal,
      organizationId,ledgerId:ledgerIdx,timeoutMs});

  await t.test('consistent immutable entries rebuild balances and reconcile Holds',async()=>{
    const result=await invoke(ledgerId),item=result.ledgers[0];
    assert.equal(result.status,'Passed');assert.equal(result.errorCode,null);
    assert.equal(result.violationCount,0);assert.ok(item);
    assert.equal(item.entryCount,2);assert.equal(item.heldReservationCount,1);
    assert.equal(item.expiredHeldCount,0);assert.deepEqual(item.stopReasons,[]);
    assert.equal(item.recomputed.heldReservation,'2.5');
    assert.equal(validateContract('CliDoctorLedgerResult',result).success,true,JSON.stringify(result));
  });
  await t.test('unknown ledger has no invented diagnostic',async()=>{
    const result=await invoke();
    assert.equal(result.status,'Failed');assert.equal(result.errorCode,'PRECONDITION_FAILED');
    assert.deepEqual(result.ledgers,[]);assert.equal(result.violationCount,1);
  });
  await t.test('column balance drift is reported without changing data',async()=>{
    await f.admin`UPDATE resource.ledgers SET confirmed_usage='9' WHERE id=${ledgerId}`;
    try{
      const result=await invoke(ledgerId),item=result.ledgers[0];
      assert.equal(result.status,'Failed');assert.equal(result.errorCode,'PRECONDITION_FAILED');
      assert.ok(item);assert.deepEqual(item.stopReasons,['BALANCE_DRIFT']);
      assert.equal(result.violationCount,1);
    }finally{await f.admin`UPDATE resource.ledgers SET confirmed_usage='0' WHERE id=${ledgerId}`;}
  });
  await t.test('ledger version drift is reported without changing data',async()=>{
    await f.admin`UPDATE resource.ledgers SET version=version+1 WHERE id=${ledgerId}`;
    try{
      const result=await invoke(ledgerId);
      assert.deepEqual(result.ledgers[0]?.stopReasons,['LEDGER_RECORD_DRIFT']);
    }finally{await f.admin`UPDATE resource.ledgers SET version=version-1 WHERE id=${ledgerId}`;}
  });
  await t.test('expired Holds remain visible liabilities',async()=>{
    await f.admin`UPDATE resource.reservations SET expires_at=now()-interval '1 second' WHERE ledger_id=${ledgerId}`;
    try{
      const result=await invoke(ledgerId),item=result.ledgers[0];
      assert.deepEqual(item?.stopReasons,['EXPIRED_HOLD']);assert.equal(item?.expiredHeldCount,1);
    }finally{await f.admin`UPDATE resource.reservations SET expires_at=now()+interval '1 hour' WHERE ledger_id=${ledgerId}`;}
  });
});
