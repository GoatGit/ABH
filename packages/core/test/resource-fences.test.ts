import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {ResourceFenceRecord} from '@abh/contracts';
import {ResourceFenceOwner} from '../src/execution/resource-fences.ts';
import {Database} from '../src/data/uow.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {CoreError} from '../src/internal/errors.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(value:unknown):Promise<CommandIdentity>=>({type:'abh.actions.request-authorization',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('resource fences retain one unresolved external-operation slot',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const c=context(),owner=new ResourceFenceOwner(),key={connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),resourceKey:'hello.brief'},ops=[ref('abh.operation'),ref('abh.operation')];
  const occupy=async(op=ops[0]!,resource=key)=>{const cmd=await command(op);let result:ResourceFenceRecord;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await owner.occupy(tx,cmd,resource,op,[c.tenant.purposeOfUse]);return result.fenceRef;}));return result!;};
  let occupied:ResourceFenceRecord;
  await t.test('competing operations cannot own the same connection/account/resource concurrently',async()=>{
    const results=await Promise.allSettled(ops.map(op=>occupy(op)));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    occupied=(results.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<ResourceFenceRecord>).value;assert.equal(occupied.fencingToken,1);
    await assert.rejects(occupy(occupied.unresolvedOperationRef!),{code:'PRECONDITION_FAILED'},'same Operation cannot use retry delivery to obtain a second slot');
  });
  await t.test('connection/account semantic version changes cannot evade the identity lock',async()=>{
    await assert.rejects(occupy(ops[1],{...key,connectionRef:{...key.connectionRef,version:2},accountRef:{...key.accountRef,version:2}}),{code:'PRECONDITION_FAILED'});
    assert.equal(await db.transaction(context(),options(),tx=>owner.lock(tx,key)),undefined);
    assert.ok(await occupy(ref('abh.operation'),{...key,resourceKey:'hello.independent'}));
  });
  await t.test('absence of conclusive evidence keeps occupation indefinitely',async()=>{
    const cmd=await command(occupied.fenceRef);
    await assert.rejects(db.transaction(c,options(),tx=>owner.clear(tx,cmd,key,occupied.unresolvedOperationRef!,occupied.fencingToken,ref('abh.reconciliation'),async()=>{throw new CoreError('OPERATION_FACT_CONFLICT');})),{code:'OPERATION_FACT_CONFLICT'});
    const current=await db.transaction(c,options(),tx=>owner.lock(tx,key));assert.deepEqual(current,occupied);assert.equal('expiresAt' in current!,false);
  });
  await t.test('verified clear permits a new generation; old fencing token never becomes current again',async()=>{
    const cmd=await command(occupied.fenceRef),evidence=ref('abh.reconciliation');
    // Fixture evidence callback; actual finality is checked by the Operation/Reconciliation Controller.
    const cleared=await db.transaction(c,options(),tx=>owner.clear(tx,cmd,key,occupied.unresolvedOperationRef!,occupied.fencingToken,evidence,async()=>{}));assert.equal(cleared.unresolvedOperationRef,undefined);
    const next=await occupy(ref('abh.operation'));assert.equal(next.fencingToken,2);
    await assert.rejects(db.transaction(c,options(),tx=>owner.requireCurrent(tx,key,occupied.unresolvedOperationRef!,occupied.fencingToken)),{code:'PRECONDITION_FAILED'});
  });
});
