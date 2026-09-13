import {checkSignedConnectorRecovery} from './signed-connector-recovery.ts';
import {installSignedConnectorFixture} from './install-signed-connector-fixture.ts';
import {retirePack} from '../src/extensions/retire-pack.ts';
import {storeSuspensionFailure} from '../src/execution/store-suspension-failure.ts';
import {runSuspensionDispatchWorker} from '../src/execution/suspension-dispatch-worker.ts';
import {processActionSuspension} from '../src/execution/process-action-suspension.ts';
import {discoverPackSuspensions} from '../src/extensions/discover-pack-suspensions.ts';
import {createTenantRuntimeLoops} from '../src/durable/runtime-host.ts';
import {runSuspensionRecoveryWorker} from '../src/execution/suspension-recovery-worker.ts';
import {queryStoredSuspensionPages} from '../src/extensions/query-stored-suspension-pages.ts';
import {deliverActionSuspensionPage,type SuspensionTargetDelivery} from '../src/execution/deliver-suspension-page.ts';
import {actionPackSuspensionConsumer,runPackSuspensionConsumer} from '../src/execution/pack-suspension-consumer.ts';
import {SuspensionSweepOwner} from '../src/extensions/suspension-sweeps.ts';
import {consumeOutboxDelivery} from '../src/durable/delivery-worker.ts';
import {actionPackSuspensionRouter} from '../src/execution/pack-suspension-router.ts';
import {publishCommittedEvent,type OutboxPublisher} from '../src/durable/publisher.ts';
import {OutboxOwner} from '../src/durable/outbox.ts';
import {recordOutboxConsumption} from '../src/durable/outbox-consumption.ts';
import {PgBossDeliveryAdapter,type DeliveryScope} from '@abh/adapter-pg-boss';
import {readSuspensionPage} from '../src/extensions/read-suspension-page.ts';
import {storeSuspensionPage} from '../src/extensions/store-suspension-page.ts';
import {scanPackSuspension} from '../src/extensions/scan-pack-suspension.ts';
import {queryPackSuspensionTargets} from '../src/extensions/query-pack-suspension-targets.ts';
import {readPackSuspension} from '../src/extensions/read-pack-suspension.ts';
import {queryCapabilityReferences} from '../src/release/capability-references.ts';
import type {ActionPinChecks} from '../src/execution/pin-action.ts';
import {suspendPack} from '../src/extensions/suspend-pack.ts';
import type {ConnectorTransport} from '../src/execution/transport.ts';
import {checkSignedConnectorAuthorization} from './signed-connector-authorization.ts';
import {ActionCompilerHost} from '../src/execution/compiler.ts';
import {compilePreparedAction} from '../src/execution/compile-action.ts';
import {registerOperationPlan} from '../src/execution/register-plan.ts';
import {OperationOwner} from '../src/execution/operations.ts';
import {preparePackCapabilityResolution,resolvePreparedPackCapability} from '../src/extensions/prepare-pack-capability-resolution.ts';
import {lockPackCapabilityDeployment} from '../src/extensions/query-pack-capabilities.ts';
import {ActionOwner} from '../src/execution/actions.ts';
import {pinAction} from '../src/execution/pin-action.ts';
import {validateAction} from '../src/execution/validate-action.ts';
import {StaticReleaseOwner} from '../src/release/static.ts';
import {RunOwner} from '../src/mission/runs.ts';
import {queryPackCapabilities} from '../src/extensions/query-pack-capabilities.ts';
import {resolvePackCapability} from '../src/extensions/resolve-pack-capability.ts';
import {recoverLocalPackSnapshot} from '../src/extensions/local-pack-staging.ts';
import {lockFences} from '../src/control/fences.ts';
import {enablePack} from '../src/extensions/enable-pack.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {executeCommand} from '../src/data/journal.ts';
import {Database} from '../src/data/uow.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,readFile,rm} from 'node:fs/promises';
import type {GrantRecord,PackGovernanceSnapshot} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import {contract,inputDigest} from '../src/data/journal.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {InstalledPackOwner} from '../src/extensions/installed-packs.ts';
import type {signedConnectorFixture} from './signed-connector-fixture.ts';

/** Real governance publication, validation, Stage and register commands. Identity and
 * grants are administrative fixtures; no Enabled/approval facts are seeded. */
export async function checkSignedConnectorInstallation(fixture:Awaited<ReturnType<typeof signedConnectorFixture>>,root:string,input:string,durable:string,governance:PackGovernanceSnapshot){
 const f=await createDatabaseFixture();
 try{
  const c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.pack.manage'});
  const {org,ref,scope,principal,grant,base,checks,packRef,validationRef,snapshot,set,saved,installed,ctkRef,impactRef,impact,approvalRef,responsibility,reviewGrant,enableGrant,accepted,enabled,enableCommand,commitGrants,commitChecks,owner,enableInput}=await installSignedConnectorFixture(f,c,fixture,root,input,durable,governance);
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${grant.grantRef.id}`;
  const business=deriveVerifiedContext({...c.request,purposeOfUse:'abh.action.prepare'}),readGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.capabilities.read','abh.actions.validate','abh.actions.pin','abh.actions.register-plan','abh.artifacts.store-inline'],purposeNames:['abh.action.prepare']};
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${readGrant.grantRef.id},${principal.id},${JSON.stringify(readGrant)}::text::jsonb,${readGrant.validFrom},${readGrant.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${readGrant.grantRef.id},1)`;
  });
  const discovery={fenceRefs:async()=>[],inspect:async()=>({visible:true,compatible:true,healthy:true})};
  const candidates=await queryPackCapabilities(f.database,business,options(),{kind:'abh.connector',limit:10},[readGrant.grantRef],discovery);
  assert.equal(candidates.candidates.length,1);assert.deepEqual(candidates.candidates[0]!.packRef,accepted.packRef);
  const entry=set.registrations[0]!,exact={kind:'Connector' as const,id:entry.capability.id,version:entry.capability.version,digest:entry.registrationDigest},slot='org.example.signed.execution';
  const purposeNames=['abh.action.prepare','abh.action.execute','abh.operation.reconcile','abh.runtime.deliver'];
  const policyProvenance=JSON.parse(await readFile(new URL('./fixtures/policy-provenance.json',import.meta.url),'utf8'));
  const behavior={kind:'BehaviorPolicy' as const,id:'org.example.signed.behavior',version:'1.0.0',digest:policyProvenance.wasmDigest};
  const businessCompiler={kind:'Compiler' as const,id:'org.example.signed.action-compiler',version:'1.0.0',digest:await inputDigest('signed fixture action compiler v1')};
  const release={releaseRef:ref('abh.release'),resourceOrganizationId:org,assets:[{behaviorSlot:slot,capabilityExactRefs:[exact,businessCompiler,behavior]}],gateRefs:[ctkRef],compatibilityRef:ctkRef,status:'Ready' as const};
  const assignment={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,releaseRef:release.releaseRef,scopeRefs:[scope],scopeTier:'Organization' as const,status:'Active' as const,selectable:true,executionAllowed:true,evidenceRefs:[approvalRef]};
  const releases=new StaticReleaseOwner(),actions=new ActionOwner(),service=ref('abh.principal');
  await f.database.transaction(business,options(),async tx=>{
   await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${service.id},'Signed Connector executor','Service',1,'Active')`;
   await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
   await releases.configure(tx,{type:'abh.releases.configure-static',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({release,assignment})},{release,assignment,purposeNames});
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.principal',${service.id},1)`;
  });
  const identity=async(type:string,input:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(input)});
  const content=canonicalJson({message:'signed Connector business input'}),artifactInput={ownerRef:scope,mediaType:'application/json',content,dataClass:'abh.data.internal',purposeNames,sourceRefs:[scope],region:'local',retentionPolicyRef:scope};
  const artifactCommand=await identity('abh.artifacts.store-inline',artifactInput);
  const payload=await f.database.transaction(business,options(),tx=>new InlineArtifactOwner().store(tx,artifactCommand,artifactInput,async()=>{}));
  const actionInput={actionType:'org.example.signed.publish',targetRefs:[scope],payloadRef:payload.artifactRef,sourceVersionRefs:[scope],sourceProposalRef:payload.artifactRef};
  const definition={actionType:actionInput.actionType,executionPrincipalRef:service,completionPolicyRef:ctkRef,riskClass:'org.example.signed.low-risk',requiredBehaviorSlots:[slot],maxOperations:1,intentExpirySeconds:120,purposeNames};
  // Domain semantics and proposal admission are installed test policies. Validation
  // and Pin use real current Grants; these facts are not execution authority.
  const actionChecks={lock:async()=>{},artifact:async()=>{},proposal:async()=>enableInput.impactUpperBound};
  const actionCommand=await identity('abh.actions.propose',actionInput);
  const proposalReceipt=await f.database.transaction(business,options(),tx=>executeCommand(tx,actionCommand,async()=>{},async()=> (await actions.propose(tx,actionCommand,actionInput,definition,actionChecks)).actionRef));
  const proposed=await f.database.transaction(business,options(),tx=>actions.get(tx,proposalReceipt.receipt.resultRef.id));
  const validationPayload={domainValidationRef:payload.artifactRef},validationCommand=await identity('abh.actions.validate',{actionRef:proposed.actionRef,payload:validationPayload});
  const validated=await validateAction(f.database,business,options(),validationCommand,proposed.actionRef,validationPayload,[readGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{},artifact:async()=>{},domain:async()=>{}});
  const pinPayload={preparationAuthorityRefs:[readGrant.grantRef]},pinCommand=await identity('abh.actions.pin',{actionRef:validated.actionRef,payload:pinPayload}),pinChecks:ActionPinChecks={fenceRefs:async()=>[],admit:async()=>{},artifact:async()=>{},selected:async(tx,action,pins)=>{
   const intent=await actions.getIntent(tx,action.actionRef.id),selection=actions.preparationRequest(tx,intent,pinPayload.preparationAuthorityRefs);
   await resolvePackCapability(tx,options(),{exactRef:exact,pinSet:pins,request:selection,behaviorSlot:slot},{exactRef:exact,registeredKind:'abh.connector',implementationRef:entry.implementationRef,implementation:{}},[readGrant.grantRef],{
    query:discovery,fenceRefs:async()=>[],current:async()=>{},source:async()=> (await recoverLocalPackSnapshot(durable,snapshot,options())).files.payload,
   });
  }};
  const pinned=await pinAction(f.database,business,options(),pinCommand,validated.actionRef,pinPayload,pinChecks);
  assert.equal(pinned.replayed,false);assert.deepEqual(await pinAction(f.database,business,options(),pinCommand,validated.actionRef,pinPayload,pinChecks),{...pinned,replayed:true});
  const {selection,pins}=await f.database.transaction(business,options(),async tx=>{
   const action=await actions.get(tx,pinned.actionRef.id),intent=await actions.getIntent(tx,action.actionRef.id),pins=await releases.getPinSet(tx,action.actionRef);
   assert.ok(pins);assert.deepEqual(action.pinSetRef,pins.pinSetRef);assert.equal(action.position.lifecycle,'Validated');assert.equal(action.executionAuthorityRef,undefined);assert.equal(pins.subjectInputDigest,intent.digest);
   return {pins,selection:actions.preparationRequest(tx,intent,pinPayload.preparationAuthorityRefs)};
  });
  let transportCalls=0;
  const implementation=Object.freeze({capabilityRef:exact,send:async(request:Parameters<ConnectorTransport['send']>[0])=>{
   transportCalls++;assert.deepEqual(request.permit.connectorRef,exact);assert.equal(new TextDecoder().decode(request.payload),content);
   const execution=deriveVerifiedContext({...business.request,actor:{type:'Service',id:service.id},purposeOfUse:'abh.action.execute'});
   // A fresh transaction can observe the exit only after the dispatch UoW commits.
   const exits=await f.database.transaction(execution,options(),tx=>tx.owner('OperationController')`SELECT id FROM execution.dispatch_exits WHERE permit_id=${request.permit.permitRef.id}`);
   assert.equal(exits.length,1);return new TextEncoder().encode('{"accepted":true}');
  }}),binding={exactRef:exact,registeredKind:'abh.connector',implementationRef:entry.implementationRef,implementation};
  let healthy=true;
  const resolveChecks={query:{...discovery,inspect:async()=>({visible:true,compatible:true,healthy})},fenceRefs:async()=>[],current:async()=>{},source:async()=> (await recoverLocalPackSnapshot(durable,snapshot,options())).files.payload};
  const resolve=()=>f.database.transaction(business,options(),tx=>resolvePackCapability(tx,options(),{exactRef:exact,pinSet:pins,request:selection,behaviorSlot:slot},binding,[readGrant.grantRef],resolveChecks));
  const resolved=await resolve();assert.equal(resolved.implementation,implementation);assert.deepEqual(resolved.packRef,accepted.packRef);assert.deepEqual(resolved.assignmentRef,assignment.assignmentRef);assert.deepEqual(resolved.schema(),fixture.bytes);
  await f.database.transaction(business,options(),async tx=>{
   const token=await preparePackCapabilityResolution(tx,options(),{exactRef:exact,pinSet:pins,request:selection,behaviorSlot:slot},binding,[readGrant.grantRef],resolveChecks);
   await lockFences(tx,token.fenceRefs);await lockPackCapabilityDeployment(tx);
   const prepared=await resolvePreparedPackCapability(tx,token);
   assert.equal(prepared.implementation,implementation);assert.deepEqual(prepared.packRef,accepted.packRef);assert.deepEqual(prepared.schema(),fixture.bytes);
   await assert.rejects(resolvePreparedPackCapability(tx,token),{code:'PRECONDITION_FAILED'});
  });
  // Caller-owned bytes must not mutate the resolver's immutable Schema snapshot.
  resolved.schema().fill(0);assert.deepEqual(resolved.schema(),fixture.bytes);
  const wrongExact={...exact,digest:'sha256:'+'0'.repeat(64)};
  await assert.rejects(f.database.transaction(business,options(),tx=>resolvePackCapability(tx,options(),{exactRef:wrongExact,pinSet:pins,request:selection,behaviorSlot:slot},{...binding,exactRef:wrongExact},[readGrant.grantRef],resolveChecks)),{code:'PIN_INPUT_CONFLICT'});
  const host=new ActionCompilerHost([{capability:businessCompiler,compile:async input=>{
   const unsigned={planRef:ref('abh.operation-plan'),actionRef:input.action.actionRef,planVersion:1,pinSetRef:input.pins.pinSetRef,pinSetDigest:input.pins.digest,
    validatedAgainstPayloadDigest:input.action.payloadDigest,compilerRef:businessCompiler,connectorRefs:[exact],scopeProofRef:payload.artifactRef,completionPolicyRef:definition.completionPolicyRef,
    impactUpperBound:input.intent.impactUpperBound,nodes:[{nodeKey:'publish',connectionRef:ref('abh.connection'),accountRef:ref('org.example.signed.account'),resourceKey:'org.example.signed.message',operationType:actionInput.actionType,
     payloadRef:payload.artifactRef,payloadDigest:payload.contentDigest,connectorRef:exact,scopeRefs:[scope],completionPolicyRef:definition.completionPolicyRef,resourceRequirements:[],dependsOn:[],inputBindings:[]}],digest:'sha256:'+'0'.repeat(64)};
   return {...unsigned,digest:await digestContract('OperationPlan',unsigned)};
  }}]);
  // The compiler is an explicit trusted test installation. Connector admission
  // still resolves the actual signed Enabled Pack before and after compilation.
  const compilationChecks={fenceRefs:async()=>[],admit:async(tx:Parameters<typeof resolvePackCapability>[0])=>{
   await resolvePackCapability(tx,options(),{exactRef:exact,pinSet:pins,request:selection,behaviorSlot:slot},binding,[readGrant.grantRef],resolveChecks);
  },artifact:async()=>{}};
  const plan=await compilePreparedAction(f.database,business,options(),pinned.actionRef,businessCompiler,host,[readGrant.grantRef],compilationChecks);
  const registrationPayload={pinSetRef:plan.pinSetRef,pinSetDigest:plan.pinSetDigest,planRef:plan.planRef,planDigest:plan.digest,scopeProofRef:plan.scopeProofRef};
  const registrationCommand=await identity('abh.actions.register-plan',{actionRef:pinned.actionRef,payload:registrationPayload}),registrationChecks={...compilationChecks,plan:async()=>{}};
  const registerPlan=()=>registerOperationPlan(f.database,business,options(),registrationCommand,pinned.actionRef,registrationPayload,plan,[readGrant.grantRef],registrationChecks);
  const registered=await registerPlan();assert.equal(registered.replayed,false);assert.deepEqual(await registerPlan(),{...registered,replayed:true});
  await f.database.transaction(business,options(),async tx=>{
   const operations=new OperationOwner(),stored=await operations.getPlan(tx,pinned.actionRef.id),children=await operations.list(tx,pinned.actionRef.id),action=await actions.get(tx,pinned.actionRef.id);
   assert.deepEqual(stored,plan);assert.equal(children.length,1);assert.equal(children[0]!.attemptCount,0);assert.equal(children[0]!.position.lifecycle,'Pending');
   assert.deepEqual(stored!.connectorRefs,[exact]);assert.deepEqual(action.planRef,registered.planRef);assert.equal(action.executionAuthorityRef,undefined);
  });
  const queryRecovery=await checkSignedConnectorAuthorization(f.database,business,{actionRef:registered.actionRef,plan,behavior,responsibilityRef:responsibility.responsibilityRef,reviewGrant,packApprovalRef:approvalRef,installation:{behaviorSlot:slot,binding,admission:resolveChecks}});
  assert.equal(transportCalls,1);
  healthy=false;await assert.rejects(resolve(),{code:'PRECONDITION_FAILED'});await assert.rejects(registerPlan(),{code:'PRECONDITION_FAILED'});healthy=true;
  const secondProposal=await identity('abh.actions.propose',actionInput);
  const secondReceipt=await f.database.transaction(business,options(),tx=>executeCommand(tx,secondProposal,async()=>{},async()=> (await actions.propose(tx,secondProposal,actionInput,definition,actionChecks)).actionRef));
  const secondRef=secondReceipt.receipt.resultRef,secondValidation=await identity('abh.actions.validate',{actionRef:secondRef,payload:validationPayload});
  const second=await validateAction(f.database,business,options(),secondValidation,secondRef,validationPayload,[readGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{},artifact:async()=>{},domain:async()=>{}});
  const secondCommand=await identity('abh.actions.pin',{actionRef:second.actionRef,payload:pinPayload});
  const secondPin=await pinAction(f.database,business,options(),secondCommand,second.actionRef,pinPayload,pinChecks);
  const suspendGrant:GrantRecord={...enableGrant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.suspend']};
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${suspendGrant.grantRef.id},${principal.id},${JSON.stringify(suspendGrant)}::text::jsonb,${suspendGrant.validFrom},${suspendGrant.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${suspendGrant.grantRef.id},1)`;
  });
  const suspension=contract('SuspendPackCommand',{...base,type:'abh.packs.suspend',commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{packRef:accepted.packRef,expectedDeploymentVersion:enabled.deploymentVersion,reason:'Stop signed fixture capability',emergency:true,evidenceRefs:[approvalRef]}});
  let suspensionAllowed=false;const suspensionChecks={fenceRefs:async()=>[],current:async()=>{if(!suspensionAllowed)throw new Error('suspension policy denied');}};
  const suspend=()=>suspendPack(f.database,c,options(),suspension,[suspendGrant.grantRef],suspensionChecks);
  await assert.rejects(suspend(),/suspension policy denied/);suspensionAllowed=true;
  await assert.rejects(suspendPack(f.database,c,options(),suspension,[],suspensionChecks),{code:'AUTHORITY_REQUIRED'});
  assert.deepEqual(await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,accepted.packRef,async()=>{})),enabled);
  await assert.rejects(suspendPack(f.database,c,options(),{...suspension,payload:{...suspension.payload,expectedDeploymentVersion:enabled.deploymentVersion+1}},[suspendGrant.grantRef],suspensionChecks),{code:'VERSION_CONFLICT'});
  await f.admin`CREATE FUNCTION extension.reject_fixture_suspend() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record->>'status'='Suspended' THEN RAISE EXCEPTION 'suspend history fault'; END IF; RETURN NEW; END; $$`;
  await f.admin`CREATE TRIGGER reject_fixture_suspend BEFORE INSERT ON extension.installed_pack_history FOR EACH ROW EXECUTE FUNCTION extension.reject_fixture_suspend()`;
  try{await assert.rejects(suspend(),/suspend history fault/);}finally{await f.admin`DROP TRIGGER reject_fixture_suspend ON extension.installed_pack_history`;await f.admin`DROP FUNCTION extension.reject_fixture_suspend()`;}
  assert.deepEqual(await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,accepted.packRef,async()=>{})),enabled);
  const suspended=await suspend();assert.equal(suspended.replayed,false);assert.equal(suspended.packRef.version,3);assert.deepEqual(await suspend(),{...suspended,replayed:true});
  const [suspensionEvent]=await f.admin`SELECT id FROM data.outbox WHERE aggregate_id=${suspended.packRef.id} AND record->>'type'='abh.installed-pack.suspend'`;
  const eventRef=ref('abh.event',suspensionEvent!.id),sourceChecks={fenceRefs:async()=>[],current:async()=>{}};
  const suspensionSource=await readPackSuspension(f.database,c,options(),eventRef,[suspendGrant.grantRef],sourceChecks);
  assert.deepEqual(suspensionSource.packRef,suspended.packRef);assert.deepEqual(suspensionSource.previousPackRef,accepted.packRef);assert.equal(suspensionSource.capabilitySetDigest,set.setDigest);assert.equal(suspensionSource.emergency,true);
  assert.deepEqual(suspensionSource.capabilities,[{capability:entry.capability,registrationDigest:entry.registrationDigest,implementationRef:entry.implementationRef}]);
  const suspensionDiscovery={fenceRefs:async()=>[],discover:async()=>{},source:sourceChecks};
  const discoveredSuspensions=await discoverPackSuspensions(f.database,c,options(),{limit:1},[suspendGrant.grantRef],suspensionDiscovery);
  assert.deepEqual(discoveredSuspensions,{suspensions:[suspensionSource],complete:true});
  const managementTenant=c.tenant,afterSuspension={afterId:eventRef.id,bindingDigest:await inputDigest({organizationId:managementTenant.resourceOrganizationId,actingOrganizationId:managementTenant.actingOrganizationId,actor:managementTenant.actor,purpose:managementTenant.purposeOfUse})};
  assert.deepEqual(await discoverPackSuspensions(f.database,c,options(),{limit:1,cursor:afterSuspension},[suspendGrant.grantRef],suspensionDiscovery),{suspensions:[],complete:true});
  let discoveryChecks=0;
  await assert.rejects(discoverPackSuspensions(f.database,c,options(),{},[suspendGrant.grantRef],{...suspensionDiscovery,discover:async()=>{if(++discoveryChecks===2)throw new Error('final discovery denied');}}),/final discovery denied/);

  await assert.rejects(discoverPackSuspensions(f.database,c,options(),{},[],suspensionDiscovery),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(discoverPackSuspensions(f.database,business,options(),{},[suspendGrant.grantRef],suspensionDiscovery),{code:'PURPOSE_DENIED'});
  await assert.rejects(discoverPackSuspensions(f.database,c,options(),{cursor:{bindingDigest:'sha256:'+'0'.repeat(64),afterId:eventRef.id}},[suspendGrant.grantRef],suspensionDiscovery),{code:'INVALID_ARGUMENT'});
  await assert.rejects(discoverPackSuspensions(f.database,c,options(),{},[suspendGrant.grantRef],{...suspensionDiscovery,discover:async()=>{throw new Error('suspension discovery denied');}}),/suspension discovery denied/);
  await assert.rejects(discoverPackSuspensions(f.database,c,options(),{},[suspendGrant.grantRef],{...suspensionDiscovery,source:{...sourceChecks,current:async()=>{throw new Error('source read denied');}}}),/source read denied/);

  const [enableEvent]=await f.admin`SELECT id FROM data.outbox WHERE aggregate_id=${suspended.packRef.id} AND record->>'type'='abh.pack.enabled'`;
  await assert.rejects(readPackSuspension(f.database,c,options(),ref('abh.event',enableEvent!.id),[suspendGrant.grantRef],sourceChecks),{code:'PRECONDITION_FAILED'});
  await assert.rejects(readPackSuspension(f.database,c,options(),eventRef,[],sourceChecks),{code:'AUTHORITY_REQUIRED'});
  const latest=await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,suspended.packRef,async()=>{}));assert.equal(latest.status,'Suspended');assert.deepEqual(latest.enablement,enabled.enablement);
  assert.deepEqual(await f.database.transaction(c,options(),tx=>new InstalledPackOwner().readHistorical(tx,accepted.packRef,async()=>{})),enabled);
  assert.equal((await queryPackCapabilities(f.database,business,options(),{kind:'abh.connector',limit:10},[readGrant.grantRef],discovery)).candidates.length,0);
  const delivery=deriveVerifiedContext({...business.request,actor:{type:'Service',id:service.id},purposeOfUse:'abh.runtime.deliver'}),notificationGrant:GrantRecord={...readGrant,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.runtime.consume-event','abh.runtime.prepare-outbox','abh.runtime.record-outbox-delivery','abh.runtime.record-outbox-consumption'],purposeNames:['abh.runtime.deliver']};
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${notificationGrant.grantRef.id},${service.id},${JSON.stringify(notificationGrant)}::text::jsonb,${notificationGrant.validFrom},${notificationGrant.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${notificationGrant.grantRef.id},1)`;
  });
  let notificationFault=true;
  const notificationAdmission={
   fenceRefs:async()=>[],source:async(_tx:Parameters<typeof resolvePackCapability>[0],event:import('@abh/contracts').EventEnvelope,capability:import('@abh/contracts').CapabilityRef)=>{assert.equal(event.eventId,eventRef.id);assert.deepEqual(event.aggregateRef,suspensionSource.packRef);assert.equal(capability.digest,suspensionSource.capabilities[0]!.registrationDigest);},
   artifact:async()=>{if(notificationFault)throw new Error('notification persistence fault');},storage:{dataClass:'abh.data.internal',purposeNames:['abh.runtime.deliver'],region:'local',retentionPolicyRef:scope},
  };
  const consumer=actionPackSuspensionConsumer({actionRef:registered.actionRef,pinSetRef:pins.pinSetRef,capability:exact,registeredKind:'abh.connector',grantRefs:[notificationGrant.grantRef]},notificationAdmission);
  const secondConsumer=actionPackSuspensionConsumer({actionRef:secondPin.actionRef,pinSetRef:secondPin.pinSetRef,capability:exact,registeredKind:'abh.connector',grantRefs:[notificationGrant.grantRef]},notificationAdmission);
  const routerInput={ruleRef:ref('org.example.suspension-routing'),eventRef,subscriptions:[registered.actionRef,secondPin.actionRef].map(actionRef=>({actionRef,capability:exact,consumerRef:ref('org.example.suspension-consumer')}))};
  assert.throws(()=>actionPackSuspensionRouter({...routerInput,subscriptions:[routerInput.subscriptions[0]!,routerInput.subscriptions[0]!]}),{code:'INVALID_ARGUMENT'});
  assert.throws(()=>actionPackSuspensionRouter({...routerInput,subscriptions:[]}),{code:'INVALID_ARGUMENT'});
  assert.throws(()=>actionPackSuspensionRouter({...routerInput,subscriptions:Array.from({length:101},()=>routerInput.subscriptions[0]!)}),{code:'INVALID_ARGUMENT'});
  const router=actionPackSuspensionRouter(routerInput),admittedCalls=new Map<string,DeliveryScope>();
  routerInput.subscriptions.length=0; // Installation captures the complete input before any await.

  const queue=await PgBossDeliveryAdapter.start({connectionString:f.queueUrl,admission:{resolve:async context=>{const admitted=admittedCalls.get(context.callId);if(!admitted)throw new Error('missing fixture queue admission');return admitted;}},onError:()=>{}});
  try{
  const publisher:OutboxPublisher={workerId:randomUUID(),context:async()=>delivery,signal:options().signal,router,
   checks:{fenceRefs:async()=>[notificationGrant.grantRef],admit:async(tx,_event,permission,targetRef)=>{await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[notificationGrant.grantRef]);}},port:queue,
   enqueueContext:async(_context,routing,consumerId)=>{const callId=randomUUID();admittedCalls.set(callId,{resourceOrganizationId:org,consumerId});return {callId,requestContextRef:ref('abh.request-context'),target:{objectRef:routing.deliveries.find(item=>item.consumerId===consumerId)!.job.targetRef,scopeRefs:[scope],action:'abh.runtime.enqueue'},deadline:new Date(Date.now()+5000).toISOString()};},
   releaseEnqueueContext:context=>{admittedCalls.delete(context.callId);}};
  const published=await publishCommittedEvent(f.database,eventRef,publisher);assert.equal(published.publication!.deliveryRefs.length,2);
  assert.deepEqual(await publishCommittedEvent(f.database,eventRef,publisher),published);
  const routing=await f.database.transaction(delivery,options(),tx=>new OutboxOwner().getRouting(tx,published.routingRef));
  assert.equal(routing.deliveries.length,2);assert.ok(routing.deliveries.every(item=>item.job.authorityRef===undefined));
  const firstJob=await queue.fetch('control',options().signal),secondJob=await queue.fetch('control',options().signal);
  assert.ok(firstJob);assert.ok(secondJob);
  const notificationDelivery=[firstJob,secondJob].find(item=>item.consumerId===consumer.id)!;
  const secondDelivery=[firstJob,secondJob].find(item=>item.consumerId===secondConsumer.id)!;
  assert.ok(notificationDelivery);assert.ok(secondDelivery);
  await assert.rejects(recordOutboxConsumption(f.database,delivery,options(),routing.routingRef,[notificationGrant.grantRef]),{code:'PRECONDITION_FAILED'});
  await assert.rejects(consumeOutboxDelivery(f.database,delivery,options().signal,{...notificationDelivery,job:{...notificationDelivery.job,targetRef:contract('ActionRef',secondPin.actionRef)}},consumer),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(consumeOutboxDelivery(f.database,delivery,options().signal,notificationDelivery,secondConsumer),{code:'FORBIDDEN'});
  const wrongSourceConsumer=actionPackSuspensionConsumer({actionRef:registered.actionRef,pinSetRef:pins.pinSetRef,capability:exact,registeredKind:'abh.tool',grantRefs:[notificationGrant.grantRef]},{...notificationAdmission,source:async()=>{},artifact:async()=>{}});
  await assert.rejects(consumeOutboxDelivery(f.database,delivery,options().signal,notificationDelivery,wrongSourceConsumer),{code:'PIN_INPUT_CONFLICT'});
  await assert.rejects(f.database.transaction(delivery,options(),tx=>new InstalledPackOwner().readSuspendedForNotification(tx,ref('abh.event',enableEvent!.id),[notificationGrant.grantRef])),{code:'PRECONDITION_FAILED'});
  await assert.rejects(f.database.transaction(delivery,options(),tx=>new InstalledPackOwner().readSuspendedForNotification(tx,eventRef,[])),{code:'AUTHORITY_REQUIRED'});
  const beforeNotification=await f.database.transaction(delivery,options(),async tx=>({action:await actions.get(tx,registered.actionRef.id),children:await new OperationOwner().list(tx,registered.actionRef.id)}));
  await assert.rejects(consumeOutboxDelivery(f.database,delivery,options().signal,notificationDelivery,consumer),/notification persistence fault/);
  const [failedInbox]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id} AND consumer_id=${consumer.id}`;assert.equal(failedInbox!.count,'0');notificationFault=false;
  const notified=await consumeOutboxDelivery(f.database,delivery,options().signal,notificationDelivery,consumer);
  assert.deepEqual(await consumeOutboxDelivery(f.database,delivery,options().signal,notificationDelivery,consumer),notified);
  const notificationRestart=await Database.connect(f.runtimeUrl,{max:1});
  try{assert.deepEqual(await consumeOutboxDelivery(notificationRestart,delivery,options().signal,notificationDelivery,consumer),notified);}finally{await notificationRestart.close();}
  const [inboxCount]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id} AND consumer_id=${consumer.id}`;assert.equal(inboxCount!.count,'1');
  const observation=await f.database.transaction(delivery,options(),tx=>new InlineArtifactOwner().read(tx,notified.resultRef,async()=>{}));
  const notice=JSON.parse(new TextDecoder().decode(observation.bytes));assert.equal(notice.kind,'ActionPackSuspensionObservation');assert.deepEqual(notice.actionRef,beforeNotification.action.actionRef);assert.equal(notice.operations[0].attemptCount,1);
  assert.deepEqual(await f.database.transaction(delivery,options(),async tx=>({action:await actions.get(tx,registered.actionRef.id),children:await new OperationOwner().list(tx,registered.actionRef.id)})),beforeNotification);
  await queue.complete(notificationDelivery,notified.inboxRef);
  await assert.rejects(recordOutboxConsumption(f.database,delivery,options(),routing.routingRef,[notificationGrant.grantRef]),{code:'PRECONDITION_FAILED'});
  const pageDiscovery={source:sourceChecks,references:{fenceRefs:async()=>[readGrant.grantRef],admit:async(tx:Parameters<typeof resolvePackCapability>[0])=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},[readGrant.grantRef]);},canRead:async()=>true}};
  const fullPage=await queryPackSuspensionTargets(f.database,c,business,options(),{eventRef,capability:exact,registeredKind:'abh.connector',limit:100},[suspendGrant.grantRef],pageDiscovery);
  assert.equal(fullPage.targets.length,2);assert.equal(fullPage.complete,true);
  const storeNotificationPage=(page:typeof fullPage)=>storeSuspensionPage(f.database,business,options(),{eventRef,capability:exact,page},{dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],region:'local',retentionPolicyRef:scope},[readGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{},references:async()=>{}});
  const savedNotificationPage=await storeNotificationPage(fullPage),deliveryInput={...savedNotificationPage,eventRef,capability:exact};
  const pageRead={fenceRefs:async()=>[readGrant.grantRef],artifact:async(tx:Parameters<typeof resolvePackCapability>[0])=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},[readGrant.grantRef]);}};
  let losePageAck=true,pageAcks=0;
  const secondKey=fullPage.targets.find(target=>target.subjectRef.id===secondPin.actionRef.id)!.notificationKey;
  const pageDelivery={context:async()=>delivery,registeredKind:'abh.connector',grantRefs:[notificationGrant.grantRef],page:pageRead,action:notificationAdmission,
   onHandled:async(result:SuspensionTargetDelivery)=>{pageAcks++;if(losePageAck&&result.notificationKey===secondKey)throw new Error('page acknowledgement lost');}};
  notificationFault=true;
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),deliveryInput,pageDelivery),/notification persistence fault/);
  const [beforePageRecovery]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id}`;assert.equal(beforePageRecovery!.count,'1');notificationFault=false;
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),deliveryInput,pageDelivery),/page acknowledgement lost/);
  const [afterLostPageAck]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id}`;assert.equal(afterLostPageAck!.count,'2');losePageAck=false;
  const recoveredNotificationDatabase=await Database.connect(f.runtimeUrl,{max:1});
  let pageDelivered;
  try{pageDelivered=await deliverActionSuspensionPage(recoveredNotificationDatabase,business,options(),deliveryInput,pageDelivery);}finally{await recoveredNotificationDatabase.close();}
  assert.equal(pageDelivered.deliveries.length,2);assert.ok(pageDelivered.deliveries.some(item=>item.inboxRef.id===notified.inboxRef.id));
  assert.deepEqual(await deliverActionSuspensionPage(f.database,business,options(),deliveryInput,pageDelivery),pageDelivered);
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),deliveryInput,{...pageDelivery,context:async()=>deriveVerifiedContext({...delivery.request,workspaceId:randomUUID()})}),{code:'FORBIDDEN'});
  const recoveryDiscovery={...pageRead,discoveryFences:async()=>[readGrant.grantRef],discover:pageRead.artifact};
  const recoveryStop=new AbortController();let recoveryPages=0,recoveryIdentities=0;
  await runSuspensionRecoveryWorker(f.database,{eventRef,capability:exact,pageContext:async()=>{recoveryIdentities++;return business;},discovery:recoveryDiscovery,delivery:pageDelivery,signal:recoveryStop.signal,pageSize:1,intervalMs:1,
   onPage:async result=>{recoveryPages++;assert.equal(result.pages,1);assert.equal(result.deliveries,2);assert.equal(result.sweepComplete,true);if(recoveryPages===2)recoveryStop.abort();}});
  assert.equal(recoveryPages,2);assert.equal(recoveryIdentities,4,'refresh discovery and page identities on each resweep');
  const hostedStop=new AbortController();let hostedPages=0;
  const hostedInstallation={eventRef:{...eventRef},capability:{...exact},pageContext:async()=>business,discovery:recoveryDiscovery,delivery:pageDelivery,
   onPage:async()=>{hostedPages++;hostedStop.abort();}};
  const hostedLoops=createTenantRuntimeLoops(f.database,{suspensionRecovery:[hostedInstallation],
   recovery:{workerId:randomUUID(),context:async()=>delivery,grantRefs:[]},consumption:{context:async()=>delivery,grantRefs:[]},publisher});
  hostedInstallation.eventRef.id=randomUUID();hostedInstallation.pageContext=async()=>{throw new Error('replaced host installation');};
  await hostedLoops[0]!(hostedStop.signal);assert.equal(hostedPages,1);
  let driftCalls=0;
  await assert.rejects(runSuspensionRecoveryWorker(f.database,{eventRef,capability:exact,pageContext:async()=>++driftCalls===1?business:deriveVerifiedContext({...business.request,workspaceId:randomUUID()}),discovery:recoveryDiscovery,delivery:pageDelivery,signal:options().signal,intervalMs:1}),{code:'FORBIDDEN'});
  const contextStop=new AbortController();let contextEntered!:()=>void;
  const contextStarted=new Promise<void>(resolve=>{contextEntered=resolve;});
  const stalledRecovery=runSuspensionRecoveryWorker(f.database,{eventRef,capability:exact,pageContext:async()=>{contextEntered();return new Promise<never>(()=>{});},discovery:recoveryDiscovery,delivery:pageDelivery,signal:contextStop.signal});
  await contextStarted;contextStop.abort();await stalledRecovery;
  const [afterRecovery]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id}`;assert.equal(afterRecovery!.count,'2');
  const alteredPage=structuredClone(fullPage);alteredPage.targets[0]!.pinSetDigest='sha256:'+'0'.repeat(64);
  const alteredArtifact=await storeNotificationPage(alteredPage);
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),{...alteredArtifact,eventRef,capability:exact},pageDelivery),{code:'PIN_INPUT_CONFLICT'});
  const stoppedDelivery=new AbortController();stoppedDelivery.abort();const priorPageAcks=pageAcks;
  await assert.rejects(deliverActionSuspensionPage(f.database,business,{...options(),signal:stoppedDelivery.signal},deliveryInput,pageDelivery),{code:'DEPENDENCY_TIMEOUT'});assert.equal(pageAcks,priorPageAcks);
  const acknowledgementStop=new AbortController();let acknowledgementEntered=0;
  await assert.rejects(deliverActionSuspensionPage(f.database,business,{...options(),signal:acknowledgementStop.signal},deliveryInput,{...pageDelivery,onHandled:async()=>{acknowledgementEntered++;acknowledgementStop.abort();return new Promise<never>(()=>{});}}),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(acknowledgementEntered,1);
  let deniedPageContextCalls=0;
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),deliveryInput,{...pageDelivery,page:{...pageRead,artifact:async()=>{throw new Error('page read denied');}},context:async()=>{deniedPageContextCalls++;return delivery;}}),/page read denied/);
  assert.equal(deniedPageContextCalls,0);
  const rescannedDeliveries:SuspensionTargetDelivery[]=[];
  const deliveredScan=await scanPackSuspension(f.database,options(),{eventRef,capability:exact,registeredKind:'abh.connector',limit:1},{contexts:async()=>({management:c,business}),grants:[suspendGrant.grantRef],admission:pageDiscovery,
   accept:async(page,work)=>{
    const saved=await storeSuspensionPage(f.database,business,work,{eventRef,capability:exact,page},{dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],region:'local',retentionPolicyRef:scope},[readGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{},references:async()=>{}});
    const delivered=await deliverActionSuspensionPage(f.database,business,work,{...saved,eventRef,capability:exact},pageDelivery);
    assert.equal(delivered.deliveries.length,1);rescannedDeliveries.push(...delivered.deliveries);
   }});
  assert.equal(deliveredScan.complete,true);assert.equal(deliveredScan.acceptedPages,2);
  assert.deepEqual(rescannedDeliveries,pageDelivered.deliveries,'page boundaries do not change original-event Inbox identity');
  const processing={contexts:async()=>({management:c,business}),managementGrants:[suspendGrant.grantRef],discovery:pageDiscovery,
   storage:{retention:{dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],region:'local',retentionPolicyRef:scope},grants:[readGrant.grantRef],checks:{fenceRefs:async()=>[],admit:async()=>{},references:async()=>{}}},delivery:pageDelivery};
  const processingInput={eventRef,capability:exact,registeredKind:'abh.connector',limit:1,maxPages:1};
  const processedPartial=await processActionSuspension(f.database,options(),processingInput,processing);
  assert.equal(processedPartial.complete,false);assert.equal(processedPartial.pages,1);assert.equal(processedPartial.targets,1);
  if(processedPartial.complete)throw new Error('expected partial processing');
  const processedRest=await processActionSuspension(f.database,options(),{...processingInput,cursor:processedPartial.cursor},processing);
  assert.deepEqual(processedRest,{pages:1,targets:1,complete:true});
  assert.deepEqual(await processActionSuspension(f.database,options(),{...processingInput,maxPages:10},processing),{pages:2,targets:2,complete:true});
  await assert.rejects(processActionSuspension(f.database,options(),processingInput,{...processing,storage:{...processing.storage,grants:[]}}),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(processActionSuspension(f.database,options(),processingInput,{...processing,delivery:{...pageDelivery,registeredKind:'abh.tool'}}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(processActionSuspension(f.database,options(),processingInput,{...processing,delivery:{...pageDelivery,onHandled:async()=>{throw new Error('processing acknowledgement lost');}}}),/processing acknowledgement lost/);
  const processingRestart=await Database.connect(f.runtimeUrl,{max:1});
  try{assert.deepEqual(await processActionSuspension(processingRestart,options(),processingInput,processing),processedPartial);}finally{await processingRestart.close();}
  const [processingInboxCount]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id}`;assert.equal(processingInboxCount!.count,'2');

  const dispatchStop=new AbortController();let dispatchedSweeps=0;
  await runSuspensionDispatchWorker(f.database,{signal:dispatchStop.signal,managementContext:async()=>c,managementGrants:[suspendGrant.grantRef],discovery:suspensionDiscovery,
   scopes:[{id:'org.example.business-primary',publicKind:exact.kind,processing},{id:'org.example.business-overlap',publicKind:exact.kind,processing}],targetPageSize:1,intervalMs:1,
   onPage:async stats=>{assert.deepEqual(stats,{events:1,scopeSweeps:2,blockedScopes:0,targetPages:4,targets:4,eventSweepComplete:true});if(++dispatchedSweeps===2)dispatchStop.abort();}});
  assert.equal(dispatchedSweeps,2);
  const [sweepStats]=await f.admin`SELECT count(*)::int AS count,count(*) FILTER (WHERE complete)::int AS complete,count(DISTINCT generation)::int AS generations,
   count(*) FILTER (WHERE cursor_id IS NOT NULL)::int AS cursors FROM runtime.suspension_sweeps WHERE event_id=${eventRef.id}`;
  assert.deepEqual(sweepStats,{count:4,complete:4,generations:2,cursors:4});
  const [dispatchedInboxCount]=await f.admin`SELECT count(*) FROM runtime.inbox WHERE event_id=${eventRef.id}`;assert.equal(dispatchedInboxCount!.count,'2','overlapping subscriptions and resweeps share original-event Inbox');
  await assert.rejects(runSuspensionDispatchWorker(f.database,{signal:options().signal,managementContext:async()=>c,managementGrants:[suspendGrant.grantRef],discovery:suspensionDiscovery,
   scopes:[{id:'org.example.unmapped',publicKind:exact.kind,processing:{...processing,delivery:{...processing.delivery,registeredKind:'abh.tool'}}}]}),{code:'PRECONDITION_FAILED'});
  let dispatchScopeCalls=0;
  await assert.rejects(runSuspensionDispatchWorker(f.database,{signal:options().signal,managementContext:async()=>c,managementGrants:[suspendGrant.grantRef],discovery:suspensionDiscovery,targetPageSize:1,
   scopes:[{id:'org.example.drifting',publicKind:exact.kind,processing:{...processing,contexts:async()=>({management:c,business:++dispatchScopeCalls===1?business:deriveVerifiedContext({...business.request,workspaceId:randomUUID()})})}}]}),{code:'FORBIDDEN'});
  const dispatcherCancel=new AbortController();let dispatchContextEntered!:()=>void;
  const dispatchContextStarted=new Promise<void>(resolve=>{dispatchContextEntered=resolve;});
  const blockedDispatcher=runSuspensionDispatchWorker(f.database,{signal:dispatcherCancel.signal,managementContext:async()=>{dispatchContextEntered();return new Promise<never>(()=>{});},managementGrants:[suspendGrant.grantRef],discovery:suspensionDiscovery,
   scopes:[{id:'org.example.cancelled',publicKind:exact.kind,processing}]});
  await dispatchContextStarted;dispatcherCancel.abort();await blockedDispatcher;
  const isolatedStop=new AbortController();let failIsolatedScope=true,isolatedRounds=0,isolatedFailures=0;
  const isolatedProcessing={...processing,storage:{...processing.storage,checks:{...processing.storage.checks,admit:async()=>{if(failIsolatedScope)throw new Error('private diagnostic must not escape');}}}};
  await runSuspensionDispatchWorker(f.database,{signal:isolatedStop.signal,managementContext:async()=>c,managementGrants:[suspendGrant.grantRef],discovery:suspensionDiscovery,targetPageSize:1,intervalMs:1,
   scopes:[{id:'org.example.isolated-failure',publicKind:exact.kind,processing:isolatedProcessing},{id:'org.example.healthy',publicKind:exact.kind,processing}],
   onScopeFailure:async(failure,work)=>{
    isolatedFailures++;assert.deepEqual(failure,{eventRef,capability:exact,scopeId:'org.example.isolated-failure',errorCode:'INTERNAL_ERROR'});
    const retention={dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],region:'local',retentionPolicyRef:scope};
    const checks={fenceRefs:async()=>[],admit:async()=>{},references:async()=>{}};
    await assert.rejects(storeSuspensionFailure(f.database,business,work,failure,retention,[],checks),{code:'AUTHORITY_REQUIRED'});
    await assert.rejects(storeSuspensionFailure(f.database,business,work,{...failure,eventRef:ref('abh.event',enableEvent!.id)},retention,[readGrant.grantRef],checks),{code:'PRECONDITION_FAILED'});
    const saved=await storeSuspensionFailure(f.database,business,work,{...failure,...{message:'must never persist raw exception'}},retention,[readGrant.grantRef],checks);
    assert.equal(saved.replayed,false);
    assert.deepEqual(await storeSuspensionFailure(f.database,business,work,failure,retention,[readGrant.grantRef],checks),{...saved,replayed:true});
    const diagnosticRestart=await Database.connect(f.runtimeUrl,{max:1});
    try{assert.deepEqual(await storeSuspensionFailure(diagnosticRestart,business,work,failure,retention,[readGrant.grantRef],checks),{...saved,replayed:true});}finally{await diagnosticRestart.close();}

    const diagnostic=await f.database.transaction(business,work,tx=>new InlineArtifactOwner().read(tx,saved.artifactRef,async()=>{}));
    assert.deepEqual(JSON.parse(new TextDecoder().decode(diagnostic.bytes)),{kind:'PackSuspensionScopeFailure',...failure});
    await assert.rejects(storeSuspensionFailure(f.database,business,work,failure,retention,[readGrant.grantRef],{...checks,admit:async()=>{throw new Error('current diagnostic storage denied');}}),/current diagnostic storage denied/);
   },onPage:async stats=>{
    isolatedRounds++;
    if(isolatedRounds===1){assert.equal(stats.blockedScopes,1);assert.equal(stats.scopeSweeps,1);assert.equal(stats.targets,2);failIsolatedScope=false;}
    else{assert.equal(stats.blockedScopes,0);assert.equal(stats.scopeSweeps,2);isolatedStop.abort();}
   }});
  assert.equal(isolatedFailures,1);assert.equal(isolatedRounds,2);
  failIsolatedScope=true;
  await assert.rejects(runSuspensionDispatchWorker(f.database,{signal:options().signal,managementContext:async()=>c,managementGrants:[suspendGrant.grantRef],discovery:suspensionDiscovery,
   scopes:[{id:'org.example.failure-sink',publicKind:exact.kind,processing:isolatedProcessing}],onScopeFailure:async()=>{throw new Error('failure sink unavailable');}}),/failure sink unavailable/);
  const secondNotified=await consumeOutboxDelivery(f.database,delivery,options().signal,secondDelivery,secondConsumer);
  assert.notEqual(secondNotified.inboxRef.id,notified.inboxRef.id);assert.notEqual(secondNotified.resultRef.id,notified.resultRef.id);
  await queue.complete(secondDelivery,secondNotified.inboxRef);
  const consumption=await recordOutboxConsumption(f.database,delivery,options(),routing.routingRef,[notificationGrant.grantRef]);assert.equal(consumption.inboxRefs.length,2);
  assert.deepEqual(await recordOutboxConsumption(f.database,delivery,options(),routing.routingRef,[notificationGrant.grantRef]),consumption);
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${notificationGrant.grantRef.id}`;
  await assert.rejects(consumeOutboxDelivery(f.database,delivery,options().signal,notificationDelivery,consumer),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),deliveryInput,pageDelivery),{code:'AUTHORITY_REQUIRED'});
  }finally{await queue.close();}
  let referencesVisible=true;
  const referenceAdmission={fenceRefs:async()=>[readGrant.grantRef],admit:async(tx:Parameters<typeof resolvePackCapability>[0])=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},[readGrant.grantRef]);},canRead:async()=>referencesVisible};
  const targetInput={eventRef,capability:exact,registeredKind:'abh.connector',limit:1},targetChecks={source:sourceChecks,references:referenceAdmission};
  const firstTargets=await queryPackSuspensionTargets(f.database,c,business,options(),targetInput,[suspendGrant.grantRef],targetChecks);
  assert.equal(firstTargets.complete,false);assert.equal(firstTargets.targets.length,1);assert.ok(firstTargets.cursor);
  assert.deepEqual(await queryPackSuspensionTargets(f.database,c,business,options(),targetInput,[suspendGrant.grantRef],targetChecks),firstTargets);
  const secondTargets=await queryPackSuspensionTargets(f.database,c,business,options(),{...targetInput,cursor:firstTargets.cursor},[suspendGrant.grantRef],targetChecks);
  assert.equal(secondTargets.complete,true);assert.equal(secondTargets.targets.length,1);assert.notEqual(firstTargets.targets[0]!.notificationKey,secondTargets.targets[0]!.notificationKey);
  await assert.rejects(queryPackSuspensionTargets(f.database,c,business,options(),{...targetInput,cursor:{...firstTargets.cursor!,bindingDigest:'sha256:'+'0'.repeat(64)}},[suspendGrant.grantRef],targetChecks),{code:'INVALID_ARGUMENT'});
  await assert.rejects(queryPackSuspensionTargets(f.database,c,business,options(),{...targetInput,capability:{...exact,version:'9.9.9'}},[suspendGrant.grantRef],targetChecks),{code:'PIN_INPUT_CONFLICT'});
  let scanCalls=0,failScan=true;const acceptedKeys=new Set<string>(),pageArtifacts=new Map<string,ReturnType<typeof ref>>();
  const storageChecks={fenceRefs:async()=>[],admit:async()=>{},references:async()=>{}};
  const pageRetention={dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],region:'local',retentionPolicyRef:scope};
  const malformed=structuredClone(firstTargets);malformed.targets[0]!.notificationKey='sha256:'+'0'.repeat(64);
  await assert.rejects(storeSuspensionPage(f.database,business,options(),{eventRef,capability:exact,page:malformed},pageRetention,[readGrant.grantRef],storageChecks),{code:'INVALID_ARGUMENT'});
  await assert.rejects(storeSuspensionPage(f.database,business,options(),{eventRef,capability:exact,page:firstTargets},pageRetention,[],storageChecks),{code:'AUTHORITY_REQUIRED'});
  const scanner={contexts:async()=>({management:c,business}),grants:[suspendGrant.grantRef],admission:targetChecks,accept:async(page:Awaited<ReturnType<typeof queryPackSuspensionTargets>>,work:ReturnType<typeof options>)=>{
   scanCalls++;
   const document={kind:'PackSuspensionTargetPage',eventRef,capability:exact,page},pageDigest=await inputDigest(document);
   const accepted=await storeSuspensionPage(f.database,business,work,{eventRef,capability:exact,page},{dataClass:'abh.data.internal',purposeNames:['abh.action.prepare'],region:'local',retentionPolicyRef:scope},[readGrant.grantRef],storageChecks);
   assert.equal(accepted.pageDigest,pageDigest);
   const previous=pageArtifacts.get(pageDigest);if(previous)assert.deepEqual(accepted.artifactRef,previous);
   pageArtifacts.set(pageDigest,accepted.artifactRef);
   for(const target of page.targets)acceptedKeys.add(target.notificationKey);if(failScan)throw new Error('scan acknowledgement lost');
  }};
  await assert.rejects(scanPackSuspension(f.database,options(),targetInput,scanner),/scan acknowledgement lost/);assert.equal(scanCalls,1);failScan=false;
  const partial=await scanPackSuspension(f.database,options(),{...targetInput,maxPages:1},scanner);assert.equal(partial.complete,false);assert.equal(partial.acceptedPages,1);assert.equal(acceptedKeys.size,1);
  if(partial.complete)throw new Error('expected partial scan');
  const resumed=await scanPackSuspension(f.database,options(),{...targetInput,cursor:partial.cursor},scanner);assert.equal(resumed.complete,true);assert.equal(acceptedKeys.size,2);
  assert.equal(pageArtifacts.size,2);
  const restarted=await Database.connect(f.runtimeUrl,{max:1});
  try{
   const persistedKeys=new Set<string>();
   for(const [digest,artifactRef] of pageArtifacts){
    const stored=await restarted.transaction(business,options(),tx=>new InlineArtifactOwner().read(tx,artifactRef,async()=>{}));
    const document=JSON.parse(new TextDecoder().decode(stored.bytes));assert.equal(await inputDigest(document),digest);assert.deepEqual(document.eventRef,eventRef);
    const recovered=await readSuspensionPage(restarted,business,options(),{artifactRef,pageDigest:digest,eventRef,capability:exact},{fenceRefs:async()=>[readGrant.grantRef],artifact:async tx=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},[readGrant.grantRef]);}});
    assert.deepEqual(recovered.page,document.page);
    await assert.rejects(readSuspensionPage(restarted,business,options(),{artifactRef,pageDigest:'sha256:'+'0'.repeat(64),eventRef,capability:exact},{fenceRefs:async()=>[],artifact:async()=>{}}),{code:'PRECONDITION_FAILED'});
    for(const target of document.page.targets)persistedKeys.add(target.notificationKey);
   }
   assert.deepEqual([...persistedKeys].sort(),[...acceptedKeys].sort());
  }finally{await restarted.close();}
  const storedPageAdmission={discoveryFences:async()=>[readGrant.grantRef],fenceRefs:async()=>[readGrant.grantRef],discover:async(tx:Parameters<typeof resolvePackCapability>[0])=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},[readGrant.grantRef]);},artifact:async(tx:Parameters<typeof resolvePackCapability>[0])=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.capabilities.read'},[readGrant.grantRef]);}};
  const storedPageBatch=await queryStoredSuspensionPages(f.database,business,options(),{eventRef,capability:exact,limit:1},storedPageAdmission);
  assert.equal(storedPageBatch.complete,false);assert.equal(storedPageBatch.pages.length,1);assert.ok(storedPageBatch.cursor);
  await assert.rejects(queryStoredSuspensionPages(f.database,business,options(),{eventRef,capability:exact,cursor:{...storedPageBatch.cursor!,bindingDigest:'sha256:'+'0'.repeat(64)}},storedPageAdmission),{code:'INVALID_ARGUMENT'});
  await assert.rejects(queryStoredSuspensionPages(f.database,business,options(),{eventRef,capability:exact},{...storedPageAdmission,discover:async()=>{throw new Error('discovery denied');}}),/discovery denied/);
  await assert.rejects(queryStoredSuspensionPages(f.database,business,options(),{eventRef,capability:exact},{...storedPageAdmission,artifact:async()=>{throw new Error('artifact read denied');}}),/artifact read denied/);
  const otherCapabilityPages=await queryStoredSuspensionPages(f.database,business,options(),{eventRef,capability:{...exact,version:'9.9.9'},limit:1},storedPageAdmission);
  assert.deepEqual(otherCapabilityPages.pages,[]);assert.equal(otherCapabilityPages.complete,false);assert.ok(otherCapabilityPages.cursor,'empty matching page still advances across unrelated evidence');
  const recoveredPages=await promisify(execFile)(process.execPath,[new URL('./fixtures/recover-suspension-pages.mjs',import.meta.url).pathname],{
   env:{...process.env,ABH_SUSPENSION_RECOVERY:JSON.stringify({runtimeUrl:f.runtimeUrl,request:business.request,managementRequest:c.request,managementGrants:[suspendGrant.grantRef],capability:exact,grants:[readGrant.grantRef]})},timeout:15000,maxBuffer:1048576,
  });
  assert.deepEqual(JSON.parse(recoveredPages.stdout),[...acceptedKeys].sort());
  const stopScan=new AbortController();stopScan.abort();const beforeScan=scanCalls;
  await assert.rejects(scanPackSuspension(f.database,{...options(),signal:stopScan.signal},targetInput,scanner),{code:'DEPENDENCY_TIMEOUT'});assert.equal(scanCalls,beforeScan);
  let stalledContexts=0;
  await assert.rejects(scanPackSuspension(f.database,{deadline:Date.now()+30,signal:new AbortController().signal},targetInput,{...scanner,contexts:async()=>{stalledContexts++;return new Promise<never>(()=>{});}}),{code:'DEPENDENCY_TIMEOUT'});
  assert.equal(stalledContexts,1);assert.equal(scanCalls,beforeScan);
  const references=await queryCapabilityReferences(f.database,business,options(),{capability:exact,limit:1},referenceAdmission);
  assert.equal(references.complete,false);assert.equal(references.references.length,1);assert.ok(references.nextAfterId);
  const nextReferences=await queryCapabilityReferences(f.database,business,options(),{capability:exact,limit:1,afterId:references.nextAfterId},referenceAdmission);
  assert.equal(nextReferences.complete,true);assert.equal(nextReferences.references.length,1);
  assert.deepEqual([...references.references,...nextReferences.references].map(item=>item.pinSetRef.id).sort(),[pins.pinSetRef.id,secondPin.pinSetRef.id].sort());
  const own=[...references.references,...nextReferences.references].find(item=>item.pinSetRef.id===pins.pinSetRef.id)!;
  assert.deepEqual(own,{pinSetRef:pins.pinSetRef,subjectRef:pins.subjectRef,pinSetDigest:pins.digest,behaviorSlots:[slot]});
  referencesVisible=false;
  const hidden=await queryCapabilityReferences(f.database,business,options(),{capability:exact,limit:1},referenceAdmission);assert.deepEqual(hidden.references,[]);assert.equal(hidden.complete,false);assert.ok(hidden.nextAfterId);referencesVisible=true;
  assert.equal((await queryCapabilityReferences(f.database,business,options(),{capability:{...exact,version:'9.9.9'}},referenceAdmission)).references.length,0);

  const runRef=ref('abh.run');
  const beforeRunPin=await f.database.transaction(business,options(),async tx=>(await tx.owner('CapabilityRelease')`SELECT statement_timestamp() AS now`)[0]!.now.toISOString());
  const runPinCommand=await identity('abh.releases.resolve-and-pin',`run:${runRef.id}`);
  const runPin=await f.database.transaction(business,options(),async tx=>releases.resolveAndPin(tx,runPinCommand,{
   subjectRef:runRef,subjectInputDigest:await digestBytes(new TextEncoder().encode(`run:${runRef.id}`)),
   requiredBehaviorSlots:[slot],verifiedScope:[scope],
   requestContextRef:{type:'abh.request-context',id:business.request.requestId,version:1},
   preparationAuthorityRefs:[readGrant.grantRef]}));
  const now=new Date().toISOString(),runRecord=contract('RunRecord',{runRef,resourceOrganizationId:org,missionRef:ref('abh.mission'),
   triggerKey:'org.example.signed-run',goalRevision:1,stopEpoch:0,progressBudgetSeconds:3600,progressDeadline:now,
   workflowRef:exact,assignmentSnapshotRef:runPin.pinSetRef,executionMode:'Production',status:'Running',
   createdBy:business.request.actor,createdAt:now,updatedAt:now});
  const taskRef=ref('abh.task'),taskRecord=contract('TaskRecord',{taskRef,resourceOrganizationId:org,runRef,nodeKey:'org.example.signed-node',
   kind:'Agent',inputRefs:[],status:'Ready',required:true,attemptOrdinal:1,createdAt:now,updatedAt:now});
  await f.database.transaction(business,options(),async tx=>{
   await tx.owner('MissionController')`INSERT INTO core.runs(resource_organization_id,id,workspace_id,purpose_names,record,mission_id,trigger_key,status,goal_revision,stop_epoch,
    progress_budget_seconds,progress_deadline) VALUES (${org},${runRef.id},${business.request.workspaceId??null},ARRAY['abh.mission.manage','abh.runtime.deliver'],
    ${JSON.stringify(runRecord)}::text::jsonb,${runRecord.missionRef.id},${runRecord.triggerKey},${runRecord.status},${runRecord.goalRevision},${runRecord.stopEpoch},
    ${runRecord.progressBudgetSeconds},${runRecord.progressDeadline})`;
   await tx.owner('MissionController')`INSERT INTO core.tasks(resource_organization_id,id,workspace_id,purpose_names,record,run_id,node_key,status,created_by,updated_by)
    VALUES (${org},${taskRef.id},${business.request.workspaceId??null},ARRAY['abh.mission.manage','abh.runtime.deliver'],
    ${JSON.stringify(taskRecord)}::text::jsonb,${runRef.id},${taskRecord.nodeKey},${taskRecord.status},${business.request.actor.id},${business.request.actor.id})`;
  });
  const [persistedRun]=await f.admin`SELECT id,workspace_id,purpose_names,status FROM core.runs WHERE id=${runRef.id}`;
  assert.ok(persistedRun);assert.deepEqual(persistedRun!.purpose_names,['abh.mission.manage','abh.runtime.deliver']);
  assert.deepEqual(await f.database.transaction(delivery,options(),tx=>new RunOwner().get(tx,runRef.id)),runRecord);
  const runReferences=await queryCapabilityReferences(f.database,business,options(),{capability:exact,limit:10},referenceAdmission);
  assert.equal(runReferences.complete,true);assert.equal(runReferences.references.length,3);
  assert.deepEqual(runReferences.references.find(item=>item.subjectRef.type==='abh.run'),{pinSetRef:runPin.pinSetRef,subjectRef:runRef,pinSetDigest:runPin.digest,behaviorSlots:[slot]});
  await f.admin`UPDATE control.grants SET status='Active' WHERE id=${notificationGrant.grantRef.id}`;
  const runAdmission={fenceRefs:async()=>[],source:async(_tx:Parameters<typeof resolvePackCapability>[0],event:import('@abh/contracts').EventEnvelope,
   capability:import('@abh/contracts').CapabilityRef,subject:import('@abh/contracts').EntityRef)=>{
   assert.equal(event.eventId,eventRef.id);assert.deepEqual(subject,runRef);assert.deepEqual(capability,exact);
  },artifact:async()=>{},storage:{dataClass:'abh.data.internal',purposeNames:['abh.runtime.deliver'],region:'local',retentionPolicyRef:scope}};
  const runPageDiscovery={source:sourceChecks,references:referenceAdmission};
  const runPage=await queryPackSuspensionTargets(f.database,c,business,options(),{eventRef,capability:exact,registeredKind:'abh.connector',limit:10},[suspendGrant.grantRef],runPageDiscovery);
  assert.equal(runPage.complete,true);assert.equal(runPage.targets.length,3);assert.equal(runPage.targets.find(target=>target.subjectRef.type==='abh.run')?.subjectRef.type,'abh.run');
  const beforeRunPage=await queryPackSuspensionTargets(f.database,c,business,options(),{eventRef,capability:exact,registeredKind:'abh.connector',limit:10,beforeAt:beforeRunPin},[suspendGrant.grantRef],runPageDiscovery);
  assert.equal(beforeRunPage.complete,true);assert.equal(beforeRunPage.targets.length,2);assert.ok(beforeRunPage.targets.every(target=>target.subjectRef.type==='abh.action'));
  const runOnlyPage={...structuredClone(runPage),targets:runPage.targets.filter(target=>target.subjectRef.type==='abh.run')};
  const storeRunPage=()=>storeSuspensionPage(f.database,business,options(),{eventRef,capability:exact,page:runOnlyPage},pageRetention,[readGrant.grantRef],storageChecks);
  const runDelivery=await deliverActionSuspensionPage(f.database,business,options(),{...await storeRunPage(),eventRef,capability:exact},
   {context:async()=>delivery,registeredKind:'abh.connector',grantRefs:[notificationGrant.grantRef],
    page:{fenceRefs:async()=>[readGrant.grantRef],artifact:async()=>{}},action:{...runAdmission},run:runAdmission});
  assert.equal(runDelivery.deliveries.length,1);
  const runObservation=await f.database.transaction(delivery,options(),tx=>new InlineArtifactOwner().read(tx,runDelivery.deliveries[0]!.resultRef,async()=>{}));
  const runNotice=JSON.parse(new TextDecoder().decode(runObservation.bytes));
  assert.equal(runNotice.kind,'RunPackSuspensionObservation');assert.deepEqual(runNotice.runRef,runRef);
  assert.deepEqual(runNotice.tasks,[{taskRef,nodeKey:taskRecord.nodeKey,status:'Ready',attemptOrdinal:1}]);
  assert.deepEqual(await runPackSuspensionConsumer({runRef,pinSetRef:runPin.pinSetRef,capability:exact,registeredKind:'abh.connector',grantRefs:[notificationGrant.grantRef]},runAdmission).id,
   `abh.pack-suspension.run-${runRef.id}.digest-${exact.digest.slice(7)}`);
  const sweepKey={eventRef,capability:exact,scopeId:'org.example.signed-sweep-owner'};
  const sweepOwner=new SuspensionSweepOwner();
  const opened=await f.database.transaction(c,options(),tx=>sweepOwner.open(tx,sweepKey));
  const [rawLowId,rawHighId]=[randomUUID(),randomUUID()].sort(),lowId=rawLowId as string,highId=rawHighId as string;
  const firstCursor={bindingDigest:'sha256:'+'1'.repeat(64),afterId:lowId};
  await f.database.transaction(c,options(),tx=>sweepOwner.advance(tx,sweepKey,firstCursor,false));
  await f.database.transaction(c,options(),tx=>sweepOwner.advance(tx,sweepKey,firstCursor,false));
  const afterStale=await f.database.transaction(c,options(),tx=>sweepOwner.get(tx,sweepKey));
  assert.equal(afterStale!.cursor?.afterId,firstCursor.afterId);assert.equal(afterStale!.complete,false);
  const secondSweep=await f.database.transaction(c,options(),tx=>sweepOwner.advance(tx,sweepKey,{...firstCursor,afterId:highId},true));
  assert.equal(secondSweep.cursor?.afterId,highId);assert.equal(secondSweep.complete,true);
  const reopened=await f.database.transaction(c,options(),tx=>sweepOwner.open(tx,sweepKey));
  assert.equal(reopened.generation,opened.generation+1);assert.equal(reopened.complete,false);assert.ok(reopened.highWaterAt>=opened.highWaterAt);
  await assert.rejects(deliverActionSuspensionPage(f.database,business,options(),{...await storeRunPage(),eventRef,capability:exact},
   {context:async()=>delivery,registeredKind:'abh.connector',grantRefs:[notificationGrant.grantRef],
    page:{fenceRefs:async()=>[readGrant.grantRef],artifact:async()=>{}},action:{...runAdmission}}),{code:'PRECONDITION_FAILED'});

  await assert.rejects(resolve(),{code:'PRECONDITION_FAILED'});
  await assert.rejects(pinAction(f.database,business,options(),pinCommand,validated.actionRef,pinPayload,pinChecks),{code:'PRECONDITION_FAILED'});
  const freshCommand=await identity('abh.actions.propose',actionInput);
  const freshReceipt=await f.database.transaction(business,options(),tx=>executeCommand(tx,freshCommand,async()=>{},async()=> (await actions.propose(tx,freshCommand,actionInput,definition,actionChecks)).actionRef));
  const freshRef=freshReceipt.receipt.resultRef,freshValidation=await identity('abh.actions.validate',{actionRef:freshRef,payload:validationPayload});
  const fresh=await validateAction(f.database,business,options(),freshValidation,freshRef,validationPayload,[readGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{},artifact:async()=>{},domain:async()=>{}});
  const freshPin=await identity('abh.actions.pin',{actionRef:fresh.actionRef,payload:pinPayload});
  await assert.rejects(pinAction(f.database,business,options(),freshPin,fresh.actionRef,pinPayload,pinChecks),{code:'PRECONDITION_FAILED'});
  await f.database.transaction(business,options(),async tx=>{
   assert.equal(await releases.getPinSet(tx,{type:'abh.action',id:fresh.actionRef.id}),undefined);
   assert.equal((await actions.get(tx,fresh.actionRef.id)).pinSetRef,undefined);
  });
  const retireGrant:GrantRecord={...suspendGrant,grantRef:ref('abh.grant'),actionTypes:['abh.packs.retire']};
  await f.database.transaction(c,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${retireGrant.grantRef.id},${principal.id},${JSON.stringify(retireGrant)}::text::jsonb,${retireGrant.validFrom},${retireGrant.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${retireGrant.grantRef.id},1)`;
  });
  const beforeRetire=await f.database.transaction(business,options(),async tx=>({action:await actions.get(tx,registered.actionRef.id),operations:await new OperationOwner().list(tx,registered.actionRef.id)}));
  const referenceReview={kind:'PackRetirementReferenceReview',packRef:suspended.packRef,packageDigest:fixture.manifest.integrity.packageDigest,rollbackWindowEndsAt:new Date(Date.now()-1000).toISOString(),retainedRefs:[pins.pinSetRef,secondPin.pinSetRef,beforeRetire.action.actionRef,...beforeRetire.operations.map(item=>item.operationRef)]};
  const reviewCommand=await identity('abh.artifacts.store-inline',referenceReview);
  const reviewArtifact=await f.database.transaction(c,options(),tx=>new InlineArtifactOwner().store(tx,reviewCommand,{ownerRef:suspended.packRef,mediaType:'application/json',content:canonicalJson(referenceReview),dataClass:'abh.data.internal',purposeNames:['abh.pack.manage'],sourceRefs:referenceReview.retainedRefs,region:'local',retentionPolicyRef:scope},async()=>{}));
  const retirement=contract('RetirePackCommand',{...base,type:'abh.packs.retire',commandId:randomUUID(),idempotencyKey:randomUUID(),payload:{packRef:suspended.packRef,expectedDeploymentVersion:latest.deploymentVersion,reason:'Retire while retaining unresolved reconciliation history',evidenceRefs:[reviewArtifact.artifactRef],referenceReviewRef:reviewArtifact.artifactRef,rollbackWindowEndsAt:referenceReview.rollbackWindowEndsAt}});
  let retirementAllowed=false;
  const retirementChecks={fenceRefs:async()=>[],current:async()=>{},review:async(_tx:Parameters<typeof resolvePackCapability>[0],artifact:import('@abh/contracts').ArtifactRecord,bytes:Uint8Array)=>{
   if(!retirementAllowed)throw new Error('reference review not admitted');
   assert.deepEqual(artifact.artifactRef,reviewArtifact.artifactRef);assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),referenceReview);
  }};
  const retire=()=>retirePack(f.database,c,options(),retirement,[retireGrant.grantRef],retirementChecks);
  await assert.rejects(retire(),/reference review not admitted/);retirementAllowed=true;
  await assert.rejects(retirePack(f.database,c,options(),retirement,[],retirementChecks),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(retirePack(f.database,c,options(),{...retirement,payload:{...retirement.payload,rollbackWindowEndsAt:new Date(Date.now()+60000).toISOString()}},[retireGrant.grantRef],retirementChecks),{code:'PRECONDITION_FAILED'});
  await assert.rejects(retirePack(f.database,c,options(),{...retirement,payload:{...retirement.payload,expectedDeploymentVersion:latest.deploymentVersion+1}},[retireGrant.grantRef],retirementChecks),{code:'VERSION_CONFLICT'});
  await f.admin`CREATE FUNCTION extension.reject_fixture_retire() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record->>'status'='Retired' THEN RAISE EXCEPTION 'retire history fault'; END IF; RETURN NEW; END; $$`;
  await f.admin`CREATE TRIGGER reject_fixture_retire BEFORE INSERT ON extension.installed_pack_history FOR EACH ROW EXECUTE FUNCTION extension.reject_fixture_retire()`;
  try{await assert.rejects(retire(),/retire history fault/);}finally{await f.admin`DROP TRIGGER reject_fixture_retire ON extension.installed_pack_history`;await f.admin`DROP FUNCTION extension.reject_fixture_retire()`;}
  assert.deepEqual(await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,suspended.packRef,async()=>{})),latest);
  const retired=await retire();assert.equal(retired.packRef.version,4);assert.deepEqual(await retire(),{...retired,replayed:true});
  const retiredRecord=await f.database.transaction(c,options(),tx=>new InstalledPackOwner().read(tx,retired.packRef,async()=>{}));assert.equal(retiredRecord.status,'Retired');assert.deepEqual(retiredRecord.enablement,enabled.enablement);assert.deepEqual(retiredRecord.suspension,latest.suspension);
  for(const patch of [{retirement:undefined},{packRef:{...retiredRecord.packRef,version:5}},{retirement:{...retiredRecord.retirement!,retiredAt:'2000-01-01T00:00:00Z'}}])assert.throws(()=>contract('InstalledPackRecord',{...retiredRecord,...patch}));
  await assert.rejects(f.admin`UPDATE extension.installed_packs SET record=jsonb_set(record,'{retirement,retiredAt}','"2000-01-01T00:00:00Z"'::jsonb) WHERE id=${retired.packRef.id}`,{code:'23514'});

  assert.deepEqual(await f.database.transaction(c,options(),tx=>new InstalledPackOwner().readHistorical(tx,suspended.packRef,async()=>{})),latest);
  assert.deepEqual(await f.database.transaction(business,options(),async tx=>({action:await actions.get(tx,registered.actionRef.id),operations:await new OperationOwner().list(tx,registered.actionRef.id)})),beforeRetire);
  assert.deepEqual(await readPackSuspension(f.database,c,options(),eventRef,[suspendGrant.grantRef],sourceChecks),suspensionSource);
  retirementAllowed=false;await assert.rejects(retire(),/reference review not admitted/);retirementAllowed=true;
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${retireGrant.grantRef.id}`;await assert.rejects(retire(),{code:'AUTHORITY_REQUIRED'});
  await f.database.transaction(business,options(),tx=>releases.stop(tx,{type:'abh.assignments.pause',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:fixture.manifest.integrity.packageDigest},assignment.assignmentRef,approvalRef));
  await assert.rejects(resolve(),{code:'RELEASE_SCOPE_MISMATCH'});
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${suspendGrant.grantRef.id}`;await assert.rejects(suspend(),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(readPackSuspension(f.database,c,options(),eventRef,[suspendGrant.grantRef],sourceChecks),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(discoverPackSuspensions(f.database,c,options(),{},[suspendGrant.grantRef],suspensionDiscovery),{code:'AUTHORITY_REQUIRED'});
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${readGrant.grantRef.id}`;
  await assert.rejects(queryPackCapabilities(f.database,business,options(),{kind:'abh.connector',limit:10},[readGrant.grantRef],discovery),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(pinAction(f.database,business,options(),pinCommand,validated.actionRef,pinPayload,pinChecks),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(registerPlan(),{code:'AUTHORITY_REQUIRED'});
  await assert.rejects(queryCapabilityReferences(f.database,business,options(),{capability:exact},referenceAdmission),{code:'AUTHORITY_REQUIRED'});
  await f.admin`UPDATE control.grants SET status='Revoked' WHERE id=${enableGrant.grantRef.id}`;
  await assert.rejects(enablePack(f.database,c,options(),enableCommand,durable,commitGrants,commitChecks),{code:'AUTHORITY_REQUIRED'});
  await checkSignedConnectorRecovery(f,c,root,fixture.trust.signer.executable,retired.packRef,queryRecovery);
 }finally{await f.close();}
}
