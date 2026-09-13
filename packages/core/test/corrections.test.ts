import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { ApplyCorrectionCommand,CorrectionApplicationRecord,CorrectionRecord,EntityRef,GrantRecord,
  GraphRevisionRecord,MissionConditionRecord,MissionRecord,ProposeCorrectionCommand,
  LearningSignalRecord,ProposeCorrectionPayload,ProposeGraphPatchPayload,ResponsibilityAssignmentRecord,RunRecord,
  StoreInlineArtifactPayload } from '@abh/contracts';
import { canonicalJson,digestContract } from '@abh/contracts/digest';
import { InlineArtifactOwner } from '../src/data/artifacts.ts';
import { contract,inputDigest,type CommandIdentity } from '../src/data/journal.ts';
import { CorrectionOwner,proposeCorrection } from '../src/human/corrections.ts';
import { applyCorrection,CorrectionApplicationOwner } from '../src/human/apply-correction.ts';
import { MissionOwner } from '../src/mission/missions.ts';
import { RunOwner } from '../src/mission/runs.ts';
import { buildCase } from '../src/mission/build-case.ts';
import { LearningOwner } from '../src/mission/learning.ts';
import { assignResponsibility } from '../src/human/responsibilities.ts';
import { createCoreHttpApp } from '../src/server/http.ts';
import { createAbhClient } from '../src/client.ts';
import { IdentityIngress } from '../src/identity/ingress.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import { CoreError } from '../src/internal/errors.ts';
import { sameRef } from '../src/execution/shared.ts';
import { createDatabaseFixture,context,options } from './database-fixture.ts';
import type { Database } from '../src/data/uow.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const artifactCommand=async(input:StoreInlineArtifactPayload):Promise<CommandIdentity>=>({
  type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),
  digest:await inputDigest({purpose:'test',input})});

test('correction candidates require current versions, responsibility and grants',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=f.database,c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.correction.propose'});
  const org=c.tenant.resourceOrganizationId,principal=ref('abh.principal',c.tenant.actor.id),scope=ref('abh.organization',org);
  const subject=ref('abh.mission',undefined,2),responsibility=ref('abh.responsibility-assignment'),
    grant=ref('abh.grant'),readGrant=ref('abh.grant'),applyGrant=ref('abh.grant'),
    authority=ref('abh.mission-authority'),condition=ref('abh.mission-conditions');
  const validUntil=new Date(Date.now()+60_000).toISOString(),validFrom=new Date(Date.now()-1000).toISOString();
  const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment',responsibility.id),
    resourceOrganizationId:org,principalRef:principal,responsibilityType:'Correction',scopeRefs:[subject],
    validFrom,validUntil,templateRef:ref('abh.artifact'),status:'Active'};
  const grantRecord:GrantRecord={grantRef:ref('abh.grant',grant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.propose'],purposeNames:['abh.correction.propose'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  const readGrantRecord:GrantRecord={grantRef:ref('abh.grant',readGrant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.read'],purposeNames:['abh.correction.propose'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  const applyGrantRecord:GrantRecord={grantRef:ref('abh.grant',applyGrant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.apply'],purposeNames:['abh.mission.manage'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${org},${org},'corrections','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${org},${principal.id},'corrector','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    for(const value of [scope,principal,grant,readGrant,applyGrant,responsibility,subject,authority,condition])
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
        VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${grant.id},${principal.id},${JSON.stringify(grantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${readGrant.id},${principal.id},${JSON.stringify(readGrantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${applyGrant.id},${principal.id},${JSON.stringify(applyGrantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('HumanGateway')`INSERT INTO human.responsibilities
      (resource_organization_id,id,workspace_id,principal_id,valid_from,valid_until,status,record)
      VALUES (${org},${responsibility.id},${null},${principal.id},${validFrom},${validUntil},'Active',
        ${JSON.stringify(assignment)}::text::jsonb)`;
  });
  const store=async(ownerRef:EntityRef,content:string)=>{const inline=new InlineArtifactOwner();
    const input:StoreInlineArtifactPayload={ownerRef,mediaType:'application/json',content,
      purposeNames:['abh.correction.propose','abh.mission.manage'],dataClass:'abh.data.internal',sourceRefs:[ownerRef],
      region:'local',retentionPolicyRef:ref('abh.retention-policy')};
    return db.transaction(c,options(),async tx=>await inline.store(tx,await artifactCommand(input),input,async()=>{}));};
  const before=await store(subject,'{"value":"before"}'),replacement=await store(subject,'{"value":"after"}');
  const missionConditions:MissionConditionRecord={conditionRef:{...condition},resourceOrganizationId:org,missionRef:subject,
    goalRevision:1,successConditionRef:ref('hello.predicate'),stopConditionRef:ref('hello.predicate'),
    triggerPolicyRef:ref('hello.trigger'),resourceEnvelopeRef:ref('abh.resource-envelope'),digest:'sha256:'+'0'.repeat(64)};
  const unsignedConditions={...missionConditions,digest:await digestContract('MissionConditionRecord',missionConditions)};
  const mission:MissionRecord={missionRef:subject,resourceOrganizationId:org,goalArtifactRef:before.artifactRef,
    goalDigest:before.contentDigest,goalRevision:1,domainType:'hello.mission',
    workflowRef:{kind:'Workflow',id:'hello.workflow',version:'1.0.0',digest:before.contentDigest},conditionRef:condition,
    responsibilityScopeRefs:[scope],status:'Active',stopEpoch:1,pauseRequested:false,cleanupStatus:'NotRequired',
    purposeNames:['abh.mission.manage'],createdBy:c.tenant.actor,createdAt:validFrom,updatedAt:validFrom,authorityRef:authority};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('MissionController')`INSERT INTO core.mission_conditions
      (resource_organization_id,id,workspace_id,purpose_names,record,mission_id,goal_revision)
      VALUES (${org},${condition.id},${null},${mission.purposeNames},${JSON.stringify(unsignedConditions)}::text::jsonb,${subject.id},1)`;
    await tx.owner('MissionController')`INSERT INTO core.missions
      (resource_organization_id,id,version,workspace_id,purpose_names,record,status,goal_revision,stop_epoch)
      VALUES (${org},${subject.id},2,${null},${mission.purposeNames},${JSON.stringify(mission)}::text::jsonb,'Active',1,1)`;
  });
  const payload:ProposeCorrectionPayload={subjectRef:subject,expectedVersion:2,beforeRef:before.artifactRef,
    newArtifactRef:replacement.artifactRef,targetOwner:'Domain',reason:'Correct the verified business fact',
    evidenceRefs:[scope],responsibilityRef:responsibility,purpose:'abh.correction.propose'};
  const command=(value=payload):ProposeCorrectionCommand=>({type:'abh.corrections.propose',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),
    target:{type:'abh.correction',id:randomUUID()},payload:value});
  const invoke=(value=command(),grants:readonly EntityRef[]=[grant])=>
    proposeCorrection(db,c,options(),value,grants);

  let accepted:CorrectionRecord|undefined;const stable=command();
  await assert.rejects(invoke(stable,[]),{code:'AUTHORITY_REQUIRED'});
  accepted=await invoke(stable);
  assert.equal(accepted.subjectVersion,2);assert.deepEqual(accepted.beforeRef,before.artifactRef);
  assert.deepEqual(accepted.proposedAfterRef,replacement.artifactRef);
  assert.equal(accepted.digest.startsWith('sha256:'),true);
  const replayed=await invoke(stable);assert.deepEqual(replayed,accepted);

  const missing={...payload,newArtifactRef:ref('abh.artifact')};
  await assert.rejects(invoke(command(missing)),{code:'RESOURCE_NOT_FOUND'});
  const foreignArtifact=await store(ref('abh.mission'),'{"foreign":true}');
  await assert.rejects(invoke(command({...payload,newArtifactRef:foreignArtifact.artifactRef})),{code:'PRECONDITION_FAILED'});
  const stale=command({...payload,expectedVersion:3,subjectRef:{...subject,version:3},
    beforeRef:{...before.artifactRef,version:3}});
  await assert.rejects(invoke(stale),{code:'CORRECTION_STALE'});
  const issuer='correction.http.fixture',audience='abh.test',identitySubject=randomUUID(),
    identityDigest=await inputDigest([issuer,identitySubject]);
  await f.admin`INSERT INTO deployment.identity_locations
    (identity_digest,resource_organization_id,principal_id,principal_version)
    VALUES (${identityDigest},${org},${principal.id},1)`;
  const identity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{
    issuer,audience,subject:identitySubject,identityKind:'Human',
    authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),
    expiresAt:new Date(Date.now()+60_000).toISOString(),evidenceRef:ref('abh.identity-evidence')}})},
    {issuer,audience});
  const app=createCoreHttpApp({database:db,identity,credentials:async request=>{
    if(!['Bearer fixture','Bearer mission'].includes(String(request.headers.authorization)))throw new CoreError('UNAUTHENTICATED');
    return {credentialRef:ref('abh.credential'),organizationId:org,
      purpose:String(request.headers.authorization)==='Bearer mission'?'abh.mission.manage':'abh.correction.propose'};},
    corrections:{grants:async()=>[grant],get:{grants:async()=>[readGrant]},
      apply:{grants:async()=>[applyGrant],authority:async()=>{}}}});
  t.after(()=>app.close());
  const httpKey=randomUUID(),httpCommand=command(),send=()=>app.inject({method:'POST',
    url:'/v1/commands/abh.corrections.propose',
    headers:{authorization:'Bearer fixture','idempotency-key':httpKey},
    payload:{target:httpCommand.target,payload:httpCommand.payload}});
  const acceptedResponse=await send();
  assert.equal(acceptedResponse.statusCode,201,acceptedResponse.body);
  const acceptedHttp=acceptedResponse.json();
  assert.equal(acceptedHttp.data.correction.subjectVersion,2);
  assert.deepEqual((await send()).json(),acceptedHttp);
  const client=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer fixture'}),
    fetch:async(url,init)=>{const response=await app.inject({method:init?.method as 'POST',
      url:new URL(String(url)).pathname+new URL(String(url)).search,
      headers:Object.fromEntries(new Headers(init?.headers)),
      payload:String(init?.body)});
      return new Response(response.body,{status:response.statusCode,
        headers:{'content-type':String(response.headers['content-type'])}});}});
  const clientReplay=await client.corrections.propose({idempotencyKey:httpKey,
    targetId:httpCommand.target.id,payload:httpCommand.payload});
  assert.deepEqual(clientReplay,acceptedHttp);
  const correctionId=acceptedHttp.data.correction.correctionRef.id;
  const queryResponse=await app.inject({method:'GET',
    url:`/v1/queries/abh.corrections.get?id=${correctionId}`,
    headers:{authorization:'Bearer fixture'}});
  assert.equal(queryResponse.statusCode,200,queryResponse.body);
  assert.deepEqual(queryResponse.json(),acceptedHttp.data.correction);
  assert.deepEqual(await client.corrections.get({id:correctionId}),acceptedHttp.data.correction);
  const missingQuery=await app.inject({method:'GET',
    url:`/v1/queries/abh.corrections.get?id=${randomUUID()}`,
    headers:{authorization:'Bearer fixture'}});
  assert.equal(missingQuery.statusCode,404,missingQuery.body);
  await db.transaction(c,options(),async tx=>{await tx.owner('ArtifactStore')`
    UPDATE data.artifacts SET version=3,record=jsonb_set(record,'{artifactRef,version}','3') WHERE id=${before.artifactRef.id}`;});
  await assert.rejects(invoke(),{code:'CORRECTION_STALE'});
  await assert.rejects(invoke(command(payload),[]),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(invoke(command({...payload,responsibilityRef:ref('abh.responsibility-assignment')})),{code:'AUTHORITY_REQUIRED'});
  const applyPayload={subjectRef:subject,authorityRef:authority,evidenceRefs:[scope]};
  const applyCommand=(value=applyPayload):ApplyCorrectionCommand=>({type:'abh.corrections.apply',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),
    target:{type:'abh.correction',id:accepted!.correctionRef.id},expectedVersion:1,payload:value});
  const apply=(value=applyCommand(),grants:readonly EntityRef[]=[applyGrant],authorityAllowed=true)=>
    applyCorrection(db,applyContext,options(),value,grants,{
      grants:async()=>grants,authority:async(tx,correction)=>{
        if(!authorityAllowed||!sameRef(correction.correctionRef,accepted!.correctionRef))throw new CoreError('GOAL_AUTHORITY_INSUFFICIENT');
      }});
  const applyContext=deriveVerifiedContext({...c.request,purposeOfUse:'abh.mission.manage'});
  const stableApply=applyCommand();
  await assert.rejects(apply(applyCommand(),[],false),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(apply(applyCommand(),[applyGrant],false),{code:'GOAL_AUTHORITY_INSUFFICIENT'});
  const applyKey=stableApply.idempotencyKey,sendApply=()=>app.inject({method:'POST',
    url:'/v1/commands/abh.corrections.apply',headers:{authorization:'Bearer mission',
      'idempotency-key':applyKey,'if-match':'"1"'},
    payload:{target:{type:'abh.correction',id:accepted!.correctionRef.id},payload:applyPayload}});
  const appliedResponse=await sendApply();
  assert.equal(appliedResponse.statusCode,200,appliedResponse.body);
  const appliedBody=appliedResponse.json();
  const applied=appliedBody.data.application as CorrectionApplicationRecord;
  assert.deepEqual(applied.correctionRef,accepted!.correctionRef);
  assert.deepEqual(applied.resultRef,{...subject,version:3});assert.equal(applied.resultVersion,3);
  assert.deepEqual(appliedBody,(await sendApply()).json());
  const applyClient=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer mission'}),
    fetch:async(url,init)=>{const response=await app.inject({method:init?.method as 'POST',
      url:new URL(String(url)).pathname+new URL(String(url)).search,
      headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
      return new Response(response.body,{status:response.statusCode,
        headers:{'content-type':String(response.headers['content-type'])}});}});
  assert.deepEqual(await applyClient.corrections.apply({id:accepted!.correctionRef.id,
    expectedVersion:1,idempotencyKey:applyKey,payload:applyPayload}),appliedBody);
  assert.deepEqual(await apply(stableApply),applied);
  const revised=await db.transaction(applyContext,options(),async tx=>await new MissionOwner().get(tx,subject.id));
  assert.deepEqual(revised.goalArtifactRef,replacement.artifactRef);assert.equal(revised.goalRevision,2);
  assert.deepEqual(await db.transaction(applyContext,options(),async tx=>
    new CorrectionApplicationOwner().getApplication(tx,applied.applicationRef)),applied);
  const immutable=await db.transaction(c,options(),async tx=>await new CorrectionOwner().get(tx,accepted!.correctionRef));
  assert.equal(immutable.digest,accepted!.digest);
  const [counts]=await f.admin`SELECT
    (SELECT count(*) FROM human.corrections) AS corrections,
    (SELECT count(*) FROM human.correction_applications) AS applications,
    (SELECT count(*) FROM data.audit_records) AS audits,
    (SELECT count(*) FROM data.outbox) AS events,
    (SELECT count(*) FROM data.command_receipts) AS receipts`;
  assert.deepEqual(counts,{corrections:'2',applications:'1',audits:'9',events:'9',receipts:'3'});
});

test('run corrections apply only through the current graph revision',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=f.database,c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.runtime.deliver'});
  const proposer=deriveVerifiedContext({...c.request,purposeOfUse:'abh.correction.propose'});
  const applyContext=deriveVerifiedContext({...c.request,purposeOfUse:'abh.runtime.deliver'});
  const org=c.tenant.resourceOrganizationId,principal=ref('abh.principal',c.tenant.actor.id),scope=ref('abh.organization',org),
    runRef=ref('abh.run'),responsibility=ref('abh.responsibility-assignment'),grant=ref('abh.grant'),applyGrant=ref('abh.grant'),
    authority=ref('abh.mission-authority');
  const validFrom=new Date(Date.now()-1000).toISOString(),validUntil=new Date(Date.now()+60_000).toISOString();
  const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment',responsibility.id),
    resourceOrganizationId:org,principalRef:principal,responsibilityType:'Correction',scopeRefs:[runRef],
    validFrom,validUntil,templateRef:ref('abh.artifact'),status:'Active'};
  const grantRecord:GrantRecord={grantRef:ref('abh.grant',grant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.propose'],purposeNames:['abh.correction.propose'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  const applyGrantRecord:GrantRecord={grantRef:ref('abh.grant',applyGrant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.apply'],purposeNames:['abh.runtime.deliver'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${org},${org},'run-corrections','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${org},${principal.id},'corrector','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    for(const value of [scope,principal,grant,applyGrant,responsibility,runRef,authority])
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
        VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${grant.id},${principal.id},${JSON.stringify(grantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${applyGrant.id},${principal.id},${JSON.stringify(applyGrantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('HumanGateway')`INSERT INTO human.responsibilities
      (resource_organization_id,id,workspace_id,principal_id,valid_from,valid_until,status,record)
      VALUES (${org},${responsibility.id},${null},${principal.id},${validFrom},${validUntil},'Active',
        ${JSON.stringify(assignment)}::text::jsonb)`;
  });
  const store=async(ownerRef:EntityRef,content:string)=>{const inline=new InlineArtifactOwner();
    const input:StoreInlineArtifactPayload={ownerRef,mediaType:'application/json',content,
      purposeNames:['abh.runtime.deliver','abh.correction.propose'],dataClass:'abh.data.internal',
      sourceRefs:[ownerRef],region:'local',retentionPolicyRef:ref('abh.retention-policy')};
    return db.transaction(c,options(),async tx=>await inline.store(tx,await artifactCommand(input),input,async()=>{}));};
  const node=(key:string,kind:'Compute'|'Agent'|'DomainCommand')=>({nodeKey:key,kind,inputRefs:[ref('abh.artifact')],required:true});
  const graph={nodes:[node('graph.one','Compute'),node('graph.two','Agent')],
    edges:[{from:'graph.one',to:'graph.two'}],supersededNodeKeys:[] as string[]};
  const before=await store(runRef,canonicalJson(graph));
  const run:RunRecord={runRef,resourceOrganizationId:org,missionRef:ref('abh.mission'),triggerKey:'run.correction',
    goalRevision:1,stopEpoch:0,progressBudgetSeconds:3600,progressDeadline:validUntil,
    workflowRef:{kind:'Workflow',id:'hello.workflow',version:'1.0.0',digest:before.contentDigest},
    assignmentSnapshotRef:before.artifactRef,executionMode:'Production',status:'Running',
    createdBy:c.tenant.actor,createdAt:validFrom,updatedAt:validFrom};
  await f.admin`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,created_by,updated_by)
    VALUES (${org},${runRef.id},${null},${['abh.runtime.deliver','abh.correction.propose']},${JSON.stringify(run)}::text::jsonb,
      ${run.missionRef.id},${run.triggerKey},${run.status},${run.runRef.version},0,${c.tenant.actor.id},${c.tenant.actor.id})`;
  const identity=async(type:string,idempotencyKey=randomUUID()):Promise<CommandIdentity>=>
    ({type,commandId:randomUUID(),idempotencyKey,digest:await inputDigest({type,idempotencyKey})});
  const initialPayload:ProposeGraphPatchPayload={runRef,baseRevision:0,addNodes:graph.nodes,addEdges:graph.edges,
    supersedePendingNodes:[],rationaleRef:before.artifactRef};
  const current=await db.transaction(c,options(),async tx=>await new RunOwner().proposeGraphPatch(
    tx,await identity('abh.graph-patches.propose'),runRef,initialPayload));
  assert.equal(current.revision,1);
  const patchPayload:ProposeGraphPatchPayload={runRef,baseRevision:1,
    addNodes:[node('graph.three','DomainCommand')],addEdges:[{from:'graph.two',to:'graph.three'}],
    supersedePendingNodes:[],rationaleRef:before.artifactRef};
  const patch=await store(runRef,JSON.stringify(patchPayload));
  const replacement=patch;
  const payload:ProposeCorrectionPayload={subjectRef:runRef,expectedVersion:1,beforeRef:before.artifactRef,
    newArtifactRef:replacement.artifactRef,targetOwner:'Run',reason:'Correct the verified run graph',
    evidenceRefs:[scope],responsibilityRef:responsibility,purpose:'abh.correction.propose'};
  const command=(value=payload):ProposeCorrectionCommand=>({type:'abh.corrections.propose',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.correction',id:randomUUID()},payload:value});
  const propose=(value=command(),grants:readonly EntityRef[]=[grant])=>
    proposeCorrection(db,proposer,options(),value,grants);
  await assert.rejects(propose(command(),[]),{code:'AUTHORITY_REQUIRED'});
  const accepted=await propose();assert.equal(accepted.targetOwner,'Run');
  const applyPayload={subjectRef:runRef,authorityRef:authority,evidenceRefs:[scope]};
  const applyCommand=(value=applyPayload):ApplyCorrectionCommand=>({type:'abh.corrections.apply',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.correction',id:accepted.correctionRef.id},
    expectedVersion:1,payload:value});
  const apply=(value=applyCommand(),grants:readonly EntityRef[]=[applyGrant],authorityAllowed=true)=>
    applyCorrection(db,applyContext,options(),value,grants,{
      grants:async()=>grants,authority:async(tx,correction)=>{
        if(!authorityAllowed)throw new CoreError('GOAL_AUTHORITY_INSUFFICIENT');
      }});
  await assert.rejects(apply(applyCommand(),[],false),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(apply(applyCommand(),[applyGrant],false),{code:'GOAL_AUTHORITY_INSUFFICIENT'});
  const staleBefore=await store(runRef,canonicalJson({nodes:[],edges:[],supersededNodeKeys:[]}));
  const staleProposal=await propose(command({...payload,beforeRef:staleBefore.artifactRef,
    newArtifactRef:staleBefore.artifactRef}));
  const staleCommand=(correction:CorrectionRecord,value=applyPayload):ApplyCorrectionCommand=>({
    type:'abh.corrections.apply',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
    target:{type:'abh.correction',id:correction.correctionRef.id},expectedVersion:1,payload:value});
  await assert.rejects(apply(staleCommand(staleProposal)),{code:'CORRECTION_STALE'});
  const stalePatchPayload={...patchPayload,baseRevision:0};
  const stalePatch=await store(runRef,JSON.stringify(stalePatchPayload));
  const stalePatchProposal=await propose(command({...payload,newArtifactRef:stalePatch.artifactRef}));
  await assert.rejects(apply(staleCommand(stalePatchProposal)),{code:'PRECONDITION_FAILED'});
  const stable=applyCommand();
  const applied=await apply(stable);
  assert.equal(applied.subjectVersionBefore,1);assert.equal(applied.resultVersion,2);
  const revision=await db.transaction(applyContext,options(),async tx=>
    await new RunOwner().getGraphRevision(tx,applied.resultRef.id)) as GraphRevisionRecord;
  assert.equal(revision.revision,2);assert.equal(revision.nodes.length,3);
  assert.equal(revision.supersededNodeKeys.length,0);
  assert.deepEqual(await apply(stable),applied);
  const [counts]=await f.admin`SELECT
    (SELECT count(*) FROM human.correction_applications) AS applications,
    (SELECT count(*) FROM core.graph_revisions WHERE run_id=${runRef.id}) AS revisions,
    (SELECT count(*) FROM core.tasks WHERE run_id=${runRef.id} AND node_key='graph.one') AS initial,
    (SELECT status FROM core.tasks WHERE run_id=${runRef.id} AND node_key='graph.three') AS added`;
  assert.deepEqual(counts,{applications:'1',revisions:'2',initial:'1',added:'Pending'});
});

test('memory corrections create a successor learning signal',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=f.database,c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.correction.propose'});
  const applyContext=deriveVerifiedContext({...c.request,purposeOfUse:'abh.learning.capture'});
  const org=c.tenant.resourceOrganizationId,principal=ref('abh.principal',c.tenant.actor.id),scope=ref('abh.organization',org),
    signalRef=ref('abh.learning-signal'),responsibility=ref('abh.responsibility-assignment'),grant=ref('abh.grant'),
    applyGrant=ref('abh.grant'),authority=ref('abh.mission-authority');
  const validFrom=new Date(Date.now()-1000).toISOString(),validUntil=new Date(Date.now()+60_000).toISOString();
  const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment',responsibility.id),
    resourceOrganizationId:org,principalRef:principal,responsibilityType:'Correction',scopeRefs:[signalRef],
    validFrom,validUntil,templateRef:ref('abh.artifact'),status:'Active'};
  const grantRecord:GrantRecord={grantRef:ref('abh.grant',grant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.propose'],purposeNames:['abh.correction.propose'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  const applyGrantRecord:GrantRecord={grantRef:ref('abh.grant',applyGrant.id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:['abh.corrections.apply'],purposeNames:['abh.learning.capture'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${org},${org},'memory-corrections','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${org},${principal.id},'learner','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    for(const value of [scope,principal,grant,applyGrant,responsibility,signalRef,authority])
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
        VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${grant.id},${principal.id},${JSON.stringify(grantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
      VALUES (${org},${applyGrant.id},${principal.id},${JSON.stringify(applyGrantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
    await tx.owner('HumanGateway')`INSERT INTO human.responsibilities
      (resource_organization_id,id,workspace_id,principal_id,valid_from,valid_until,status,record)
      VALUES (${org},${responsibility.id},${null},${principal.id},${validFrom},${validUntil},'Active',
        ${JSON.stringify(assignment)}::text::jsonb)`;
  });
  const original:LearningSignalRecord={signalRef,resourceOrganizationId:org,sourceEventRef:ref('abh.correction'),
    signalType:'memory.correction',artifactRefs:[],scopeRef:scope,purposeOfUse:'abh.learning.capture',
    capturedAt:validFrom};
  await f.admin`INSERT INTO core.learning_signals(resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,signal_type)
    VALUES (${org},${signalRef.id},${null},${principal.id},${principal.id},${['abh.learning.capture']},${JSON.stringify(original)}::text::jsonb,${original.signalType})`;
  const store=async(content:string)=>{const inline=new InlineArtifactOwner();
    const input:StoreInlineArtifactPayload={ownerRef:signalRef,mediaType:'application/json',content,
      purposeNames:['abh.correction.propose','abh.learning.capture'],dataClass:'abh.data.internal',
      sourceRefs:[signalRef],region:'local',retentionPolicyRef:ref('abh.retention-policy')};
    return db.transaction(c,options(),async tx=>await inline.store(tx,await artifactCommand(input),input,async()=>{}));};
  const before=await store(canonicalJson(original)),replacement=await store('{"correctedMemory":true}');
  const payload:ProposeCorrectionPayload={subjectRef:signalRef,expectedVersion:1,beforeRef:before.artifactRef,
    newArtifactRef:replacement.artifactRef,targetOwner:'Memory',reason:'Correct the retained learning signal',
    evidenceRefs:[scope],responsibilityRef:responsibility,purpose:'abh.correction.propose'};
  const command=(value=payload):ProposeCorrectionCommand=>({type:'abh.corrections.propose',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.correction',id:randomUUID()},payload:value});
  const propose=(value=command(),grants:readonly EntityRef[]=[grant])=>
    proposeCorrection(db,c,options(),value,grants);
  await assert.rejects(propose(command(),[]),{code:'AUTHORITY_REQUIRED'});
  const accepted=await propose();
  const applyPayload={subjectRef:signalRef,authorityRef:authority,evidenceRefs:[scope]};
  const applyCommand=(value=applyPayload):ApplyCorrectionCommand=>({type:'abh.corrections.apply',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.correction',id:accepted.correctionRef.id},
    expectedVersion:1,payload:value});
  const apply=(value=applyCommand(),grants:readonly EntityRef[]=[applyGrant],authorityAllowed=true)=>
    applyCorrection(db,applyContext,options(),value,grants,{
      grants:async()=>grants,authority:async(tx,correction)=>{
        if(!authorityAllowed)throw new CoreError('GOAL_AUTHORITY_INSUFFICIENT');
      }});
  await assert.rejects(apply(applyCommand(),[],false),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(apply(applyCommand(),[applyGrant],false),{code:'GOAL_AUTHORITY_INSUFFICIENT'});
  const staleArtifact=await store('{"differentMemory":true}');
  const staleProposal=await propose(command({...payload,beforeRef:staleArtifact.artifactRef,
    newArtifactRef:staleArtifact.artifactRef}));
  const staleCommand:ApplyCorrectionCommand={...applyCommand(),commandId:randomUUID(),idempotencyKey:randomUUID(),
    target:{type:'abh.correction',id:staleProposal.correctionRef.id}};
  await assert.rejects(apply(staleCommand),{code:'CORRECTION_STALE'});
  const stable=applyCommand(),applied=await apply(stable);
  assert.equal(applied.targetOwner,'Memory');assert.deepEqual(applied.resultRef.type,'abh.learning-signal');
  assert.deepEqual(await apply(stable),applied);
  const secondProposal=await propose(command({...payload,beforeRef:before.artifactRef,
    newArtifactRef:replacement.artifactRef}));
  const secondCommand:ApplyCorrectionCommand={...applyCommand(),commandId:randomUUID(),idempotencyKey:randomUUID(),
    target:{type:'abh.correction',id:secondProposal.correctionRef.id}};
  await assert.rejects(apply(secondCommand),{code:'PRECONDITION_FAILED'});
  const successor=await db.transaction(applyContext,options(),async tx=>{
    const [row]=await tx.owner('LearningController')`SELECT record FROM core.learning_signals
      WHERE resource_organization_id=${org} AND id=${applied.resultRef.id} AND deleted_at IS NULL`;
    return contract('LearningSignalRecord',row!.record);
  });
  assert.deepEqual(successor.sourceEventRef,original.sourceEventRef);
  assert.deepEqual(successor.artifactRefs,[replacement.artifactRef]);
  const [counts]=await f.admin`SELECT
    (SELECT count(*) FROM core.learning_signals) AS signals,
    (SELECT count(*) FROM core.learning_signals WHERE record->'signalRef'->>'id'=${signalRef.id}) AS originals,
    (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.learning-signal.corrected') AS corrected`;
  assert.deepEqual(counts,{signals:'2',originals:'1',corrected:'1'});
});

test('capability corrections create a governed draft candidate',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());
  const db=f.database,c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.correction.propose'});
  const applyContext=deriveVerifiedContext({...c.request,purposeOfUse:'abh.learning.capture'});
  const org=c.tenant.resourceOrganizationId,principal=ref('abh.principal',c.tenant.actor.id),scope=ref('abh.organization',org),
    responsibility=ref('abh.responsibility-assignment'),proposeGrant=ref('abh.grant'),applyGrant=ref('abh.grant'),
    learningGrant=ref('abh.grant'),authority=ref('abh.capability-authority'),domainOwner=ref('abh.domain');
  const validFrom=new Date(Date.now()-1000).toISOString(),validUntil=new Date(Date.now()+120_000).toISOString();
  const grantRecord=(action:string,id:string):GrantRecord=>({grantRef:ref('abh.grant',id),resourceOrganizationId:org,principalRef:principal,
    scopeRefs:[scope],actionTypes:[action],purposeNames:action==='abh.corrections.propose'
      ?['abh.correction.propose']:['abh.learning.capture'],
    validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'});
  const proposeGrantRecord=grantRecord('abh.corrections.propose',proposeGrant.id),
    applyGrantRecord=grantRecord('abh.corrections.apply',applyGrant.id),
    learningGrantRecord=grantRecord('abh.learning.build-case',learningGrant.id);
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
      VALUES (${org},${org},'capability corrections','local','Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
      VALUES (${org},${principal.id},'capability corrector','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
      VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
    for(const value of [scope,principal,proposeGrant,applyGrant,learningGrant,authority])
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
        VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
    for(const record of [proposeGrantRecord,applyGrantRecord,learningGrantRecord])
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
        VALUES (${org},${record.grantRef.id},${principal.id},${JSON.stringify(record)}::text::jsonb,${validFrom},${validUntil},'Active')`;
  });
  const signals=[ref('abh.learning-signal'),ref('abh.learning-signal')].map(signal=>({signalRef:signal,
    resourceOrganizationId:org,sourceEventRef:ref('abh.correction'),signalType:'capability.correction',
    artifactRefs:[],scopeRef:scope,purposeOfUse:'abh.learning.capture',capturedAt:validFrom}));
  await f.admin`INSERT INTO core.learning_signals
    (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,signal_type)
    VALUES (${org},${signals[0]!.signalRef.id},${null},${principal.id},${principal.id},${['abh.learning.capture']},
      ${JSON.stringify(signals[0])}::text::jsonb,${signals[0]!.signalType}),
    (${org},${signals[1]!.signalRef.id},${null},${principal.id},${principal.id},${['abh.learning.capture']},
      ${JSON.stringify(signals[1])}::text::jsonb,${signals[1]!.signalType})`;
  const storeArtifact=async(ownerRef:EntityRef,sourceRefs:EntityRef[],content:string,purposeNames:string[])=>{
    const inline=new InlineArtifactOwner();
    const input:StoreInlineArtifactPayload={ownerRef,mediaType:'application/json',content,purposeNames,
      dataClass:'capability.candidate',sourceRefs,region:'local',retentionPolicyRef:ref('abh.retention-policy')};
    return db.transaction(c,options(),async tx=>await inline.store(tx,await artifactCommand(input),input,async()=>{}));
  };
  const evidence=await storeArtifact(scope,[signals[0]!.signalRef,signals[1]!.signalRef],'{"rootCause":true}',['abh.correction.propose','abh.learning.capture']);
  const counter=await storeArtifact(scope,[signals[0]!.signalRef,signals[1]!.signalRef],'{"counter":true}',['abh.correction.propose','abh.learning.capture']);
  const caseInput={signalRefs:[signals[0]!.signalRef,signals[1]!.signalRef],rootCauseCode:'capability.prompt',
    evidenceRefs:[evidence.artifactRef],counterEvidenceRefs:[counter.artifactRef],domainOwnerRef:domainOwner};
  const built=await buildCase(db,applyContext,options(),{type:'abh.learning.build-case',schemaVersion:'0.1.0',
    commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:caseInput},[learningGrant]);
  const caseRef=built.caseRef;
  const before=await storeArtifact(caseRef,[caseRef],'{"prompt":{"version":"base"}}',['abh.correction.propose','abh.learning.capture']);
  const replacement=await storeArtifact(caseRef,[caseRef],'{"prompt":{"version":"corrected"}}',['abh.correction.propose','abh.learning.capture']);
  const assignment:ResponsibilityAssignmentRecord={responsibilityRef:ref('abh.responsibility-assignment',responsibility.id),
    resourceOrganizationId:org,principalRef:principal,responsibilityType:'Correction',scopeRefs:[caseRef],
    validFrom,validUntil,templateRef:ref('abh.artifact'),status:'Active'};
  const assign:CommandIdentity={type:'abh.responsibilities.assign',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(assignment)};
  await db.transaction(c,options(),tx=>assignResponsibility(tx,assign,assignment));
  await f.admin`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch,created_by,updated_by,purpose_names)
    VALUES (${org},${randomUUID()},'abh.learning-case',${caseRef.id},1,${principal.id},${principal.id},ARRAY['abh.learning.capture'])
    ON CONFLICT (resource_organization_id,scope_type,scope_id) DO NOTHING`;
  const proposeGrantRecordPatch:GrantRecord={...proposeGrantRecord,scopeRefs:[scope,caseRef]};
  const applyGrantRecordPatch:GrantRecord={...applyGrantRecord,scopeRefs:[scope,caseRef]};
  await f.admin`UPDATE control.grants SET record=${JSON.stringify(proposeGrantRecordPatch)}::text::jsonb WHERE resource_organization_id=${org} AND id=${proposeGrant.id}`;
  await f.admin`UPDATE control.grants SET record=${JSON.stringify(applyGrantRecordPatch)}::text::jsonb WHERE resource_organization_id=${org} AND id=${applyGrant.id}`;
  const payload:ProposeCorrectionPayload={subjectRef:caseRef,expectedVersion:1,beforeRef:before.artifactRef,
    newArtifactRef:replacement.artifactRef,targetOwner:'Capability',reason:'Correct the governed prompt',
    evidenceRefs:[scope],responsibilityRef:responsibility,purpose:'abh.correction.propose'};
  const proposeCommand:ProposeCorrectionCommand={type:'abh.corrections.propose',schemaVersion:'0.1.0',commandId:randomUUID(),
    idempotencyKey:randomUUID(),target:{type:'abh.correction',id:randomUUID()},payload};
  const correction=await proposeCorrection(db,c,options(),proposeCommand,[proposeGrant]);
  const applyPayload={subjectRef:caseRef,authorityRef:authority,evidenceRefs:[scope],candidate:{
    caseRef,baseVersion:1,assetKind:'model.prompt',scopeRef:scope,risk:'learning.low'}};
  const applyCommand:ApplyCorrectionCommand={type:'abh.corrections.apply',schemaVersion:'0.1.0',commandId:randomUUID(),
    idempotencyKey:randomUUID(),target:{type:'abh.correction',id:correction.correctionRef.id},expectedVersion:1,payload:applyPayload};
  const application=await applyCorrection(db,applyContext,options(),applyCommand,[applyGrant],{
    grants:async()=>[applyGrant],authority:async(tx,correction)=>{
      if(correction.targetOwner!=='Capability')throw new CoreError('FORBIDDEN');
    }});
  assert.equal(application.targetOwner,'Capability');assert.equal(application.resultRef.type,'abh.learning-candidate');
  assert.equal(application.resultVersion,1);
  const candidate=await db.transaction(applyContext,options(),async tx=>await new LearningOwner().getCandidate(tx,application.resultRef));
  assert.equal(candidate.status,'Draft');assert.equal(candidate.caseRef.id,caseRef.id);
  assert.deepEqual(candidate.candidateArtifactRef,replacement.artifactRef);
  const replay=await applyCorrection(db,applyContext,options(),applyCommand,[applyGrant],{
    grants:async()=>[applyGrant],authority:async()=>{}});
  assert.deepEqual(replay,application);
}); 
