import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {EntityRef,WorkLeaseRecord} from '@abh/contracts';
import {WorkLeaseOwner} from '../src/durable/work-leases.ts';
import {Database,type TenantTransaction} from '../src/data/uow.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {CoreError} from '../src/internal/errors.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('work leases use current Service identity and monotonic fencing',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const human=context(),c=deriveVerifiedContext({...human.request,actor:{type:'Service',id:human.tenant.actor.id}}),org=c.tenant.resourceOrganizationId,principal=c.tenant.actor.id;
  const target={type:'abh.organization',id:org,version:1},owner=new WorkLeaseOwner(),workers=[randomUUID(),randomUUID()];
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'fixture','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal},'worker service','Service',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal},1,'Active')`;
    for(const ref of [target,{type:'abh.principal',id:principal}])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${ref.type},${ref.id},1)`;
  });
  const verifyTarget=async(tx:TenantTransaction,ref:EntityRef)=>{
    if(ref.type!=='abh.organization')throw new CoreError('INVALID_ARGUMENT');
    const rows=await tx.owner('Identity')`SELECT id FROM identity.organizations WHERE id=${ref.id} AND status='Active'`;if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
  };
  const run=async(cmd:CommandIdentity,work:(tx:TenantTransaction)=>Promise<WorkLeaseRecord>)=>{
    let result:WorkLeaseRecord;await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await work(tx);return result.leaseRef;}));return result!;
  };
  const claim=async(workerId:string,leaseSeconds=30)=>{const input={targetRef:target,workerId,leaseSeconds},cmd=await command('abh.work-leases.claim',input);return run(cmd,tx=>owner.claim(tx,cmd,input,verifyTarget));};
  let lease:WorkLeaseRecord;
  await t.test('two workers claim the same target; one wins and repeated claim does not extend expiry',async()=>{
    const results=await Promise.allSettled(workers.map(worker=>claim(worker)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    lease=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<WorkLeaseRecord>).value;assert.equal(lease.fencingToken,1);
    assert.deepEqual(await claim(lease.workerId),lease);
  });
  await t.test('heartbeat changes lease version without changing token and rejects stale CAS',async()=>{
    const old=lease,cmd=await command('abh.work-leases.renew',lease.leaseRef);
    lease=await run(cmd,tx=>owner.renew(tx,cmd,lease.leaseRef,lease.workerId,lease.fencingToken,30));assert.equal(lease.fencingToken,old.fencingToken);assert.equal(lease.leaseRef.version,old.leaseRef.version+1);
    const stale=await command('abh.work-leases.renew',old.leaseRef);await assert.rejects(run(stale,tx=>owner.renew(tx,stale,old.leaseRef,old.workerId,old.fencingToken,30)),{code:'VERSION_CONFLICT'});
    await db.transaction(c,options(),tx=>owner.requireCurrent(tx,old.leaseRef,old.workerId,old.fencingToken,target));
  });
  await t.test('release followed by new claim advances token and invalidates old worker',async()=>{
    const old=lease,cmd=await command('abh.work-leases.release',lease.leaseRef);await run(cmd,tx=>owner.release(tx,cmd,lease.leaseRef,lease.workerId,lease.fencingToken));
    lease=await claim(workers.find(worker=>worker!==old.workerId)!,1);assert.equal(lease.fencingToken,2);assert.equal(lease.leaseRef.id,old.leaseRef.id);
    await assert.rejects(db.transaction(c,options(),tx=>owner.requireCurrent(tx,old.leaseRef,old.workerId,old.fencingToken,target)),{code:'PRECONDITION_FAILED'});
  });
  await t.test('database-time expiry allows takeover but cannot renew the expired token',async()=>{
    const old=lease;await f.raw`SELECT pg_sleep(1.1)`;
    const cmd=await command('abh.work-leases.renew',old.leaseRef);await assert.rejects(run(cmd,tx=>owner.renew(tx,cmd,old.leaseRef,old.workerId,old.fencingToken,30)),{code:'PRECONDITION_FAILED'});
    lease=await claim(old.workerId);assert.equal(lease.fencingToken,3);
  });
  await t.test('stored lease identity cannot replace its physical row reference',async()=>{
    await f.admin`UPDATE runtime.work_leases SET record=jsonb_set(record,'{leaseRef,id}',to_jsonb(${randomUUID()}::text)) WHERE id=${lease.leaseRef.id}`;
    try{await assert.rejects(db.transaction(c,options(),tx=>owner.get(tx,lease.leaseRef)),{code:'INTERNAL_ERROR'});}
    finally{await f.admin`UPDATE runtime.work_leases SET record=${JSON.stringify(lease)}::text::jsonb WHERE id=${lease.leaseRef.id}`;}
  });
  await t.test('target, tenant, identity and current membership are checked independently of the queue',async()=>{
    const cmd=await command('abh.work-leases.claim',target);
    await assert.rejects(db.transaction(human,options(),tx=>owner.claim(tx,cmd,{targetRef:target,workerId:workers[0]!,leaseSeconds:30},verifyTarget)),{code:'FORBIDDEN'});
    await assert.rejects(run(cmd,tx=>owner.claim(tx,cmd,{targetRef:{...target,id:randomUUID()},workerId:workers[0]!,leaseSeconds:30},verifyTarget)),{code:'RESOURCE_NOT_FOUND'});
    await assert.rejects(db.transaction(context(),options(),tx=>owner.get(tx,lease.leaseRef)),{code:'RESOURCE_NOT_FOUND'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.memberships SET status='Revoked' WHERE principal_id=${principal}`);
    await assert.rejects(claim(lease.workerId),{code:'FORBIDDEN'});
    assert.equal((await db.transaction(c,options(),tx=>owner.get(tx,lease.leaseRef))).fencingToken,3);
  });
});
