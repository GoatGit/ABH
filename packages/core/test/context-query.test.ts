import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {contract} from '../src/data/journal.ts';
import {ContextOwner} from '../src/mission/context.ts';
import {createMissionQueryHandlers,type MissionHttpInstallation} from '../src/server/mission-http.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {context,options,createDatabaseFixture} from './database-fixture.ts';

const ref=(type:string)=>({type,id:randomUUID(),version:1});

test('Context get revalidates current grants and persisted integrity',async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.mission.manage'});
 const org=c.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1};
 const principal={type:'abh.principal',id:c.tenant.actor.id,version:1};
 const grant=contract('GrantRecord',{grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:principal,
  scopeRefs:[scope],actionTypes:['abh.missions.read'],purposeNames:['abh.mission.manage'],
  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),
  issuanceEvidenceRef:scope,status:'Active'});
 await f.database.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'Context fixture','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${principal.id},'Reader','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${principal.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
  for(const value of [scope,principal,grant.grantRef])await tx.owner('Control')
    `INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
 });
 const manifest=contract('ContextManifest',{contextRef:ref('abh.context'),resourceOrganizationId:org,
  taskRef:ref('abh.task'),goalDigest:`sha256:${'1'.repeat(64)}`,manifestDigest:`sha256:${'2'.repeat(64)}`,
  inputRefs:[ref('abh.artifact')],purposeOfUse:'abh.mission.manage',executionMode:'Production',
  createdAt:new Date().toISOString()});
 const stored=await f.database.transaction(c,options(),tx=>new ContextOwner().store(tx,manifest));
 assert.notEqual(stored.manifestDigest,manifest.manifestDigest);
 const base:MissionHttpInstallation={grants:async()=>[],definition:null as never,activation:null as never,
  fenceRefs:async()=>[],tool:null as never};
 const query=(install:MissionHttpInstallation,verifiedContext=c)=>createMissionQueryHandlers(f.database,install)
   ['abh.contexts.get'](verifiedContext,options(),stored.contextRef.id);
 await assert.rejects(query(base),{code:'AUTHORITY_REQUIRED'});
 const denied:MissionHttpInstallation={...base,contextGet:{grants:async()=>[]}};
 await assert.rejects(query(denied),{code:'AUTHORITY_REQUIRED'});
 const authorized:MissionHttpInstallation={...base,contextGet:{grants:async()=>[grant.grantRef]}};
 assert.deepEqual(await query(authorized),stored);
 const wrongPurpose=deriveVerifiedContext({...c.request,purposeOfUse:'abh.action.prepare'});
 await assert.rejects(query(authorized,wrongPurpose),{code:'FORBIDDEN'});
 await f.admin`UPDATE core.context_manifests SET version=2 WHERE id=${stored.contextRef.id}`;
 await assert.rejects(query(authorized),{code:'INTERNAL_ERROR'});
 await f.admin`UPDATE core.context_manifests SET version=1,record=jsonb_set(record,'{manifestDigest}',${JSON.stringify(`sha256:${'3'.repeat(64)}`)}::text::jsonb) WHERE id=${stored.contextRef.id}`;
 await assert.rejects(query(authorized),{code:'INTERNAL_ERROR'});
 await f.database.transaction(c,options(),async tx=>tx.owner('Control')
  `UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`);
 await assert.rejects(query(authorized),{code:'AUTHORITY_REQUIRED'});
});
