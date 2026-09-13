import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { EntityRef } from '@abh/contracts';
import { inspectLedgerBalanceAudit } from '../src/diagnostics.ts';
import { LedgerCatalogOwner,LedgerOwner } from '../src/resources/ledger.ts';
import { CoreError } from '../src/internal/errors.ts';
import { executeCommand,inputDigest,type CommandIdentity } from '../src/data/journal.ts';
import { createDatabaseFixture,context,options,seedLedgerCatalog } from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1):EntityRef & {type:T}=>({type,id,version});
const command=async(type:string,input:unknown):Promise<CommandIdentity>=>({
  commandId:randomUUID(),type,idempotencyKey:randomUUID(),digest:await inputDigest(input)});

test('Ledger units, periods and signed corrections close the catalog gap', {timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const c=context(),catalog=new LedgerCatalogOwner(),ledger=new LedgerOwner();
  const unitInput={id:randomUUID(),name:'abh.unit.credit',kind:'quantity' as const,precision:6};
  const periodInput={id:randomUUID(),startsAt:'2026-01-01T00:00:00Z',endsAt:'2027-01-01T00:00:00Z'};
  const unitCommand=await command('abh.ledger-units.register',unitInput);
  const periodCommand=await command('abh.ledger-periods.register',periodInput);
  let unit!:EntityRef & {type:'abh.unit'},period!:EntityRef & {type:'abh.period'};
  await f.database.transaction(c,options(),tx=>executeCommand(tx,unitCommand,async()=>{},
    async()=>unit=(await catalog.registerUnit(tx,unitCommand,unitInput)).unitRef));
  await f.database.transaction(c,options(),tx=>executeCommand(tx,periodCommand,async()=>{},
    async()=>period=(await catalog.registerPeriod(tx,periodCommand,periodInput)).periodRef));

  const ledgerRecord=await f.database.transaction(c,options(),async tx=>await ledger.configure(tx,
    await command('abh.ledgers.configure',{unit:unitInput.name,periodRef:period,limit:'10'}),
    {id:randomUUID(),scopeRef:ref('abh.organization',c.tenant.resourceOrganizationId),resourceType:'abh.resource.cost',
      meteringMode:'cumulative' as const,unit:unitInput.name,periodRef:period,limit:'10',
      purposeNames:['abh.action.prepare','abh.resource.read']}));
  const configure=async(unitName=unitInput.name,inputPeriod=period,limit='10',currency?:string)=>f.database.transaction(c,options(),async tx=>
    await ledger.configure(tx,await command('abh.ledgers.configure',{unit:unitName,periodRef:inputPeriod,limit,
      ...(currency?{currency}:{})}),
      {id:randomUUID(),scopeRef:ref('abh.organization',c.tenant.resourceOrganizationId),resourceType:'abh.resource.cost',
        meteringMode:'cumulative' as const,unit:unitName,periodRef:inputPeriod,limit,...(currency?{currency}:{})}));
  await assert.rejects(configure('abh.unit.missing'),{code:'RESOURCE_NOT_FOUND'});
  await assert.rejects(configure(unitInput.name,{...period,version:2}),{code:'VERSION_CONFLICT'});

  await t.test('signed correction appends source-deduped delta and keeps immutable record',async()=>{
    const verify=async()=>{};
    const source=ref('abh.operation'),increase={ledgerRef:ledgerRecord.ledgerRef,sourceRef:source,kind:'FxRevaluation' as const,
      usageDelta:'2.5',conversionRef:ref('abh.conversion'),evidenceRefs:[ref('abh.artifact')]};
    const first=await f.database.transaction(c,options(),async tx=>await ledger.applyCorrection(tx,
      await command('abh.ledger-corrections.apply',increase),increase,verify));
    assert.equal(first.usageDelta,'2.5');
    const current=await f.database.transaction(c,options(),tx=>ledger.get(tx,ledgerRecord.ledgerRef.id));
    assert.equal(current.confirmedUsage,'2.5');
    const replay=await f.database.transaction(c,options(),async tx=>await ledger.applyCorrection(tx,
      await command('abh.ledger-corrections.apply',increase),increase,verify));
    assert.equal(replay.correctionRef.id,first.correctionRef.id);
    const {conversionRef:_conversionRef,...refundSource}=increase;
    const refund={...refundSource,ledgerRef:first.ledgerRef,sourceRef:ref('abh.operation',source.id,2),
      kind:'Refund' as const,usageDelta:'-1'};
    await f.database.transaction(c,options(),async tx=>await ledger.applyCorrection(tx,
      await command('abh.ledger-corrections.apply',refund),refund,verify));
    const corrected=await f.database.transaction(c,options(),tx=>ledger.get(tx,ledgerRecord.ledgerRef.id));
    assert.equal(corrected.confirmedUsage,'1.5');
    const overRefund={...refund,ledgerRef:corrected.ledgerRef,sourceRef:ref('abh.operation',source.id,3),usageDelta:'-2'};
    await assert.rejects(f.database.transaction(c,options(),async tx=>await ledger.applyCorrection(tx,
      await command('abh.ledger-corrections.apply',overRefund),overRefund,verify)),{code:'RESOURCE_EXHAUSTED'});
  });

  await t.test('doctor rebuilds corrected balances',async()=>{
    const result=await inspectLedgerBalanceAudit({connectionString:f.runtimeUrl,signal:new AbortController().signal,
      organizationId:c.tenant.resourceOrganizationId,ledgerId:ledgerRecord.ledgerRef.id,timeoutMs:10_000});
    assert.equal(result.status,'Passed');assert.equal(result.ledgers[0]?.current.confirmedUsage,'1.5');
  });
});
