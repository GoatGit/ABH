import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {GrantRecord,ResourceFenceRecord} from '@abh/contracts';
import {ResourceFenceOwner} from '../src/execution/resource-fences.ts';
import {Database} from '../src/data/uow.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {CoreError} from '../src/internal/errors.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {listSafetyStops} from '../src/execution/list-safety-stops.ts';
import {createAbhClient} from '../src/client.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import {createCoreHttpApp} from '../src/server/http.ts';

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
test('safety stop discovery is bounded and governance gated',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const base=context(),safety=deriveVerifiedContext({...base.request,purposeOfUse:'abh.action.safety-stop'});
  const org=base.tenant.resourceOrganizationId,principal={type:'abh.principal' as const,id:base.tenant.actor.id,version:1},
    scope={type:'abh.organization' as const,id:org,version:1},grant={type:'abh.grant' as const,id:randomUUID(),version:1};
  const grantRecord:GrantRecord={grantRef:grant,resourceOrganizationId:org,principalRef:principal,scopeRefs:[scope],
    actionTypes:['abh.actions.read'],purposeNames:['abh.action.safety-stop'],validFrom:new Date(Date.now()-1000).toISOString(),
    validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
  const key={connectionRef:{type:'abh.connection' as const,id:randomUUID(),version:1},accountRef:{type:'abh.account' as const,id:randomUUID(),version:1},resourceKey:'hello.safety'};
  const operations=[randomUUID(),randomUUID()].map(id=>({type:'abh.operation' as const,id,version:1})),owner=new ResourceFenceOwner();
  await db.transaction(base,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'safety-discovery','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Safety','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    for(const target of [scope,principal,grant])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.id},${principal.id},${JSON.stringify(grantRecord)}::text::jsonb,${grantRecord.validFrom},${grantRecord.validUntil},'Active')`;
  });
  for(const [index,operation] of operations.entries()){
    const command={type:'abh.actions.request-authorization',commandId:randomUUID(),idempotencyKey:randomUUID(),
      digest:await inputDigest(operation)};
    await db.transaction(base,options(),tx=>executeCommand(tx,command,async()=>{},
      async()=>(await owner.occupy(tx,command,{...key,resourceKey:`hello.safety${index}`},operation,[base.tenant.purposeOfUse,'abh.action.safety-stop'])).fenceRef));
  }
  await assert.rejects(listSafetyStops(db,safety,options(),{limit:100},[]),{code:'AUTHORITY_REQUIRED'});
  const full=await listSafetyStops(db,safety,options(),{limit:100},[grant]);
  assert.equal(full.candidates.length,2);assert.equal(full.complete,true);
  assert.deepEqual(full.candidates.map(value=>value.unresolvedOperationRef.id).sort(),operations.map(value=>value.id).sort());
  const bounded=await listSafetyStops(db,safety,options(),{limit:1},[grant]);
  assert.equal(bounded.candidates.length,1);assert.equal(bounded.complete,false);
  const issuer='development.fake',audience='abh.safety-stops',subject='safety-reader';
  const identityDigest=await inputDigest([issuer,subject]);
  await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${principal.id},1)`;
  const identity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{issuer,audience,subject,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:grantRecord.validUntil,evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
  let httpGrants=[grant];
  const app=createCoreHttpApp({database:db,identity,credentials:async(request:{headers:Record<string,unknown>})=>{
    if(request.headers.authorization!=='Bearer safety')throw new CoreError('UNAUTHENTICATED');
    return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.action.safety-stop'};
  },safetyStops:{grants:async()=>httpGrants}});
  const address=await app.listen({host:'127.0.0.1',port:0});t.after(()=>app.close());
  const client=createAbhClient({baseUrl:address,headers:async()=>({authorization:'Bearer safety'})});
  const http=await client.safetyStops.list({limit:100});
  assert.deepEqual(http.candidates,full.candidates);assert.equal(http.complete,true);
  assert.equal((await app.inject({method:'GET',url:'/v1/safety-stops?limit=100'})).statusCode,401);
  assert.equal((await app.inject({method:'GET',url:'/v1/safety-stops',headers:{authorization:'Bearer safety'}})).statusCode,400);
  httpGrants=[];assert.equal((await app.inject({method:'GET',url:'/v1/safety-stops?limit=100',headers:{authorization:'Bearer safety'}})).statusCode,403);
});
