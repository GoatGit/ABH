import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { EntityRef, GrantRecord, PinSet, ReleaseRecord, ResolveAndPinRequest,
  RollbackStaticAssignmentCommand, StaticAssignmentRecord } from '@abh/contracts';
import { Database } from '../src/data/uow.ts';
import { createAbhClient } from '../src/client.ts';
import { createCoreHttpApp } from '../src/server/http.ts';
import { IdentityIngress } from '../src/identity/ingress.ts';
import { CoreError } from '../src/internal/errors.ts';
import { StaticReleaseOwner } from '../src/release/static.ts';
import { contract,executeCommand,inputDigest,type CommandIdentity } from '../src/data/journal.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import { context,createDatabaseFixture,options } from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,input:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),
  idempotencyKey:randomUUID(),digest:await inputDigest(input)});
const digest='sha256:'+'a'.repeat(64);

test('static assignment rollback restores only new selection eligibility', {timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,owner=new StaticReleaseOwner();
  const purpose=c.tenant.purposeOfUse;
  const governance=deriveVerifiedContext({...c.request,purposeOfUse:'abh.release.manage'});
  const principal=ref('abh.principal',c.tenant.actor.id),scope=ref('abh.organization',org),grant=ref('abh.grant');
  const validFrom=new Date(Date.now()-1000).toISOString(),validUntil=new Date(Date.now()+60_000).toISOString();
  const grantRecord:GrantRecord={grantRef:ref('abh.grant',grant.id),resourceOrganizationId:org,
    principalRef:principal,scopeRefs:[scope],actionTypes:['abh.release.manage'],
    purposeNames:['abh.release.manage'],validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${org},${org},'assignment rollback','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${org},${principal.id},'release authority','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${org},${randomUUID()},'abh.organization',${org},1)`;
    for(const value of [principal,grant])
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
        VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${grant.id},${principal.id},${JSON.stringify(grantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    for(const id of [randomUUID(),randomUUID()]) {
      const artifact={artifactRef:{type:'abh.artifact',id,version:1},resourceOrganizationId:org,
        ownerRef:{type:'abh.organization',id:org,version:1},mediaType:'application/json',sizeBytes:2,
        contentDigest:digest,status:'Available',dataClass:'abh.data.internal',
        purposeNames:[purpose,'abh.release.manage'],
        sourceRefs:[],region:'local',retentionPolicyRef:{type:'abh.organization',id:org,version:1}};
      await tx.owner('ArtifactStore')`INSERT INTO data.artifacts
        (resource_organization_id,id,purpose_names,record,inline_body,content_digest,status)
        VALUES (${org},${id},${[purpose,'abh.release.manage']},${JSON.stringify(artifact)}::text::jsonb,${new TextEncoder().encode('{}')},${digest},'Available')`;
    }
  });
  const evidence=(await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT id FROM data.artifacts`))
    .map(row=>({type:'abh.artifact' as const,id:String(row.id),version:1}));
  const [gateRef,compatibilityRef]=evidence;
  const configure=async(version:string)=>{
    const release:ReleaseRecord={releaseRef:ref('abh.release'),resourceOrganizationId:org,
      assets:[{behaviorSlot:'hello.connector',capabilityExactRefs:[{kind:'Connector',id:'hello.connector',version,digest}]}],
      gateRefs:[gateRef!],compatibilityRef:compatibilityRef!,status:'Ready'};
    const assignment:StaticAssignmentRecord={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,
      releaseRef:release.releaseRef,scopeRefs:[{type:'abh.organization',id:org,version:1}],scopeTier:'Organization',
      status:'Active',selectable:true,executionAllowed:true,evidenceRefs:[gateRef!,compatibilityRef!]};
    const cmd=await command('abh.releases.configure-static',{release,assignment});
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},
      ()=>owner.configure(tx,cmd,{release,assignment,
        purposeNames:[purpose,'abh.release.manage']})));
    return {release,assignment};
  };
  const request=(id:string=randomUUID()):ResolveAndPinRequest=>({subjectRef:ref('abh.action',id),
    subjectInputDigest:'sha256:'+'b'.repeat(64),requiredBehaviorSlots:['hello.connector'],
    verifiedScope:[{type:'abh.organization',id:org,version:1}],
    requestContextRef:ref('abh.request-context',c.tenant.requestId),
    preparationAuthorityRefs:[ref('abh.execution-authority')]});
  const resolve=async(input:ResolveAndPinRequest)=>{
    const cmd=await command('abh.releases.resolve-pins',input);let pins:PinSet|undefined;
    await db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
      pins=await owner.resolveAndPin(tx,cmd,input);return pins.pinSetRef;}));
    return pins!;
  };
  const previous=await configure('0.1.0'),current=await configure('0.2.0');
  await db.transaction(c,options(),tx=>tx.owner('CapabilityRelease')`UPDATE release.assignments
    SET selectable=false,record=jsonb_set(record,'{selectable}','false'::jsonb)
    WHERE id=${previous.assignment.assignmentRef.id}`);
  const oldPin=await resolve(request());
  assert.equal(oldPin.pins[0]!.capabilityExactRefs[0]!.version,'0.2.0');
  const rollbackInput={
    previousReleaseRef:{...previous.release.releaseRef,version:2},
    gateRefs:[gateRef!],compatibilityRef:compatibilityRef!,reason:'Canary regression'};
  const rollbackCommand=await command('abh.assignments.rollback',{target:current.assignment.assignmentRef,...rollbackInput});
  await t.test('invalid version or evidence fails closed without replacement',async()=>{
    await assert.rejects(db.transaction(c,options(),tx=>owner.rollback(tx,rollbackCommand,
      {...current.assignment.assignmentRef,version:2},rollbackInput)),{code:'VERSION_CONFLICT'});
    await assert.rejects(db.transaction(c,options(),tx=>owner.rollback(tx,rollbackCommand,
      current.assignment.assignmentRef,{...rollbackInput,previousReleaseRef:ref('abh.release')})),{code:'RESOURCE_NOT_FOUND'});
    await f.admin`UPDATE data.artifacts SET status='Tombstoned' WHERE id=${compatibilityRef!.id}`;
    try{await assert.rejects(db.transaction(c,options(),tx=>owner.rollback(tx,rollbackCommand,
      current.assignment.assignmentRef,rollbackInput)),{code:'PRECONDITION_FAILED'});}
    finally{await f.admin`UPDATE data.artifacts SET status='Available' WHERE id=${compatibilityRef!.id}`;}
    const assignments=await db.transaction(c,options(),tx=>tx.owner('CapabilityRelease')`SELECT count(*) AS count
      FROM release.assignments`);
    assert.equal(assignments[0]!.count,'2');
  });
  let replacementRef:EntityRef;
  await t.test('rollback pauses failed assignment and creates a replacement atomically',async()=>{
    replacementRef=await db.transaction(c,options(),tx=>owner.rollback(tx,rollbackCommand,
      current.assignment.assignmentRef,rollbackInput));
    assert.notEqual(replacementRef.id,current.assignment.assignmentRef.id);
    const rows=await db.transaction(c,options(),tx=>tx.owner('CapabilityRelease')`
      SELECT id,record,status,selectable,execution_allowed FROM release.assignments
      WHERE resource_organization_id=${org} AND deleted_at IS NULL ORDER BY created_at,id`);
    assert.equal(rows.length,3);
    const failed=rows.find(row=>row.id===current.assignment.assignmentRef.id)!;
    assert.equal(failed.status,'Paused');assert.equal(failed.selectable,false);assert.equal(failed.execution_allowed,false);
    assert.equal(failed.record.stopReason,'Canary regression');
    const replacement=rows.find(row=>row.id===replacementRef.id)!;
    assert.equal(replacement.status,'Active');assert.equal(replacement.selectable,true);assert.equal(replacement.execution_allowed,true);
    assert.equal(replacement.record.releaseRef.id,previous.release.releaseRef.id);
    assert.deepEqual(replacement.record.rollbackOfAssignmentRef,{...current.assignment.assignmentRef,version:2});
    assert.deepEqual(replacement.record.rollbackFromReleaseRef,{...current.release.releaseRef,version:2});
    const audit=await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`SELECT count(*) AS count
      FROM data.audit_records WHERE record->>'action'='abh.assignments.rollback'`);
    const events=await db.transaction(c,options(),tx=>tx.owner('DurableExecution')`SELECT
      count(*) FILTER (WHERE record->>'type'='abh.assignment.rollback') AS rollbacks,
      count(*) FILTER (WHERE record->>'type'='abh.assignment.created') AS created FROM data.outbox`);
    assert.equal(audit[0]!.count,'2');assert.equal(events[0]!.rollbacks,'1');assert.equal(events[0]!.created,'3');
  });
  await t.test('existing pin is immutable but failed assignment loses execution eligibility',async()=>{
    const recovered=await db.transaction(c,options(),tx=>owner.getPinSet(tx,oldPin.subjectRef));
    assert.deepEqual(recovered,oldPin);
    await assert.rejects(db.transaction(c,options(),tx=>owner.revalidate(tx,oldPin,request(oldPin.subjectRef.id))),
      {code:'RELEASE_SCOPE_MISMATCH'});
    const next=await resolve(request());
    assert.equal(next.pins[0]!.assignmentRef.id,replacementRef!.id);
    assert.equal(next.pins[0]!.capabilityExactRefs[0]!.version,'0.1.0');
  });
  await t.test('public rollback requires current release authority and replays its receipt',async()=>{
    const governed=await configure('0.3.0');
    const rollbackAssignment=async(grants:readonly unknown[])=>{
      const input={type:'abh.assignments.rollback' as const,
        target:{type:'abh.assignment' as const,id:governed.assignment.assignmentRef.id},
        schemaVersion:'0.1.0' as const,commandId:randomUUID(),idempotencyKey:randomUUID(),
        expectedVersion:governed.assignment.assignmentRef.version,
        payload:{previousReleaseRef:{...previous.release.releaseRef,version:2},
          gateRefs:[gateRef!],compatibilityRef:compatibilityRef!,reason:'Governed regression rollback'}};
      return owner.rollbackAssignment(db,governance,options(),contract(
        'RollbackStaticAssignmentCommand',input),grants as readonly []);
    };
    await assert.rejects(rollbackAssignment([]),{code:'AUTHORITY_REQUIRED'});
    const before=await db.transaction(governance,options(),tx=>owner.listAssignments(tx,
      {releaseId:governed.release.releaseRef.id}));
    assert.equal(before.counts.Active,1);
    const governedCommand=contract('RollbackStaticAssignmentCommand',{type:'abh.assignments.rollback',
      target:{type:'abh.assignment',id:governed.assignment.assignmentRef.id},schemaVersion:'0.1.0',
      commandId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:governed.assignment.assignmentRef.version,
      payload:{previousReleaseRef:{...previous.release.releaseRef,version:2},gateRefs:[gateRef!],
        compatibilityRef:compatibilityRef!,reason:'Governed regression rollback'}});
    const replacement=await owner.rollbackAssignment(db,governance,options(),
      governedCommand,[grant]) as StaticAssignmentRecord;
    assert.equal(replacement.status,'Active');
    assert.equal(replacement.releaseRef.id,previous.release.releaseRef.id);
    assert.deepEqual(replacement.rollbackOfAssignmentRef,
      {...governed.assignment.assignmentRef,version:2});
    const replay=await owner.rollbackAssignment(db,governance,options(),governedCommand,[grant]);
    assert.deepEqual(replay,replacement);
  });
  await t.test('rollback is governed on the public HTTP and client surface',async()=>{
    const governed=await configure('0.4.0');
    const issuer='assignment.rollback.http.fixture',audience='abh.test',subject=randomUUID();
    const identityDigest=await inputDigest([issuer,subject]);
    await f.admin`INSERT INTO deployment.identity_locations
      (identity_digest,resource_organization_id,principal_id,principal_version)
      VALUES (${identityDigest},${org},${principal.id},1)`;
    const identity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{
      issuer,audience,subject,identityKind:'Human',authnStrength:{level:'SingleFactor'},
      credentialEpoch:1,verifiedAt:new Date().toISOString(),
      expiresAt:new Date(Date.now()+60_000).toISOString(),
      evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
    let httpGrants:readonly EntityRef[]=[];
    const app=createCoreHttpApp({database:db,identity,credentials:async request=>{
      if(String(request.headers.authorization)!=='Bearer rollback')throw new CoreError('UNAUTHENTICATED');
      return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.release.manage'};},
      assignments:{rollback:{grants:async()=>httpGrants}}});
    t.after(()=>app.close());
    const payload={previousReleaseRef:{...previous.release.releaseRef,version:2},
      gateRefs:[gateRef!],compatibilityRef:compatibilityRef!,reason:'HTTP governed rollback'};
    const send=()=>app.inject({method:'POST',url:'/v1/commands/abh.assignments.rollback',
      headers:{authorization:'Bearer rollback','idempotency-key':randomUUID(),
        'if-match':`"${governed.assignment.assignmentRef.version}"`},
      payload:{target:{type:'abh.assignment',id:governed.assignment.assignmentRef.id},
        expectedVersion:governed.assignment.assignmentRef.version,payload}});
    const denied=await send();
    assert.equal(denied.statusCode,403,denied.body);
    httpGrants=[grant];
    const client=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer rollback'}),
      fetch:async(url,init)=>{const injected=await app.inject({method:init?.method as 'POST',
        url:new URL(String(url)).pathname+new URL(String(url)).search,
        headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
        return new Response(injected.body,{status:injected.statusCode,
          headers:{'content-type':String(injected.headers['content-type'])}});}});
    const input={id:governed.assignment.assignmentRef.id,
      expectedVersion:governed.assignment.assignmentRef.version,idempotencyKey:randomUUID(),payload};
    const httpReplacement=await client.assignments.rollback(input);
    assert.equal(httpReplacement.status,'Active');
    assert.equal(httpReplacement.releaseRef.id,previous.release.releaseRef.id);
    assert.deepEqual(await client.assignments.rollback(input),httpReplacement);
  });
});
