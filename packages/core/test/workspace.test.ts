import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Database } from '../src/data/uow.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import { verifyWorkspaceMembership } from '../src/control/workspace.ts';
import { lockFences } from '../src/control/fences.ts';
import { DatabaseReadinessError } from '../src/data/readiness.ts';
import { contract } from '../src/data/journal.ts';
import { createDatabaseFixture,context,options } from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
test('restricted cross-organization membership verifier', {timeout:120_000},async t=> {
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const a=context(),b=context(),actor=a.tenant.actor.id,orgA=a.tenant.resourceOrganizationId,orgB=b.tenant.resourceOrganizationId;
  const membership=ref('abh.membership'),workspace=ref('abh.workspace'),grant=ref('abh.grant');
  for (const c of [a,b]) await db.transaction(c,options(),async tx=> {
    const org=c.tenant.resourceOrganizationId,sql=tx.owner('Identity');
    await sql`INSERT INTO identity.organizations (resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'private organization name','local','Active')`;
    const scopes=c===a?[ref('abh.organization',orgA),ref('abh.principal',actor),membership]:[ref('abh.organization',orgB),workspace,grant];
    for (const scope of scopes) await tx.owner('Control')`INSERT INTO control.fences (resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${scope.type},${scope.id},1)`;
  });
  await db.transaction(a,options(),async tx=> {
    const sql=tx.owner('Identity');
    await sql`INSERT INTO identity.principals (resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${orgA},${actor},'private human name','Human',1,'Active')`;
    await sql`INSERT INTO identity.memberships (resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${orgA},${membership.id},${actor},1,'Active')`;
  });
  await db.transaction(b,options(),async tx=> {
    const record=contract('WorkspaceRecord',{workspaceRef:workspace,resourceOrganizationId:orgB,participantOrganizationRefs:[ref('abh.organization',orgA),ref('abh.organization',orgB)],
      scopeContractRef:ref('abh.artifact'),consentEvidenceRefs:[ref('abh.decision'),ref('abh.decision')],status:'Active',scopeEpoch:1,validUntil:new Date(Date.now()+60_000).toISOString()});
    await tx.owner('Identity')`INSERT INTO control.workspaces (resource_organization_id,id,participant_organization_ids,scope_epoch,valid_until,record,status)
      VALUES (${orgB},${workspace.id},${`{${orgA},${orgB}}`}::uuid[],1,${record.validUntil},${JSON.stringify(record)}::text::jsonb,'Active')`;
  });
  const cross=deriveVerifiedContext({...a.request,resourceOrganizationId:orgB,workspaceId:workspace.id});

  await t.test('valid bilateral Workspace verifies minimum source fields while foreign business rows stay hidden',async()=> {
    await db.transaction(cross,options(),async tx=> {
      const result=await verifyWorkspaceMembership(tx,membership,[grant]);
      assert.equal(result.membershipRef.id,membership.id);assert.equal(result.fences.length,6);
      assert.ok(!JSON.stringify(result).includes('private'));
      assert.deepEqual(Object.keys(result).sort(),['fences','membershipEpoch','membershipRef','principalVersion','workspaceEpoch','workspaceVersion']);
      const source=await tx.owner('Identity')`SELECT * FROM identity.principals`;
      assert.equal(source.length,0);
      const visible=await tx.owner('Identity')`SELECT id FROM identity.organizations`;
      assert.deepEqual(visible.map(row=>row.id),[orgB]);
      await tx.owner('Identity')`UPDATE identity.organizations SET name='resource-side write' WHERE id=${orgB}`;
    });
  });
  await t.test('invalid Workspace, source membership or epoch fails closed',async()=> {
    for (const changed of [deriveVerifiedContext({...cross.request,workspaceId:randomUUID()}),deriveVerifiedContext({...cross.request,scopeEpoch:2}),deriveVerifiedContext({...cross.request,sessionEpoch:2})]) {
      await assert.rejects(db.transaction(changed,options(),tx=>verifyWorkspaceMembership(tx,membership,[grant])));
    }
    for (const source of [ref('abh.membership'),{...membership,version:2}]) await assert.rejects(db.transaction(cross,options(),tx=>verifyWorkspaceMembership(tx,source,[grant])),{code:'FORBIDDEN'});
    await assert.rejects(f.raw`SET ROLE abh_control_verifier`,{code:'42501'});
    await assert.rejects(f.queue`SELECT * FROM control.verify_workspace_membership(${workspace.id},${membership.id},1,'{}'::uuid[])`,{code:'42501'});
    const noContext=await f.raw`SELECT * FROM control.verify_workspace_membership(${workspace.id},${membership.id},1,'{}'::uuid[])`;
    assert.equal(noContext.length,0);
  });
  await t.test('source membership revocation competes in the same fence order and denies the waiting verifier',async()=> {
    let release!:()=>void,ready!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});const locked=new Promise<void>(resolve=>{ready=resolve;});
    const revocation=db.transaction(a,options(),async tx=> {
      await lockFences(tx,[ref('abh.organization',orgA),ref('abh.principal',actor),membership]);
      ready();await barrier;
      await tx.owner('Identity')`UPDATE identity.memberships SET status='Revoked',version=version+1 WHERE id=${membership.id}`;
      await tx.owner('Control')`UPDATE control.fences SET epoch=epoch+1,stop_flag=true WHERE scope_type='abh.membership' AND scope_id=${membership.id}`;
    });
    await locked;
    const denied=assert.rejects(db.transaction(cross,options(),tx=>verifyWorkspaceMembership(tx,membership,[grant])),{code:'FORBIDDEN'});
    release();await revocation;await denied;
  });
  await t.test('helper privileges and function-body drift are checked against migration inventory',async()=> {
    await f.admin`GRANT SELECT(display_name) ON identity.principals TO abh_control_verifier`;
    try {await assert.rejects(db.verify(),DatabaseReadinessError);} finally {await f.admin`REVOKE SELECT(display_name) ON identity.principals FROM abh_control_verifier`;}
    const [fn]=await f.admin`SELECT pg_get_functiondef('control.verify_workspace_membership(uuid,uuid,bigint,uuid[])'::regprocedure) AS definition`;
    try {
      await f.admin.unsafe(fn!.definition.replace('IF NOT FOUND THEN RETURN; END IF;','IF NOT FOUND THEN RETURN; END IF; -- unexpected alteration'));
      await assert.rejects(db.verify(),DatabaseReadinessError);
    } finally {await f.admin.unsafe(fn!.definition);}
    await db.verify();
  });
});
