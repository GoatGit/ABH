import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { PinSet, ReleaseRecord, ResolveAndPinRequest, StaticAssignmentRecord } from '@abh/contracts';
import { Database } from '../src/data/uow.ts';
import { StaticReleaseOwner } from '../src/release/static.ts';
import { executeCommand,inputDigest,type CommandIdentity } from '../src/data/journal.ts';
import { context,createDatabaseFixture,options } from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,input:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(input)});
test('static release selection and immutable execution pins', {timeout:120_000},async t=> {
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,owner=new StaticReleaseOwner();
  await db.transaction(c,options(),tx=>tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.organization',${org},1)`);
  const configure=async(version:string)=> {
    const release:ReleaseRecord={releaseRef:ref('abh.release'),resourceOrganizationId:org,
      assets:[{behaviorSlot:'hello.connector',capabilityExactRefs:[{kind:'Connector',id:'hello.connector',version,digest:'sha256:'+'a'.repeat(64)}]}],gateRefs:[ref('abh.artifact')],compatibilityRef:ref('abh.artifact'),status:'Ready'};
    const assignment:StaticAssignmentRecord={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,releaseRef:release.releaseRef,scopeRefs:[ref('abh.organization',org)],scopeTier:'Organization',status:'Active',selectable:true,executionAllowed:true,evidenceRefs:[ref('abh.decision')]};
    const cmd=await command('abh.releases.configure-static',{release,assignment});
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>owner.configure(tx,cmd,{release,assignment})));
    return {release,assignment};
  };
  const request=():ResolveAndPinRequest=>({subjectRef:ref('abh.action'),subjectInputDigest:'sha256:'+'b'.repeat(64),requiredBehaviorSlots:['hello.connector'],verifiedScope:[ref('abh.organization',org)],requestContextRef:ref('abh.request-context',c.tenant.requestId),preparationAuthorityRefs:[ref('abh.execution-authority')]});
  const resolve=async(input:ResolveAndPinRequest)=> {
    const cmd=await command('abh.releases.resolve-pins',input);let pins:PinSet;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{pins=await owner.resolveAndPin(tx,cmd,input);return pins.pinSetRef;}));return pins!;
  };
  const first=await configure('0.1.0'),input=request();let original:PinSet;
  await t.test('concurrent same-subject pinning writes one whole set without placeholder Agent slots',async()=> {
    const sets=await Promise.all([resolve(input),resolve({...input,subjectRef:{...input.subjectRef,version:2}})]);
    assert.deepEqual(sets[0],sets[1]);original=sets[0]!;
    assert.equal(original.pins.length,1);assert.equal(original.pins[0]!.capabilityExactRefs[0]!.version,'0.1.0');
    const rows=await db.transaction(c,options(),tx=>tx.owner('CapabilityRelease')`SELECT count(*) FROM release.pin_sets`);assert.equal(rows[0]!.count,'1');
  });
  await t.test('changed digest or incomplete slots leave no partial pin set',async()=> {
    await assert.rejects(resolve({...input,subjectInputDigest:'sha256:'+'c'.repeat(64)}),{code:'PIN_INPUT_CONFLICT'});
    const missing={...request(),requiredBehaviorSlots:['hello.connector','hello.missing']};
    await assert.rejects(resolve(missing),{code:'RELEASE_SCOPE_MISMATCH'});
    assert.equal(await db.transaction(c,options(),tx=>owner.getPinSet(tx,missing.subjectRef)),undefined);
  });
  await t.test('exact capability lookup requires the stored pin, complete digest and current assignment row',async()=>{
    const capability=original.pins[0]!.capabilityExactRefs[0]!;
    const lookup=(exact=capability,slot='hello.connector')=>db.transaction(c,options(),tx=>owner.requirePinnedCapability(tx,original,input,slot,exact));
    assert.deepEqual(await lookup(),first.assignment.assignmentRef);
    await assert.rejects(db.transaction(c,options(),tx=>owner.requirePinnedCapability(tx,original,{...input,requestContextRef:ref('abh.request-context')},'hello.connector',capability)),{code:'FORBIDDEN'});
    for(const patch of [{digest:'sha256:'+'f'.repeat(64)},{version:'9.0.0'},{id:'hello.other'}])await assert.rejects(lookup({...capability,...patch}),{code:'PIN_INPUT_CONFLICT'});
    await assert.rejects(lookup(capability,'hello.other'),{code:'PIN_INPUT_CONFLICT'});
    await f.admin`UPDATE release.assignments SET record=jsonb_set(record,'{assignmentRef,version}','2') WHERE id=${first.assignment.assignmentRef.id}`;
    try{await assert.rejects(lookup(),{code:'PIN_INPUT_CONFLICT'});}finally{await f.admin`UPDATE release.assignments SET record=jsonb_set(record,'{assignmentRef,version}','1') WHERE id=${first.assignment.assignmentRef.id}`;}
    await f.admin`UPDATE release.releases SET record=jsonb_set(record,'{releaseRef,version}','3') WHERE id=${first.release.releaseRef.id}`;
    try{await assert.rejects(lookup(),{code:'PIN_INPUT_CONFLICT'});}finally{await f.admin`UPDATE release.releases SET record=jsonb_set(record,'{releaseRef,version}','2') WHERE id=${first.release.releaseRef.id}`;}
  });
  const second=await configure('0.2.0');
  await t.test('overlapping same-tier assignments fail closed for new subjects',async()=> {
    await assert.rejects(resolve(request()),{code:'ASSIGNMENT_AMBIGUOUS'});
  });
  await t.test('normal replacement and process restart preserve previous subject pins',async()=> {
    // Fixture selects the new assignment; execution permission of the previous assignment remains valid.
    await db.transaction(c,options(),tx=>tx.owner('CapabilityRelease')`UPDATE release.assignments SET selectable=false,
      record=jsonb_set(record,'{selectable}','false'::jsonb) WHERE id=${first.assignment.assignmentRef.id}`);
    const newSubject=await resolve(request());assert.equal(newSubject.pins[0]!.capabilityExactRefs[0]!.version,'0.2.0');
    const restarted=await Database.connect(f.runtimeUrl,{max:1});
    try{
      const recovered=await restarted.transaction(c,options(),tx=>new StaticReleaseOwner().getPinSet(tx,input.subjectRef));
      assert.deepEqual(recovered,original);
      await restarted.transaction(c,options(),tx=>owner.revalidate(tx,recovered!,input));
      assert.deepEqual(await restarted.transaction(c,options(),tx=>owner.requirePinnedCapability(tx,recovered!,input,'hello.connector',original.pins[0]!.capabilityExactRefs[0]!)),first.assignment.assignmentRef);
      assert.deepEqual(await resolve(input),original);
    }finally{await restarted.close();}
  });
  await t.test('emergency pause revokes old execution eligibility and keeps immutable pins',async()=> {
    const evidence=ref('abh.decision'),cmd=await command('abh.assignments.pause',{assignment:first.assignment.assignmentRef,evidence});
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>owner.stop(tx,cmd,first.assignment.assignmentRef,evidence)));
    await assert.rejects(db.transaction(c,options(),tx=>owner.revalidate(tx,original,input)),{code:'RELEASE_SCOPE_MISMATCH'});
    assert.deepEqual(await db.transaction(c,options(),tx=>owner.getPinSet(tx,input.subjectRef)),original);
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('CapabilityRelease')`UPDATE release.pin_sets SET record=record`),{code:'42501'});
    assert.equal((await resolve(request())).pins[0]!.assignmentRef.id,second.assignment.assignmentRef.id);
  });
  await t.test('foreign scope, forged context reference and hidden pins cannot be used',async()=> {
    await assert.rejects(resolve({...request(),verifiedScope:[ref('abh.organization')]}),{code:'FORBIDDEN'});
    await assert.rejects(resolve({...request(),requestContextRef:ref('abh.request-context')}),{code:'FORBIDDEN'});
    assert.equal(await db.transaction(context(),options(),tx=>owner.getPinSet(tx,input.subjectRef)),undefined);
  });
});
