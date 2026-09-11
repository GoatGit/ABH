import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { EntityRef, GrantRecord, Target, VerifiedIdentity } from '@abh/contracts';
import type { IdentityProviderPort } from '@abh/contracts/ports';
import { createDatabaseFixture, context, options } from './database-fixture.ts';
import { Database } from '../src/data/uow.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import { IdentityIngress } from '../src/identity/ingress.ts';
import { assertCurrentGrants } from '../src/control/grants.ts';
import { lockFences } from '../src/control/fences.ts';
import { revokeGrant } from '../src/control/revoke.ts';
import { executeCommand, inputDigest, type CommandIdentity } from '../src/data/journal.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
test('Identity ingress and synchronous Grant/fence verification', {timeout:120_000},async t=> {
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,principalId=c.tenant.actor.id;
  const issuer='development.fake',audience='abh.test',subject='fixture-human';
  const identityDigest=await inputDigest([issuer,subject]);
  const credentialRef=ref('abh.credential');
  const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',principalId),scopeRefs:[ref('abh.organization',org)],
    actionTypes:['abh.actions.propose'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
  const target:Target={objectRef:ref('abh.organization',org),action:'abh.actions.propose',scopeRefs:[ref('abh.organization',org)]};
  // Maintenance fixture only: external subject bindings are not writable by runtime.
  await f.admin`INSERT INTO deployment.identity_locations (identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${principalId},1)`;
  await db.transaction(c,options(),async tx=> {
    const sql=tx.owner('Identity');
    await sql`INSERT INTO identity.organizations (resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Fixture','local','Active')`;
    await sql`INSERT INTO identity.principals (resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principalId},'Fixture human','Human',1,'Active')`;
    await sql`INSERT INTO identity.memberships (resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principalId},1,'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants (resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${grant.grantRef.id},${principalId},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    for (const scope of [ref('abh.organization',org),ref('abh.principal',principalId),grant.grantRef]) await tx.owner('Control')`INSERT INTO control.fences (resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${org},${randomUUID()},${scope.type},${scope.id},1)`;
  });
  const verified=():VerifiedIdentity=>({issuer,subject,audience,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,
    verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),evidenceRef:ref('abh.identity-evidence')});
  const provider:IdentityProviderPort={verify:async request=>{assert.equal(request.issuer,issuer);assert.equal(request.audience,audience);return {status:'Completed',data:verified()};}};
  const ingress=new IdentityIngress(db,provider,{issuer,audience});
  const authenticate=()=>ingress.authenticate({credentialRef,organizationId:org,purpose:'abh.action.prepare'},options());

  await t.test('validated IdP subject maps to current local identity without trusting caller context',async()=> {
    const result=await authenticate();
    assert.equal(result.tenant.actor.id,principalId);assert.equal(result.tenant.resourceOrganizationId,org);assert.equal(result.tenant.scopeEpoch,1);
    assert.equal(Object.isFrozen(result.request.actor),true);
    const granted=await db.transaction(result,options(),tx=>assertCurrentGrants(tx,target,[grant.grantRef]));
    assert.equal(granted[0]!.grantRef.id,grant.grantRef.id);
    await assert.rejects(f.raw`UPDATE deployment.identity_locations SET principal_id=principal_id`,{code:'42501'});
    await assert.rejects(f.queue`SELECT * FROM deployment.identity_locations`,{code:'42501'});
  });
  await t.test('Workspace Grant admission and revocation reject other or missing Workspace',async()=>{
    const workspaceId=randomUUID(),scoped=deriveVerifiedContext({...c.request,workspaceId}),other=deriveVerifiedContext({...c.request,workspaceId:randomUUID()});
    await f.admin`UPDATE control.grants SET workspace_id=${workspaceId} WHERE resource_organization_id=${org} AND id=${grant.grantRef.id}`;
    try{
      assert.equal((await db.transaction(scoped,options(),tx=>assertCurrentGrants(tx,target,[grant.grantRef]))).length,1);
      const evidenceRefs=[ref('abh.decision')],command:CommandIdentity={type:'abh.grants.revoke',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({grantRef:grant.grantRef,evidenceRefs})};
      for(const denied of [c,other]){
        await assert.rejects(db.transaction(denied,options(),tx=>assertCurrentGrants(tx,target,[grant.grantRef])),{code:'AUTHORITY_REQUIRED'});
        await assert.rejects(db.transaction(denied,options(),tx=>revokeGrant(tx,command,grant.grantRef,evidenceRefs)),{code:'RESOURCE_NOT_FOUND'});
      }
      assert.equal((await db.transaction(scoped,options(),tx=>assertCurrentGrants(tx,target,[grant.grantRef]))).length,1);
    }finally{await f.admin`UPDATE control.grants SET workspace_id=NULL WHERE resource_organization_id=${org} AND id=${grant.grantRef.id}`;}
  });
  await t.test('forged issuer/audience, unknown mapping, caller organization and unregistered purposes are refused',async()=> {
    for (const patch of [{issuer:'attacker'},{audience:'attacker'},{subject:'unbound'},{credentialEpoch:2},{identityKind:'Service'}]) {
      const bad:IdentityProviderPort={verify:async()=>({status:'Completed',data:{...verified(),...patch} as VerifiedIdentity})};
      await assert.rejects(new IdentityIngress(db,bad,{issuer,audience}).authenticate({credentialRef,organizationId:org,purpose:'abh.action.prepare'},options()));
    }
    await assert.rejects(ingress.authenticate({credentialRef,organizationId:randomUUID(),purpose:'abh.action.prepare'},options()),{code:'FORBIDDEN'});
    await assert.rejects(ingress.authenticate({credentialRef,organizationId:org,purpose:'unregistered.purpose'},options()),{code:'PURPOSE_DENIED'});
    await assert.rejects(db.transaction(c,options(),tx=>assertCurrentGrants(tx,{...target,objectRef:ref('abh.organization')},[grant.grantRef])),{code:'FORBIDDEN'});
  });
  await t.test('an unresponsive identity Adapter cannot outlive the ingress deadline',async()=> {
    const hanging:IdentityProviderPort={verify:async()=>new Promise(()=>{})};
    await assert.rejects(new IdentityIngress(db,hanging,{issuer,audience}).authenticate({credentialRef,organizationId:org,purpose:'abh.action.prepare'},{...options(),deadline:Date.now()+30}),{code:'DEPENDENCY_TIMEOUT'});
  });
  await t.test('expired or cancelled identity lookup is refused before acquiring a connection',async()=> {
    for (const deadline of [Date.now()-1,NaN,Infinity]) {
      await assert.rejects(db.locateIdentity(identityDigest,{...options(),deadline}),{code:'DEPENDENCY_TIMEOUT'});
      await assert.rejects(ingress.authenticate({credentialRef,organizationId:org,purpose:'abh.action.prepare'},{...options(),deadline}),{code:'DEPENDENCY_TIMEOUT'});
    }
    await assert.rejects(db.locateIdentity(identityDigest,{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
  });
  await t.test('identity mapping lock waits obey the request deadline and cancellation, then release the connection',async()=> {
    const single=await Database.connect(f.runtimeUrl,{max:1});
    const bounded=new IdentityIngress(single,provider,{issuer,audience});
    let release!:()=>void, locked!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const acquired=new Promise<void>(resolve=>{locked=resolve;});
    const blocker=f.admin.begin(async sql=>{
      await sql`LOCK TABLE deployment.identity_locations IN ACCESS EXCLUSIVE MODE`;
      locked();await held;
    });
    try {
      await acquired;
      for (const cancel of [false,true]) {
        const controller=new AbortController();
        const timer=cancel?setTimeout(()=>controller.abort(),100):undefined;
        const started=Date.now();
        try {
          await assert.rejects(bounded.authenticate({credentialRef,organizationId:org,purpose:'abh.action.prepare'},
            {deadline:Date.now()+(cancel?10_000:100),signal:controller.signal}),{code:'DEPENDENCY_TIMEOUT'});
          assert.ok(Date.now()-started<3000,'lookup must stop before the database statement timeout');
          const active=await f.raw`SELECT pid FROM pg_stat_activity WHERE application_name='abh-runtime' AND state='active' AND query LIKE '%FROM deployment.identity_locations%'`;
          assert.equal(active.length,0,'cancelled lookup must finish before ingress returns');
        } finally {clearTimeout(timer);}
      }
    } finally {release();await blocker;}
    try {assert.equal((await bounded.authenticate({credentialRef,organizationId:org,purpose:'abh.action.prepare'},options())).tenant.actor.id,principalId);}
    finally {await single.close();}
    assert.equal((await authenticate()).tenant.actor.id,principalId);
  });
  await t.test('identity lookup waiting for a busy pool can be cancelled without leaking queued work',async()=> {
    const single=await Database.connect(f.runtimeUrl,{max:1});
    let release!:()=>void, started!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    const acquired=new Promise<void>(resolve=>{started=resolve;});
    const occupied=single.transaction(c,options(),async()=>{started();await held;});
    try {
      await acquired;
      await assert.rejects(single.locateIdentity(identityDigest,{...options(),deadline:Date.now()+100}),{code:'DEPENDENCY_TIMEOUT'});
    } finally {release();await occupied;}
    try {assert.equal((await single.locateIdentity(identityDigest,options()))[0]!.principalRef.id,principalId);}
    finally {await single.close();}
  });
  await t.test('membership revocation and credential epoch are checked on every authentication',async()=> {
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.memberships SET status='Revoked' WHERE principal_id=${principalId}`);
    await assert.rejects(authenticate(),{code:'FORBIDDEN'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.memberships SET status='Active' WHERE principal_id=${principalId}`);
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=2 WHERE id=${principalId}`);
    await assert.rejects(authenticate(),{code:'EPOCH_REVOKED'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=1 WHERE id=${principalId}`);
  });
  await t.test('expiry is checked from PostgreSQL time even if the persisted status remains Active',async()=> {
    await db.transaction(c,options(),tx=>tx.owner('Control')`UPDATE control.grants SET valid_from=clock_timestamp()-interval '2 hours',valid_until=clock_timestamp()-interval '1 hour' WHERE id=${grant.grantRef.id}`);
    await assert.rejects(db.transaction(c,options(),tx=>assertCurrentGrants(tx,target,[grant.grantRef])),{code:'AUTHORITY_REQUIRED'});
    await db.transaction(c,options(),tx=>tx.owner('Control')`UPDATE control.grants SET valid_from=${grant.validFrom},valid_until=${grant.validUntil} WHERE id=${grant.grantRef.id}`);
  });
  await t.test('revocation locks the same fences and later admission observes the committed revocation',async()=> {
    const evidenceRefs:EntityRef[]=[ref('abh.decision')];
    const command:CommandIdentity={type:'abh.grants.revoke',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({grantRef:grant.grantRef,evidenceRefs})};
    let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
    let started!:()=>void;const acquired=new Promise<void>(resolve=>{started=resolve;});
    const revoke=db.transaction(c,options(),tx=>executeCommand(tx,command,async()=>{},async()=>{
      await lockFences(tx,[ref('abh.organization',org),ref('abh.principal',principalId),grant.grantRef]);
      started();await barrier;
      return (await revokeGrant(tx,command,grant.grantRef,evidenceRefs)).grantRef;
    }));
    await acquired;
    const admission=db.transaction(c,options(),tx=>assertCurrentGrants(tx,target,[grant.grantRef]));
    const denied=assert.rejects(admission,{code:'EPOCH_REVOKED'});
    release();await revoke;await denied;
    const replay=await db.transaction(c,options(),tx=>executeCommand(tx,command,async()=>{},async()=>{throw new Error('must not run');}));
    assert.equal(replay.replayed,true);
    const rows=await db.transaction(c,options(),tx=>tx.owner('Control')`SELECT status,version FROM control.grants WHERE id=${grant.grantRef.id}`);
    assert.equal(rows[0]!.status,'Revoked');assert.equal(rows[0]!.version,'2');
    const events=await db.transaction(c,options(),tx=>tx.owner('DurableExecution')`SELECT record FROM data.outbox WHERE record->>'causationId'=${command.commandId}`);
    assert.deepEqual(events.map(row=>row.record.type).sort(),['abh.fence.advanced','abh.grant.revoke']);
  });
});
