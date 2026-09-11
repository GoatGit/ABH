import {compatiblePackFixture} from './compatible-pack-fixture.ts';
import {queryPackOnce} from '../src/execution/query-pack-once.ts';
import type {DispatchPermitRecord} from '@abh/contracts';
import {runTenantRuntime} from '../src/durable/runtime-host.ts';
import {submitDecision} from '../src/human/submit-decision.ts';
import {prepareControlDecisionEffect,applyControlDecisionEffect,getDecisionEffectIntent} from '../src/human/apply-control-effect.ts';
import {waitRequestedResponsibility} from '../src/execution/requested-wait.ts';
import {ensureRequestedResponsibility,openRequestedResponsibility,recoverRequestedResponsibility,requestedResponsibilityProgress} from '../src/execution/requested-responsibility.ts';
import {runAuthorizationWorker,type AuthorizationWorkerOptions} from '../src/execution/authorization-worker.ts';
import {authorizeRequestedAction} from '../src/execution/requested-authorization.ts';
import {compileRequestedAction} from '../src/execution/requested-compilation.ts';
import {validateRequestedAction,pinRequestedAction} from '../src/execution/requested-preparation.ts';
import {discoverAuthorizationRequests} from '../src/execution/authorization-discovery.ts';
import {requestActionAuthorization,ActionAuthorizationRequestOwner} from '../src/execution/request-authorization.ts';
import {compilePreparedAction} from '../src/execution/compile-action.ts';
import {ActionCompilerHost} from '../src/execution/compiler.ts';
import {registerOperationPlan} from '../src/execution/register-plan.ts';
import {pinAction} from '../src/execution/pin-action.ts';
import {validateAction} from '../src/execution/validate-action.ts';
import {authorizePreparedAction} from '../src/execution/authorize-action.ts';
import {ActionCursorCodec} from '../src/server/action-cursor.ts';
import {randomBytes} from 'node:crypto';
import {getActionQuery} from '../src/execution/action-query.ts';
import {createAbhClient,AbhClientError} from '../src/client.ts';
import {createCoreHttpApp} from '../src/server/http.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import type {IdentityProviderPort} from '@abh/contracts/ports';
import {withdrawDecision,type DecisionWithdrawalChecks} from '../src/human/withdraw-decision.ts';
import {lockAction} from '../src/execution/shared.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {runResponsibilityExpiryWorker} from '../src/human/expiry-worker.ts';
import {runWaitRecoveryWorker} from '../src/durable/wait-worker.ts';
import {composeWaitNotificationRouter} from '../src/durable/wait-router.ts';
import {OutboxOwner} from '../src/durable/outbox.ts';
import {consumeOutboxDelivery} from '../src/durable/delivery-worker.ts';
import {recoverPendingOperation,runRecoveryWorker} from '../src/execution/recovery-worker.ts';
import {recoverOperation} from '../src/execution/recover-operation.ts';
import {cancelAction} from '../src/execution/cancel-action.ts';
import {assertScopeRuntimePolicy} from '../src/control/scope-runtime.ts';
import {createScopeAuthority,ScopeAuthorityOwner} from '../src/control/scope-authority.ts';
import {resolveScopeAuthoritySource} from '../src/control/scope-source.ts';
import {queryAndCapture,queryPackAndCapture,retryQueryCapture} from '../src/execution/query-and-capture.ts';
import {captureQuery,QueryCaptureOwner,type QueryCaptureChecks} from '../src/execution/query-capture.ts';
import type {QueryExitRecord} from '@abh/contracts';
import {QueryExitOwner,type InstalledQueryPolicy} from '../src/execution/query-exit.ts';
import {queryOnce,requireQueryOrigin} from '../src/execution/query-transport.ts';
import {OperationReconciliationWaitOwner} from '../src/execution/reconciliation-waits.ts';
import {consumeCommittedEvent,readCommittedEvent} from '../src/durable/inbox.ts';
import {ActionApprovalWaitOwner} from '../src/execution/approval-waits.ts';
import {DurableWaitPort,WaitContextDirectory} from '../src/durable/wait-port.ts';
import {DurableWaitOwner} from '../src/durable/waits.ts';
import {captureTransport,TransportCaptureOwner,type TransportCaptureChecks} from '../src/execution/transport-capture.ts';
import {dispatchAndCapture,dispatchPackAndCapture,retryTransportCapture,type CaptureDestination} from '../src/execution/dispatch-and-capture.ts';
import {decodeReceiptBytes} from '../src/execution/raw-transport.ts';
import {ActionSnapshotRefresh} from '../src/control/snapshot-refresh.ts';
import {ActionCleanupOwner} from '../src/execution/action-cleanup.ts';
import {ActionResultOwner,type ActionFinalizationChecks} from '../src/execution/action-results.ts';
import {OperationController} from '../src/execution/operation-controller.ts';
import {ReconciliationOwner,type InstalledComparisonRule} from '../src/execution/reconciliations.ts';
import {OperationReceiptOwner,type ReceiptSourceChecks} from '../src/execution/receipts.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {dispatchOnce,requireTransportOrigin} from '../src/execution/transport.ts';
import {DispatchExitOwner} from '../src/execution/exit.ts';
import {FakeProvider} from './support/fake-provider.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import type {ActionRecord,ArtifactRecord,CompiledPolicyManifest,DecisionPackage,EntityRef,ExecutionAuthority,GrantRecord,ImpactUpperBound,NormalizedOperationObservation,OperationPlan,PolicyVersionRecord,ProposeActionPayload,ReleaseRecord,ResourceEnvelopeRecord,ResponsibilityRequestRecord,StaticAssignmentRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import {ActionOwner,type ActionDefinition,type ActionPreparationChecks} from '../src/execution/actions.ts';
import {OperationOwner} from '../src/execution/operations.ts';
import {DispatchOwner} from '../src/execution/dispatch.ts';
import {DispatchAuthorizationResolver,type DispatchSourceChecks} from '../src/control/dispatch.ts';
import {WorkLeaseOwner} from '../src/durable/work-leases.ts';
import {ResourceFenceOwner} from '../src/execution/resource-fences.ts';
import {compareClosedOperation,runTerminalReconciliationWorker} from '../src/execution/terminal-reconciliation-worker.ts';
import type {OperationPlanNode} from '@abh/contracts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {StaticReleaseOwner} from '../src/release/static.ts';
import {Database,type TenantTransaction} from '../src/data/uow.ts';
import {executeCommand,inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {CoreError} from '../src/internal/errors.ts';
import {inspectActionExecutionSource} from '../src/control/execution-source.ts';
import {revokeExecutionAuthority,revokeGrant} from '../src/control/revoke.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import {InstalledPolicyAssets} from '../src/control/policy-assets.ts';
import {PolicyOwner} from '../src/control/policy-owner.ts';
import {ActionAuthorizationResolver,type SnapshotSourceChecks} from '../src/control/snapshots.ts';
import {LedgerOwner} from '../src/resources/ledger.ts';
import {ResourceEnvelopeOwner} from '../src/resources/envelopes.ts';
import {ConnectionOwner} from '../src/identity/connections.ts';
import {PurposeOwner} from '../src/control/purposes.ts';
import {createContractCatalog} from '@abh/contracts/catalog';
import {DecisionOwner} from '../src/human/decisions.ts';
import {assignResponsibility} from '../src/human/responsibilities.ts';
import {ExceptionOwner,openTerminalException} from '../src/human/exceptions.ts';
import {runExceptionWorker} from '../src/human/exception-worker.ts';
import {ExecutionAuthorityOwner} from '../src/control/authority.ts';
import {context,createDatabaseFixture,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const command=async(type:string,value:unknown):Promise<CommandIdentity>=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
test('Action preparation persists frozen intent and complete immutable operations',{timeout:120_000},async t=>{
  const f=await createDatabaseFixture();t.after(()=>f.close());const db=await Database.connect(f.runtimeUrl,{max:4});t.after(()=>db.close());
  const c=context(),org=c.tenant.resourceOrganizationId,scope=ref('abh.organization',org),service=ref('abh.principal');
  const purposeNames=[c.tenant.purposeOfUse,'abh.action.execute','abh.operation.reconcile','abh.runtime.deliver','abh.decision.review'];
  const executionPurpose=ref('abh.purpose');
  const actions=new ActionOwner(),operations=new OperationOwner(),releases=new StaticReleaseOwner(),artifacts=new InlineArtifactOwner();
  const run=async<T extends EntityRef>(cmd:CommandIdentity,work:(tx:TenantTransaction)=>Promise<T>)=>db.transaction(c,options(),tx=>executeCommand(tx,cmd,async()=>{},()=>work(tx)));
  await db.transaction(c,options(),async tx=>{
    await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status) VALUES (${org},${org},'fixture organization','local','Active')`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.organization',${org},1)`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${service.id},'fixture executor','Service',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status) VALUES (${org},${c.tenant.actor.id},'fixture proposer','Human',1,'Active')`;
    await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status) VALUES (${org},${randomUUID()},${c.tenant.actor.id},1,'Active')`;
    for(const principalId of [service.id,c.tenant.actor.id])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${org},${randomUUID()},'abh.principal',${principalId},1)`;
  });
  const wasm=new Uint8Array(await readFile(new URL('./fixtures/policy.wasm',import.meta.url))),provenance=JSON.parse(await readFile(new URL('./fixtures/policy-provenance.json',import.meta.url),'utf8'));
  const behaviorCapability={kind:'BehaviorPolicy' as const,id:'hello.empty-policy',version:'0.1.0',digest:provenance.wasmDigest};
  const compiler={kind:'Compiler' as const,id:'hello.compiler',version:'0.1.0',digest:'sha256:'+'a'.repeat(64)},connector={kind:'Connector' as const,id:'hello.connector',version:'0.1.0',digest:'sha256:'+'b'.repeat(64)};
  const release:ReleaseRecord={releaseRef:ref('abh.release'),resourceOrganizationId:org,assets:[{behaviorSlot:'hello.execution',capabilityExactRefs:[compiler,connector,behaviorCapability]}],gateRefs:[ref('abh.artifact')],compatibilityRef:ref('abh.artifact'),status:'Ready'};
  const assignment:StaticAssignmentRecord={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,releaseRef:release.releaseRef,scopeRefs:[scope],scopeTier:'Organization',status:'Active',selectable:true,executionAllowed:true,evidenceRefs:[ref('abh.decision')]};
  const releaseCmd=await command('abh.releases.configure-static',{release,assignment,purposeNames});await run(releaseCmd,tx=>releases.configure(tx,releaseCmd,{release,assignment,purposeNames}));
  const store=async(content:string,purposes=[c.tenant.purposeOfUse])=>{
    const input={ownerRef:scope,mediaType:'application/json',content,purposeNames:purposes,dataClass:'hello.internal',sourceRefs:[scope],region:'local',retentionPolicyRef:ref('abh.artifact')};
    const cmd=await command('abh.artifacts.store-inline',input);let artifact:ArtifactRecord;
    await run(cmd,async tx=>{artifact=await artifacts.store(tx,cmd,input,async()=>{});return artifact.artifactRef;});return artifact!;
  };
  const payloadArtifact=await store('{"message":"fixture"}'),resource=ref('abh.resource');
  const impact:ImpactUpperBound={scopeRefs:[scope],resourceRequirements:[{resourceRef:resource,quantity:'9007199254740993.000000000001',unit:'hello.credit'}],maxMoney:[],description:'Fixture finite bound'};
  const definition:ActionDefinition={actionType:'hello.publish',executionPrincipalRef:service,completionPolicyRef:ref('hello.completion-policy'),riskClass:'hello.low-risk',requiredBehaviorSlots:['hello.execution'],maxOperations:100,intentExpirySeconds:86400,purposeNames};
  // Domain and preparation authority fixtures only; these are not the production handler/admission composition.
  const checks:ActionPreparationChecks={lock:async()=>{},artifact:async()=>{},proposal:async()=>impact,domain:async()=>{},plan:async()=>{}};
  const proposal=():ProposeActionPayload=>({actionType:'hello.publish',targetRefs:[ref('hello.brief')],payloadRef:payloadArtifact.artifactRef,sourceVersionRefs:[scope],sourceProposalRef:ref('hello.proposal')});
  const propose=async(input=proposal(),policy=checks)=>{
    const cmd=await command('abh.actions.propose',input);let action:ActionRecord;
    await run(cmd,async tx=>{action=await actions.propose(tx,cmd,input,definition,policy);return action.actionRef;});return action!;
  };
  const validate=async(action:ActionRecord,policy=checks)=>{
    const evidence=ref('hello.validation'),cmd=await command('abh.actions.validate',{actionRef:action.actionRef,evidence});let next:ActionRecord;
    await run(cmd,async tx=>{next=await actions.validate(tx,cmd,action.actionRef,evidence,policy);return next.actionRef;});return next!;
  };
  const pin=async(action:ActionRecord)=>{
    const cmd=await command('abh.actions.pin',{actionRef:action.actionRef});let pinned:ActionRecord;
    await run(cmd,async tx=>{pinned=await actions.pin(tx,cmd,action.actionRef,[ref('abh.execution-authority')],checks);return pinned.actionRef;});return pinned!;
  };
  const prepare=async(payload=payloadArtifact)=>{
    const action=await pin(await validate(await propose({...proposal(),payloadRef:payload.artifactRef}))),pins=await db.transaction(c,options(),tx=>releases.getPinSet(tx,action.actionRef));
    const node={nodeKey:'publish',connectionRef:ref('abh.connection'),accountRef:ref('hello.account'),resourceKey:'hello.brief',operationType:'hello.publish',payloadRef:payload.artifactRef,payloadDigest:payload.contentDigest,
      connectorRef:connector,scopeRefs:[scope],completionPolicyRef:definition.completionPolicyRef,resourceRequirements:[{resourceRef:resource,quantity:'1',unit:'hello.credit'}],dependsOn:[],inputBindings:[]};
    const unsigned:OperationPlan={planRef:ref('abh.operation-plan'),actionRef:action.actionRef,planVersion:1,pinSetRef:pins!.pinSetRef,pinSetDigest:pins!.digest,validatedAgainstPayloadDigest:action.payloadDigest,
      compilerRef:compiler,connectorRefs:[connector],scopeProofRef:ref('abh.scope-proof'),completionPolicyRef:definition.completionPolicyRef,impactUpperBound:impact,
      nodes:[node,{...node,nodeKey:'announce',operationType:'hello.announce',dependsOn:['publish'],inputBindings:[{inputPath:'/externalId',parentNodeKey:'publish',outputName:'hello.external-id',valueType:'hello.external-id'}]}],digest:'sha256:'+'0'.repeat(64)};
    return {action,plan:{...unsigned,digest:await digestContract('OperationPlan',unsigned)},pins:pins!};
  };
  const register=async(action:ActionRecord,plan:OperationPlan,policy=checks)=>{
    const cmd=await command('abh.actions.register-plan',plan);let next:ActionRecord;
    await run(cmd,async tx=>{next=await actions.registerPlan(tx,cmd,action.actionRef,plan,[ref('abh.execution-authority')],policy);return next.actionRef;});return next!;
  };
  const children=(action:ActionRecord)=>db.transaction(c,options(),tx=>operations.list(tx,action.actionRef.id));

  const queryView=async(id:string,related=true)=>{
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.read'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    return getActionQuery(db,c,options(),id,[grant.grantRef],{},{fenceRefs:async()=>[],canRead:async()=>true,canReadRelated:async()=>related,canAct:async()=>false});
  };

  await t.test('public Action proposal authenticates, validates current sources and replays a stable receipt through the client',async()=>{
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.propose','abh.actions.cancel','abh.actions.request-authorization','abh.artifacts.store-inline'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
    const readGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.actions.read']};
    const issuer='action.http.fixture',audience='abh.test',subject=randomUUID(),credentialRef=ref('abh.credential'),identityDigest=await inputDigest([issuer,subject]);
    await f.admin`INSERT INTO deployment.identity_locations(identity_digest,resource_organization_id,principal_id,principal_version) VALUES (${identityDigest},${org},${c.tenant.actor.id},1)`;
    await db.transaction(c,options(),async tx=>{
      for(const candidate of [readGrant, grant]) {
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${candidate.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${candidate.grantRef.id},${c.tenant.actor.id},${JSON.stringify(candidate)}::text::jsonb,${candidate.validFrom},${candidate.validUntil},'Active')`;
      }
    });
    const provider:IdentityProviderPort={verify:async()=>({status:'Completed',data:{issuer,audience,subject,identityKind:'Human',authnStrength:{level:'SingleFactor'},credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),evidenceRef:ref('abh.identity-evidence')}})};
    let automaticAllowed=true,automaticGrants=true,permitted=true,artifactVisible=true,grantsAvailable=true,domainValid=true,definitionCalls=0,resolverDenied=false,readAvailable=true,objectVisible=true,relatedVisible=true,commandReady=true;
    const app=createCoreHttpApp({database:db,identity:new IdentityIngress(db,provider,{issuer,audience}),credentials:async req=>{
      if(req.headers.authorization!=='Bearer fixture')throw new CoreError('UNAUTHENTICATED');return {credentialRef,organizationId:org,purpose:'abh.action.prepare'};
    },artifactStorage:{grants:async()=>grantsAvailable?[grant.grantRef]:[],checks:{fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},references:async()=>{}}},actionProposal:{automaticAuthorization:{purposeNames,grants:async()=>automaticGrants?[grant.grantRef]:[],fenceRefs:async()=>[],admit:async()=>{if(!automaticAllowed)throw new CoreError('FORBIDDEN');}},grants:async verified=>{assert.equal(verified.tenant.actor.id,c.tenant.actor.id);return grantsAvailable?[grant.grantRef]:[];},checks:{
      fenceRefs:async()=>[],admit:async(_tx,received)=>{if(!permitted)throw new CoreError('FORBIDDEN');received.actionType='fixture.mutated';},
      artifact:async()=>{if(!artifactVisible)throw new CoreError('FORBIDDEN');},
      proposal:async(_tx,received,installed)=>{if(!domainValid)throw new CoreError('ACTION_DOMAIN_INVALID');received.sourceVersionRefs=[];installed.maxOperations=1;return impact;},
      definition:async(_tx,received)=>{definitionCalls++;received.targetRefs=[];return definition;},
    }},actionQuery:{grants:async()=>{if(resolverDenied)throw new CoreError('FORBIDDEN');return {read:readAvailable?[readGrant.grantRef]:[],actions:{'abh.actions.cancel':[grant.grantRef],'abh.actions.request-authorization':[grant.grantRef]}};},admission:{
      fenceRefs:async()=>[],canRead:async()=>objectVisible,canReadRelated:async()=>relatedVisible,canAct:async()=>commandReady,
    }},actionAuthorizationRequest:{grants:async()=>grantsAvailable?[grant.grantRef]:[],checks:{purposeNames,fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');}}},actionCancellation:{grants:async()=>grantsAvailable?[grant.grantRef]:[],checks:{fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');}}},actionList:{cursor:new ActionCursorCodec(randomBytes(32)),grants:async()=>({read:readAvailable?[readGrant.grantRef]:[],actions:{'abh.actions.cancel':[grant.grantRef]}}),admission:{
      fenceRefs:async()=>[],listFenceRefs:async()=>[],admitList:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},canRead:async()=>objectVisible,canReadRelated:async()=>relatedVisible,canAct:async()=>commandReady,
    }}});
    try{
      const input=proposal(),key=randomUUID(),url='/v1/commands/abh.actions.propose';
      const send=(payload=input,idempotencyKey=key,targetId=org)=>app.inject({method:'POST',url,headers:{authorization:'Bearer fixture','idempotency-key':idempotencyKey},payload:{target:{type:'abh.organization',id:targetId},payload}});
      assert.equal((await app.inject({method:'POST',url,headers:{authorization:'Bearer fixture','idempotency-key':key},payload:{target:scope,payload:input}})).statusCode,400);
      assert.equal((await app.inject({method:'POST',url,headers:{'idempotency-key':key},payload:{target:{type:'abh.organization',id:org},payload:input}})).statusCode,401);
      assert.equal((await send(input,key,randomUUID())).statusCode,403);
      grantsAvailable=false;assert.equal((await send()).statusCode,403);grantsAvailable=true;
      automaticGrants=false;assert.equal((await send()).statusCode,403);automaticGrants=true;
      automaticAllowed=false;assert.equal((await send()).statusCode,403);automaticAllowed=true;
      domainValid=false;const denied=await send();assert.equal(denied.json().error.code,'ACTION_DOMAIN_INVALID');domainValid=true;
      await f.admin`CREATE FUNCTION execution.fixture_reject_proposal_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture proposal persistence failure'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_proposal_intent BEFORE INSERT ON execution.action_intents FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_proposal_intent()`;
      try{assert.equal((await send()).statusCode,500);}finally{
        await f.admin`DROP TRIGGER fixture_reject_proposal_intent ON execution.action_intents`;
        await f.admin`DROP FUNCTION execution.fixture_reject_proposal_intent()`;
      }
      const [rolledBack]=await f.admin`SELECT count(*) FROM execution.actions`;assert.equal(rolledBack!.count,'0');
      await f.admin`CREATE FUNCTION execution.fixture_reject_automatic_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'automatic request rollback'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_automatic_request BEFORE INSERT ON execution.authorization_requests FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_automatic_request()`;
      try{assert.equal((await send()).statusCode,500);}finally{await f.admin`DROP TRIGGER fixture_reject_automatic_request ON execution.authorization_requests`;await f.admin`DROP FUNCTION execution.fixture_reject_automatic_request()`;}
      const [emptyAutomatic]=await f.admin`SELECT (SELECT count(*) FROM execution.actions) AS actions,(SELECT count(*) FROM execution.authorization_requests) AS requests`;
      assert.deepEqual({...emptyAutomatic},{actions:'0',requests:'0'});
      const responses=await Promise.all([send(),send()]);for(const response of responses)assert.equal(response.statusCode,202,response.body);
      const accepted=responses[0]!.json();assert.deepEqual(accepted,responses[1]!.json());
      assert.equal(responses[0]!.headers.etag,'"1"');assert.equal(responses[0]!.headers.location,`/v1/actions/${accepted.data.objectRef.id}`);
      assert.equal(definitionCalls,4); // Three rollbacks and one committed creation; replay never re-resolves.
      const action=await db.transaction(c,options(),tx=>actions.get(tx,accepted.data.objectRef.id));
      assert.deepEqual(action.proposedBy,c.tenant.actor);assert.deepEqual(action.executionPrincipalRef,service);assert.equal(action.position.lifecycle,'Proposed');assert.equal(action.executionAuthorityRef,undefined);
      const automatic=await db.transaction(c,options(),tx=>tx.owner('ActionEngine')`SELECT record FROM execution.authorization_requests WHERE command_id=${accepted.data.commandId}`);
      assert.equal(automatic.length,1);assert.deepEqual(automatic[0]!.record.actionRef,action.actionRef);assert.deepEqual(automatic[0]!.record.payload,{});
      const autoRead=await db.transaction(c,options(),tx=>new ActionAuthorizationRequestOwner().get(tx,automatic[0]!.record.requestRef));assert.deepEqual(autoRead.executionPrincipalRef,service);
      assert.deepEqual(action.targetRefs,input.targetRefs);assert.deepEqual(action.inputVersionRefs,input.sourceVersionRefs);
      assert.equal((await db.transaction(c,options(),tx=>actions.getIntent(tx,action.actionRef.id))).maxOperations,100);
      assert.equal((await send({...input,sourceProposalRef:ref('hello.proposal')})).json().error.code,'IDEMPOTENCY_CONFLICT');
      const get=(id=action.actionRef.id,suffix='')=>app.inject({url:`/v1/actions/${id}${suffix}`,headers:{authorization:'Bearer fixture'}});
      const firstView=await get();assert.equal(firstView.statusCode,200,firstView.body);
      assert.deepEqual(firstView.json().data,{actionRef:action.actionRef,actionType:action.actionType,position:action.position,authorizationSummary:{},operationSummary:[],unresolvedRefs:[],availableActions:['abh.actions.cancel','abh.actions.request-authorization']});
      assert.match(firstView.json().meta.watermark,/^action-source\/sha256:/);assert.equal(firstView.json().meta.stale,false);
      assert.equal((await get()).json().meta.watermark,firstView.json().meta.watermark);
      assert.equal((await get(action.actionRef.id,'?consistency=Projection')).json().error.code,'SCHEMA_UNSUPPORTED');
      assert.equal((await get('not-a-uuid')).statusCode,400);
      readAvailable=false;assert.equal((await get()).statusCode,404);readAvailable=true;
      resolverDenied=true;assert.equal((await get()).statusCode,404);resolverDenied=false;
      objectVisible=false;assert.equal((await get()).statusCode,404);objectVisible=true;
      commandReady=false;assert.deepEqual((await get()).json().data.availableActions,[]);commandReady=true;
      await f.admin`UPDATE execution.actions SET workspace_id=${randomUUID()} WHERE id=${action.actionRef.id}`;
      try{assert.equal((await get()).statusCode,404);}finally{await f.admin`UPDATE execution.actions SET workspace_id=NULL WHERE id=${action.actionRef.id}`;}
      const prepared=await prepare(),planned=await register(prepared.action,prepared.plan),plannedChildren=await children(planned);
      assert.deepEqual((await get(planned.actionRef.id)).json().data.operationSummary,plannedChildren.map(child=>({operationRef:child.operationRef,position:child.position})));
      relatedVisible=false;assert.deepEqual((await get(planned.actionRef.id)).json().data.operationSummary,[]);relatedVisible=true;
      const authorizationKey=randomUUID(),authorizationUrl='/v1/commands/abh.actions.request-authorization';
      const requestHttp=(version=action.actionRef.version,payload={},key=authorizationKey)=>app.inject({method:'POST',url:authorizationUrl,headers:{authorization:'Bearer fixture','idempotency-key':key,'if-match':`"${version}"`},payload:{target:{type:'abh.action',id:action.actionRef.id},payload}});
      assert.equal((await app.inject({method:'POST',url:authorizationUrl,headers:{authorization:'Bearer fixture','idempotency-key':authorizationKey},payload:{target:{type:'abh.action',id:action.actionRef.id},payload:{}}})).statusCode,400);
      grantsAvailable=false;assert.equal((await requestHttp()).statusCode,403);grantsAvailable=true;
      permitted=false;assert.equal((await requestHttp()).statusCode,403);permitted=true;
      assert.equal((await requestHttp(99)).json().error.code,'VERSION_CONFLICT');
      await f.admin`CREATE FUNCTION execution.fixture_reject_http_authorization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture request rollback'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_http_authorization BEFORE INSERT ON execution.authorization_requests FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_http_authorization()`;
      try{assert.equal((await requestHttp()).statusCode,500);}finally{await f.admin`DROP TRIGGER fixture_reject_http_authorization ON execution.authorization_requests`;await f.admin`DROP FUNCTION execution.fixture_reject_http_authorization()`;}
      const requested=await Promise.all([requestHttp(),requestHttp()]);for(const response of requested)assert.equal(response.statusCode,202,response.body);
      assert.deepEqual(requested[0]!.json(),requested[1]!.json());assert.equal(requested[0]!.headers.location,`/v1/actions/${action.actionRef.id}`);
      assert.deepEqual(await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id)),action,'reception never performs Service T1');
      const records=await db.transaction(c,options(),tx=>tx.owner('ActionEngine')`SELECT record FROM execution.authorization_requests WHERE action_id=${action.actionRef.id} AND command_id=${requested[0]!.json().data.commandId}`);
      assert.equal(records.length,1);assert.deepEqual(records[0]!.record.requestedBy,c.tenant.actor);assert.deepEqual(records[0]!.record.executionPrincipalRef,service);
      assert.equal((await requestHttp(action.actionRef.version,{authorityRefs:[ref('abh.execution-authority')]})).json().error.code,'IDEMPOTENCY_CONFLICT');
      const cancelKey=randomUUID(),cancelUrl='/v1/commands/abh.actions.cancel';
      const cancelHttp=(version=action.actionRef.version,reason='Fixture cancellation',key=cancelKey)=>app.inject({method:'POST',url:cancelUrl,headers:{authorization:'Bearer fixture','idempotency-key':key,'if-match':`"${version}"`},payload:{target:{type:'abh.action',id:action.actionRef.id},payload:{reason}}});
      grantsAvailable=false;assert.equal((await cancelHttp()).statusCode,403);grantsAvailable=true;
      permitted=false;assert.equal((await cancelHttp()).statusCode,403);permitted=true;
      assert.equal((await cancelHttp(99)).json().error.code,'VERSION_CONFLICT');
      const canceled=await Promise.all([cancelHttp(),cancelHttp()]);for(const response of canceled)assert.equal(response.statusCode,202,response.body);assert.deepEqual(canceled[0]!.json(),canceled[1]!.json());
      assert.equal((await cancelHttp(action.actionRef.version,'different')).json().error.code,'IDEMPOTENCY_CONFLICT');
      assert.equal((await cancelHttp(action.actionRef.version,'Fixture cancellation',randomUUID())).json().error.code,'VERSION_CONFLICT');

      const client=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer fixture'}),fetch:async(url,init)=>{
        const response=await app.inject({method:init?.method as 'GET'|'POST',url:new URL(String(url)).pathname+new URL(String(url)).search,headers:Object.fromEntries(new Headers(init?.headers)),...(init?.body?{payload:String(init.body)}:{})});
        return new Response(response.body,{status:response.statusCode,headers:{'content-type':String(response.headers['content-type'])}});
      }});
      const requestReplay=()=>client.actions.requestAuthorization({id:action.actionRef.id,expectedVersion:action.actionRef.version,idempotencyKey:authorizationKey,payload:{}});
      assert.deepEqual(await requestReplay(),requested[0]!.json());
      assert.equal((await requestHttp(action.actionRef.version,{},randomUUID())).json().error.code,'VERSION_CONFLICT');
      permitted=false;await assert.rejects(requestReplay(),error=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');permitted=true;
      assert.deepEqual(await client.actions.cancel({id:action.actionRef.id,expectedVersion:action.actionRef.version,idempotencyKey:cancelKey,payload:{reason:'Fixture cancellation'}}),canceled[0]!.json());
      const current=await client.actions.get(action.actionRef.id,{consistency:'Strong'});assert.equal(current.data.position.lifecycle,'Cancelled');assert.deepEqual(current.data.availableActions,[]);assert.notEqual(current.meta.watermark,firstView.json().meta.watermark);
      // Microseconds and equal-time UUID ties must survive encrypted pagination without duplicates or gaps.
      const other=await propose(),ordered=[action.actionRef.id,planned.actionRef.id,other.actionRef.id];
      await f.admin`UPDATE execution.actions SET created_at='2026-09-08T00:00:00.123001Z'::timestamptz WHERE id=${action.actionRef.id}`;
      await f.admin`UPDATE execution.actions SET created_at='2026-09-08T00:00:00.123999Z'::timestamptz WHERE id=ANY(${ordered.slice(1)}::uuid[])`;
      const expected=[...ordered.slice(1)].sort().reverse().concat(ordered[0]!);
      let cursor:string|undefined;const seen:string[]=[];
      for(let page=0;page<4;page++){
        const result=await client.actions.list({type:'hello.publish',limit:1,...(cursor?{cursor}:{})});seen.push(...result.data.map(view=>view.actionRef.id));cursor=result.meta.nextCursor;
        if(!cursor)break;assert.match(cursor,/^ac1\./);assert.ok(!cursor.includes(result.data[0]!.actionRef.id));
      }
      assert.deepEqual(seen,expected);assert.equal(cursor,undefined);
      objectVisible=false;const hidden=await client.actions.list({type:'hello.publish',limit:1});assert.deepEqual(hidden.data,[]);assert.ok(hidden.meta.nextCursor);objectVisible=true;
      const continued=await client.actions.list({type:'hello.publish',limit:2,cursor:hidden.meta.nextCursor!});assert.deepEqual(continued.data.map(view=>view.actionRef.id),expected.slice(1));
      await assert.rejects(client.actions.list({type:'hello.other',cursor:hidden.meta.nextCursor!}),error=>error instanceof AbhClientError&&error.response?.error.code==='INVALID_ARGUMENT');
      assert.equal((await client.actions.list({lifecycle:'Cancelled'})).data.length,1);
      assert.equal((await client.actions.list({missionId:randomUUID()})).data.length,0);
      readAvailable=false;await assert.rejects(client.actions.list({type:'hello.missing'}),error=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');readAvailable=true;
      permitted=false;await assert.rejects(client.actions.list(),error=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');permitted=true;
      await assert.rejects(client.actions.list({consistency:'Projection'}),error=>error instanceof AbhClientError&&error.response?.error.code==='SCHEMA_UNSUPPORTED');
      const replay=()=>client.actions.proposeFromArtifact({organizationId:org,idempotencyKey:key,payload:input});
      assert.deepEqual(await replay(),accepted);assert.equal(definitionCalls,4);
      automaticAllowed=false;await assert.rejects(replay(),error=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');automaticAllowed=true;
      permitted=false;await assert.rejects(replay(),(error:unknown)=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');permitted=true;
      artifactVisible=false;assert.equal((await send()).statusCode,403);artifactVisible=true;
      await f.admin`UPDATE data.artifacts SET workspace_id=${randomUUID()} WHERE id=${input.payloadRef.id}`;
      try{assert.equal((await send()).json().error.code,'RESOURCE_NOT_FOUND');}finally{await f.admin`UPDATE data.artifacts SET workspace_id=NULL WHERE id=${input.payloadRef.id}`;}
      const [counts]=await f.admin`SELECT (SELECT count(*) FROM execution.actions WHERE record->'sourceCommandRef'->>'id'=${accepted.data.commandId}) AS actions,(SELECT count(*) FROM execution.action_intents WHERE id=${action.actionRef.id}) AS intents,(SELECT count(*) FROM data.outbox WHERE aggregate_id=${action.actionRef.id} AND aggregate_version=1) AS events`;
      assert.deepEqual({...counts},{actions:'1',intents:'1',events:'1'});
      // High-level upload/proposal uses the same real HTTP Owners, including committed response loss.
      const highInput={organizationId:org,idempotencyKey:randomUUID(),input:{message:'high-level input'},artifact:{ownerRef:scope,purposeNames:['abh.action.prepare'],dataClass:'hello.internal',sourceRefs:[scope],region:'local',retentionPolicyRef:ref('abh.artifact')},action:{actionType:'hello.publish',targetRefs:input.targetRefs,sourceVersionRefs:[scope]}};
      let lose=true;const stepKeys:string[]=[],highClient=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer fixture'}),fetch:async(url,init)=>{
        const path=new URL(String(url)).pathname,headers=Object.fromEntries(new Headers(init?.headers));stepKeys.push(headers['idempotency-key']!);
        const response=await app.inject({method:'POST',url:path,headers,payload:String(init?.body)});
        if(lose&&path.endsWith('abh.actions.propose')&&response.statusCode===202){lose=false;throw new Error('committed response lost');}
        return new Response(response.body,{status:response.statusCode,headers:{'content-type':String(response.headers['content-type'])}});
      }});
      const beforeHigh=await f.admin`SELECT (SELECT count(*) FROM execution.actions) AS actions,(SELECT count(*) FROM data.artifacts) AS artifacts`;
      await assert.rejects(highClient.actions.propose(highInput),error=>{assert.ok(error instanceof AbhClientError);assert.equal(error.outcome,'Unknown',JSON.stringify(error.response));return true;});
      const high=await highClient.actions.propose(highInput);assert.equal(stepKeys[0],stepKeys[2]);assert.equal(stepKeys[1],stepKeys[3]);assert.notEqual(stepKeys[0],stepKeys[1]);
      const highAction=await db.transaction(c,options(),tx=>actions.get(tx,high.data.objectRef.id));assert.deepEqual((await db.transaction(c,options(),tx=>actions.getIntent(tx,highAction.actionRef.id))).proposal.sourceProposalRef,highAction.payloadArtifactRef);
      const highBytes=await db.transaction(c,options(),tx=>artifacts.read(tx,highAction.payloadArtifactRef,async()=>{}));assert.equal(new TextDecoder().decode(highBytes.bytes),'{"message":"high-level input"}');
      const afterHigh=await f.admin`SELECT (SELECT count(*) FROM execution.actions) AS actions,(SELECT count(*) FROM data.artifacts) AS artifacts`;
      assert.equal(Number(afterHigh[0]!.actions)-Number(beforeHigh[0]!.actions),1);assert.equal(Number(afterHigh[0]!.artifacts)-Number(beforeHigh[0]!.artifacts),1);
      await assert.rejects(highClient.actions.propose({...highInput,input:{message:'changed'}}),error=>error instanceof AbhClientError&&error.response?.error.code==='IDEMPOTENCY_CONFLICT');
      await assert.rejects(highClient.actions.propose({...highInput,action:{...highInput.action,targetRefs:[ref('hello.brief')]}}),error=>error instanceof AbhClientError&&error.response?.error.code==='IDEMPOTENCY_CONFLICT');
      const autoRows=await db.transaction(c,options(),tx=>tx.owner('ActionEngine')`SELECT record FROM execution.authorization_requests WHERE command_id=${high.data.commandId}`);
      assert.equal(autoRows.length,1);const automaticRequest=autoRows[0]!.record.requestRef;
      const forged=await command('abh.actions.propose',{});
      await assert.rejects(db.transaction(c,options(),tx=>new ActionAuthorizationRequestOwner().accept(tx,forged,highAction.actionRef,{},purposeNames)),{code:'FORBIDDEN'});
      await assert.rejects(db.transaction(c,options(),tx=>new ActionAuthorizationRequestOwner().accept(tx,{...forged,commandId:high.data.commandId},highAction.actionRef,{authorityRefs:[ref('abh.execution-authority')]},purposeNames)),{code:'FORBIDDEN'});
      await assert.rejects(db.transaction(c,options(),tx=>new ActionAuthorizationRequestOwner().accept(tx,forged,highAction.actionRef,{},['abh.not-registered'])),{code:'PURPOSE_DENIED'});
      const recoveryGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.actions.read','abh.actions.validate']};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${recoveryGrant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${recoveryGrant.grantRef.id},${service.id},${JSON.stringify(recoveryGrant)}::text::jsonb,${recoveryGrant.validFrom},${recoveryGrant.validUntil},'Active')`;
      });
      const recovering=deriveVerifiedContext({...c.request,actor:{type:'Service',id:service.id}}),discovery={fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx:TenantTransaction,request:{requestRef:EntityRef})=>request.requestRef.id===automaticRequest.id};
      const page=await discoverAuthorizationRequests(db,recovering,options(),100,undefined,[recoveryGrant.grantRef],discovery);assert.equal(page.candidates.length,1);assert.equal(page.candidates[0]!.stage,'Validate');
      const evidence={domainValidationRef:ref('hello.validation')};let validations=0;
      const validationChecks={fenceRefs:async()=>[],admit:async()=>{},artifact:async()=>{},domain:async()=>{validations++;}},requestChecks={fenceRefs:async()=>[],admit:async()=>{}};
      const validateAutomatic=(database=db)=>validateRequestedAction(database,recovering,options(),automaticRequest,highAction.actionRef,evidence,[recoveryGrant.grantRef],validationChecks,requestChecks);
      const next=await validateAutomatic();assert.equal(validations,1);
      const reconnect=await Database.connect(f.runtimeUrl,{max:1});try{assert.deepEqual((await validateAutomatic(reconnect)).actionRef,next.actionRef);}finally{await reconnect.close();}assert.equal(validations,1);
      assert.deepEqual(await highClient.actions.propose(highInput),high,'replay after actual preparation returns original acceptance');
      const afterValidation=await discoverAuthorizationRequests(db,recovering,options(),100,undefined,[recoveryGrant.grantRef],discovery);assert.equal(afterValidation.candidates[0]!.stage,'Pin');
      await client.actions.cancel({id:highAction.actionRef.id,expectedVersion:next.actionRef.version,idempotencyKey:randomUUID(),payload:{reason:'finish high-level fixture'}});
      const revoke=await command('abh.grants.revoke',grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef);
      assert.equal((await send()).statusCode,403);assert.equal((await cancelHttp()).statusCode,403);
      assert.equal((await get()).statusCode,200);assert.deepEqual((await get(planned.actionRef.id)).json().data.availableActions,[]);
      await assert.rejects(requestReplay(),error=>error instanceof AbhClientError&&error.response?.error.code==='FORBIDDEN');
      const revokeRead=await command('abh.grants.revoke',readGrant.grantRef);await run(revokeRead,async tx=>(await revokeGrant(tx,revokeRead,readGrant.grantRef,[scope])).grantRef);assert.equal((await get()).statusCode,404);
    }finally{await app.close();}
  });
  await t.test('concurrent Command replay creates one intent with server proposer and Service identity',async()=>{
    const input=proposal(),cmd=await command('abh.actions.propose',input);
    const results=await Promise.all([1,2].map(()=>run(cmd,async tx=>(await actions.propose(tx,cmd,input,definition,checks)).actionRef)));
    assert.equal(results.filter(r=>r.replayed).length,1);assert.deepEqual(results[0]!.receipt,results[1]!.receipt);
    const stored=await db.transaction(c,options(),tx=>actions.get(tx,results[0]!.receipt.resultRef.id));assert.deepEqual(stored.proposedBy,c.tenant.actor);assert.deepEqual(stored.executionPrincipalRef,service);assert.equal(stored.executionAuthorityRef,undefined);
    await assert.rejects(run({...cmd,digest:await inputDigest(proposal())},async()=>scope),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('ActionEngine')`UPDATE execution.action_intents SET record=record`),{code:'42501'});
    await assert.rejects(db.transaction(context(),options(),tx=>actions.get(tx,stored.actionRef.id)),{code:'RESOURCE_NOT_FOUND'});
  });
  await t.test('internal validation ingress requires current Grant and source admission even on replay',async()=>{
    const action=await propose(),payload={domainValidationRef:ref('hello.validation')},cmd=await command('abh.actions.validate',{actionRef:action.actionRef,payload});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.validate'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    let permitted=true,valid=false,calls=0;
    const policy={fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},artifact:async()=>{},domain:async()=>{calls++;if(!valid)throw new CoreError('ACTION_DOMAIN_INVALID');}};
    const invoke=(grants=[grant.grantRef])=>validateAction(db,c,options(),cmd,action.actionRef,payload,grants,policy);
    await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});await assert.rejects(invoke(),{code:'ACTION_DOMAIN_INVALID'});
    assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id))).position.lifecycle,'Proposed');
    valid=true;const results=await Promise.all([invoke(),invoke()]);assert.equal(calls,2);assert.equal(results.filter(value=>value.replayed).length,1);assert.equal(results[0]!.commandId,cmd.commandId);
    const validated=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));assert.equal(validated.position.lifecycle,'Validated');
    const cancel=await command('abh.actions.cancel',validated.actionRef);await run(cancel,async tx=>(await actions.cancelPreparation(tx,cancel,validated.actionRef,'fixture cancel after validation')).actionRef);
    assert.deepEqual((await invoke()).actionRef,results[0]!.actionRef);assert.equal(calls,2);
    permitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});permitted=true;
    const different={domainValidationRef:ref('hello.validation')};await assert.rejects(validateAction(db,c,options(),{...cmd,digest:await inputDigest({actionRef:action.actionRef,payload:different})},action.actionRef,different,[grant.grantRef],policy),{code:'IDEMPOTENCY_CONFLICT'});
    const revoke=await command('abh.grants.revoke',grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef);await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
  });
  await t.test('Grant-backed pinning needs no execution Authority and atomically binds one fixed version set',async()=>{
    const action=await validate(await propose()),grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.pin'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    const payload={preparationAuthorityRefs:[grant.grantRef]},cmd=await command('abh.actions.pin',{actionRef:action.actionRef,payload});let permitted=true;
    const policy={fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},artifact:async()=>{}};
    const invoke=()=>pinAction(db,c,options(),cmd,action.actionRef,payload,policy);
    permitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});permitted=true;
    const invented={preparationAuthorityRefs:[ref('abh.execution-authority')]},inventedCmd=await command('abh.actions.pin',{actionRef:action.actionRef,payload:invented});await assert.rejects(pinAction(db,c,options(),inventedCmd,action.actionRef,invented,policy),{code:'AUTHORITY_REQUIRED'});
    await f.admin`CREATE FUNCTION execution.fixture_reject_pin_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record ? 'pinSetRef' THEN RAISE EXCEPTION 'fixture pin rollback'; END IF; RETURN NEW; END; $$`;
    await f.admin`CREATE TRIGGER fixture_reject_pin_binding BEFORE UPDATE ON execution.actions FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_pin_binding()`;
    try{await assert.rejects(invoke(),/fixture pin rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_pin_binding ON execution.actions`;await f.admin`DROP FUNCTION execution.fixture_reject_pin_binding()`;}
    assert.equal(await db.transaction(c,options(),tx=>releases.getPinSet(tx,action.actionRef)),undefined);
    const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(value=>value.replayed).length,1);assert.deepEqual(results[0]!.pinSetRef,results[1]!.pinSetRef);assert.equal(results[0]!.commandId,cmd.commandId);
    const current=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));assert.equal(current.position.lifecycle,'Validated');assert.equal(current.executionAuthorityRef,undefined);assert.equal(current.authorizationSnapshotRef,undefined);assert.equal(current.planRef,undefined);
    const pins=await db.transaction(c,options(),tx=>releases.getPinSet(tx,current.actionRef));assert.deepEqual(pins!.pins[0]!.capabilityExactRefs,[compiler,connector,behaviorCapability]);
    await f.admin`UPDATE release.assignments SET execution_allowed=false WHERE id=${assignment.assignmentRef.id}`;
    try{await assert.rejects(invoke(),{code:'RELEASE_SCOPE_MISMATCH'});}finally{await f.admin`UPDATE release.assignments SET execution_allowed=true WHERE id=${assignment.assignmentRef.id}`;}
    assert.deepEqual((await invoke()).pinSetRef,results[0]!.pinSetRef);
    const revoke=await command('abh.grants.revoke',grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef);await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
  });
  await t.test('domain denial and stale versions leave Proposed and its audit unchanged',async()=>{
    const action=await propose();await assert.rejects(validate(action,{...checks,domain:async()=>{throw new CoreError('ACTION_DOMAIN_INVALID');}}),{code:'ACTION_DOMAIN_INVALID'});
    assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id))).position.lifecycle,'Proposed');
    const valid=await validate(action);assert.equal(valid.position.lifecycle,'Validated');await assert.rejects(validate(action),{code:'VERSION_CONFLICT'});
  });
  await t.test('payload replacement after proposal cannot pass validation',async()=>{
    const artifact=await store('{"message":"old"}'),action=await propose({...proposal(),payloadRef:artifact.artifactRef});
    await db.transaction(c,options(),tx=>tx.owner('ArtifactStore')`UPDATE data.artifacts SET inline_body=${new TextEncoder().encode('{"message":"new"}')} WHERE id=${artifact.artifactRef.id}`);
    await assert.rejects(validate(action),{code:'INTERNAL_ERROR'});
  });
  await t.test('PinSet and Action binding commit together; rollback leaves neither and retry reuses one set',async()=>{
    const action=await validate(await propose()),cmd=await command('abh.actions.pin',action.actionRef);
    await assert.rejects(run(cmd,async tx=>{await actions.pin(tx,cmd,action.actionRef,[ref('abh.execution-authority')],checks);throw new Error('after pin binding');}),/after pin binding/);
    assert.equal(await db.transaction(c,options(),tx=>releases.getPinSet(tx,action.actionRef)),undefined);
    assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id))).pinSetRef,undefined);
    const [first,second]=await Promise.all([pin(action),pin(action)]);assert.deepEqual(first,second);assert.ok(first.pinSetRef);
    assert.equal(first.planRef,undefined);assert.equal(first.actionRef.version,3);
  });
  await t.test('authorization request durably accepts Human intent without issuing authority and replays current admission',async()=>{
    const action=await propose(),payload={authorityRefs:[ref('abh.execution-authority')]},cmd=await command('abh.actions.request-authorization',{actionRef:action.actionRef,payload});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.request-authorization'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    let permitted=true;
    const policy={purposeNames,fenceRefs:async()=>[],admit:async(_tx:TenantTransaction,value:ActionRecord)=>{value.actionType='fixture.mutated';if(!permitted)throw new CoreError('FORBIDDEN');}};
    const invoke=(grants=[grant.grantRef])=>requestActionAuthorization(db,c,options(),cmd,action.actionRef,payload,grants,policy);
    const counts=()=>f.admin`SELECT (SELECT count(*)::int FROM execution.authorization_requests WHERE action_id=${action.actionRef.id}) AS requests,(SELECT count(*)::int FROM data.command_receipts WHERE id=${cmd.commandId}) AS receipts,(SELECT count(*)::int FROM data.outbox WHERE record->>'causationId'=${cmd.commandId}) AS events`;
    await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});permitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});permitted=true;
    await f.admin`CREATE FUNCTION execution.fixture_reject_authorization_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record->>'type'='abh.action-authorization-request.accepted' THEN RAISE EXCEPTION 'fixture request rollback'; END IF; RETURN NEW; END; $$`;
    await f.admin`CREATE TRIGGER fixture_reject_authorization_event BEFORE INSERT ON data.outbox FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_authorization_event()`;
    try{await assert.rejects(invoke(),/fixture request rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_authorization_event ON data.outbox`;await f.admin`DROP FUNCTION execution.fixture_reject_authorization_event()`;}
    assert.deepEqual({...((await counts())[0])},{requests:0,receipts:0,events:0});
    const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(x=>x.replayed).length,1);assert.deepEqual(results[0]!.request,results[1]!.request);
    const request=results[0]!.request;assert.deepEqual(request.requestedBy,c.tenant.actor);assert.deepEqual(request.executionPrincipalRef,service);assert.deepEqual(request.payload,payload);assert.equal(request.sourceCommandRef.id,cmd.commandId);
    assert.deepEqual({...((await counts())[0])},{requests:1,receipts:1,events:1});assert.deepEqual(await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id)),action);assert.equal((await children(action)).length,0);
    const restart=await Database.connect(f.runtimeUrl,{max:1});try{const replay=await requestActionAuthorization(restart,c,options(),{...cmd,commandId:randomUUID()},action.actionRef,payload,[grant.grantRef],policy);assert.equal(replay.commandId,cmd.commandId);assert.deepEqual(replay.request,request);}finally{await restart.close();}
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('ActionEngine')`UPDATE execution.authorization_requests SET record=record`),{code:'42501'});
    const conflict={authorityRefs:[ref('abh.execution-authority')]};await assert.rejects(requestActionAuthorization(db,c,options(),{...cmd,digest:await inputDigest({actionRef:action.actionRef,payload:conflict})},action.actionRef,conflict,[grant.grantRef],policy),{code:'IDEMPOTENCY_CONFLICT'});
    const worker=deriveVerifiedContext({...c.request,requestId:randomUUID(),actor:{type:'Service',id:service.id}});
    const readGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.actions.read','abh.actions.validate','abh.actions.pin','abh.actions.register-plan']};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${readGrant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${readGrant.grantRef.id},${service.id},${JSON.stringify(readGrant)}::text::jsonb,${readGrant.validFrom},${readGrant.validUntil},'Active')`;
    });
    let visible=true,discoveryAllowed=true;
    const discovery={fenceRefs:async()=>[],admit:async()=>{if(!discoveryAllowed)throw new CoreError('FORBIDDEN');},canRead:async()=>visible};
    const scan=(limit=1,after?:string)=>discoverAuthorizationRequests(db,worker,options(),limit,after,[readGrant.grantRef],discovery);
    await assert.rejects(discoverAuthorizationRequests(db,c,options(),1,undefined,[grant.grantRef],discovery),{code:'FORBIDDEN'});
    await assert.rejects(discoverAuthorizationRequests(db,worker,options(),1,undefined,[],discovery),{code:'AUTHORITY_REQUIRED'});
    const firstPage=await scan();assert.equal(firstPage.candidates.length,1);assert.equal(firstPage.candidates[0]!.stage,'Validate');assert.deepEqual(firstPage.candidates[0]!.request,request);
    const secondCmd=await command('abh.actions.request-authorization',{actionRef:action.actionRef,payload});
    const secondRequest=await requestActionAuthorization(db,c,options(),secondCmd,action.actionRef,payload,[grant.grantRef],policy);
    visible=false;const hidden=await scan();assert.equal(hidden.candidates.length,0);assert.equal(hidden.scanned,1);assert.ok(hidden.next);visible=true;
    const first=await scan(),second=await scan(1,first.next);assert.equal(second.candidates.length,1);assert.equal(second.next,undefined);assert.notEqual(first.candidates[0]!.request.requestRef.id,second.candidates[0]!.request.requestRef.id);
    assert.deepEqual(new Set([first.candidates[0]!.request.requestRef.id,second.candidates[0]!.request.requestRef.id]),new Set([request.requestRef.id,secondRequest.request.requestRef.id]));
    let prepareAllowed=true,domainCalls=0;
    const requestChecks={fenceRefs:async()=>[],admit:async()=>{if(!prepareAllowed)throw new CoreError('FORBIDDEN');}};
    const validation={fenceRefs:async()=>[],admit:async()=>{},artifact:checks.artifact,domain:async()=>{domainCalls++;}};
    const evidence={domainValidationRef:ref('hello.validation')};
    const advanceValidation=(database=db)=>validateRequestedAction(database,worker,options(),request.requestRef,action.actionRef,evidence,[readGrant.grantRef],validation,requestChecks);
    await assert.rejects(validateRequestedAction(db,c,options(),request.requestRef,action.actionRef,evidence,[grant.grantRef],validation,requestChecks),{code:'FORBIDDEN'});
    const unrelated=await propose();await assert.rejects(validateRequestedAction(db,worker,options(),request.requestRef,unrelated.actionRef,evidence,[readGrant.grantRef],validation,requestChecks),{code:'FORBIDDEN'});
    prepareAllowed=false;await assert.rejects(advanceValidation(),{code:'FORBIDDEN'});prepareAllowed=true;assert.equal(domainCalls,0);
    const validations=await Promise.all([advanceValidation(),advanceValidation()]);assert.equal(validations.filter(value=>value.replayed).length,1);assert.equal(domainCalls,1);assert.equal(validations[0]!.commandId,validations[1]!.commandId);
    const validated=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));assert.ok((await scan(100)).candidates.every(value=>value.stage==='Pin'));
    const reopened=await Database.connect(f.runtimeUrl,{max:1});try{assert.equal((await advanceValidation(reopened)).commandId,validations[0]!.commandId);}finally{await reopened.close();}
    await assert.rejects(validateRequestedAction(db,worker,options(),request.requestRef,action.actionRef,{domainValidationRef:ref('hello.validation')},[readGrant.grantRef],validation,requestChecks),{code:'IDEMPOTENCY_CONFLICT'});
    let selectedAllowed=false;
    const pinPayload={preparationAuthorityRefs:[readGrant.grantRef]},pinChecks={fenceRefs:async()=>[],admit:async()=>{},artifact:checks.artifact,selected:async()=>{if(!selectedAllowed)throw new CoreError('PRECONDITION_FAILED');}};
    const advancePin=()=>pinRequestedAction(db,worker,options(),request.requestRef,validated.actionRef,pinPayload,pinChecks,requestChecks);
    await assert.rejects(advancePin(),{code:'PRECONDITION_FAILED'});
    assert.equal(await db.transaction(worker,options(),tx=>releases.getPinSet(tx,validated.actionRef)),undefined);selectedAllowed=true;
    const pins=await Promise.all([advancePin(),advancePin()]);assert.equal(pins.filter(value=>value.replayed).length,1);assert.deepEqual(pins[0]!.pinSetRef,pins[1]!.pinSetRef);assert.equal(pins[0]!.commandId,pins[1]!.commandId);
    selectedAllowed=false;await assert.rejects(advancePin(),{code:'PRECONDITION_FAILED'});selectedAllowed=true;
    const pinned=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));assert.ok((await scan(100)).candidates.every(value=>value.stage==='Compile'));
    await assert.rejects(pinRequestedAction(db,worker,options(),request.requestRef,{...validated.actionRef,version:1000},pinPayload,pinChecks,requestChecks),{code:'VERSION_CONFLICT'});
    assert.equal((await advanceValidation()).commandId,validations[0]!.commandId);assert.equal(domainCalls,1);
    prepareAllowed=false;await assert.rejects(advanceValidation(),{code:'FORBIDDEN'});await assert.rejects(advancePin(),{code:'FORBIDDEN'});prepareAllowed=true;
    assert.deepEqual((await invoke()).request,request);
    const template=await prepare(),ownPins=(await db.transaction(c,options(),tx=>releases.getPinSet(tx,pinned.actionRef)))!;
    let compileCalls=0,planAllowed=false,releaseCompilers=()=>{};
    const barrier=new Promise<void>(resolve=>{releaseCompilers=resolve;});let concurrent=false;
    const compilerHost=new ActionCompilerHost([{capability:compiler,compile:async()=>{
      compileCalls++;if(concurrent){if(compileCalls===3)releaseCompilers();await barrier;}
      const candidate={...template.plan,planRef:ref('abh.operation-plan'),actionRef:pinned.actionRef,pinSetRef:ownPins.pinSetRef,pinSetDigest:ownPins.digest};
      return {...candidate,digest:await digestContract('OperationPlan',candidate)};
    }}]);
    const compilation={fenceRefs:async()=>[],admit:async()=>{},artifact:checks.artifact};
    const registration={fenceRefs:async()=>[],admit:async()=>{},artifact:checks.artifact,plan:async()=>{if(!planAllowed)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');}};
    const advanceCompile=(database=db)=>compileRequestedAction(database,worker,options(),request.requestRef,compiler,compilerHost,[readGrant.grantRef],compilation,registration,requestChecks);
    await assert.rejects(advanceCompile(),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});assert.equal((await children(pinned)).length,0);assert.equal(await db.transaction(c,options(),tx=>operations.getPlan(tx,pinned.actionRef.id)),undefined);
    planAllowed=true;concurrent=true;
    const compiled=await Promise.all([advanceCompile(),advanceCompile()]);assert.equal(compileCalls,3);assert.deepEqual(compiled[0]!.planRef,compiled[1]!.planRef);assert.equal(compiled[0]!.commandId,compiled[1]!.commandId);assert.equal(compiled.filter(value=>value.replayed).length,1);
    const planned=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id)),originalChildren=await children(planned);assert.equal(originalChildren.length,2);assert.ok((await scan(100)).candidates.every(value=>value.stage==='Authorize'));
    const compilerRestart=await Database.connect(f.runtimeUrl,{max:1});try{assert.equal((await advanceCompile(compilerRestart)).commandId,compiled[0]!.commandId);}finally{await compilerRestart.close();}
    assert.equal(compileCalls,3);assert.deepEqual(await children(planned),originalChildren);
    await assert.rejects(compileRequestedAction(db,worker,options(),request.requestRef,{...compiler,version:'9.0.0'},compilerHost,[readGrant.grantRef],compilation,registration,requestChecks),{code:'PIN_INPUT_CONFLICT'});assert.equal(compileCalls,3);
    prepareAllowed=false;await assert.rejects(advanceCompile(),{code:'FORBIDDEN'});prepareAllowed=true;
    const cancel=await command('abh.actions.cancel',planned.actionRef);await run(cancel,async tx=>(await actions.cancelPreparation(tx,cancel,planned.actionRef,'cancel accepted request')).actionRef);
    assert.equal((await advanceCompile()).commandId,compiled[0]!.commandId);assert.equal(compileCalls,3);
    assert.equal((await advanceValidation()).commandId,validations[0]!.commandId);assert.equal((await advancePin()).commandId,pins[0]!.commandId);assert.equal(domainCalls,1);
    const cancelled=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));await assert.rejects(pinRequestedAction(db,worker,options(),request.requestRef,cancelled.actionRef,pinPayload,pinChecks,requestChecks),{code:'PRECONDITION_FAILED'});
    assert.equal((await scan()).candidates.length,0);discoveryAllowed=false;await assert.rejects(scan(),{code:'FORBIDDEN'});discoveryAllowed=true;
    const workerAction=await propose(),workerPayload={},workerCmd=await command('abh.actions.request-authorization',{actionRef:workerAction.actionRef,payload:workerPayload});
    await requestActionAuthorization(db,c,options(),workerCmd,workerAction.actionRef,workerPayload,[grant.grantRef],policy);
    const stopWorker=new AbortController();let pages=0,workerCompiles=0,workerValidations=0;
    const workerCompiler=new ActionCompilerHost([{capability:compiler,compile:async input=>{
      workerCompiles++;const candidate={...template.plan,planRef:ref('abh.operation-plan'),actionRef:input.action.actionRef,pinSetRef:input.pins.pinSetRef,pinSetDigest:input.pins.digest};
      return {...candidate,digest:await digestContract('OperationPlan',candidate)};
    }}]);
    const workerInstallation={context:async()=>worker,readGrants:[readGrant.grantRef],discovery,requestChecks,
      validation:{payload:async()=>evidence,grants:[readGrant.grantRef],checks:{...validation,domain:async()=>{workerValidations++;}}},
      pin:{grants:[readGrant.grantRef],checks:pinChecks},compilation:{compiler,host:workerCompiler,grants:[readGrant.grantRef],checks:compilation,registration},intervalMs:1,
      onPage:async(result:{authorizationReady:number})=>{pages++;if(result.authorizationReady)stopWorker.abort();if(pages>8)throw new Error('worker failed to advance');}};
    let contextCalls=0;
    await assert.rejects(runAuthorizationWorker(db,{...workerInstallation,signal:new AbortController().signal,context:async()=>{
      contextCalls++;return contextCalls===1?worker:deriveVerifiedContext({...worker.request,actor:{type:'Service',id:randomUUID()}});
    }}),{code:'FORBIDDEN'});assert.equal(workerValidations,0);assert.equal(workerCompiles,0);
    await runAuthorizationWorker(db,{...workerInstallation,signal:stopWorker.signal});assert.equal(pages,4);assert.equal(workerValidations,1);assert.equal(workerCompiles,1);
    const workerPlanned=await db.transaction(c,options(),tx=>actions.get(tx,workerAction.actionRef.id));assert.ok(workerPlanned.planRef);assert.equal(workerPlanned.authorizationSnapshotRef,undefined);assert.equal((await children(workerPlanned)).length,2);
    const restartWorker=new AbortController();await runAuthorizationWorker(db,{...workerInstallation,signal:restartWorker.signal,onPage:async result=>{assert.equal(result.authorizationReady,1);restartWorker.abort();}});assert.equal(workerCompiles,1);assert.equal(workerValidations,1);
    const blockedObservation=new AbortController();
    await assert.rejects(runAuthorizationWorker(db,{...workerInstallation,transactionTimeoutMs:100,signal:blockedObservation.signal,onPage:async()=>new Promise<void>(()=>{})}),{code:'DEPENDENCY_TIMEOUT'});
    const revokeRead=await command('abh.grants.revoke',readGrant.grantRef);await run(revokeRead,async tx=>(await revokeGrant(tx,revokeRead,readGrant.grantRef,[scope])).grantRef);await assert.rejects(scan(),{code:'EPOCH_REVOKED'});await assert.rejects(advanceValidation(),{code:'EPOCH_REVOKED'});await assert.rejects(advancePin(),{code:'EPOCH_REVOKED'});await assert.rejects(advanceCompile(),{code:'EPOCH_REVOKED'});

    assert.deepEqual((await invoke()).request,request);assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id))).position.lifecycle,'Cancelled');
    const fresh=await command('abh.actions.request-authorization',{actionRef:action.actionRef,payload});await assert.rejects(requestActionAuthorization(db,c,options(),fresh,action.actionRef,payload,[grant.grantRef],policy),{code:'VERSION_CONFLICT'});
    permitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});permitted=true;
    const revoke=await command('abh.grants.revoke',grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef);await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
  });
  await t.test('compiler host invokes only exact pinned capabilities with bounded isolated inputs',async()=>{
    const {action,plan,pins}=await prepare(),intent=await db.transaction(c,options(),tx=>actions.getIntent(tx,action.actionRef.id)),input={action,intent,pins};let calls=0;
    const host=new ActionCompilerHost([{capability:compiler,compile:async received=>{calls++;received.action.actionType='fixture.changed';received.pins.pins=[];return plan;}}]);
    assert.deepEqual(await host.compile(input,compiler,options()),plan);assert.equal(input.action.actionType,'hello.publish');assert.ok(input.pins.pins.length);
    await assert.rejects(host.compile(input,{...compiler,version:'9.0.0'},options()),{code:'PIN_INPUT_CONFLICT'});assert.equal(calls,1);
    const wrong=new ActionCompilerHost([{capability:compiler,compile:async()=>({...plan,pinSetDigest:'sha256:'+'0'.repeat(64)})}]);await assert.rejects(wrong.compile(input,compiler,options()),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
    assert.throws(()=>new ActionCompilerHost([{capability:compiler,compile:async()=>plan},{capability:compiler,compile:async()=>plan}]),{code:'INVALID_ARGUMENT'});
    const stopped=new AbortController();stopped.abort();await assert.rejects(host.compile(input,compiler,{signal:stopped.signal,deadline:Date.now()+1000}),{code:'DEPENDENCY_TIMEOUT'});assert.equal(calls,1);
    const stuck=new ActionCompilerHost([{capability:compiler,compile:async()=>new Promise(()=>{})}]);await assert.rejects(stuck.compile(input,compiler,{signal:new AbortController().signal,deadline:Date.now()+30}),{code:'DEPENDENCY_TIMEOUT'});
    const result=await host.compile(input,compiler,options());result.nodes=[];assert.equal(plan.nodes.length,2);
  });
  await t.test('plan registration ingress validates current Grant, exact compiled payload and stable replay',async()=>{
    const {action,plan}=await prepare(),payload={pinSetRef:plan.pinSetRef,pinSetDigest:plan.pinSetDigest,planRef:plan.planRef,planDigest:plan.digest,scopeProofRef:plan.scopeProofRef};
    let compilerCalls=0;
    const compilerHost=new ActionCompilerHost([{capability:compiler,compile:async()=>{compilerCalls++;return plan;}}]);
    const cmd=await command('abh.actions.register-plan',{actionRef:action.actionRef,payload});
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.register-plan'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    });
    let permitted=true,valid=false,checksCount=0;
    const policy={fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},artifact:async()=>{},plan:async(_tx:TenantTransaction,candidate:OperationPlan)=>{checksCount++;if(!valid)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');candidate.nodes=[];}};
    const compilePolicy={fenceRefs:async()=>[],admit:async()=>{if(!permitted)throw new CoreError('FORBIDDEN');},artifact:async()=>{}};
    const compile=()=>compilePreparedAction(db,c,options(),action.actionRef,compiler,compilerHost,[grant.grantRef],compilePolicy);
    await assert.rejects(compilePreparedAction(db,c,options(),action.actionRef,compiler,compilerHost,[],compilePolicy),{code:'AUTHORITY_REQUIRED'});assert.equal(compilerCalls,0);
    permitted=false;await assert.rejects(compile(),{code:'FORBIDDEN'});assert.equal(compilerCalls,0);permitted=true;
    const revokedDuringCompile=new ActionCompilerHost([{capability:compiler,compile:async()=>{permitted=false;return plan;}}]);
    await assert.rejects(compilePreparedAction(db,c,options(),action.actionRef,compiler,revokedDuringCompile,[grant.grantRef],compilePolicy),{code:'FORBIDDEN'});permitted=true;
    const compiled=await compile();assert.deepEqual(compiled,plan);assert.equal(compilerCalls,1);
    const cancelledCompilation=await prepare();
    const cancellingHost=new ActionCompilerHost([{capability:compiler,compile:async()=>{
      const cancel=await command('abh.actions.cancel',cancelledCompilation.action.actionRef);
      await run(cancel,async tx=>(await actions.cancelPreparation(tx,cancel,cancelledCompilation.action.actionRef,'cancel during compilation')).actionRef);
      return cancelledCompilation.plan;
    }}]);
    await assert.rejects(compilePreparedAction(db,c,options(),cancelledCompilation.action.actionRef,compiler,cancellingHost,[grant.grantRef],compilePolicy),{code:'VERSION_CONFLICT'});
    assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,cancelledCompilation.action.actionRef.id))).position.lifecycle,'Cancelled');
    assert.equal((await children(cancelledCompilation.action)).length,0);

    const invoke=(grants=[grant.grantRef])=>registerOperationPlan(db,c,options(),cmd,action.actionRef,payload,compiled,grants,policy);
    await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});await assert.rejects(invoke(),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});assert.equal((await children(action)).length,0);valid=true;
    await assert.rejects(registerOperationPlan(db,c,options(),cmd,action.actionRef,payload,{...plan,scopeProofRef:ref('abh.scope-proof')},[grant.grantRef],policy),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
    await f.admin`CREATE FUNCTION execution.fixture_reject_registered_plan() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record ? 'planRef' THEN RAISE EXCEPTION 'fixture plan rollback'; END IF; RETURN NEW; END; $$`;
    await f.admin`CREATE TRIGGER fixture_reject_registered_plan BEFORE UPDATE ON execution.actions FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_registered_plan()`;
    try{await assert.rejects(invoke(),/fixture plan rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_registered_plan ON execution.actions`;await f.admin`DROP FUNCTION execution.fixture_reject_registered_plan()`;}
    assert.equal((await children(action)).length,0);assert.equal(await db.transaction(c,options(),tx=>operations.getPlan(tx,action.actionRef.id)),undefined);
    const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(value=>value.replayed).length,1);assert.deepEqual(results[0]!.planRef,plan.planRef);assert.equal(results[0]!.commandId,cmd.commandId);assert.equal(checksCount,3);
    await assert.rejects(compile(),{code:'VERSION_CONFLICT'});assert.equal(compilerCalls,1);
    const childRecords=await children(action);assert.equal(childRecords.length,2);assert.ok(childRecords.every(child=>child.attemptCount===0));
    const reconnected=await Database.connect(f.runtimeUrl,{max:1});try{const replay=await registerOperationPlan(reconnected,c,options(),{...cmd,commandId:randomUUID()},action.actionRef,payload,plan,[grant.grantRef],policy);assert.equal(replay.commandId,cmd.commandId);assert.equal(replay.replayed,true);}finally{await reconnected.close();}
    assert.deepEqual(await children(action),childRecords);permitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});permitted=true;
    await f.admin`UPDATE release.assignments SET execution_allowed=false WHERE id=${assignment.assignmentRef.id}`;
    try{await assert.rejects(invoke(),{code:'RELEASE_SCOPE_MISMATCH'});}finally{await f.admin`UPDATE release.assignments SET execution_allowed=true WHERE id=${assignment.assignmentRef.id}`;}
    const revoke=await command('abh.grants.revoke',grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef);await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
  });
  await t.test('concurrent plan registration creates one complete DAG and stable provider keys, recovered after reconnect',async()=>{
    const {action,plan}=await prepare();const [first,second]=await Promise.all([register(action,plan),register(action,plan)]);assert.deepEqual(first,second);
    assert.equal(first.position.lifecycle,'Validated');assert.deepEqual(first.planRef,plan.planRef);
    const ops=await children(action);assert.equal(ops.length,2);assert.ok(ops.every(op=>op.position.lifecycle==='Pending'&&op.attemptCount===0));assert.notEqual(ops[0]!.providerIdempotencyKey,ops[1]!.providerIdempotencyKey);
    const restarted=await Database.connect(f.runtimeUrl);try{assert.deepEqual(await restarted.transaction(c,options(),tx=>new OperationOwner().getPlan(tx,action.actionRef.id)),plan);}finally{await restarted.close();}
    await assert.rejects(register(first,{...plan,nodes:plan.nodes.slice(0,1)}),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
    const different={...plan,planRef:ref('abh.operation-plan')};await assert.rejects(register(first,different),{code:'IDEMPOTENCY_CONFLICT'});
    await assert.rejects(db.transaction(c,options(),tx=>tx.owner('OperationController')`UPDATE execution.plans SET record=record`),{code:'42501'});
  });
  await t.test('excess scope, unpinned capability, summed fractional overrun and domain proof denial leave no children',async()=>{
    const {action,plan}=await prepare();
    const reject=async(value:OperationPlan,code:string)=>{value.digest=await digestContract('OperationPlan',value);await assert.rejects(register(action,value),{code});assert.equal((await children(action)).length,0);};
    await reject({...plan,compilerRef:{...compiler,version:'0.2.0'}},'PIN_INPUT_CONFLICT');
    await reject({...plan,nodes:plan.nodes.map(node=>({...node,payloadDigest:'sha256:'+'e'.repeat(64)}))},'ACTION_PLAN_SCOPE_EXCEEDED');
    await reject({...plan,impactUpperBound:{...impact,scopeRefs:[scope,ref('abh.organization')]}},'ACTION_PLAN_SCOPE_EXCEEDED');
    await reject({...plan,nodes:plan.nodes.map((node,i)=>({...node,resourceRequirements:[{resourceRef:resource,quantity:i===0?'9007199254740993':'0.000000000002',unit:'hello.credit'}]}))},'ACTION_PLAN_SCOPE_EXCEEDED');
    await assert.rejects(register(action,plan,{...checks,plan:async()=>{throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');}}),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});assert.equal((await children(action)).length,0);
    assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id))).actionRef.version,3);
  });
  await t.test('cancel/plan competition converges to Cancelled with no dispatchable child',async()=>{
    const {action,plan}=await prepare();const cmd=await command('abh.actions.cancel',{action:action.actionRef,reason:'fixture stop'});
    const cancel=(a:ActionRecord)=>run(cmd,async tx=>(await actions.cancelPreparation(tx,cmd,a.actionRef,'fixture stop')).actionRef);
    const results=await Promise.allSettled([register(action,plan),cancel(action)]);assert.ok(results.some(result=>result.status==='fulfilled'));
    let current=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));if(current.position.lifecycle!=='Cancelled'){await cancel(current);current=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));}
    assert.equal(current.position.lifecycle,'Cancelled');assert.ok((await children(action)).every(op=>op.position.lifecycle==='Cancelled'));
  });
  // These Authority fixtures isolate the persisted-source checker. Effect issuance from real complete Decisions is covered in decisions.test.ts.
  const authorityFixture=async(action:ActionRecord,envelopeRef=ref('abh.resource-envelope'),evidence:EntityRef=ref('abh.request-completion-evidence'),realEffect=false)=>{
    const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[scope],actionTypes:['hello.publish'],purposeNames,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+45_000).toISOString(),issuanceEvidenceRef:evidence,status:'Active'};
    const unsigned:ExecutionAuthority={authorityRef:ref('abh.execution-authority'),resourceOrganizationId:org,executionPrincipalRef:service,allowedProposerRefs:[ref('abh.principal',c.tenant.actor.id)],binding:{kind:'Action',actionRef:action.actionRef,payloadDigest:action.payloadDigest},
      grantRefs:[grant.grantRef],scopeRefs:[scope],purposeRefs:[executionPurpose],actionTypes:['hello.publish'],resourceEnvelopeRef:envelopeRef,validFrom:grant.validFrom,validUntil:grant.validUntil,stopConditions:[],issuanceEvidenceRef:{...evidence,type:'abh.request-completion-evidence'},effectKey:'fixture',issuedBy:c.tenant.actor,sourceVersionRefs:[action.actionRef],issuanceDigest:'sha256:'+'0'.repeat(64),status:'Active'};
    const authority={...unsigned,issuanceDigest:await digestContract('ExecutionAuthority',unsigned)};
    if(realEffect){
      const cmd=await command('abh.execution-authority.issue-effect',{authority,serviceGrant:grant});
      await run(cmd,async tx=>(await new ExecutionAuthorityOwner().issueEffect(tx,cmd,{authority,serviceGrant:grant},{lock:async()=>{},scope:async()=>{},decision:async()=>{}})).authorityRef);
      return {authority,grant};
    }
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
        VALUES (${org},${grant.grantRef.id},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
      await tx.owner('Control')`INSERT INTO control.execution_authorities(resource_organization_id,id,execution_principal_id,evidence_type,evidence_id,effect_key,input_digest,valid_from,valid_until,status,record)
        VALUES (${org},${authority.authorityRef.id},${service.id},${evidence.type},${evidence.id},'fixture',${authority.issuanceDigest},${authority.validFrom},${authority.validUntil},'Active',${JSON.stringify(authority)}::text::jsonb)`;
      for(const target of [authority.authorityRef,grant.grantRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
    });return {authority,grant};
  };
  await t.test('source resolution follows semantic Action identity after plan binding and uses no old user session',async()=>{
    const {action,plan}=await prepare(),{authority}=await authorityFixture(action),registered=await register(action,plan);
    const freshService=deriveVerifiedContext({...c.request,requestId:randomUUID(),actor:{type:'Service',id:service.id},purposeOfUse:'abh.action.execute'});
    const result=await db.transaction(freshService,options(),tx=>inspectActionExecutionSource(tx,registered));
    assert.deepEqual(result.authority.authorityRef,authority.authorityRef);assert.equal(result.grants.length,1);assert.ok(result.sourceVersions.some(ref=>ref.id===action.sourceCommandRef.id));
    assert.equal(authority.binding.kind==='Action'&&authority.binding.actionRef.version,3);assert.equal(registered.actionRef.version,4);
    await assert.rejects(db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,{...registered,sourceCommandRef:ref('abh.command')})),{code:'VERSION_CONFLICT'});
    await assert.rejects(db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,registered,ref('abh.execution-authority'))),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
  });
  await t.test('configured lifecycle purposes carry metadata to execution without expanding Artifact access',async()=>{
    const {action,plan,pins}=await prepare(),registered=await register(action,plan);
    const executing=deriveVerifiedContext({...c.request,requestId:randomUUID(),actor:{type:'Service',id:service.id},purposeOfUse:'abh.action.execute'});
    await db.transaction(executing,options(),async tx=>{
      assert.deepEqual(await actions.get(tx,action.actionRef.id),registered);
      const intent=await actions.getIntent(tx,action.actionRef.id);assert.ok(intent.purposeNames.includes('abh.action.execute'));
      assert.deepEqual(await operations.getPlan(tx,action.actionRef.id),plan);assert.equal((await operations.list(tx,action.actionRef.id)).length,2);
      assert.deepEqual(await releases.getPinSet(tx,action.actionRef),pins);
      await releases.revalidate(tx,pins,actions.preparationRequest(tx,intent,[ref('abh.execution-authority')]));
    });
    await assert.rejects(db.transaction(executing,options(),tx=>artifacts.read(tx,payloadArtifact.artifactRef,async()=>{})),{code:'RESOURCE_NOT_FOUND'});
    const input=proposal(),cmd=await command('abh.actions.propose',input);
    await assert.rejects(run(cmd,async tx=>(await actions.propose(tx,cmd,input,{...definition,purposeNames:[...purposeNames,'hello.unregistered']},checks)).actionRef),{code:'PURPOSE_DENIED'});
  });
  await t.test('ambiguous candidate set is never disambiguated by a caller authority assertion',async()=>{
    const action=await validate(await propose()),first=await authorityFixture(action);await authorityFixture(action);
    await assert.rejects(db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,action,first.authority.authorityRef)),{code:'EXECUTION_AUTHORITY_AMBIGUOUS'});
  });
  await t.test('source Grant and Authority revocation invalidate current checks and journal their fence atomically',async()=>{
    for(const target of ['grant','authority'] as const){
      const action=await validate(await propose()),{authority,grant}=await authorityFixture(action);
      await db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,action));
      const object=target==='grant'?grant.grantRef:authority.authorityRef,cmd=await command(target==='grant'?'abh.grants.revoke':'abh.execution-authority.revoke',object);
      await run(cmd,async tx=>target==='grant'?(await revokeGrant(tx,cmd,object,[scope])).grantRef:(await revokeExecutionAuthority(tx,cmd,object,[scope])).authorityRef);
      await assert.rejects(db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,action)),{code:target==='grant'?'EPOCH_REVOKED':'AUTHORITY_REQUIRED'});
      const rows=await db.transaction(c,options(),tx=>tx.owner('Control')`SELECT epoch,stop_flag FROM control.fences WHERE scope_type=${object.type} AND scope_id=${object.id}`);
      assert.equal(rows[0]!.epoch,'2');assert.equal(rows[0]!.stop_flag,true);
    }
  });
  await t.test('different Action, wrong purpose and current principal membership loss reject source reuse',async()=>{
    const action=await validate(await propose());await authorityFixture(action);
    const other=await validate(await propose());await assert.rejects(db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,other)),{code:'AUTHORITY_REQUIRED'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.memberships SET status='Revoked' WHERE principal_id=${service.id}`);
    await assert.rejects(db.transaction(c,options(),tx=>inspectActionExecutionSource(tx,action)),{code:'AUTHORITY_REQUIRED'});
    await db.transaction(c,options(),tx=>tx.owner('Identity')`UPDATE identity.memberships SET status='Active' WHERE principal_id=${service.id}`);
    const otherPurpose=deriveVerifiedContext({...c.request,requestId:randomUUID(),purposeOfUse:'abh.artifact.read'});
    await assert.rejects(db.transaction(otherPurpose,options(),tx=>inspectActionExecutionSource(tx,action)),{code:'RESOURCE_NOT_FOUND'});
  });
  await t.test('Control Snapshot, two policy evaluations, reservations and Action authorization commit atomically',async t=>{
    const assets=new InstalledPolicyAssets();t.after(()=>assets.close());const policies=new PolicyOwner(),ledgerOwner=new LedgerOwner(),envelopes=new ResourceEnvelopeOwner();
    const catalog=createContractCatalog();assert.ok(catalog.success);
    const purpose={purposeRef:executionPurpose,resourceOrganizationId:org,name:'abh.action.execute',evidenceRefs:[scope],status:'Active' as const},purposeCmd=await command('abh.purposes.configure',purpose);
    await run(purposeCmd,async tx=>(await new PurposeOwner().configure(tx,purposeCmd,purpose,catalog.data,async()=>{})).purposeRef);
    const manifest:CompiledPolicyManifest={formatVersion:'0.1.0',wasmDigest:provenance.wasmDigest,sourceDigest:provenance.sourceDigest,compilerName:'OPA',compilerVersion:'1.20.2',compilerDigest:'sha256:54e7008e696d39e8e4f96594e2b71bcbe45fd9a4f838102bcf1240638bf3fbe1',entrypoints:['abh_fixture/action_decision','abh_fixture/empty_behavior','abh_fixture/decision','abh_fixture/scope_decision']};
    const artifact=await store(JSON.stringify(manifest),purposeNames);await assets.install(new TextEncoder().encode(JSON.stringify(manifest)),wasm,new AbortController().signal);
    const policyChecks={lock:async()=>{},publish:async()=>{},activate:async()=>{}};
    const configurePolicy=async(kind:'Mandatory'|'Behavior',entrypoint:string)=>{
      const unsigned:PolicyVersionRecord={policyVersionRef:ref('abh.policy-version'),resourceOrganizationId:org,kind,artifactRef:artifact.artifactRef,manifestDigest:artifact.contentDigest,wasmDigest:manifest.wasmDigest,entrypoint,inputSchemaName:'ActionPolicyInput',ownerRef:scope,releaseEvidenceRefs:[scope],
        ...(kind==='Behavior'?{behaviorCapabilityRef:behaviorCapability}:{}),digest:'sha256:'+'0'.repeat(64)};
      const policy={...unsigned,digest:await digestContract('PolicyVersionRecord',unsigned)},cmd=await command('abh.policies.configure',policy);
      await run(cmd,async tx=>(await policies.configure(tx,cmd,{policy,purposeNames},assets,policyChecks)).policyVersionRef);return policy;
    };
    const mandatory=await configurePolicy('Mandatory','abh_fixture/action_decision');await configurePolicy('Behavior','abh_fixture/empty_behavior');
    const activate=async(policy:PolicyVersionRecord,version?:number)=>{
      const input={policyVersionRef:policy.policyVersionRef,evidenceRefs:[scope],purposeNames,...(version?{expectedBindingVersion:version}:{})},cmd=await command('abh.policies.activate-mandatory',input);let binding;
      await run(cmd,async tx=>{binding=await policies.activateMandatory(tx,cmd,input,policyChecks);return binding.bindingRef;});return binding!;
    };
    let binding=await activate(mandatory);
    const resolver=new ActionAuthorizationResolver(assets),execution=deriveVerifiedContext({...c.request,requestId:randomUUID(),actor:{type:'Service',id:service.id},purposeOfUse:'abh.action.execute'});
    const reviewer=new DecisionOwner();
    const responsibility={responsibilityRef:ref('abh.responsibility-assignment'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),responsibilityType:'Authorization' as const,scopeRefs:[scope],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+50_000).toISOString(),templateRef:scope,status:'Active' as const};
    const responsibilityCmd=await command('abh.responsibilities.assign',responsibility);await run(responsibilityCmd,tx=>assignResponsibility(tx,responsibilityCmd,responsibility));
    const approvalGrant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:responsibility.principalRef,scopeRefs:[scope],actionTypes:['abh.decisions.submit'],purposeNames:['abh.decision.review'],validFrom:responsibility.validFrom,validUntil:responsibility.validUntil,issuanceEvidenceRef:scope,status:'Active'};
    await db.transaction(c,options(),async tx=>{
      await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
        VALUES (${org},${approvalGrant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(approvalGrant)}::text::jsonb,${approvalGrant.validFrom},${approvalGrant.validUntil},'Active')`;
      await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${approvalGrant.grantRef.id},1)`;
    });
    const approve=async(action:ActionRecord,onOpen?:(request:ResponsibilityRequestRecord)=>Promise<void>,response:'Approved'|'Rejected'|null='Approved',expiresAt=responsibility.validUntil)=>{
      const request:ResponsibilityRequestRecord={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,kind:'Authorization',subjectRef:action.actionRef,proposalDigest:action.payloadDigest,evidenceRefs:[payloadArtifact.artifactRef],
        requiredSlots:[{slotId:'approval',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:'ANY',required:true,dependsOnSlotIds:[],seats:[{seatId:'owner',responsibilityRefs:[responsibility.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],expiresAt,status:'Unresolved'};
      const unsigned:DecisionPackage={requestRef:request.requestRef,routeRevision:1,slotId:'approval',subjectRef:action.actionRef,proposalDigest:action.payloadDigest,question:'Approve bounded fixture?',recommendation:'Inspect intent',alternatives:[],impactUpperBound:impact,risks:[],evidenceRefs:request.evidenceRefs,validUntil:request.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)};
      const pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)},input={request,packages:[pkg]},cmd=await command('abh.responsibility-requests.open',input);
      const eligibility={lock:async()=>{},candidate:async()=>true,submit:async()=>[approvalGrant.grantRef],revalidate:async()=>{},conditions:async()=>[]};let opened:ResponsibilityRequestRecord;
      await run(cmd,async tx=>{opened=await reviewer.open(tx,cmd,input,eligibility);return opened.requestRef;});
      if(onOpen)await onOpen(opened!);
      if(response===null)return opened!.requestRef;
      const decision=await db.transaction(c,options(),tx=>reviewer.getDecision(tx,opened!.decisionRefs[0]!.id)),submission={response,packageDigest:pkg.packageDigest,conditionRefs:[],reason:'fixture reviewer verdict'},submit=await command('abh.decisions.submit',submission);let completion:EntityRef|undefined;
      await run(submit,async tx=>{const result=await reviewer.submit(tx,submit,decision.decisionRef,submission,eligibility);completion=result.completion?.completionEvidenceRef;return result.decision.decisionRef;});return completion!;
    };
    await t.test('saved authorization request opens one actual governed approval route with current replay checks',async routeTest=>{
      const prepared=await prepare(),action=await register(prepared.action,prepared.plan);
      const templateRef=await approve(action,undefined,null),template=await db.transaction(c,options(),async tx=>{
        const request=await reviewer.getRequest(tx,templateRef.id),decision=await reviewer.getDecision(tx,request.decisionRefs[0]!.id);
        return {request:{...request,requestRef:{...request.requestRef,version:1},status:'Unresolved' as const,decisionRefs:[]},packages:[decision.package]};
      });
      const proposal=structuredClone(template);proposal.request.requestRef=ref('abh.responsibility-request');
      for(const pkg of proposal.packages){pkg.requestRef=proposal.request.requestRef;pkg.packageDigest=await digestContract('DecisionPackage',pkg);}
      const worker=deriveVerifiedContext({...c.request,actor:{type:'Service',id:service.id}});
      const base={resourceOrganizationId:org,scopeRefs:[scope],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),issuanceEvidenceRef:scope,status:'Active' as const};
      const ingressGrant:GrantRecord={...base,grantRef:ref('abh.grant'),principalRef:ref('abh.principal',c.tenant.actor.id),actionTypes:['abh.actions.request-authorization']};
      const openingGrant:GrantRecord={...base,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.responsibility-requests.open']};
      await db.transaction(c,options(),async tx=>{for(const grant of [ingressGrant,openingGrant]){
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${grant.principalRef.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
      }});
      let allowed=true;const requestChecks={fenceRefs:async()=>[],admit:async()=>{if(!allowed)throw new CoreError('FORBIDDEN');}};
      const cmd=await command('abh.actions.request-authorization',{actionRef:action.actionRef,payload:{}});
      const saved=await requestActionAuthorization(db,c,options(),cmd,action.actionRef,{},[ingressGrant.grantRef],{...requestChecks,purposeNames});
      const eligibility={lock:async()=>{},candidate:async()=>true,submit:async()=>[approvalGrant.grantRef],revalidate:async()=>{},conditions:async()=>[]};
      const invoke=(database=db,grants=[openingGrant.grantRef])=>openRequestedResponsibility(database,worker,options(),saved.request.requestRef,proposal,grants,eligibility,requestChecks);
      await assert.rejects(invoke(db,[]),{code:'AUTHORITY_REQUIRED'});allowed=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});allowed=true;
      await f.admin`CREATE FUNCTION human.fixture_reject_requested_route() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture route rollback'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_requested_route BEFORE INSERT ON human.decisions FOR EACH ROW EXECUTE FUNCTION human.fixture_reject_requested_route()`;
      try{await assert.rejects(invoke(),/fixture route rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_requested_route ON human.decisions`;await f.admin`DROP FUNCTION human.fixture_reject_requested_route()`;}
      await assert.rejects(db.transaction(c,options(),tx=>reviewer.getRequest(tx,proposal.request.requestRef.id)),{code:'RESOURCE_NOT_FOUND'});
      const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(x=>x.replayed).length,1);assert.equal(results[0]!.commandId,results[1]!.commandId);assert.equal(results[0]!.current.status,'Open');assert.equal(results[0]!.current.decisionRefs.length,1);
      const restart=await Database.connect(f.runtimeUrl,{max:1});try{assert.equal((await invoke(restart)).commandId,results[0]!.commandId);}finally{await restart.close();}
      const recover=(database=db)=>recoverRequestedResponsibility(database,worker,options(),saved.request.requestRef,[openingGrant.grantRef],eligibility,requestChecks);
      const progress=()=>requestedResponsibilityProgress(db,worker,options(),saved.request.requestRef,'fixture.control',[openingGrant.grantRef],eligibility,requestChecks);
      assert.deepEqual(await progress(),{status:'AwaitingCompletion'});
      const recovered=await recover();assert.equal(recovered.commandId,results[0]!.commandId);assert.equal(recovered.replayed,true);assert.deepEqual(recovered.current,results[0]!.current);
      const reloaded=await Database.connect(f.runtimeUrl,{max:1});try{assert.equal((await recover(reloaded)).commandId,recovered.commandId);}finally{await reloaded.close();}
      const waitGrant:GrantRecord={...openingGrant,grantRef:ref('abh.grant'),purposeNames:['abh.runtime.deliver'],actionTypes:['abh.runtime.register-wait','abh.runtime.schedule-wakeup','abh.runtime.recheck-wait','abh.runtime.signal']};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${waitGrant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${waitGrant.grantRef.id},${service.id},${JSON.stringify(waitGrant)}::text::jsonb,${waitGrant.validFrom},${waitGrant.validUntil},'Active')`;
      });
      const delivery=async()=>deriveVerifiedContext({...worker.request,requestId:randomUUID(),purposeOfUse:'abh.runtime.deliver'});
      const wait=(database=db)=>waitRequestedResponsibility(database,worker,options(),saved.request.requestRef,[openingGrant.grantRef],eligibility,requestChecks,{context:delivery,grantRef:waitGrant.grantRef});
      const waiting=await Promise.all([wait(),wait()]);assert.deepEqual(waiting[0]!.waitRef,waiting[1]!.waitRef);
      const waitReconnect=await Database.connect(f.runtimeUrl,{max:1});try{assert.deepEqual((await wait(waitReconnect)).waitRef,waiting[0]!.waitRef);}finally{await waitReconnect.close();}
      await assert.rejects(waitRequestedResponsibility(db,worker,options(),saved.request.requestRef,[openingGrant.grantRef],eligibility,requestChecks,{context:async()=>deriveVerifiedContext({...worker.request,actor:{type:'Service',id:randomUUID()},purposeOfUse:'abh.runtime.deliver'}),grantRef:waitGrant.grantRef}),{code:'FORBIDDEN'});
      const readGrant:GrantRecord={...openingGrant,grantRef:ref('abh.grant'),actionTypes:['abh.actions.read']};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${readGrant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${readGrant.grantRef.id},${service.id},${JSON.stringify(readGrant)}::text::jsonb,${readGrant.validFrom},${readGrant.validUntil},'Active')`;
      });
      const unexpected=async():Promise<never>=>{throw new Error('approval gate bypassed');};
      const gated:Omit<AuthorizationWorkerOptions,'signal'|'onPage'>={context:async()=>worker,readGrants:[readGrant.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,request)=>request.requestRef.id===saved.request.requestRef.id},requestChecks,
        validation:{payload:unexpected,grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected,domain:unexpected}},pin:{grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected}},
        compilation:{compiler,host:new ActionCompilerHost([{capability:compiler,compile:unexpected}]),grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected},registration:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected,plan:unexpected}},
        authorization:{context:unexpected,resolver,checks:{fenceRefs:unexpected,sources:unexpected,artifact:unexpected,obligations:unexpected,admit:unexpected},admission:requestChecks},
        responsibility:{effectKey:'fixture.control',grants:[openingGrant.grantRef],eligibility,delivery:{context:delivery,grantRef:waitGrant.grantRef}},intervalMs:1};
      const scanWaiting=async()=>{const stop=new AbortController();await runAuthorizationWorker(db,{...gated,signal:stop.signal,onPage:async report=>{assert.equal(report.responsibilityWaiting,1);assert.equal(report.authorizationReady,0);assert.equal(report.advanced,0);stop.abort();}});};
      await scanWaiting();
      const decision=await db.transaction(c,options(),tx=>reviewer.getDecision(tx,recovered.current.decisionRefs[0]!.id));
      const submission={response:'Approved' as const,packageDigest:decision.package.packageDigest,conditionRefs:[],reason:'approve recovered request'};
      const submit=await command('abh.decisions.submit',submission);
      await run(submit,async tx=>(await reviewer.submit(tx,submit,decision.decisionRef,submission,eligibility)).decision.decisionRef);
      assert.deepEqual(await progress(),{status:'AwaitingEffect'});await scanWaiting();
      assert.equal((await recover()).current.status,'Closed');assert.deepEqual((await wait()).waitRef,waiting[0]!.waitRef);
      const delivered=await delivery(),directory=new WaitContextDirectory(),contextRef=directory.register(delivered,[waitGrant.grantRef]);
      const waitPort=new DurableWaitPort(db,directory,new ActionApprovalWaitOwner().install(waitGrant.grantRef));
      const closeEvent=await db.transaction(delivered,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${recovered.current.requestRef.id} AND record->>'type'='abh.responsibility-request.close'`;return ref('abh.event',row!.id);});
      const signalResult=await waitPort.signal({context:{callId:randomUUID(),requestContextRef:contextRef,deadline:new Date(Date.now()+5000).toISOString(),target:{objectRef:action.actionRef,scopeRefs:[scope],action:'abh.runtime.signal'}},ownerRef:action.actionRef,waitKey:`authorization/${saved.request.requestRef.id}/approval`,committedEventRef:closeEvent},{signal:new AbortController().signal});
      assert.equal(signalResult.status,'Completed');directory.revoke(contextRef);
      const durable=await db.transaction(delivered,options(),tx=>new DurableWaitOwner().get(tx,waiting[0]!.waitRef));assert.equal(durable.status,'Succeeded');assert.ok(durable.wakeupRef);


      await routeTest.test('trusted first-route policy recovers concurrent winners and the worker creates and waits automatically',async()=>{
        const save=async()=>requestActionAuthorization(db,c,options(),await command('abh.actions.request-authorization',{actionRef:action.actionRef,payload:{}}),action.actionRef,{},[ingressGrant.grantRef],{...requestChecks,purposeNames});
        const makeProposal=async()=>{
          const next=structuredClone(proposal);next.request.requestRef=ref('abh.responsibility-request');
          for(const pkg of next.packages){pkg.requestRef=next.request.requestRef;pkg.packageDigest=await digestContract('DecisionPackage',pkg);}
          return next;
        };
        const fresh=await save();let calls=0;
        const policy=async(input:Parameters<NonNullable<NonNullable<AuthorizationWorkerOptions['responsibility']>['policy']>>[0])=>{
          calls++;assert.deepEqual(input.request.requestRef,fresh.request.requestRef);assert.deepEqual(input.action,action);assert.deepEqual(input.plan.planRef,action.planRef);
          return makeProposal();
        };
        const ensure=(grants=[openingGrant.grantRef])=>ensureRequestedResponsibility(db,worker,options(),fresh.request.requestRef,action.actionRef,policy,grants,eligibility,requestChecks);
        await assert.rejects(ensure([]),{code:'AUTHORITY_REQUIRED'});allowed=false;await assert.rejects(ensure(),{code:'FORBIDDEN'});allowed=true;assert.equal(calls,0);
        await assert.rejects(ensureRequestedResponsibility(db,worker,options(),fresh.request.requestRef,action.actionRef,async()=>{
          const wrong=await makeProposal();wrong.request.subjectRef=ref('abh.action');return wrong;
        },[openingGrant.grantRef],eligibility,requestChecks),{code:'DECISION_STALE'});
        const stop=new AbortController();let callbackSignal:AbortSignal|undefined;
        await assert.rejects(ensureRequestedResponsibility(db,worker,{deadline:Date.now()+5000,signal:stop.signal},fresh.request.requestRef,action.actionRef,async(_input,opts)=>{
          callbackSignal=opts.signal;stop.abort();return new Promise<never>(()=>{});
        },[openingGrant.grantRef],eligibility,requestChecks),{code:'DEPENDENCY_TIMEOUT'});assert.equal(callbackSignal?.aborted,true);
        await assert.rejects(ensureRequestedResponsibility(db,worker,options(),fresh.request.requestRef,action.actionRef,async()=>{
          allowed=false;return makeProposal();
        },[openingGrant.grantRef],eligibility,requestChecks),{code:'FORBIDDEN'});allowed=true;
        await assert.rejects(recoverRequestedResponsibility(db,worker,options(),fresh.request.requestRef,[openingGrant.grantRef],eligibility,requestChecks),{code:'RESOURCE_NOT_FOUND'});
        // Both policies run before either can commit; different candidate IDs must converge on one frozen route.
        let entered=0,release!:()=>void;const both=new Promise<void>(resolve=>{release=resolve;});
        const concurrentPolicy:typeof policy=async input=>{const result=await policy(input);if(++entered===2)release();await both;return result;};
        const concurrent=await Promise.all([1,2].map(()=>ensureRequestedResponsibility(db,worker,options(),fresh.request.requestRef,action.actionRef,concurrentPolicy,[openingGrant.grantRef],eligibility,requestChecks)));
        assert.equal(calls,2);assert.equal(concurrent.filter(result=>result.replayed).length,1);assert.equal(concurrent[0]!.commandId,concurrent[1]!.commandId);
        const reconnected=await Database.connect(f.runtimeUrl,{max:1});try{
          const replay=await ensureRequestedResponsibility(reconnected,worker,options(),fresh.request.requestRef,action.actionRef,unexpected,[openingGrant.grantRef],eligibility,requestChecks);
          assert.equal(replay.commandId,concurrent[0]!.commandId);
        }finally{await reconnected.close();}
        allowed=false;await assert.rejects(ensure(),{code:'FORBIDDEN'});allowed=true;assert.equal(calls,2,'recovery never recomputes policy');
        const automatic=await save();let generated=0;
        const runAutomatic=async(policy:NonNullable<NonNullable<AuthorizationWorkerOptions['responsibility']>['policy']>)=>{
          const stop=new AbortController();await runAuthorizationWorker(db,{...gated,signal:stop.signal,
            discovery:{...gated.discovery,canRead:async(_tx,request)=>request.requestRef.id===automatic.request.requestRef.id},
            responsibility:{...gated.responsibility!,policy},onPage:async report=>{assert.equal(report.responsibilityWaiting,1);assert.equal(report.advanced,0);assert.equal(report.authorizationReady,0);stop.abort();}});
        };
        await runAutomatic(async input=>{generated++;assert.deepEqual(input.request.requestRef,automatic.request.requestRef);return makeProposal();});
        await runAutomatic(unexpected);assert.equal(generated,1);
        const opened=await recoverRequestedResponsibility(db,worker,options(),automatic.request.requestRef,[openingGrant.grantRef],eligibility,requestChecks);
        assert.equal(opened.current.status,'Open');assert.equal(opened.current.decisionRefs.length,1);
        const durable=await db.transaction(delivered,options(),tx=>tx.owner('DurableExecution')`SELECT id FROM runtime.waits WHERE owner_id=${action.actionRef.id} AND wait_key=${`authorization/${automatic.request.requestRef.id}/approval`}`);
        assert.equal(durable.length,1);
        // Leave Pending: the next installation must recover only its own authority, despite sharing this condition.
      });

      const changed=structuredClone(proposal);changed.request.requestRef=ref('abh.responsibility-request');for(const pkg of changed.packages){pkg.requestRef=changed.request.requestRef;pkg.packageDigest=await digestContract('DecisionPackage',pkg);}
      await assert.rejects(openRequestedResponsibility(db,worker,options(),saved.request.requestRef,changed,[openingGrant.grantRef],eligibility,requestChecks),{code:'IDEMPOTENCY_CONFLICT'});
      assert.deepEqual(await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id)),action);
      const cancel=await command('abh.actions.cancel',action.actionRef);await run(cancel,async tx=>(await actions.cancelPreparation(tx,cancel,action.actionRef,'cancel after opening responsibility')).actionRef);
      assert.equal((await recover()).current.status,'Closed');assert.equal((await invoke()).commandId,results[0]!.commandId);allowed=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});await assert.rejects(recover(),{code:'FORBIDDEN'});allowed=true;
      const revoke=await command('abh.grants.revoke',openingGrant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,openingGrant.grantRef,[scope])).grantRef);await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});await assert.rejects(recover(),{code:'EPOCH_REVOKED'});await assert.rejects(wait(),{code:'EPOCH_REVOKED'});await assert.rejects(progress(),{code:'EPOCH_REVOKED'});
    });
    await t.test('Action approval waiting uses the real Decision Owner and records a notification without granting execution',async waitTest=>{
      const action=await validate(await propose()),worker=deriveVerifiedContext({...c.request,requestId:randomUUID(),actor:{type:'Service',id:service.id},purposeOfUse:'abh.runtime.deliver'});
      const grant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[scope],actionTypes:['abh.responsibility-requests.expire','abh.runtime.register-wait','abh.runtime.recheck-wait','abh.runtime.cancel-wait','abh.runtime.schedule-wakeup','abh.runtime.cancel-wakeup','abh.runtime.signal','abh.runtime.inspect','abh.actions.notify-wait','abh.runtime.consume-event','abh.runtime.prepare-outbox'],purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:responsibility.validUntil,issuanceEvidenceRef:scope,status:'Active'};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
      });
      const business=new ActionApprovalWaitOwner(),contexts=new WaitContextDirectory(),contextRef=contexts.register(worker,[grant.grantRef]),port=new DurableWaitPort(db,contexts,business.install(grant.grantRef)),waits=new DurableWaitOwner();
      const call=(permission:string,target:EntityRef)=>({callId:randomUUID(),requestContextRef:contextRef,target:{objectRef:target,scopeRefs:[scope],action:permission},deadline:new Date(Date.now()+5000).toISOString()}),opts={signal:new AbortController().signal};
      let waitRef!:EntityRef,requestRef!:EntityRef;const waitKey=randomUUID();
      await approve(action,async request=>{
        requestRef=request.requestRef;
        const query=await queryView(action.actionRef.id);assert.deepEqual(query.data.authorizationSummary.requestRef,request.requestRef);assert.ok(query.data.unresolvedRefs.some(ref=>ref.id===request.requestRef.id));
        const result=await port.scheduleWakeup({context:call('abh.runtime.schedule-wakeup',action.actionRef),ownerRef:action.actionRef,waitKey,dueAt:request.expiresAt,causeRef:request.requestRef},opts);
        assert.equal(result.status,'Completed');if(result.status!=='Completed')throw new Error('schedule failed');waitRef=result.data.waitRef;
        assert.equal((await db.transaction(worker,options(),tx=>waits.get(tx,waitRef))).status,'Pending');
      });
      const event=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${requestRef.id} AND record->>'type'='abh.responsibility-request.close'`;return ref('abh.event',row!.id,1);});
      const signalled=await port.signal({context:call('abh.runtime.signal',action.actionRef),ownerRef:action.actionRef,waitKey,committedEventRef:{...event,type:'abh.event',version:1}},opts);assert.equal(signalled.status,'Completed');
      const wait=await db.transaction(worker,options(),tx=>waits.get(tx,waitRef));assert.equal(wait.status,'Succeeded');
      const input={bindingRef:{...wait.waitingIntentRef,type:'abh.action-wait' as const},wakeupRef:wait.wakeupRef!};
      const notify=async(fail=false)=>{
        const cmd=await command('abh.actions.notify-wait',input);let result;
        await db.transaction(worker,options(),tx=>executeCommand(tx,cmd,()=>business.admitNotification(tx,input,[grant.grantRef]),async()=>{result=await business.notify(tx,cmd,input,[grant.grantRef]);if(fail)throw new Error('after business notification');return result.bindingRef;}));return result!;
      };
      await assert.rejects(notify(true),/after business notification/);assert.equal((await db.transaction(worker,options(),tx=>business.get(tx,input.bindingRef))).outcome,'Waiting');
      const wakeEvent=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${wait.wakeupRef!.id} AND record->>'type'='abh.durable-wakeup.created'`;return readCommittedEvent(tx,ref('abh.event',row!.id));});
      const consumer=business.consumer([grant.grantRef]),inboxInput={consumerId:consumer.id,eventRef:{type:'abh.event' as const,id:wakeEvent.eventId,version:1 as const},eventDigest:await inputDigest(wakeEvent)};
      const router=composeWaitNotificationRouter(ref('hello.routing-rule'),new Map([['abh.action',business.router(ref('hello.routing-rule'),ref('hello.consumer'))],['abh.operation',{ruleRef:ref('hello.routing-rule'),eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],route:async()=>{throw new Error('wrong owner router');}}]]));
      const routeInput={eventRef:inboxInput.eventRef,eventDigest:inboxInput.eventDigest},routeCommand=await command('abh.runtime.prepare-outbox',routeInput);
      const routing=await db.transaction(worker,options(),tx=>new OutboxOwner().prepare(tx,routeCommand,routeInput,router,{fenceRefs:async()=>[grant.grantRef],admit:async(tx,_event,permission,targetRef)=>{
        await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[grant.grantRef]);
      }}));
      assert.equal(routing.deliveries.length,1);assert.deepEqual(routing.deliveries[0]!.job.targetRef,action.actionRef);
      assert.equal(routing.deliveries[0]!.job.authorityRef,undefined,'notification route issues no execution authority');
      const delivery={jobRef:ref('abh.job'),resourceOrganizationId:org,consumerId:consumer.id,job:routing.deliveries[0]!.job};
      const [left,right]=await Promise.all([consumeOutboxDelivery(db,worker,opts.signal,delivery,consumer),consumeCommittedEvent(db,worker,options(),inboxInput,consumer)]);assert.deepEqual(left,right);
      const first=await db.transaction(worker,options(),tx=>business.get(tx,input.bindingRef));assert.equal(first.outcome,'SourceClosed');assert.equal(first.bindingRef.version,2);
      assert.deepEqual(await notify(),first);
      assert.deepEqual((await db.transaction(worker,options(),tx=>actions.get(tx,action.actionRef.id))).position,{lifecycle:'Validated',outcome:'NotStarted'});
      assert.equal((await db.transaction(worker,options(),tx=>actions.get(tx,action.actionRef.id))).executionAuthorityRef,undefined);
      const rejectedAction=await validate(await propose());let rejectedWait!:EntityRef;
      await approve(rejectedAction,async request=>{
        const result=await port.scheduleWakeup({context:call('abh.runtime.schedule-wakeup',rejectedAction.actionRef),ownerRef:rejectedAction.actionRef,waitKey:randomUUID(),dueAt:request.expiresAt,causeRef:request.requestRef},opts);
        assert.equal(result.status,'Completed');if(result.status!=='Completed')throw new Error('schedule failed');rejectedWait=result.data.waitRef;
      },'Rejected');
      const recoveryStop=new AbortController();let pages=0;
      await runWaitRecoveryWorker(db,{context:async()=>worker,grantRefs:[grant.grantRef],installation:business.install(grant.grantRef),signal:recoveryStop.signal,
        onPage:async result=>{pages++;assert.ok(result.checkedRefs.some(ref=>ref.id===rejectedWait.id));recoveryStop.abort();}});
      assert.equal(pages,1);
      const observerStop=new AbortController();let observerEntered!:()=>void,observerSignal:AbortSignal|undefined;
      const observerReady=new Promise<void>(resolve=>{observerEntered=resolve;});
      const observing=runWaitRecoveryWorker(db,{context:async()=>worker,grantRefs:[grant.grantRef],installation:business.install(grant.grantRef),signal:observerStop.signal,
        onPage:async(_result,options)=>{observerSignal=options.signal;observerEntered();return new Promise<void>(()=>{});}});
      await observerReady;observerStop.abort();await observing;assert.equal(observerSignal?.aborted,true);

      const rejected=await db.transaction(worker,options(),tx=>waits.get(tx,rejectedWait));assert.equal(rejected.status,'Succeeded');
      const rejectedInput={bindingRef:{...rejected.waitingIntentRef,type:'abh.action-wait' as const},wakeupRef:rejected.wakeupRef!},rejectedCommand=await command('abh.actions.notify-wait',rejectedInput);
      await db.transaction(worker,options(),tx=>executeCommand(tx,rejectedCommand,()=>business.admitNotification(tx,rejectedInput,[grant.grantRef]),async()=>{const result=await business.notify(tx,rejectedCommand,rejectedInput,[grant.grantRef]);assert.equal(result.outcome,'SourceClosed');return result.bindingRef;}));
      assert.equal((await db.transaction(worker,options(),tx=>actions.get(tx,rejectedAction.actionRef.id))).executionAuthorityRef,undefined,'a rejected request can wake its Owner but cannot authorize execution');
      await waitTest.test('request expiry reaches the actual Wait Port, frozen Outbox route and Action consumer without authorization',async()=>{
        for(const deadlineFirst of [false,true]){
          const expiringAction=await validate(await propose()),expiresAt=new Date(Date.now()+500).toISOString(),expiryWaitKey=randomUUID();let expiringWait!:EntityRef;
          const expiringRequest=await approve(expiringAction,async request=>{
            const scheduled=await port.scheduleWakeup({context:call('abh.runtime.schedule-wakeup',expiringAction.actionRef),ownerRef:expiringAction.actionRef,waitKey:expiryWaitKey,dueAt:request.expiresAt,causeRef:request.requestRef},opts);
            assert.equal(scheduled.status,'Completed');if(scheduled.status!=='Completed')throw new Error('schedule failed');expiringWait=scheduled.data.waitRef;
          },null,expiresAt);
          // Expiry is decided by PostgreSQL; the host clock is not proof that the DB deadline passed.
          const waitUntil=Date.now()+5000;
          while(true){
            const expired=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('HumanGateway')`SELECT clock_timestamp()>=${expiresAt}::timestamptz AS expired`;return row!.expired;});
            if(expired)break;
            assert.ok(Date.now()<waitUntil,'database request deadline did not arrive within fixture bound');
            await delay(10);
          }
          if(deadlineFirst){
            const stop=new AbortController();await runWaitRecoveryWorker(db,{context:async()=>worker,grantRefs:[grant.grantRef],installation:business.install(grant.grantRef),signal:stop.signal,onPage:async()=>{stop.abort();}});
          }
          const stop=new AbortController();await runResponsibilityExpiryWorker(db,{context:async()=>worker,grantRefs:[grant.grantRef],signal:stop.signal,onPage:async result=>{assert.equal(result.expired,1);stop.abort();}});
          const closed=await db.transaction(worker,options(),tx=>reviewer.getRequest(tx,expiringRequest.id));assert.equal(closed.status,'Closed');
          const decision=await db.transaction(c,options(),tx=>reviewer.getDecision(tx,closed.decisionRefs[0]!.id));assert.equal(decision.status,'Expired');
          const closeEvent=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${expiringRequest.id} AND record->>'type'='abh.responsibility-request.close'`;return ref('abh.event',row!.id);});
          for(let attempt=0;attempt<2;attempt++)assert.equal((await port.signal({context:call('abh.runtime.signal',expiringAction.actionRef),ownerRef:expiringAction.actionRef,waitKey:expiryWaitKey,committedEventRef:{...closeEvent,type:'abh.event',version:1}},opts)).status,'Completed');
          const settled=await db.transaction(worker,options(),tx=>waits.get(tx,expiringWait));assert.equal(settled.status,'Succeeded');
          const wake=await db.transaction(worker,options(),tx=>waits.getWakeup(tx,settled.wakeupRef!));assert.equal(wake.reason,deadlineFirst?'Deadline':'Condition');
          const wakeEvent=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${settled.wakeupRef!.id} AND record->>'type'='abh.durable-wakeup.created'`;return readCommittedEvent(tx,ref('abh.event',row!.id));});
          const routeInput={eventRef:{type:'abh.event' as const,id:wakeEvent.eventId,version:1 as const},eventDigest:await inputDigest(wakeEvent)},routeCommand=await command('abh.runtime.prepare-outbox',routeInput);
          const route=await db.transaction(worker,options(),tx=>new OutboxOwner().prepare(tx,routeCommand,routeInput,router,{fenceRefs:async()=>[grant.grantRef],admit:async(tx,_event,permission,targetRef)=>{await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[grant.grantRef]);}}));
          assert.equal(route.deliveries.length,1);
          const delivery={jobRef:ref('abh.job'),resourceOrganizationId:org,consumerId:consumer.id,job:route.deliveries[0]!.job};
          const [first,replay]=await Promise.all([consumeOutboxDelivery(db,worker,opts.signal,delivery,consumer),consumeOutboxDelivery(db,worker,opts.signal,delivery,consumer)]);assert.deepEqual(first,replay);
          const notified=await db.transaction(worker,options(),tx=>business.get(tx,first.resultRef));assert.equal(notified.outcome,deadlineFirst?'Deadline':'SourceClosed');assert.equal(notified.bindingRef.version,2);
          const actual=await db.transaction(worker,options(),tx=>actions.get(tx,expiringAction.actionRef.id));assert.deepEqual(actual.position,{lifecycle:'Validated',outcome:'NotStarted'});assert.equal(actual.executionAuthorityRef,undefined);
          const counts=await db.transaction(worker,options(),tx=>tx.owner('HumanGateway')`SELECT (SELECT count(*) FROM human.completion_evidence WHERE request_id=${expiringRequest.id}) AS proofs,(SELECT count(*) FROM runtime.wakeups WHERE wait_id=${expiringWait.id}) AS wakes`);
          assert.equal(counts[0]!.proofs,'0');assert.equal(counts[0]!.wakes,'1');
        }
      });
      await waitTest.test('withdrawal verifies the actual cancelled Action and notifies its Wait without rewriting cancellation',async()=>{
        const action=await validate(await propose()),key=randomUUID();let waitRef!:EntityRef;
        const requestRef=await approve(action,async request=>{const result=await port.scheduleWakeup({context:call('abh.runtime.schedule-wakeup',action.actionRef),ownerRef:action.actionRef,waitKey:key,dueAt:request.expiresAt,causeRef:request.requestRef},opts);assert.equal(result.status,'Completed');if(result.status!=='Completed')throw new Error('schedule failed');waitRef=result.data.waitRef;},null);
        const request=await db.transaction(c,options(),tx=>reviewer.getRequest(tx,requestRef.id)),review=deriveVerifiedContext({...c.request,purposeOfUse:'abh.decision.review'});
        const management:GrantRecord={...approvalGrant,grantRef:ref('abh.grant'),actionTypes:['abh.decisions.withdraw']};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${management.grantRef.id},${c.tenant.actor.id},${JSON.stringify(management)}::text::jsonb,${management.validFrom},${management.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${management.grantRef.id},1)`;
        });
        const payload={reason:'Original Action cancelled'},decisionRef=request.decisionRefs[0]!,cmd=await command('abh.decisions.withdraw',{decisionRef,payload});
        const checks:DecisionWithdrawalChecks={fenceRefs:async()=>[],admit:async()=>{},lockSubject:async(tx,request)=>lockAction(tx,request.subjectRef.id),source:async(tx,request)=>{
          const current=await actions.get(tx,request.subjectRef.id);
          if(current.position.lifecycle!=='Cancelled'||current.payloadDigest!==request.proposalDigest)throw new CoreError('PRECONDITION_FAILED');return [current.actionRef];
        }};
        await assert.rejects(withdrawDecision(db,review,options(),cmd,decisionRef,payload,[management.grantRef],checks),{code:'PRECONDITION_FAILED'});
        const cancel=await command('abh.actions.cancel',{actionRef:action.actionRef,reason:payload.reason});await run(cancel,async tx=>(await actions.cancelPreparation(tx,cancel,action.actionRef,payload.reason)).actionRef);
        const cancelled=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));
        await withdrawDecision(db,review,options(),cmd,decisionRef,payload,[management.grantRef],checks);
        const closeEvent=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${requestRef.id} AND record->>'type'='abh.responsibility-request.withdraw'`;return ref('abh.event',row!.id);});
        assert.equal((await port.signal({context:call('abh.runtime.signal',action.actionRef),ownerRef:action.actionRef,waitKey:key,committedEventRef:{...closeEvent,type:'abh.event',version:1}},opts)).status,'Completed');
        const wait=await db.transaction(worker,options(),tx=>waits.get(tx,waitRef));assert.equal(wait.status,'Succeeded');
        const event=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${wait.wakeupRef!.id} AND record->>'type'='abh.durable-wakeup.created'`;return readCommittedEvent(tx,ref('abh.event',row!.id));});
        const routeInput={eventRef:{type:'abh.event' as const,id:event.eventId,version:1 as const},eventDigest:await inputDigest(event)},routeCommand=await command('abh.runtime.prepare-outbox',routeInput);
        const routing=await db.transaction(worker,options(),tx=>new OutboxOwner().prepare(tx,routeCommand,routeInput,router,{fenceRefs:async()=>[grant.grantRef],admit:async(tx,_event,permission,targetRef)=>{await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[grant.grantRef]);}}));
        assert.equal(routing.deliveries.length,1);
        const result=await consumeOutboxDelivery(db,worker,opts.signal,{jobRef:ref('abh.job'),resourceOrganizationId:org,consumerId:consumer.id,job:routing.deliveries[0]!.job},consumer);
        assert.equal((await db.transaction(worker,options(),tx=>business.get(tx,result.resultRef))).outcome,'SourceClosed');
        assert.deepEqual(await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id)),cancelled);
        const [proof]=await db.transaction(review,options(),tx=>tx.owner('HumanGateway')`SELECT record FROM human.decision_withdrawals WHERE request_id=${requestRef.id}`);assert.deepEqual(proof!.record.evidenceRefs,[cancelled.actionRef]);
      });
      await waitTest.test('an unroutable revision signal observes its second event without completing the Action wait',async()=>{
        const action=await validate(await propose()),key=randomUUID();let waitRef!:EntityRef;
        const requestRef=await approve(action,async request=>{const result=await port.scheduleWakeup({context:call('abh.runtime.schedule-wakeup',action.actionRef),ownerRef:action.actionRef,waitKey:key,dueAt:request.expiresAt,causeRef:request.requestRef},opts);assert.equal(result.status,'Completed');if(result.status!=='Completed')throw new Error('schedule failed');waitRef=result.data.waitRef;},null);
        const request=await db.transaction(c,options(),tx=>reviewer.getRequest(tx,requestRef.id)),old=await db.transaction(c,options(),tx=>reviewer.getDecision(tx,request.decisionRefs[0]!.id));
        const next={...request,requestRef:{...request.requestRef,version:request.requestRef.version+1},routeRevision:request.routeRevision+1,status:'Unresolved' as const,decisionRefs:[]};
        const unsigned={...old.package,requestRef:next.requestRef,routeRevision:next.routeRevision},pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)};
        const input={expectedRequestRef:request.requestRef,proposal:{request:next,packages:[pkg]},frozenPolicyRefs:[ref('abh.policy-version')],directoryRef:ref('abh.artifact'),evidenceRefs:[scope],reason:'Unroutable directory fixture'},cmd=await command('abh.responsibility-requests.revise-route',input);
        await run(cmd,async tx=>(await reviewer.reviseRoute(tx,cmd,input,{lock:async()=>{},candidate:async()=>false,submit:async()=>[],revalidate:async()=>{},conditions:async()=>[]},async()=>{})).requestRef);
        const event=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id,event_ordinal FROM data.outbox WHERE aggregate_id=${requestRef.id} AND record->>'type'='abh.responsibility-request.route-revised'`;assert.equal(row!.event_ordinal,1);return ref('abh.event',row!.id);});
        const signalled=await port.signal({context:call('abh.runtime.signal',action.actionRef),ownerRef:action.actionRef,waitKey:key,committedEventRef:{...event,type:'abh.event',version:1}},opts);assert.equal(signalled.status,'Completed');
        const waiting=await db.transaction(worker,options(),tx=>waits.get(tx,waitRef));assert.equal(waiting.status,'Pending');assert.equal(waiting.source.eventOrdinal,1);assert.deepEqual(waiting.source.sourceRef,next.requestRef);assert.equal(waiting.wakeupRef,undefined);
      });
      const cancelledAction=await validate(await propose());let cancelledWait!:EntityRef;
      await approve(cancelledAction,async request=>{
        const result=await port.scheduleWakeup({context:call('abh.runtime.schedule-wakeup',cancelledAction.actionRef),ownerRef:cancelledAction.actionRef,waitKey:randomUUID(),dueAt:request.expiresAt,causeRef:request.requestRef},opts);
        assert.equal(result.status,'Completed');if(result.status!=='Completed')throw new Error('schedule failed');cancelledWait=result.data.waitRef;
        const cancelled=await port.cancelWakeup({context:call('abh.runtime.cancel-wakeup',result.data.waitRef),waitRef:result.data.waitRef,expectedVersion:result.data.waitRef.version,reason:'stop waiting'},opts);assert.equal(cancelled.status,'Completed');
      });
      const cancelEvent=await db.transaction(worker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${cancelledWait.id} AND record->>'type'='abh.durable-wait.cancel'`;return readCommittedEvent(tx,ref('abh.event',row!.id));});
      const cancelRoutingInput={eventRef:{type:'abh.event' as const,id:cancelEvent.eventId,version:1 as const},eventDigest:await inputDigest(cancelEvent)},cancelRoutingCommand=await command('abh.runtime.prepare-outbox',cancelRoutingInput);
      const cancelRouting=await db.transaction(worker,options(),tx=>new OutboxOwner().prepare(tx,cancelRoutingCommand,cancelRoutingInput,router,{fenceRefs:async()=>[grant.grantRef],admit:async(tx,_event,permission,targetRef)=>{
        await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[grant.grantRef]);
      }}));
      assert.deepEqual(cancelRouting.deliveries[0]!.job.targetRef,cancelledAction.actionRef);
      const cancellation=await consumeOutboxDelivery(db,worker,opts.signal,{jobRef:ref('abh.job'),resourceOrganizationId:org,consumerId:consumer.id,job:cancelRouting.deliveries[0]!.job},consumer);
      assert.equal((await db.transaction(worker,options(),tx=>business.get(tx,cancellation.resultRef))).outcome,'Cancelled');
      const revoke=await command('abh.grants.revoke',grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,grant.grantRef,[scope])).grantRef);
      await assert.rejects(notify(),{code:'EPOCH_REVOKED'});
    });
    const payload=await store('{"message":"authorized fixture"}',purposeNames);
    const setup=async(ledgerLimit=impact.resourceRequirements[0]!.quantity)=>{
      const input={id:randomUUID(),scopeRef:scope,resourceType:'hello.resource',meteringMode:'cumulative' as const,unit:'hello.credit',periodRef:ref('abh.period'),limit:ledgerLimit,purposeNames},cmd=await command('abh.ledgers.configure',input);let ledger;
      await run(cmd,async tx=>{ledger=await ledgerOwner.configure(tx,cmd,input);return ledger.ledgerRef;});
      const unsigned:ResourceEnvelopeRecord={envelopeRef:ref('abh.resource-envelope'),resourceOrganizationId:org,scopeRefs:[scope],bindings:[{resourceRef:resource,ledgerRef:ledger!.ledgerRef,unit:'hello.credit',maxQuantity:impact.resourceRequirements[0]!.quantity}],evidenceRefs:[scope],purposeNames,digest:'sha256:'+'0'.repeat(64)};
      const envelope={...unsigned,digest:await digestContract('ResourceEnvelopeRecord',unsigned)},envelopeCmd=await command('abh.resource-envelopes.configure',envelope);
      await run(envelopeCmd,async tx=>(await envelopes.configure(tx,envelopeCmd,envelope,async()=>{})).envelopeRef);return {envelope,ledger:ledger!};
    };
    const prepared=async(envelope:ResourceEnvelopeRecord,single:boolean|'independent'=false)=>{
      const {action,plan}=await prepare(payload);
      if(single===true){plan.nodes=plan.nodes.slice(0,1);plan.digest=await digestContract('OperationPlan',plan);}
      if(single==='independent'){plan.nodes=plan.nodes.map((node,index)=>index?{...node,resourceKey:'hello.announcement',dependsOn:[],inputBindings:[]}:node);plan.digest=await digestContract('OperationPlan',plan);}
      const registered=await register(action,plan),completion=await approve(registered),source=await authorityFixture(registered,envelope.envelopeRef,completion,true),node=plan.nodes[0]!;
      const connection={connectionRef:node.connectionRef,resourceOrganizationId:org,providerName:'hello.fake',providerTenantId:'fixture',accountRefs:[node.accountRef],scopeRefs:[scope],connectorRefs:[connector],secretRef:ref('abh.secret'),evidenceRefs:[scope],purposeNames,status:'Active' as const},cmd=await command('abh.connections.configure',connection);
      await run(cmd,async tx=>(await new ConnectionOwner().configure(tx,cmd,connection,async()=>{})).connectionRef);
      return {action:registered,plan,...source};
    };
    // Source governance and Domain/one-shot proof callbacks remain fixtures; all tested policy/resource/state Owners are real.
    const checks:SnapshotSourceChecks={fenceRefs:async()=>[],sources:async()=>[],artifact:async()=>{},obligations:async(_tx,refs)=>{if(refs.length)throw new CoreError('OBLIGATION_CONFLICT');}};
    const authorize=async(action:ActionRecord,sourceChecks=checks,authorizationResolver=resolver)=>{
      const cmd=await command('abh.actions.request-authorization',action.actionRef);let result:ActionRecord;
      await db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await actions.authorize(tx,cmd,action.actionRef,tx=>authorizationResolver.authorizeOneShot(tx,cmd,action.actionRef,sourceChecks));return result.actionRef;}));return result!;
    };
    const count=()=>db.transaction(execution,options(),async tx=>{
      const [snapshots]=await tx.owner('Control')`SELECT count(*) FROM control.authorization_snapshots`,[evaluations]=await tx.owner('Control')`SELECT count(*) FROM control.policy_evaluations`,[holds]=await tx.owner('ResourceLedger')`SELECT count(*) FROM resource.reservations`;
      return [snapshots!.count,evaluations!.count,holds!.count];
    });
    await t.test('required responsibility worker authorizes only after real Control Effect and rejects revoked applied authority',async()=>{
      for(const revoked of [false,true]){
        const budget=await setup(),candidate=await prepare(payload),action=await register(candidate.action,candidate.plan),node=candidate.plan.nodes[0]!;
        const connection={connectionRef:node.connectionRef,resourceOrganizationId:org,providerName:'hello.fake',providerTenantId:'fixture',accountRefs:[node.accountRef],scopeRefs:[scope],connectorRefs:[connector],secretRef:ref('abh.secret'),evidenceRefs:[scope],purposeNames,status:'Active' as const},connectionCommand=await command('abh.connections.configure',connection);
        await run(connectionCommand,async tx=>(await new ConnectionOwner().configure(tx,connectionCommand,connection,async()=>{})).connectionRef);
        const preparation=deriveVerifiedContext({...execution.request,purposeOfUse:'abh.action.prepare'}),review=deriveVerifiedContext({...c.request,purposeOfUse:'abh.decision.review'});
        const base={resourceOrganizationId:org,scopeRefs:[scope],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+30000).toISOString(),issuanceEvidenceRef:scope,status:'Active' as const};
        const ingress:GrantRecord={...base,grantRef:ref('abh.grant'),principalRef:ref('abh.principal',c.tenant.actor.id),actionTypes:['abh.actions.request-authorization'],purposeNames:['abh.action.prepare']};
        const opening:GrantRecord={...base,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.actions.read','abh.responsibility-requests.open','abh.execution-authority.create'],purposeNames:['abh.action.prepare']};
        const waiting:GrantRecord={...base,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.runtime.register-wait','abh.runtime.schedule-wakeup','abh.runtime.recheck-wait','abh.runtime.prepare-outbox','abh.runtime.record-outbox-delivery','abh.runtime.record-outbox-consumption'],purposeNames:['abh.runtime.deliver']};
        await db.transaction(c,options(),async tx=>{for(const grant of [ingress,opening,waiting]){
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${grant.principalRef.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
        }});
        const saved=await requestActionAuthorization(db,c,options(),await command('abh.actions.request-authorization',{actionRef:action.actionRef,payload:{}}),action.actionRef,{},[ingress.grantRef],{purposeNames,fenceRefs:async()=>[],admit:async()=>{}});
        const eligibility={lock:async()=>{},candidate:async()=>true,submit:async()=>[approvalGrant.grantRef],revalidate:async()=>{},conditions:async()=>[]},requestChecks={fenceRefs:async()=>[],admit:async()=>{}};
        let policyCalls=0,executionContexts=0;
        const unexpected=async():Promise<never>=>{throw new Error('completed stage repeated');};
        const installation:Omit<AuthorizationWorkerOptions,'signal'|'onPage'>={context:async()=>preparation,readGrants:[opening.grantRef],discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,request)=>request.requestRef.id===saved.request.requestRef.id},requestChecks,
          validation:{payload:unexpected,grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected,domain:unexpected}},pin:{grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected}},
          compilation:{compiler,host:new ActionCompilerHost([{capability:compiler,compile:unexpected}]),grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected},registration:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected,plan:unexpected}},
          authorization:{context:async()=>{executionContexts++;return execution;},resolver,checks:{...checks,admit:async()=>{}},admission:requestChecks},
          responsibility:{effectKey:'fixture.worker-control',grants:[opening.grantRef],eligibility,delivery:{context:async()=>deriveVerifiedContext({...preparation.request,purposeOfUse:'abh.runtime.deliver'}),grantRef:waiting.grantRef},policy:async input=>{
            policyCalls++;assert.deepEqual(input.action.actionRef,action.actionRef);
            const request:ResponsibilityRequestRecord={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,kind:'Authorization',subjectRef:action.actionRef,proposalDigest:action.payloadDigest,evidenceRefs:[payload.artifactRef],requiredSlots:[{slotId:'approval',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:'ANY',required:true,dependsOnSlotIds:[],seats:[{seatId:'owner',responsibilityRefs:[responsibility.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],expiresAt:base.validUntil,status:'Unresolved'};
            const pkg:DecisionPackage={requestRef:request.requestRef,routeRevision:1,slotId:'approval',subjectRef:action.actionRef,proposalDigest:action.payloadDigest,question:'Approve actual worker execution?',recommendation:'Review bounded plan',alternatives:[],impactUpperBound:impact,risks:[],evidenceRefs:request.evidenceRefs,validUntil:request.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)};
            return {request,packages:[{...pkg,packageDigest:await digestContract('DecisionPackage',pkg)}]};
          }},intervalMs:1};
        const page=async(expectedWaiting:number,advanced=0,database=db)=>{const stop=new AbortController();await runAuthorizationWorker(database,{...installation,signal:stop.signal,onPage:async result=>{assert.equal(result.responsibilityWaiting,expectedWaiting);assert.equal(result.advanced,advanced);stop.abort();}});};
        const before=await count();await page(1);assert.equal(executionContexts,0);
        const opened=await recoverRequestedResponsibility(db,preparation,options(),saved.request.requestRef,[opening.grantRef],eligibility,requestChecks);
        const decision=await db.transaction(review,options(),tx=>reviewer.getDecision(tx,opened.current.decisionRefs[0]!.id)),submission={response:'Approved' as const,packageDigest:decision.package.packageDigest,conditionRefs:[],reason:'reviewed bounded execution'};
        const submitted=await submitDecision(db,review,options(),await command('abh.decisions.submit',{decisionRef:decision.decisionRef,submission}),decision.decisionRef,submission,[approvalGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{},eligibility,effects:async()=>[{effectKey:'fixture.worker-control',targetOwner:'Control',targetRef:action.actionRef}]});
        assert.equal(submitted.effectTrackingRefs.length,1);await page(1);assert.equal(executionContexts,0);assert.deepEqual(await count(),before);
        const effect=await db.transaction(preparation,options(),tx=>getDecisionEffectIntent(tx,submitted.effectTrackingRefs[0]!));
        const output:GrantRecord={...base,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['hello.publish'],purposeNames,issuanceEvidenceRef:effect.completionEvidenceRef};
        const unsigned:ExecutionAuthority={authorityRef:ref('abh.execution-authority'),resourceOrganizationId:org,executionPrincipalRef:service,allowedProposerRefs:[ingress.principalRef],binding:{kind:'Action',actionRef:action.actionRef,payloadDigest:action.payloadDigest},grantRefs:[output.grantRef],scopeRefs:[scope],purposeRefs:[executionPurpose],actionTypes:['hello.publish'],resourceEnvelopeRef:budget.envelope.envelopeRef,validFrom:base.validFrom,validUntil:base.validUntil,stopConditions:[],issuanceEvidenceRef:effect.completionEvidenceRef,effectKey:effect.effectKey,issuedBy:preparation.tenant.actor,sourceVersionRefs:[effect.requestRef,...effect.decisionRefs],issuanceDigest:'sha256:'+'0'.repeat(64),status:'Active'};
        const authority={...unsigned,issuanceDigest:await digestContract('ExecutionAuthority',unsigned)},effectInput={authority,serviceGrant:output};
        const governance={fenceRefs:async()=>[],admit:async()=>{},authority:{lock:async()=>{},scope:async()=>{},decision:async()=>{}}};
        await prepareControlDecisionEffect(db,preparation,options(),effect.effectRef,effectInput,[opening.grantRef],governance);
        await page(1);assert.equal(executionContexts,0,'frozen effect input is still not an Applied receipt');
        await applyControlDecisionEffect(db,preparation,options(),effect.effectRef,effectInput,[opening.grantRef],governance);
        assert.equal((await requestedResponsibilityProgress(db,preparation,options(),saved.request.requestRef,effect.effectKey,[opening.grantRef],eligibility,requestChecks)).status,'EffectApplied');
        if(revoked){
          const revoke=await command('abh.execution-authority.revoke',authority.authorityRef);await run(revoke,async tx=>(await revokeExecutionAuthority(tx,revoke,authority.authorityRef,[scope])).authorityRef);
          await assert.rejects(page(0,1),{code:'AUTHORITY_REQUIRED'});assert.deepEqual(await count(),before);
          assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id))).position.lifecycle,'Validated');
          assert.equal((await requestedResponsibilityProgress(db,preparation,options(),saved.request.requestRef,effect.effectKey,[opening.grantRef],eligibility,requestChecks)).status,'EffectApplied');
        }else{
          await f.admin`CREATE FUNCTION control.fixture_reject_approval_worker_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'approval worker T1 rollback'; END; $$`;
          await f.admin`CREATE TRIGGER fixture_reject_approval_worker_snapshot BEFORE INSERT ON control.authorization_snapshots FOR EACH ROW EXECUTE FUNCTION control.fixture_reject_approval_worker_snapshot()`;
          try{await assert.rejects(page(0,1),/approval worker T1 rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_approval_worker_snapshot ON control.authorization_snapshots`;await f.admin`DROP FUNCTION control.fixture_reject_approval_worker_snapshot()`;}
          assert.deepEqual(await count(),before);executionContexts=0;
          const delivery=async()=>deriveVerifiedContext({...preparation.request,purposeOfUse:'abh.runtime.deliver'});
          const seen=new Set<string>(),peerSignals:AbortSignal[]=[];let ready!:()=>void;const peersReady=new Promise<void>(resolve=>{ready=resolve;});
          const observed=async(name:string,opts:{signal:AbortSignal})=>{seen.add(name);peerSignals.push(opts.signal);if(seen.size===4)ready();return new Promise<void>(()=>{});};
          await assert.rejects(runTenantRuntime(db,{signal:new AbortController().signal,
            actionAuthorization:{...installation,onPage:async result=>{assert.equal(result.advanced,1);await peersReady;throw new Error('lost approval worker acknowledgement');}},
            recovery:{workerId:randomUUID(),context:async()=>deriveVerifiedContext({...preparation.request,purposeOfUse:'abh.operation.reconcile'}),grantRefs:[],onPage:async(result,opts)=>{assert.equal(result.recovered,0);return observed('recovery',opts);}},
            publisher:{workerId:randomUUID(),context:delivery,router:{ruleRef:ref('hello.routing-rule'),eventTypes:['abh.action-authorization-request.accepted'],route:async()=>[]},checks:{fenceRefs:async()=>[waiting.grantRef],admit:async(tx,_event,permission,target)=>{await assertCurrentGrants(tx,{objectRef:target,scopeRefs:[scope],action:permission},[waiting.grantRef]);}},port:{enqueue:async()=>({status:'Cancelled',effect:'None'})},enqueueContext:async(_context,routing,consumerId)=>({callId:randomUUID(),requestContextRef:ref('abh.request-context'),target:{objectRef:routing.deliveries.find(item=>item.consumerId===consumerId)!.job.targetRef,scopeRefs:[scope],action:'abh.runtime.enqueue'},deadline:new Date(Date.now()+5000).toISOString()}),
              onPage:async(result,opts)=>{assert.ok(result.scanned>0);assert.equal(result.published,0);return observed('publisher',opts);}},
            consumption:{context:delivery,grantRefs:[waiting.grantRef],onPage:async(_result,opts)=>observed('consumption',opts)},
            waits:[{context:delivery,grantRefs:[waiting.grantRef],installation:new ActionApprovalWaitOwner().install(waiting.grantRef),onPage:async(result,opts)=>{assert.equal(result.checkedRefs.length,1);return observed('waits',opts);}}],
          }),/lost approval worker acknowledgement/);
          assert.equal(seen.size,4);assert.ok(peerSignals.every(signal=>signal.aborted),'failing authorization observer cancels and joins all real peer loops');

          assert.deepEqual((await count()).map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
          const current=await db.transaction(c,options(),tx=>actions.get(tx,action.actionRef.id));assert.equal(current.position.lifecycle,'Authorized');assert.deepEqual(current.executionAuthorityRef,authority.authorityRef);
          const reconnect=await Database.connect(f.runtimeUrl,{max:1});try{await page(0,0,reconnect);}finally{await reconnect.close();}
          assert.deepEqual((await count()).map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
        }
        assert.equal(policyCalls,1);assert.equal(executionContexts,1);
      }
    });
    const first=await setup(),one=await prepared(first.envelope),two=await prepared(first.envelope);
    await t.test('first T1 binds the current configured Service identity before policy or resource effects',async()=>{
      const before=await count(),target=one.action;
      const attempt=async(actorContext:typeof execution)=>{
        const cmd=await command('abh.actions.request-authorization',target.actionRef);
        return db.transaction(actorContext,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await actions.authorize(tx,cmd,target.actionRef,tx=>resolver.authorizeOneShot(tx,cmd,target.actionRef,checks))).actionRef));
      };
      await assert.rejects(attempt(deriveVerifiedContext({...c.request,purposeOfUse:'abh.action.execute'})),{code:'PURPOSE_DENIED'});
      await assert.rejects(attempt(deriveVerifiedContext({...execution.request,actor:{type:'Service',id:randomUUID()}})),{code:'FORBIDDEN'});
      await f.admin`UPDATE identity.principals SET credential_epoch=2 WHERE id=${service.id} AND resource_organization_id=${org}`;
      try{await assert.rejects(attempt(execution),{code:'EPOCH_REVOKED'});}finally{await f.admin`UPDATE identity.principals SET credential_epoch=1 WHERE id=${service.id} AND resource_organization_id=${org}`;}
      await f.admin`UPDATE identity.memberships SET status='Revoked' WHERE principal_id=${service.id} AND resource_organization_id=${org}`;
      try{await assert.rejects(attempt(execution),{code:'AUTHORITY_REQUIRED'});}finally{await f.admin`UPDATE identity.memberships SET status='Active' WHERE principal_id=${service.id} AND resource_organization_id=${org}`;}
      await assert.rejects(attempt(deriveVerifiedContext({...execution.request,scopeEpoch:execution.tenant.scopeEpoch+1})),{code:'EPOCH_REVOKED'});
      assert.deepEqual(await count(),before);
      assert.equal((await db.transaction(c,options(),tx=>actions.get(tx,target.actionRef.id))).position.lifecycle,'Validated');
      assert.ok((await children(target)).every(child=>child.attemptCount===0&&child.position.lifecycle==='Pending'));
    });
    await t.test('two Actions contest the last exact budget; only one Snapshot/Authorized state commits',async()=>{
      const before=await count(),results=await Promise.allSettled([authorize(one.action),authorize(two.action)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.deepEqual((await count()).map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
      const current=await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,first.ledger.ledgerRef.id));assert.equal(current.heldReservation,impact.resourceRequirements[0]!.quantity);
      const states=await db.transaction(execution,options(),async tx=>Promise.all([actions.get(tx,one.action.actionRef.id),actions.get(tx,two.action.actionRef.id)]));
      assert.deepEqual(states.map(state=>state.position.lifecycle).sort(),['Authorized','Validated']);
      const authorized=states.find(state=>state.position.lifecycle==='Authorized')!,query=await queryView(authorized.actionRef.id);
      assert.deepEqual(query.data.authorizationSummary.authorityRef,authorized.executionAuthorityRef);assert.deepEqual(query.data.authorizationSummary.snapshotRef,authorized.authorizationSnapshotRef);assert.ok(query.data.authorizationSummary.expiresAt);
      assert.deepEqual((await queryView(authorized.actionRef.id,false)).data.authorizationSummary,{});

      assert.ok((await children(one.action)).every(op=>op.position.lifecycle==='Pending'));assert.ok((await children(two.action)).every(op=>op.position.lifecycle==='Pending'));
      await assert.rejects(db.transaction(execution,options(),tx=>tx.owner('Control')`UPDATE control.authorization_snapshots SET record=record`),{code:'42501'});
    });
    await t.test('prepared Service T1 ingress replays one atomic reservation and revalidates current source',async()=>{
      const budget=await setup(),value=await prepared(budget.envelope),payload={},cmd=await command('abh.actions.request-authorization',{actionRef:value.action.actionRef,payload});
      let admitted=true;
      const policy={...checks,admit:async()=>{if(!admitted)throw new CoreError('FORBIDDEN');}};
      const invoke=()=>authorizePreparedAction(db,execution,options(),cmd,value.action.actionRef,payload,resolver,policy);
      const before=await count();
      admitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});admitted=true;assert.deepEqual(await count(),before);
      await assert.rejects(authorizePreparedAction(db,c,options(),cmd,value.action.actionRef,payload,resolver,policy),{code:'PURPOSE_DENIED'});
      await f.admin`CREATE FUNCTION control.fixture_reject_t1_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture t1 rollback'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_t1_snapshot BEFORE INSERT ON control.authorization_snapshots FOR EACH ROW EXECUTE FUNCTION control.fixture_reject_t1_snapshot()`;
      try{await assert.rejects(invoke(),/fixture t1 rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_t1_snapshot ON control.authorization_snapshots`;await f.admin`DROP FUNCTION control.fixture_reject_t1_snapshot()`;}
      assert.deepEqual(await count(),before);
      const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(result=>result.replayed).length,1);assert.deepEqual(results[0]!.actionRef,results[1]!.actionRef);assert.equal(results[0]!.commandId,cmd.commandId);
      assert.deepEqual((await count()).map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
      const reconnected=await Database.connect(f.runtimeUrl,{max:1});
      try{const replay=await authorizePreparedAction(reconnected,execution,options(),{...cmd,commandId:randomUUID()},value.action.actionRef,payload,resolver,policy);assert.equal(replay.commandId,cmd.commandId);assert.equal(replay.replayed,true);assert.deepEqual(replay.actionRef,results[0]!.actionRef);}finally{await reconnected.close();}

      assert.equal((await db.transaction(execution,options(),tx=>actions.get(tx,value.action.actionRef.id))).position.lifecycle,'Authorized');
      const conflict={authorityRefs:[ref('abh.execution-authority')]};await assert.rejects(authorizePreparedAction(db,execution,options(),{...cmd,digest:await inputDigest({actionRef:value.action.actionRef,payload:conflict})},value.action.actionRef,conflict,resolver,policy),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
      admitted=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});admitted=true;
      const revoke=await command('abh.grants.revoke',value.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,value.grant.grantRef,[scope])).grantRef);
      await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
      assert.equal((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
    });
    await t.test('persisted Human authorization request executes finite Service T1 once and retains original stage receipt',async()=>{
      const budget=await setup(),value=await prepared(budget.envelope);
      const requestGrant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),scopeRefs:[scope],actionTypes:['abh.actions.request-authorization'],purposeNames:['abh.action.prepare'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${requestGrant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${requestGrant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(requestGrant)}::text::jsonb,${requestGrant.validFrom},${requestGrant.validUntil},'Active')`;
      });
      const accept=async(authorityRef=value.authority.authorityRef)=>{
        const payload={authorityRefs:[authorityRef]},cmd=await command('abh.actions.request-authorization',{actionRef:value.action.actionRef,payload});
        return requestActionAuthorization(db,c,options(),cmd,value.action.actionRef,payload,[requestGrant.grantRef],{purposeNames,fenceRefs:async()=>[],admit:async()=>{}});
      };
      const accepted=await accept(),wrong=await accept(ref('abh.execution-authority'));let allowed=true;
      const requestChecks={fenceRefs:async()=>[],admit:async()=>{if(!allowed)throw new CoreError('FORBIDDEN');}},policy={...checks,admit:async()=>{}};
      const invoke=(database=db)=>authorizeRequestedAction(database,execution,options(),accepted.request.requestRef,value.action.actionRef,resolver,policy,requestChecks);
      const readGrant:GrantRecord={...requestGrant,grantRef:ref('abh.grant'),principalRef:service,actionTypes:['abh.actions.read']};
      await db.transaction(c,options(),async tx=>{
        await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${readGrant.grantRef.id},1)`;
        await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${readGrant.grantRef.id},${service.id},${JSON.stringify(readGrant)}::text::jsonb,${readGrant.validFrom},${readGrant.validUntil},'Active')`;
      });
      const preparation=deriveVerifiedContext({...execution.request,purposeOfUse:'abh.action.prepare'});
      let executionContexts=0;
      const unexpected=async():Promise<never>=>{throw new Error('completed preparation stage repeated');};
      const installation:Omit<AuthorizationWorkerOptions,'signal'|'onPage'>={context:async()=>preparation,readGrants:[readGrant.grantRef],
        discovery:{fenceRefs:async()=>[],admit:async()=>{},canRead:async(_tx,request)=>request.requestRef.id===accepted.request.requestRef.id},requestChecks,
        validation:{payload:unexpected,grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected,domain:unexpected}},
        pin:{grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected}},
        compilation:{compiler,host:new ActionCompilerHost([{capability:compiler,compile:unexpected}]),grants:[],checks:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected},registration:{fenceRefs:unexpected,admit:unexpected,artifact:unexpected,plan:unexpected}},
        authorization:{context:async()=>{executionContexts++;return execution;},resolver,checks:policy,admission:requestChecks},intervalMs:1};
      const before=await count();
      await assert.rejects(authorizeRequestedAction(db,c,options(),accepted.request.requestRef,value.action.actionRef,resolver,policy,requestChecks),{code:'PURPOSE_DENIED'});
      await assert.rejects(authorizeRequestedAction(db,execution,options(),accepted.request.requestRef,ref('abh.action'),resolver,policy,requestChecks),{code:'FORBIDDEN'});
      await assert.rejects(authorizeRequestedAction(db,execution,options(),wrong.request.requestRef,value.action.actionRef,resolver,policy,requestChecks),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
      allowed=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});allowed=true;assert.deepEqual(await count(),before);
      await f.admin`CREATE FUNCTION control.fixture_reject_requested_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture requested rollback'; END; $$`;
      await f.admin`CREATE TRIGGER fixture_reject_requested_snapshot BEFORE INSERT ON control.authorization_snapshots FOR EACH ROW EXECUTE FUNCTION control.fixture_reject_requested_snapshot()`;
      try{await assert.rejects(invoke(),/fixture requested rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_requested_snapshot ON control.authorization_snapshots`;await f.admin`DROP FUNCTION control.fixture_reject_requested_snapshot()`;}
      assert.deepEqual(await count(),before);
      await assert.rejects(runAuthorizationWorker(db,{...installation,signal:new AbortController().signal,authorization:{...installation.authorization!,context:async()=>deriveVerifiedContext({...execution.request,actor:{type:'Service',id:randomUUID()}})}}),{code:'FORBIDDEN'});
      assert.deepEqual(await count(),before);
      allowed=false;await assert.rejects(runAuthorizationWorker(db,{...installation,signal:new AbortController().signal}),{code:'FORBIDDEN'});allowed=true;assert.deepEqual(await count(),before);
      await assert.rejects(runAuthorizationWorker(db,{...installation,signal:new AbortController().signal,onPage:async report=>{assert.equal(report.advanced,1);throw new Error('fixture lost worker acknowledgement');}}),/fixture lost worker acknowledgement/);
      const afterWorker=await count();assert.deepEqual(afterWorker.map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
      const usedContexts=executionContexts,stopWorker=new AbortController();
      const workerRestart=await Database.connect(f.runtimeUrl,{max:1});try{
        await runAuthorizationWorker(workerRestart,{...installation,signal:stopWorker.signal,onPage:async report=>{assert.equal(report.advanced,0);assert.equal(report.authorizationReady,0);stopWorker.abort();}});
      }finally{await workerRestart.close();}
      assert.equal(executionContexts,usedContexts);assert.deepEqual(await count(),afterWorker);
      const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(x=>x.replayed).length,2);assert.deepEqual(results[0]!.actionRef,results[1]!.actionRef);assert.equal(results[0]!.commandId,results[1]!.commandId);assert.notEqual(results[0]!.commandId,accepted.commandId);
      assert.deepEqual((await count()).map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
      const restart=await Database.connect(f.runtimeUrl,{max:1});try{assert.equal((await invoke(restart)).commandId,results[0]!.commandId);}finally{await restart.close();}
      assert.deepEqual((await count()).map((n,i)=>Number(n)-Number(before[i])),[1,2,1]);
      allowed=false;await assert.rejects(invoke(),{code:'FORBIDDEN'});allowed=true;
      const revoke=await command('abh.grants.revoke',value.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,value.grant.grantRef,[scope])).grantRef);await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
      assert.equal((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
    });
    await t.test('source or policy denial and final Action CAS failure roll back policy and all resource work',async()=>{
      const next=await setup(),preparedAction=await prepared(next.envelope),before=await count();
      await assert.rejects(authorize(preparedAction.action,{...checks,sources:async()=>{throw new CoreError('AUTHORITY_REQUIRED');}}),{code:'AUTHORITY_REQUIRED'});
      const denied=await configurePolicy('Mandatory','abh_fixture/decision');binding=await activate(denied,binding.bindingRef.version);
      await assert.rejects(authorize(preparedAction.action),{code:'POLICY_DENIED'});binding=await activate(mandatory,binding.bindingRef.version);
      const cmd=await command('abh.actions.request-authorization',preparedAction.action.actionRef);
      await assert.rejects(db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
        await actions.authorize(tx,cmd,preparedAction.action.actionRef,tx=>resolver.authorizeOneShot(tx,cmd,preparedAction.action.actionRef,checks));throw new Error('after Authorized CAS');
      })),/after Authorized CAS/);assert.deepEqual(await count(),before);
      await assert.rejects(db.transaction(execution,options(),tx=>resolver.authorizeOneShot(tx,cmd,preparedAction.action.actionRef,checks)),{code:'INTERNAL_ERROR'});
      assert.deepEqual(await count(),before,'issuing a Snapshot without the paired Action CAS cannot commit');
      assert.equal((await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,next.ledger.ledgerRef.id))).heldReservation,'0');
    });
    await t.test('forged authorization and revoked source Grant produce no Snapshot or budget hold',async()=>{
      const next=await setup(),preparedAction=await prepared(next.envelope),before=await count(),cmd=await command('abh.actions.request-authorization',preparedAction.action.actionRef);
      await assert.rejects(db.transaction(execution,options(),tx=>actions.authorize(tx,cmd,preparedAction.action.actionRef,async()=>({kind:'IssuedActionAuthorization'}))),{code:'AUTHORITY_REQUIRED'});
      const revoke=await command('abh.grants.revoke',preparedAction.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,preparedAction.grant.grantRef,[scope])).grantRef);
      await assert.rejects(authorize(preparedAction.action),{code:'EPOCH_REVOKED'});assert.deepEqual(await count(),before);
    });
    await t.test('T2 persists one bounded Permit and immutable Attempt with the parent transition',async t=>{
      const dispatch=new DispatchOwner(),control=new DispatchAuthorizationResolver(assets),leases=new WorkLeaseOwner();
      const sourceChecks:DispatchSourceChecks={...checks,target:async()=>{},bindings:{outputs:async()=>[{outputName:'hello.external-id',valueType:'hello.external-id',field:'externalId'}],validate:async(_tx,_node,_plan,payload)=>{
        const parsed=JSON.parse(new TextDecoder().decode(payload.bytes));if(parsed.message!=='authorized fixture'||typeof parsed.externalId!=='string')throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
      }}};
      const claim=async(operationRef:EntityRef,workerId=randomUUID(),leaseSeconds=30)=>{
        const input={targetRef:operationRef,workerId,leaseSeconds},cmd=await command('abh.work-leases.claim',input);let lease;
        await db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
          lease=await leases.claim(tx,cmd,input,async(tx,ref)=>{const op=await operations.get(tx,ref.id);return (await actions.getIntent(tx,op.actionRef.id)).purposeNames;});return lease.leaseRef;
        }));return lease!;
      };
      const ready=async(ttl=60,single:boolean|'independent'=false)=>{
        const budget=await setup(),preparedAction=await prepared(budget.envelope,single),action=await authorize(preparedAction.action,checks,new ActionAuthorizationResolver(assets,{snapshotTtlSeconds:ttl}));
        const operation=(await children(action)).find(op=>op.nodeKey==='publish')!,lease=await claim(operation.operationRef);
        return {budget,...preparedAction,action,operation,lease};
      };
      const issue=async(value:Awaited<ReturnType<typeof ready>>,input={snapshotRef:value.action.authorizationSnapshotRef!,workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken},cmd?:CommandIdentity,admission=sourceChecks)=>{
        const request=cmd??await command('abh.operations.issue-permit',input);
        const result=await db.transaction(execution,options(),tx=>executeCommand(tx,request,async()=>{},async()=>
          (await dispatch.issue(tx,request,value.operation.operationRef,input,tx=>control.authorize(tx,request,value.operation.operationRef,input.snapshotRef,admission))).permitRef));
        return db.transaction(execution,options(),tx=>dispatch.getPermit(tx,result.receipt.resultRef));
      };
      const counts=()=>db.transaction(execution,options(),async tx=>{
        const [row]=await tx.owner('OperationController')`SELECT (SELECT count(*) FROM execution.dispatch_permits) AS permits,(SELECT count(*) FROM execution.attempts) AS attempts,
          (SELECT count(*) FROM execution.attempt_observations) AS observations,(SELECT count(*) FROM execution.resource_fences) AS slots`;
        return row;
      });
      await t.test('duplicate workers/delivery produce one Permit; Command replay returns it without another Attempt',async()=>{
        const value=await ready(),input={snapshotRef:value.action.authorizationSnapshotRef!,workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        const cmd=await command('abh.operations.issue-permit',input),results=await Promise.allSettled([issue(value,input,cmd),issue(value)]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        const permit=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof issue>>>).value;
        if(results[0]!.status==='fulfilled')assert.deepEqual(await issue(value,input,cmd),permit);
        assert.ok(Date.parse(permit.expiresAt)-Date.parse(permit.issuedAt)<=5000);assert.equal(permit.providerIdempotencyKey,value.operation.providerIdempotencyKey);
        assert.equal(permit.ordinal,1);assert.equal(permit.resourceFencingToken,1);assert.deepEqual(permit.connectorRef,connector);
        await db.transaction(execution,options(),async tx=>{
          assert.deepEqual((await actions.get(tx,value.action.actionRef.id)).position,{lifecycle:'Executing',outcome:'Pending'});
          const op=await operations.get(tx,value.operation.operationRef.id);assert.equal(op.position.lifecycle,'Dispatching');assert.equal(op.attemptCount,1);
          assert.equal((await dispatch.getAttempt(tx,permit.attemptRef)).permitRef.id,permit.permitRef.id);
          assert.deepEqual((await dispatch.observations(tx,permit.attemptRef)).map(o=>o.status),['Created']);
          assert.equal((await ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id)).heldReservation,impact.resourceRequirements[0]!.quantity);
        });
        await assert.rejects(issue(value),{code:'VERSION_CONFLICT'});
        await assert.rejects(db.transaction(execution,options(),tx=>tx.owner('OperationController')`UPDATE execution.dispatch_permits SET record=record`),{code:'42501'});
        await assert.rejects(db.transaction(execution,options(),tx=>tx.owner('OperationController')`UPDATE execution.attempts SET record=record`),{code:'42501'});
        await assert.rejects(db.transaction(context(),options(),tx=>dispatch.getPermit(tx,permit.permitRef)),{code:'RESOURCE_NOT_FOUND'});
      });
      await t.test('rollback after both Owner CAS operations retains authorization and removes all new dispatch facts',async()=>{
        const value=await ready(),before=await counts(),input={snapshotRef:value.action.authorizationSnapshotRef!,workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken},cmd=await command('abh.operations.issue-permit',input);
        await assert.rejects(db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
          await dispatch.issue(tx,cmd,value.operation.operationRef,input,tx=>control.authorize(tx,cmd,value.operation.operationRef,input.snapshotRef,sourceChecks));throw new Error('after Permit and Action');
        })),/after Permit and Action/);
        assert.deepEqual(await counts(),before);
        assert.equal((await db.transaction(execution,options(),tx=>actions.get(tx,value.action.actionRef.id))).position.lifecycle,'Authorized');
        assert.equal((await children(value.action)).find(op=>op.nodeKey==='publish')!.attemptCount,0);
        await assert.rejects(db.transaction(execution,options(),tx=>control.authorize(tx,cmd,value.operation.operationRef,input.snapshotRef,sourceChecks)),{code:'INTERNAL_ERROR'});
        await assert.rejects(db.transaction(execution,options(),tx=>dispatch.issue(tx,cmd,value.operation.operationRef,input,async()=>({kind:'IssuedDispatchAuthorization'}))),{code:'AUTHORITY_REQUIRED'});
        assert.deepEqual(await counts(),before);
      });
      await t.test('revocation committed before T2 prevents Permit issuance and preserves the original hold',async()=>{
        const value=await ready(),before=await counts(),cmd=await command('abh.grants.revoke',value.grant.grantRef);
        await run(cmd,async tx=>(await revokeGrant(tx,cmd,value.grant.grantRef,[scope])).grantRef);
        await assert.rejects(issue(value),{code:'EPOCH_REVOKED'});assert.deepEqual(await counts(),before);
        assert.equal((await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
      });
      await t.test('Mandatory Policy tightening is re-evaluated after T1 while Behavior remains pinned',async()=>{
        const value=await ready(),before=await counts(),deny=await configurePolicy('Mandatory','abh_fixture/decision');binding=await activate(deny,binding.bindingRef.version);
        await assert.rejects(issue(value),{code:'POLICY_DENIED'});assert.deepEqual(await counts(),before);
        binding=await activate(mandatory,binding.bindingRef.version);const permit=await issue(value);
        assert.equal(permit.policyEvaluationRefs.length,2);
        const snapshot=await db.transaction(execution,options(),tx=>resolver.get(tx,value.action.authorizationSnapshotRef!));
        assert.ok(permit.policyEvaluationRefs.every(ref=>!snapshot.policyEvaluationRefs.some(prior=>prior.id===ref.id)));
      });
      await t.test('wrong or expired Worker lease cannot issue a Permit; takeover changes fencing generation',async()=>{
        const value=await ready(),before=await counts();
        await assert.rejects(issue(value,{snapshotRef:value.action.authorizationSnapshotRef!,workerId:randomUUID(),leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken}),{code:'PRECONDITION_FAILED'});
        const cmd=await command('abh.work-leases.release',value.lease.leaseRef);
        await db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await leases.release(tx,cmd,value.lease.leaseRef,value.lease.workerId,value.lease.fencingToken)).leaseRef));
        await assert.rejects(issue(value),{code:'PRECONDITION_FAILED'});assert.deepEqual(await counts(),before);
        const lease=await claim(value.operation.operationRef);assert.equal(lease.fencingToken,2);await issue({...value,lease});
      });
      await t.test('an expired Snapshot cannot dispatch even while the Service lease remains active',async()=>{
        const value=await ready(5),before=await counts();await f.raw`SELECT pg_sleep(5.1)`;
        await assert.rejects(issue(value),{code:'AUTHORITY_REQUIRED'});assert.deepEqual(await counts(),before);
      });
      await t.test('current worker credential epoch is revalidated even when the saved lease still exists',async()=>{
        const value=await ready(),before=await counts();
        await db.transaction(execution,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=2 WHERE id=${service.id}`);
        try{await assert.rejects(issue(value),{code:'EPOCH_REVOKED'});assert.deepEqual(await counts(),before);}
        finally{await db.transaction(execution,options(),tx=>tx.owner('Identity')`UPDATE identity.principals SET credential_epoch=1 WHERE id=${service.id}`);}
      });
      await t.test('one-use exit rechecks authority, commits before transport and rejects replay and wrong Connector',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        const wrong=new FakeProvider({...connector,version:'0.2.0'});
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,wrong),{code:'PIN_INPUT_CONFLICT'});
        assert.equal(wrong.calls,0);
        const cmd=await command('abh.operations.claim-exit',{permit:permit.permitRef,claim}),request={permitRef:permit.permitRef,claim,command:cmd};
        const result=await dispatchOnce(db,execution,options(),request,control,sourceChecks,fake);
        assert.equal(result.status,'Responded');assert.equal(fake.calls,1);assert.equal(fake.records.length,1);
        assert.deepEqual(fake.records[0]!.payload,new TextEncoder().encode('{"message":"authorized fixture"}'));
        await assert.rejects(dispatchOnce(db,execution,options(),request,control,sourceChecks,fake),{code:'PRECONDITION_FAILED'});
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake),{code:'PRECONDITION_FAILED'});
        assert.equal(fake.calls,1);
      });
      await t.test('dispatch fixes installed method and preserves evidence when Connector mutates input or ignores abort',async()=>{
        const value=await ready(),permit=await issue(value),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        const abort=new AbortController();let calls=0,replacements=0;
        const installed={capabilityRef:{...connector},async send(input:{permit:DispatchPermitRecord;payload:Uint8Array;signal:AbortSignal}){
          calls++;assert.equal(this,installed);input.permit.digest='sha256:'+'f'.repeat(64);input.permit.connectorRef.id='hello.changed';abort.abort();return new Promise<Uint8Array>(()=>{});
        }};
        const promise=dispatchOnce(db,execution,{...options(),signal:abort.signal},{permitRef:permit.permitRef,claim},control,sourceChecks,installed);
        installed.capabilityRef.id='hello.replaced';installed.send=async()=>{replacements++;return new Uint8Array();};
        const result=await promise;assert.equal(result.status,'Interrupted');assert.equal(calls,1);assert.equal(replacements,0);assert.equal(result.permit.digest,permit.digest);assert.deepEqual(result.permit.connectorRef,connector);
        assert.equal((await requireTransportOrigin(result)).status,'Interrupted');
        const replacement=new FakeProvider(connector);
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,replacement),{code:'PRECONDITION_FAILED'});assert.equal(replacement.calls,0);
      });
      await t.test('dispatch retains denying business admission despite method replacement and rolls back its exit',async()=>{
        const value=await ready(),permit=await issue(value),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken},fake=new FakeProvider(connector);
        let denied=0,replacements=0;
        const installed:DispatchSourceChecks={...sourceChecks,target:async function(){assert.equal(this,installed);denied++;throw new CoreError('FORBIDDEN');}};
        const pending=dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,installed,fake);
        installed.target=async()=>{replacements++;};
        await assert.rejects(pending,{code:'FORBIDDEN'});assert.equal(denied,1);assert.equal(replacements,0);assert.equal(fake.calls,0);
        const [row]=await db.transaction(execution,options(),tx=>tx.owner('OperationController')`SELECT count(*) AS count FROM execution.dispatch_exits WHERE permit_id=${permit.permitRef.id}`);
        assert.equal(Number(row!.count),0);
        assert.equal((await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake)).status,'Responded');assert.equal(fake.calls,1);
      });
      await t.test('final capability admission rejects after exit insertion and rolls back before any send',async()=>{
        const value=await ready(),permit=await issue(value),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken},fake=new FakeProvider(connector);
        let calls=0;
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake,async(tx,current)=>{
          calls++;assert.deepEqual(current.permitRef,permit.permitRef);
          const [row]=await tx.owner('OperationController')`SELECT count(*) AS count FROM execution.dispatch_exits WHERE permit_id=${permit.permitRef.id}`;
          assert.equal(Number(row!.count),1);throw new CoreError('PRECONDITION_FAILED');
        }),{code:'PRECONDITION_FAILED'});
        assert.equal(calls,1);assert.equal(fake.calls,0);
        const [row]=await db.transaction(execution,options(),tx=>tx.owner('OperationController')`SELECT count(*) AS count FROM execution.dispatch_exits WHERE permit_id=${permit.permitRef.id}`);
        assert.equal(Number(row!.count),0);
        assert.equal((await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake)).status,'Responded');assert.equal(fake.calls,1);
      });
      await t.test('Pack dispatch cannot use execution authority as an implicit capability read Grant',async()=>{
        const value=await ready(),permit=await issue(value),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken},fake=new FakeProvider(connector);
        let inspections=0;
        await assert.rejects(dispatchPackAndCapture([db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,{
          behaviorSlot:'hello.execution',binding:{exactRef:connector,registeredKind:'abh.connector',implementationRef:ref('abh.artifact'),implementation:fake},readGrants:[],
          admission:{fenceRefs:async()=>[],query:{fenceRefs:async()=>[],inspect:async()=>{inspections++;return {visible:true,compatible:true,healthy:true};}},current:async()=>{},source:async()=>{throw new Error('must deny before bytes');}},
        }],{context:async()=>{throw new Error('denied dispatch must not capture');},options,checks:{} as CaptureDestination['checks']}),{code:'AUTHORITY_REQUIRED'});
        assert.equal(inspections,0);assert.equal(fake.calls,0);
        const [row]=await db.transaction(execution,options(),tx=>tx.owner('OperationController')`SELECT count(*) AS count FROM execution.dispatch_exits WHERE permit_id=${permit.permitRef.id}`);
        assert.equal(Number(row!.count),0);
      });
      await t.test('Permit first, revocation second: no new exit, while the durable possible-in-flight facts remain',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        const cmd=await command('abh.grants.revoke',value.grant.grantRef);await run(cmd,async tx=>(await revokeGrant(tx,cmd,value.grant.grantRef,[scope])).grantRef);
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake),{code:'EPOCH_REVOKED'});assert.equal(fake.calls,0);
        await db.transaction(execution,options(),async tx=>{
          assert.equal((await dispatch.getAttempt(tx,permit.attemptRef)).ordinal,1);
          assert.equal((await operations.get(tx,value.operation.operationRef.id)).position.lifecycle,'Dispatching');
          assert.ok((await new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!))!.unresolvedOperationRef);
        });
      });
      await t.test('Provider accepted but lost response cannot be redispatched by delivery or lease takeover',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};fake.mode='ResponseLost';
        const result=await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake);
        assert.equal(result.status,'TransportFailed');assert.equal(fake.calls,1);assert.equal(fake.query(permit.providerIdempotencyKey).length,1);
        const release=await command('abh.work-leases.release',value.lease.leaseRef);
        await db.transaction(execution,options(),tx=>executeCommand(tx,release,async()=>{},async()=>(await leases.release(tx,release,value.lease.leaseRef,value.lease.workerId,value.lease.fencingToken)).leaseRef));
        const lease=await claimLeaseForTakeover();
        async function claimLeaseForTakeover(){const input={targetRef:value.operation.operationRef,workerId:randomUUID(),leaseSeconds:30},cmd=await command('abh.work-leases.claim',input);let lease;
          await db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{lease=await leases.claim(tx,cmd,input,async(tx,ref)=>{const op=await operations.get(tx,ref.id);return (await actions.getIntent(tx,op.actionRef.id)).purposeNames;});return lease.leaseRef;}));return lease!;}
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim:{workerId:lease.workerId,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken}},control,sourceChecks,fake),{code:'PRECONDITION_FAILED'});
        await assert.rejects(issue({...value,lease}),{code:'VERSION_CONFLICT'});assert.equal(fake.calls,1);
      });
      await t.test('independent budgeted query survives dispatch revocation; replay, rollback and exhausted budget never invoke again',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector);
        const dispatchClaim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        fake.mode='ResponseLost';assert.equal((await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim:dispatchClaim},control,sourceChecks,fake)).status,'TransportFailed');
        const operation=await db.transaction(execution,options(),tx=>operations.get(tx,value.operation.operationRef.id)),budget=await setup('3');
        const receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'}),queryPurpose=ref('abh.purpose');
        const purpose={purposeRef:queryPurpose,resourceOrganizationId:org,name:'abh.operation.reconcile',evidenceRefs:[scope],status:'Active' as const},purposeCmd=await command('abh.purposes.configure',purpose);
        await run(purposeCmd,async tx=>(await new PurposeOwner().configure(tx,purposeCmd,purpose,catalog.data,async()=>{})).purposeRef);
        // Independent issuance fixture; production Scope preauthorization and policy admission remain separate work.
        const grant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.claim-query-exit'],purposeNames:['abh.operation.reconcile']};
        const unsigned:ExecutionAuthority={...value.authority,authorityRef:ref('abh.execution-authority'),grantRefs:[grant.grantRef],purposeRefs:[queryPurpose],actionTypes:grant.actionTypes,resourceEnvelopeRef:budget.envelope.envelopeRef,effectKey:'query-fixture'};
        const authority={...unsigned,issuanceDigest:await digestContract('ExecutionAuthority',unsigned)};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.execution_authorities(resource_organization_id,id,execution_principal_id,evidence_type,evidence_id,effect_key,input_digest,valid_from,valid_until,status,record,purpose_names)
            VALUES (${org},${authority.authorityRef.id},${service.id},${authority.issuanceEvidenceRef.type},${authority.issuanceEvidenceRef.id},'query-fixture',${authority.issuanceDigest},${authority.validFrom},${authority.validUntil},'Active',${JSON.stringify(authority)}::text::jsonb,${['abh.operation.reconcile']})`;
          for(const target of [grant.grantRef,authority.authorityRef])await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},${target.type},${target.id},1)`;
        });
        const draft={executionPrincipalRef:authority.executionPrincipalRef,allowedProposerRefs:authority.allowedProposerRefs,grantRefs:authority.grantRefs,scopeRefs:authority.scopeRefs,purposeRefs:authority.purposeRefs,actionTypes:authority.actionTypes,resourceEnvelopeRef:authority.resourceEnvelopeRef,validFrom:authority.validFrom,validUntil:authority.validUntil,stopConditions:authority.stopConditions,effectKey:'scope-source-fixture'};
        await assert.rejects(db.transaction(receiver,options(),tx=>resolveScopeAuthoritySource(tx,{...draft,purposeRefs:[...draft.purposeRefs,executionPurpose]})),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
        const allPurposes=await db.transaction(receiver,options(),tx=>new PurposeOwner().requireAllCurrent(tx,[...draft.purposeRefs,executionPurpose]));assert.equal(allPurposes.length,2);
        await assert.rejects(db.transaction(receiver,options(),async tx=>{
          const broadGrant={...grant,grantRef:ref('abh.grant'),purposeNames:['abh.operation.reconcile','abh.action.execute']};
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${broadGrant.grantRef.id},${service.id},${JSON.stringify(broadGrant)}::text::jsonb,${broadGrant.validFrom},${broadGrant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${broadGrant.grantRef.id},1)`;
          const resolved=await resolveScopeAuthoritySource(tx,{...draft,grantRefs:[broadGrant.grantRef],purposeRefs:[...draft.purposeRefs,executionPurpose]});
          assert.deepEqual(resolved.grants,[broadGrant]);assert.ok(resolved.sourceVersionRefs.some(ref=>ref.id===executionPurpose.id));
          throw new Error('rollback multi-purpose fixture');
        }),/rollback multi-purpose fixture/);

        await assert.rejects(db.transaction(receiver,options(),tx=>new PurposeOwner().requireAllCurrent(tx,[executionPurpose,executionPurpose])),{code:'PURPOSE_DENIED'});
        const source=await db.transaction(receiver,options(),tx=>resolveScopeAuthoritySource(tx,draft));assert.deepEqual(source.grants,[grant]);assert.deepEqual(source.resourceEnvelope,budget.envelope);
        const management:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.execution-authority.create']};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${management.grantRef.id},${service.id},${JSON.stringify(management)}::text::jsonb,${management.validFrom},${management.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${management.grantRef.id},1)`;
        });
        const currentPolicy=await db.transaction(execution,options(),tx=>policies.selectMandatory(tx,'ActionPolicyInput'));
        const unsignedPolicy={...currentPolicy.policy,policyVersionRef:ref('abh.policy-version'),inputSchemaName:'ScopeAuthorityPolicyInput' as const,entrypoint:'abh_fixture/scope_decision'};
        const scopePolicy={...unsignedPolicy,digest:await digestContract('PolicyVersionRecord',unsignedPolicy)},configureScope=await command('abh.policies.configure',scopePolicy);
        await run(configureScope,async tx=>(await policies.configure(tx,configureScope,{policy:scopePolicy,purposeNames},assets,{lock:async()=>{},publish:async()=>{},activate:async()=>{}})).policyVersionRef);
        const activateScope=await command('abh.policies.activate-mandatory',scopePolicy.policyVersionRef);
        await run(activateScope,async tx=>(await policies.activateMandatory(tx,activateScope,{policyVersionRef:scopePolicy.policyVersionRef,purposeNames,evidenceRefs:[scope]},{lock:async()=>{},publish:async()=>{},activate:async()=>{}})).bindingRef);
        const multiIssued=await db.transaction(receiver,options(),async tx=>{
          const broad={...grant,grantRef:ref('abh.grant'),purposeNames:['abh.operation.reconcile','abh.action.execute']},manager={...management,grantRef:ref('abh.grant'),purposeNames:broad.purposeNames};
          for(const record of [broad,manager]){
            await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${record.grantRef.id},${service.id},${JSON.stringify(record)}::text::jsonb,${record.validFrom},${record.validUntil},'Active')`;
            await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${record.grantRef.id},1)`;
          }
          const multi={...draft,grantRefs:[broad.grantRef],purposeRefs:[...draft.purposeRefs,executionPurpose]},actual=await resolveScopeAuthoritySource(tx,multi,[manager.grantRef,management.grantRef]);
          const cmd=await command('abh.execution-authority.evaluate-scope',multi),evaluation=await policies.evaluateScope(tx,cmd,actual,assets,async()=>{}),request={draft:multi,evaluationRef:evaluation.evaluationRef,managementGrantRefs:[management.grantRef]};
          const createCmd=await command('abh.execution-authority.create',request);
          await assert.rejects(new ScopeAuthorityOwner().create(tx,createCmd,request),{code:'FORBIDDEN'});
          const created=await new ScopeAuthorityOwner().create(tx,createCmd,{...request,managementGrantRefs:[manager.grantRef]});assert.equal(created.purposeRefs.length,2);
          const [stored]=await tx.owner('Control')`SELECT purpose_names FROM control.execution_authorities WHERE id=${created.authorityRef.id}`;assert.deepEqual([...stored!.purpose_names].sort(),[...broad.purposeNames].sort());
          const [evidence]=await tx.owner('Control')`SELECT purpose_names FROM control.policy_evaluations WHERE id=${evaluation.evaluationRef.id}`;assert.deepEqual([...evidence!.purpose_names].sort(),[...broad.purposeNames].sort());
          return created;
        });
        const otherPurpose=deriveVerifiedContext({...receiver.request,requestId:randomUUID(),purposeOfUse:'abh.action.execute'});
        await db.transaction(otherPurpose,options(),async tx=>{
          assert.deepEqual(await new ExecutionAuthorityOwner().get(tx,multiIssued.authorityRef.id),multiIssued);
          await assertScopeRuntimePolicy(tx,multiIssued,assets);
        });
        await assert.rejects(db.transaction(receiver,options(),async tx=>{
          await tx.owner('Control')`UPDATE control.execution_authorities SET valid_until=valid_until+interval '1 second' WHERE id=${multiIssued.authorityRef.id}`;
          await new ExecutionAuthorityOwner().get(tx,multiIssued.authorityRef.id);
        }),{code:'INTERNAL_ERROR'},'metadata drift cannot extend persisted authority validity');
        const unrelatedPurpose=deriveVerifiedContext({...receiver.request,requestId:randomUUID(),purposeOfUse:'abh.artifact.read'});
        await assert.rejects(db.transaction(unrelatedPurpose,options(),tx=>new ExecutionAuthorityOwner().get(tx,multiIssued.authorityRef.id)),{code:'RESOURCE_NOT_FOUND'});

        const evaluateSource=await command('abh.execution-authority.evaluate-scope',draft);let proof;
        await db.transaction(receiver,options(),tx=>executeCommand(tx,evaluateSource,async()=>{},async()=>{
          const actual=await resolveScopeAuthoritySource(tx,draft);proof=await policies.evaluateScope(tx,evaluateSource,actual,assets,async()=>{});return proof.evaluationRef;
        }));
        const createInput={draft,evaluationRef:proof!.evaluationRef,managementGrantRefs:[management.grantRef]},scopeOwner=new ScopeAuthorityOwner();
        const create=async(value=createInput,rollback=false)=>{const cmd=await command('abh.execution-authority.create',value);let issued;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{issued=await scopeOwner.create(tx,cmd,value);if(rollback)throw new Error('scope create rollback');return issued.authorityRef;}));return issued!;};
        await assert.rejects(create({...createInput,managementGrantRefs:[grant.grantRef]}),{code:'FORBIDDEN'});
        await assert.rejects(create(createInput,true),/scope create rollback/);
        const ingressCommand=await command('abh.execution-authority.create',createInput);
        const [firstIngress,repeatedIngress]=await Promise.all([1,2].map(()=>createScopeAuthority(db,receiver,options(),ingressCommand,createInput)));assert.deepEqual(firstIngress,repeatedIngress);
        await assert.rejects(createScopeAuthority(db,receiver,options(),{...ingressCommand,digest:'sha256:'+'0'.repeat(64)},createInput),{code:'INVALID_ARGUMENT'});
        const issued=await create(),replayed=await create();assert.deepEqual(issued,replayed);assert.equal(issued.binding.kind,'Scope');assert.deepEqual(issued.grantRefs,[grant.grantRef]);
        await db.transaction(receiver,options(),async tx=>{
          await assertScopeRuntimePolicy(tx,issued,assets);
          await assert.rejects(f.admin.begin(async sql=>{await sql`SELECT id FROM control.fences WHERE resource_organization_id=${org} AND scope_type='abh.execution-authority' AND scope_id=${issued.authorityRef.id} FOR UPDATE NOWAIT`;}),{code:'55P03'},'runtime check itself locks Authority against concurrent revocation');
        });
        assert.equal(issued.issuanceEvidenceRef.id,proof!.evaluationRef.id);assert.equal(await digestContract('ExecutionAuthority',issued),issued.issuanceDigest);
        await assert.rejects(create({...createInput,draft:{...draft,validUntil:new Date(Date.parse(draft.validUntil)-1000).toISOString()}}),{code:'IDEMPOTENCY_CONFLICT'});
        assert.ok(source.sourceVersionRefs.some(ref=>ref.type==='abh.membership'));assert.ok(source.sourceVersionRefs.some(ref=>ref.type==='abh.fence'));
        for(const changed of [{actionTypes:['hello.ungranted']},{validUntil:new Date(Date.parse(grant.validUntil)+1000).toISOString()},{executionPrincipalRef:ref('abh.principal',c.tenant.actor.id)}])await assert.rejects(db.transaction(receiver,options(),tx=>resolveScopeAuthoritySource(tx,{...draft,...changed})));
        const revoke=await command('abh.grants.revoke',value.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,value.grant.grantRef,[scope])).grantRef);
        const input={operationRef:operation.operationRef,queryAuthorityRef:issued.authorityRef,...dispatchClaim};
        const policy:InstalledQueryPolicy={policyRef:ref('abh.artifact'),connectorRef:connector,cost:{resourceRef:resource,quantity:'1',unit:'hello.credit'},timeoutMs:5000,minIntervalMs:1,authorize:async(tx,authority)=>assertScopeRuntimePolicy(tx,authority,assets)};
        let calls=0;const transport={capabilityRef:connector,query:async({exit}:{exit:QueryExitRecord})=>{
          calls++;assert.equal(exit.providerIdempotencyKey,permit.providerIdempotencyKey);
          const [persisted]=await db.transaction(receiver,options(),tx=>tx.owner('OperationController')`SELECT id FROM execution.query_exits WHERE id=${exit.exitRef.id}`);assert.ok(persisted,'exit commits before network');
          return new TextEncoder().encode(JSON.stringify(fake.query(exit.providerIdempotencyKey)));
        }};
        const balance=()=>db.transaction(receiver,options(),tx=>ledgerOwner.get(tx,budget.ledger.ledgerRef.id));
        const tightenedUnsigned={...scopePolicy,policyVersionRef:ref('abh.policy-version'),entrypoint:'abh_fixture/decision'},tightened={...tightenedUnsigned,digest:await digestContract('PolicyVersionRecord',tightenedUnsigned)};
        const configureTight=await command('abh.policies.configure',tightened);await run(configureTight,async tx=>(await policies.configure(tx,configureTight,{policy:tightened,purposeNames},assets,{lock:async()=>{},publish:async()=>{},activate:async()=>{}})).policyVersionRef);
        const setScope=async(policyVersionRef:PolicyVersionRecord['policyVersionRef'])=>{const binding=await db.transaction(receiver,options(),tx=>policies.selectMandatory(tx,'ScopeAuthorityPolicyInput')),cmd=await command('abh.policies.activate-mandatory',policyVersionRef);
          await run(cmd,async tx=>(await policies.activateMandatory(tx,cmd,{policyVersionRef,expectedBindingVersion:binding.binding.bindingRef.version,purposeNames,evidenceRefs:[scope]},{lock:async()=>{},publish:async()=>{},activate:async()=>{}})).bindingRef);};
        await setScope(tightened.policyVersionRef);
        await assert.rejects(queryOnce(db,receiver,options(),input,policy,transport),{code:'POLICY_DENIED'});assert.equal(calls,0);
        assert.match((await balance()).confirmedUsage,/^0(?:\.0+)?$/);
        await setScope(scopePolicy.policyVersionRef);

        const rollback=await command('abh.operations.claim-query-exit',input);
        await assert.rejects(db.transaction(receiver,options(),tx=>executeCommand(tx,rollback,async()=>{},async()=>{await new QueryExitOwner().claim(tx,rollback,input,policy);throw new Error('rollback query exit');})),/rollback query exit/);
        assert.equal(calls,0);assert.match((await balance()).confirmedUsage,/^0(?:\.0+)?$/);
        await assert.rejects(queryOnce(db,receiver,options(),input,{...policy,authorize:async()=>{throw new CoreError('FORBIDDEN');}},transport),{code:'FORBIDDEN'});
        await assert.rejects(queryOnce(db,receiver,options(),{...input,leaseFencingToken:input.leaseFencingToken+1},policy,transport));assert.equal(calls,0);
        await assert.rejects(queryPackAndCapture([db,receiver,options(),input,policy,{
          behaviorSlot:'hello.execution',binding:{exactRef:connector,registeredKind:'abh.connector',implementationRef:ref('abh.artifact'),implementation:transport},readGrants:[],
          admission:{fenceRefs:async()=>[],query:{fenceRefs:async()=>[],inspect:async()=>{throw new Error('must not inspect without read authority');}},current:async()=>{},source:async()=>{throw new Error('must not read bytes');}},
        }],{context:async()=>{throw new Error('denied query must not capture');},options,checks:{} as QueryCaptureChecks}),{code:'AUTHORITY_REQUIRED'});
        assert.equal(calls,0);assert.match((await balance()).confirmedUsage,/^0(?:\.0+)?$/);
        const finalDenied=await command('abh.operations.claim-query-exit',input);
        let finalChecks=0;
        await assert.rejects(queryOnce(db,receiver,options(),input,policy,transport,finalDenied,async(tx,exit)=>{
          finalChecks++;const [persisted]=await tx.owner('OperationController')`SELECT id FROM execution.query_exits WHERE id=${exit.exitRef.id}`;
          assert.ok(persisted);assert.match((await ledgerOwner.get(tx,budget.ledger.ledgerRef.id)).confirmedUsage,/^1(?:\.0+)?$/);
          exit.digest='sha256:'+'0'.repeat(64);throw new CoreError('PRECONDITION_FAILED');
        }),{code:'PRECONDITION_FAILED'});
        assert.equal(finalChecks,1);assert.equal(calls,0);assert.match((await balance()).confirmedUsage,/^0(?:\.0+)?$/);
        const [rolledBack]=await db.transaction(receiver,options(),tx=>tx.owner('OperationController')`SELECT count(*) AS count FROM execution.query_exits WHERE operation_id=${input.operationRef.id}`);
        assert.equal(Number(rolledBack!.count),0);
        const cmd=finalDenied;
        const mutableInput=structuredClone(input),mutableCommand={...structuredClone(cmd)},mutableOptions={...options()};
        let replacedCalls=0,authorizedCalls=0;
        const mutablePolicy={...structuredClone({policyRef:policy.policyRef,connectorRef:policy.connectorRef,cost:policy.cost,timeoutMs:policy.timeoutMs,minIntervalMs:policy.minIntervalMs}),
          authorize:async function(...args:Parameters<InstalledQueryPolicy['authorize']>){assert.equal(this,mutablePolicy);authorizedCalls++;await policy.authorize(...args);}};
        const mutableTransport={capabilityRef:structuredClone(connector),query:async function(args:{exit:QueryExitRecord;signal:AbortSignal}){
          assert.equal(this,mutableTransport);const raw=await transport.query(args);args.exit.digest='sha256:'+'0'.repeat(64);return raw;
        }};
        const querying=queryOnce(db,receiver,mutableOptions,mutableInput,mutablePolicy,mutableTransport,mutableCommand);
        mutableInput.leaseFencingToken++;mutableCommand.digest='sha256:'+'0'.repeat(64);mutableOptions.deadline=0;
        mutablePolicy.connectorRef.id=randomUUID();mutablePolicy.cost.quantity='999';mutablePolicy.timeoutMs=0;mutablePolicy.minIntervalMs=60_000;
        mutablePolicy.authorize=async()=>{replacedCalls++;throw new Error('replaced policy');};
        mutableTransport.capabilityRef.id=randomUUID();mutableTransport.query=async()=>{replacedCalls++;throw new Error('replaced transport');};
        const observation=await querying;assert.equal(replacedCalls,0);assert.ok(authorizedCalls>0);

        assert.equal(observation.status,'Responded');if(observation.status!=='Responded')throw new Error('missing query response');
        assert.equal(JSON.parse(new TextDecoder().decode(observation.raw)).length,1);await requireQueryOrigin(observation);
        await assert.rejects(requireQueryOrigin(structuredClone(observation)),{code:'OPERATION_FACT_CONFLICT'});
        const original=observation.raw[0]!;observation.raw[0]=0;await assert.rejects(requireQueryOrigin(observation),{code:'OPERATION_FACT_CONFLICT'});observation.raw[0]=original;
        await assert.rejects(queryOnce(db,receiver,options(),input,policy,transport,cmd),{code:'PRECONDITION_FAILED'});assert.equal(calls,1);
        await assert.rejects(queryOnce(db,receiver,options(),input,{...policy,minIntervalMs:60_000},transport),{code:'RESOURCE_EXHAUSTED'});assert.equal(calls,1);
        assert.match((await balance()).confirmedUsage,/^1(?:\.0+)?$/);assert.match((await balance()).heldReservation,/^0(?:\.0+)?$/);
        // Empty query observations are evidence only; they do not close Unknown or clear the resource fence.
        const replacementPack=await compatiblePackFixture(db,receiver,grant),replacement=replacementPack.exact;
        const replacementTransport={capabilityRef:replacement,query:async({exit}:{exit:QueryExitRecord})=>{
          calls++;assert.deepEqual(exit.connectorRef,connector);assert.deepEqual(exit.queryConnectorRef,replacement);assert.equal(exit.providerIdempotencyKey,permit.providerIdempotencyKey);
          return new TextEncoder().encode('[]');
        }};
        await assert.rejects(queryOnce(db,receiver,options(),input,{...policy,connectorRef:replacement},replacementTransport),{code:'PIN_INPUT_CONFLICT'});
        const queryNode=(await db.transaction(receiver,options(),tx=>operations.getPlan(tx,operation.actionRef.id)))!.nodes.find(node=>node.nodeKey===operation.nodeKey)!;
        const compatibilityProof={kind:'CompatibleQueryEvidence',operationRef:operation.operationRef,originalConnectorRef:connector,queryConnectorRef:replacement,connectionRef:queryNode.connectionRef,accountRef:queryNode.accountRef,expiresAt:new Date(Date.now()+60000).toISOString()};
        const proofCommand=await command('abh.artifacts.store-inline',compatibilityProof);
        const compatibilityArtifact=await db.transaction(receiver,options(),tx=>new InlineArtifactOwner().store(tx,proofCommand,{ownerRef:operation.operationRef,mediaType:'application/json',content:canonicalJson(compatibilityProof),dataClass:'abh.data.internal',purposeNames:['abh.operation.reconcile'],sourceRefs:[],region:'local',retentionPolicyRef:scope},async()=>{}));
        let compatibilityAllowed=false;
        const compatiblePolicy={...policy,connectorRef:replacement,compatibility:{evidenceRef:compatibilityArtifact.artifactRef,authorize:async()=>{if(!compatibilityAllowed)throw new CoreError('POLICY_DENIED');}}};
        await assert.rejects(queryOnce(db,receiver,options(),input,compatiblePolicy,replacementTransport),{code:'POLICY_DENIED'});assert.equal(calls,1);assert.match((await balance()).confirmedUsage,/^1(?:\.0+)?$/);
        compatibilityAllowed=true;
        for(const [patch,code] of [[{queryConnectorRef:connector},'PIN_INPUT_CONFLICT'],[{approved:true},'PIN_INPUT_CONFLICT'],[{queryConnectorRef:{...replacement,kind:'Tool'}},'PIN_INPUT_CONFLICT'],[{expiresAt:'2000-01-01T00:00:00Z'},'AUTHORITY_REQUIRED']] as const){
          const content={...compatibilityProof,...patch},cmd=await command('abh.artifacts.store-inline',content);
          const wrong=await db.transaction(receiver,options(),tx=>new InlineArtifactOwner().store(tx,cmd,{ownerRef:operation.operationRef,mediaType:'application/json',content:canonicalJson(content),dataClass:'abh.data.internal',purposeNames:['abh.operation.reconcile'],sourceRefs:[],region:'local',retentionPolicyRef:scope},async()=>{}));
          await assert.rejects(queryOnce(db,receiver,options(),input,{...compatiblePolicy,compatibility:{...compatiblePolicy.compatibility,evidenceRef:wrong.artifactRef}},replacementTransport),{code});
        }
        assert.equal(calls,1);assert.match((await balance()).confirmedUsage,/^1(?:\.0+)?$/);
        const invalidateProof=await command('abh.artifacts.tombstone',compatibilityArtifact.artifactRef);
        await assert.rejects(queryOnce(db,receiver,options(),input,{...compatiblePolicy,lock:async tx=>{
          await new InlineArtifactOwner().tombstone(tx,invalidateProof,compatibilityArtifact.artifactRef,scope,async()=>{});
        }},replacementTransport),{code:'VERSION_CONFLICT'});
        assert.equal(calls,1);assert.match((await balance()).confirmedUsage,/^1(?:\.0+)?$/);
        assert.equal((await db.transaction(receiver,options(),tx=>new InlineArtifactOwner().read(tx,compatibilityArtifact.artifactRef,async()=>{}))).record.status,'Available','denied query rolls back evidence mutation');
        let proofChecks=0;
        await assert.rejects(queryOnce(db,receiver,options(),input,{...compatiblePolicy,compatibility:{...compatiblePolicy.compatibility,authorize:async()=>{if(++proofChecks===2)throw new CoreError('POLICY_DENIED');}}},replacementTransport),{code:'POLICY_DENIED'});
        assert.equal(proofChecks,2);assert.equal(calls,1);
        const originalPins=await db.transaction(receiver,options(),tx=>new StaticReleaseOwner().getPinSet(tx,operation.actionRef));
        assert.ok(originalPins);const originalPin=originalPins.pins.find(pin=>pin.capabilityExactRefs.some(ref=>canonicalJson(ref)===canonicalJson(connector)))!;
        const replacementInstallation={behaviorSlot:originalPin.behaviorSlot,readGrants:[replacementPack.grant.grantRef],admission:replacementPack.admission,
          binding:{exactRef:replacement,registeredKind:'abh.connector',implementationRef:replacementPack.implementationRef,implementation:replacementTransport}};
        const packQuery=(installation=replacementInstallation)=>queryPackOnce(db,receiver,options(),input,compatiblePolicy,installation);
        await assert.rejects(packQuery({...replacementInstallation,readGrants:[]}),{code:'AUTHORITY_REQUIRED'});
        await assert.rejects(packQuery({...replacementInstallation,binding:{...replacementInstallation.binding,implementationRef:scope}}),{code:'PRECONDITION_FAILED'});
        await assert.rejects(packQuery({...replacementInstallation,admission:{...replacementPack.admission,current:async()=>{throw new CoreError('POLICY_DENIED');}}}),{code:'POLICY_DENIED'});
        await assert.rejects(packQuery({...replacementInstallation,admission:{...replacementPack.admission,source:async()=>({refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('bad');}})})}}),{code:'PRECONDITION_FAILED'});
        await assert.rejects(packQuery({...replacementInstallation,admission:{...replacementPack.admission,current:async tx=>{
          await new InlineArtifactOwner().tombstone(tx,invalidateProof,compatibilityArtifact.artifactRef,scope,async()=>{});
        }}}),{code:'VERSION_CONFLICT'});
        assert.equal(calls,1);assert.match((await balance()).confirmedUsage,/^1(?:\.0+)?$/);
        const pauseOriginal=await command('abh.assignments.pause',originalPin.assignmentRef);
        await assert.rejects(db.transaction(receiver,options(),async tx=>{
          const release=new StaticReleaseOwner(),parent=await actions.get(tx,operation.actionRef.id),intent=await actions.getIntent(tx,operation.actionRef.id);
          const request=actions.preparationRequest(tx,intent,[parent.executionAuthorityRef!]);
          await release.stop(tx,pauseOriginal,originalPin.assignmentRef,scope);
          await release.requireHistoricalQueryPin(tx,originalPins,request,originalPin.behaviorSlot,connector);
          await assert.rejects(release.requirePinnedCapability(tx,originalPins,request,originalPin.behaviorSlot,connector),{code:'RELEASE_SCOPE_MISMATCH'});
          throw new Error('rollback isolated Assignment pause');
        }),/rollback isolated Assignment pause/);
        let stableProofChecks=0;
        const emptyObservation=await queryPackOnce(db,receiver,options(),input,{...compatiblePolicy,compatibility:{...compatiblePolicy.compatibility,authorize:async()=>{
          stableProofChecks++;
          if(stableProofChecks%2===0)await assert.rejects(f.admin.begin(async sql=>{await sql`SELECT id FROM data.artifacts WHERE id=${compatibilityArtifact.artifactRef.id} FOR UPDATE NOWAIT`;}),{code:'55P03'},'final compatibility check holds evidence against concurrent tombstone');
        }}},replacementInstallation);
        assert.ok(stableProofChecks>=4);
        assert.deepEqual(await db.transaction(receiver,options(),tx=>new StaticReleaseOwner().getPinSet(tx,operation.actionRef)),originalPins);

        assert.deepEqual(emptyObservation.exit.compatibilityEvidenceRef,compatibilityArtifact.artifactRef);assert.equal(emptyObservation.exit.compatibilityEvidenceDigest,compatibilityArtifact.contentDigest);

        assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,operation.operationRef.id)),operation);
        const unavailableCapture:QueryCaptureChecks={admit:async()=>{throw new Error('capture unavailable');},artifact:async()=>{},storage:async()=>{throw new Error('capture unavailable');},normalize:async()=>{throw new Error('capture unavailable');}};
        const pending=await queryAndCapture([db,receiver,options(),input,{...policy,timeoutMs:500},{capabilityRef:connector,query:async()=>{calls++;return new Promise<Uint8Array>(()=>{});}}],{context:async()=>receiver,options,checks:unavailableCapture});
        assert.equal(pending.status,'CapturePending');if(pending.status!=='CapturePending')throw new Error('missing pending handle');assert.equal(JSON.stringify(pending.pending),'{"kind":"PendingQueryCapture"}');
        await assert.rejects(queryOnce(db,receiver,options(),input,policy,transport),{code:'RESOURCE_EXHAUSTED'});assert.equal(calls,3);assert.equal(fake.calls,1);
        assert.match((await balance()).confirmedUsage,/^3(?:\.0+)?$/);
        await assert.rejects(db.transaction(receiver,options(),async tx=>{
          await assertScopeRuntimePolicy(tx,issued,assets);
          const revokeAuthority=await command('abh.execution-authority.revoke',issued.authorityRef);
          await revokeExecutionAuthority(tx,revokeAuthority,issued.authorityRef,[scope]);
          await assertScopeRuntimePolicy(tx,issued,assets);
        }),{code:'EPOCH_REVOKED'});
        const revokeQuery=await command('abh.grants.revoke',grant.grantRef);await run(revokeQuery,async tx=>(await revokeGrant(tx,revokeQuery,grant.grantRef,[scope])).grantRef);
        await assert.rejects(queryOnce(db,receiver,options(),input,policy,transport,cmd),{code:'EPOCH_REVOKED'});assert.equal(calls,3);
        await assert.rejects(db.transaction(receiver,options(),tx=>resolveScopeAuthoritySource(tx,draft)),{code:'EPOCH_REVOKED'});
        assert.deepEqual(await create(),issued,'same evidence returns history without reviving revoked source');
        assert.deepEqual(await createScopeAuthority(db,receiver,options(),ingressCommand,createInput),issued);
        const revokeManager=await command('abh.grants.revoke',management.grantRef);await run(revokeManager,async tx=>(await revokeGrant(tx,revokeManager,management.grantRef,[scope])).grantRef);
        await assert.rejects(createScopeAuthority(db,receiver,options(),ingressCommand,createInput),{code:'EPOCH_REVOKED'});
        await assert.rejects(db.transaction(receiver,options(),tx=>tx.owner('OperationController')`UPDATE execution.query_exits SET record=record`),{code:'42501'});
        const captureGrant:GrantRecord={...grant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.capture-query']};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${captureGrant.grantRef.id},${service.id},${JSON.stringify(captureGrant)}::text::jsonb,${captureGrant.validFrom},${captureGrant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${captureGrant.grantRef.id},1)`;
        });
        const captureChecks:QueryCaptureChecks={admit:async(tx,op)=>{await assertCurrentGrants(tx,{objectRef:op.operationRef,scopeRefs:[scope],action:'abh.operations.capture-query'},[captureGrant.grantRef]);},artifact:async()=>{},
          storage:async()=>({dataClass:'hello.internal',purposeNames:['abh.operation.reconcile'],region:'local',retentionPolicyRef:scope}),
          normalize:async(node,exit,raw,observedAt)=>({resourceOrganizationId:org,operationId:exit.operationRef.id,connectionRef:node.connectionRef,accountRef:node.accountRef,connectorRef:node.connectorRef,
            providerIdempotencyKey:exit.providerIdempotencyKey,sourceKey:exit.exitRef.id,sourceVersion:'1',source:{kind:'Query',queryAuthorityRef:exit.queryAuthorityRef,coverage:'Partial',visibleThrough:observedAt},observedAt,
            matches:JSON.parse(new TextDecoder().decode(raw)).map((record:{externalId:string;version:number})=>({externalId:record.externalId,sourceVersion:String(record.version),payloadDigest:exit.payloadDigest,effect:'Applied'}))})};
        const captureCmd=await command('abh.operations.capture-query',{exitRef:observation.exit.exitRef});
        await assert.rejects(db.transaction(receiver,options(),tx=>executeCommand(tx,captureCmd,async()=>{},async()=>{await new QueryCaptureOwner().record(tx,captureCmd,observation,captureChecks);throw new Error('rollback query capture');})),/rollback query capture/);
        assert.equal((await db.transaction(receiver,options(),tx=>new OperationReceiptOwner().list(tx,operation.operationRef.id))).length,0);
        const [capture,replayedCapture]=await Promise.all([1,2].map(()=>captureQuery(db,receiver,options(),observation,captureChecks)));assert.deepEqual(capture,replayedCapture);
        assert.equal(capture!.normalization,'Normalized');assert.ok(capture!.receiptRef);assert.ok(capture!.rawArtifactRef);
        const raw=await db.transaction(receiver,options(),tx=>artifacts.read(tx,capture!.rawArtifactRef!,async()=>{}));assert.deepEqual(await decodeReceiptBytes(raw.record,raw.bytes),observation.raw);
        const receipt=await db.transaction(receiver,options(),tx=>new OperationReceiptOwner().get(tx,capture!.receiptRef!));
        const normalized=await db.transaction(receiver,options(),tx=>new OperationReceiptOwner().observation(tx,receipt,async()=>{}));assert.equal(normalized.source.kind,'Query');
        const unsupported=await captureQuery(db,receiver,options(),emptyObservation,{...captureChecks,normalize:async()=>{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}});
        assert.equal(unsupported.normalization,'Unsupported');assert.ok(unsupported.rawArtifactRef);assert.equal(unsupported.receiptRef,undefined);
        assert.equal(calls,3);assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,operation.operationRef.id)),operation);
        let lateContext!:(value:typeof receiver)=>void,refreshSignal:AbortSignal|undefined;
        const stillPending=await retryQueryCapture(pending.pending,{context:async opts=>{refreshSignal=opts.signal;return new Promise(resolve=>{lateContext=resolve;});},options:()=>({...options(),deadline:Date.now()+30}),checks:captureChecks});
        assert.equal(stillPending.status,'CapturePending');assert.equal(refreshSignal?.aborted,true);lateContext(receiver);
        await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,3);
        const recovered=await retryQueryCapture(pending.pending,{context:async()=>receiver,options,checks:captureChecks});assert.equal(recovered.status,'Captured');if(recovered.status!=='Captured')throw new Error('capture retry failed');
        assert.equal(recovered.capture.transportStatus,'Interrupted');assert.equal(recovered.capture.normalization,'NotApplicable');assert.equal(recovered.capture.receiptRef,undefined);assert.equal(calls,3);
        await assert.rejects(retryQueryCapture(pending.pending,{context:async()=>receiver,options,checks:captureChecks}),{code:'PRECONDITION_FAILED'});
        const revokeCapture=await command('abh.grants.revoke',captureGrant.grantRef);await run(revokeCapture,async tx=>(await revokeGrant(tx,revokeCapture,captureGrant.grantRef,[scope])).grantRef);
        await assert.rejects(captureQuery(db,receiver,options(),observation,captureChecks),{code:'EPOCH_REVOKED'});

      });
      await t.test('post-dispatch cancellation preserves uncertainty and budget while stopping pending children atomically',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        fake.mode='ResponseLost';await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake);
        const parent=await db.transaction(execution,options(),tx=>actions.get(tx,value.action.actionRef.id)),before=await children(parent),budget=await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id));
        const cmd=await command('abh.actions.cancel',{actionRef:parent.actionRef,reason:'stop remaining steps'});
        const cancel=(rollback=false)=>db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
          const result=await actions.requestCancellation(tx,cmd,parent.actionRef,'stop remaining steps',async()=>{});if(rollback)throw new Error('cancel rollback');return result.actionRef;
        }));
        await assert.rejects(cancel(true),/cancel rollback/);assert.deepEqual(await children(parent),before);
        assert.deepEqual(await db.transaction(execution,options(),tx=>actions.get(tx,parent.actionRef.id)),parent);
        const cancellationContext=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.action.prepare'}),cancelGrant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.actions.cancel'],purposeNames:['abh.action.prepare']};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${cancelGrant.grantRef.id},${service.id},${JSON.stringify(cancelGrant)}::text::jsonb,${cancelGrant.validFrom},${cancelGrant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${cancelGrant.grantRef.id},1)`;
        });
        const revokeExecution=await command('abh.grants.revoke',value.grant.grantRef);await run(revokeExecution,async tx=>(await revokeGrant(tx,revokeExecution,value.grant.grantRef,[scope])).grantRef);
        const payload={reason:'stop remaining steps'},ingress=await command('abh.actions.cancel',{actionRef:parent.actionRef,payload});
        const invoke=(grants=[cancelGrant.grantRef])=>cancelAction(db,cancellationContext,options(),ingress,parent.actionRef,payload,grants,{fenceRefs:async()=>[],admit:async()=>{}});
        await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});
        const [left,right]=await Promise.all([invoke(),invoke()]);assert.deepEqual(left.actionRef,right.actionRef);assert.equal(left.commandId,right.commandId);assert.notEqual(left.replayed,right.replayed);
        const stopped=await db.transaction(execution,options(),tx=>actions.get(tx,parent.actionRef.id)),after=await children(stopped);
        assert.equal(stopped.position.lifecycle,'Reconciling');assert.equal(stopped.position.outcome,parent.position.outcome);assert.ok(stopped.cancellationRequestedAt);
        assert.deepEqual(after.find(op=>op.attemptCount>0),before.find(op=>op.attemptCount>0));assert.ok(after.filter(op=>op.attemptCount===0).every(op=>op.position.lifecycle==='Cancelled'));
        assert.deepEqual(await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id)),budget);assert.equal(fake.calls,1);
        assert.ok((await db.transaction(execution,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef);
        assert.deepEqual((await invoke()).actionRef,stopped.actionRef);
        const revokeCancel=await command('abh.grants.revoke',cancelGrant.grantRef);await run(revokeCancel,async tx=>(await revokeGrant(tx,revokeCancel,cancelGrant.grantRef,[scope])).grantRef);
        await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
        await assert.rejects(db.transaction(execution,options(),tx=>actions.requestCancellation(tx,cmd,stopped.actionRef,'stop',async()=>{throw new CoreError('FORBIDDEN');})),{code:'FORBIDDEN'});
      });
      await t.test('cancellation competes with a committed Permit exit without enabling another remote call',async()=>{
        for(const concurrent of [false,true]){
          const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
          const parent=await db.transaction(execution,options(),tx=>actions.get(tx,value.action.actionRef.id)),cmd=await command('abh.actions.cancel',parent.actionRef);
          const cancel=()=>db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await actions.requestCancellation(tx,cmd,parent.actionRef,'stop racing exit',async()=>{})).actionRef));
          const send=()=>dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake);
          if(concurrent){const results=await Promise.allSettled([cancel(),send()]);assert.equal(results[0]!.status,'fulfilled');}
          else await cancel();
          const calls=fake.calls;assert.ok(calls<=1);if(!concurrent)assert.equal(calls,0);
          await assert.rejects(send(),{code:'PRECONDITION_FAILED'});assert.equal(fake.calls,calls);
          const stopped=await db.transaction(execution,options(),tx=>actions.get(tx,parent.actionRef.id));assert.equal(stopped.position.lifecycle,'Reconciling');
          const pending=(await children(parent)).find(child=>child.attemptCount===0)!;assert.equal(pending.position.lifecycle,'Cancelled');
          const authorizeCmd=await command('abh.operations.issue-permit',pending.operationRef);
          await assert.rejects(db.transaction(execution,options(),tx=>control.authorize(tx,authorizeCmd,pending.operationRef,value.action.authorizationSnapshotRef!,sourceChecks)),{code:'PRECONDITION_FAILED'});
          assert.equal((await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
          assert.ok((await db.transaction(execution,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef);
        }
      });
      await t.test('crash after committed exit claim leaves an irrevocable query-first claim even with zero fake calls',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken},cmd=await command('abh.operations.claim-exit',permit.permitRef);
        await db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await new DispatchExitOwner().claim(tx,cmd,permit.permitRef,claim,tx=>control.authorizeExit(tx,cmd,permit.permitRef,sourceChecks))).exit.exitRef));
        await assert.rejects(dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake),{code:'PRECONDITION_FAILED'});
        assert.equal(fake.calls,0);assert.equal((await db.transaction(execution,options(),tx=>operations.get(tx,value.operation.operationRef.id))).position.lifecycle,'Dispatching');
      });
      await t.test('late authenticated Receipt is immutable evidence after lease and execution Grant revocation',async()=>{
        const value=await ready(),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        fake.mode='Duplicate';
        const response=await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake);assert.equal(response.status,'Responded');if(response.status!=='Responded')throw new Error('missing response');
        const json=JSON.parse(new TextDecoder().decode(response.raw)),normalized:NormalizedOperationObservation={resourceOrganizationId:org,operationId:value.operation.operationRef.id,connectionRef:value.plan.nodes[0]!.connectionRef,
          accountRef:value.plan.nodes[0]!.accountRef,connectorRef:connector,providerIdempotencyKey:permit.providerIdempotencyKey,sourceKey:json.externalId,sourceVersion:String(json.version),
          source:{kind:'Response',attemptRef:permit.attemptRef},observedAt:new Date().toISOString(),matches:[{externalId:json.externalId,sourceVersion:String(json.version),payloadDigest:permit.payloadDigest,effect:'Applied'}]};
        const raw=await store(new TextDecoder().decode(response.raw),purposeNames),normalizedArtifact=await store(JSON.stringify(normalized),purposeNames);
        const input={receiptKey:await inputDigest({sourceKey:normalized.sourceKey,sourceVersion:normalized.sourceVersion}),rawArtifactRef:raw.artifactRef,normalizedArtifactRef:normalizedArtifact.artifactRef};
        const receiptGrant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.record-receipt','abh.operations.reconcile','abh.operations.apply-reconciliation'],purposeNames:['abh.operation.reconcile'],issuanceEvidenceRef:scope};
        // Separate observation-ingress Grant fixture; the old execution Grant never authorizes recording after revocation.
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
            VALUES (${org},${receiptGrant.grantRef.id},${service.id},${JSON.stringify(receiptGrant)}::text::jsonb,${receiptGrant.validFrom},${receiptGrant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${receiptGrant.grantRef.id},1)`;
        });
        const release=await command('abh.work-leases.release',value.lease.leaseRef);
        await db.transaction(execution,options(),tx=>executeCommand(tx,release,async()=>{},async()=>(await leases.release(tx,release,value.lease.leaseRef,value.lease.workerId,value.lease.fencingToken)).leaseRef));
        const revoke=await command('abh.grants.revoke',value.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,value.grant.grantRef,[scope])).grantRef);
        const receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'}),receipts=new OperationReceiptOwner();
        const checks:ReceiptSourceChecks={admit:async(tx,op)=>{await assertCurrentGrants(tx,{objectRef:op.operationRef,scopeRefs:[scope],action:'abh.operations.record-receipt'},[receiptGrant.grantRef]);},artifact:async()=>{},
          normalize:async(_tx,node,raw,observation)=>{
            const source=JSON.parse(new TextDecoder().decode(raw));
            if(observation.source.kind!=='Response'||source.externalId!==observation.sourceKey||String(source.version)!==observation.sourceVersion||source.providerKey!==observation.providerIdempotencyKey
              ||observation.matches.length!==1||observation.matches[0]!.externalId!==source.externalId||observation.matches[0]!.payloadDigest!==node.payloadDigest||observation.matches[0]!.effect!=='Applied')throw new CoreError('RAW_RECEIPT_UNSUPPORTED');
          }};
        const record=async(payload=input,sourceChecks=checks)=>{const cmd=await command('abh.operations.record-receipt',payload);let receipt;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{receipt=await receipts.record(tx,cmd,value.operation.operationRef,payload,sourceChecks);return receipt.receiptRef;}));return receipt!;};
        const before=await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id));
        const [first,second]=await Promise.all([record(),record()]);assert.deepEqual(first,second);
        assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id)),before,'evidence ingress cannot submit the outcome');
        assert.deepEqual(await db.transaction(receiver,options(),tx=>receipts.observation(tx,first,async()=>{})),normalized);
        assert.deepEqual(await record({...input,rawArtifactRef:(await store(new TextDecoder().decode(response.raw),purposeNames)).artifactRef}),first,'new physical copy of same raw bytes is the same receipt');
        await assert.rejects(record({...input,receiptKey:'invented-key'}),{code:'OPERATION_FACT_CONFLICT'});
        await assert.rejects(record(input,{...checks,normalize:async()=>{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}}),{code:'RAW_RECEIPT_UNSUPPORTED'});
        const changed=await store(JSON.stringify({...normalized,observedAt:new Date(Date.now()+1).toISOString()}),purposeNames);
        await assert.rejects(record({...input,normalizedArtifactRef:changed.artifactRef}),{code:'OPERATION_FACT_CONFLICT'});
        await assert.rejects(db.transaction(receiver,options(),tx=>tx.owner('OperationController')`UPDATE execution.receipts SET record=record`),{code:'42501'});
        await assert.rejects(db.transaction(context(),options(),tx=>receipts.get(tx,first.receiptRef)),{code:'RESOURCE_NOT_FOUND'});
        const reconciliation=new ReconciliationOwner(),comparisonRule:InstalledComparisonRule={ruleRef:value.plan.nodes[0]!.completionPolicyRef,connectorRef:connector,
          compareSourceVersions:(a,b)=>/^\d+$/.test(a)&&/^\d+$/.test(b)?BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0:undefined,verifyNoEffect:async()=>false};
        const comparisonChecks={artifact:async()=>{},admit:async(tx:TenantTransaction,op:typeof before)=>{await assertCurrentGrants(tx,{objectRef:op.operationRef,scopeRefs:[scope],action:'abh.operations.reconcile'},[receiptGrant.grantRef]);}};
        const compare=async(receiptRefs:EntityRef[],rule=comparisonRule)=>{const payload={receiptRefs},cmd=await command('abh.operations.reconcile',payload);let report;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{report=await reconciliation.compare(tx,cmd,before.operationRef,payload,rule,comparisonChecks);return report.reconciliationRef;}));return report!;};
        const successfulReport=await compare([first.receiptRef]);assert.equal(successfulReport.verdict,'ConfirmedSuccess');assert.deepEqual(successfulReport.receiptRefs,[first.receiptRef]);
        assert.deepEqual(await db.transaction(receiver,options(),tx=>reconciliation.get(tx,successfulReport.reconciliationRef)),successfulReport);
        assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id)),before,'comparison service cannot commit Operation state');
        await assert.rejects(compare([first.receiptRef],{...comparisonRule,ruleRef:ref('hello.unpinned-rule')}),{code:'OPERATION_FACT_CONFLICT'});
        assert.equal(fake.records.length,2,'fault injection created a second remote identity');const duplicate=fake.records[1]!;
        const otherRaw=await store(JSON.stringify({externalId:duplicate.externalId,version:duplicate.version,providerKey:duplicate.providerKey}),purposeNames);
        const otherNormalized={...normalized,sourceKey:duplicate.externalId,matches:[{...normalized.matches[0]!,externalId:duplicate.externalId}]};
        const otherArtifact=await store(JSON.stringify(otherNormalized),purposeNames);
        const extra=await record({receiptKey:await inputDigest({sourceKey:otherNormalized.sourceKey,sourceVersion:otherNormalized.sourceVersion}),rawArtifactRef:otherRaw.artifactRef,normalizedArtifactRef:otherArtifact.artifactRef});
        await assert.rejects(compare([first.receiptRef]),{code:'OPERATION_FACT_CONFLICT'},'cannot omit the contradictory persisted receipt');
        const conflicting=await compare([first.receiptRef,extra.receiptRef]);assert.equal(conflicting.verdict,'Conflicting');assert.equal(conflicting.receiptRefs.length,2);
        const claimInput={targetRef:before.operationRef,workerId:randomUUID(),leaseSeconds:30},leaseCommand=await command('abh.work-leases.claim',claimInput);let controllerLease;
        await db.transaction(receiver,options(),tx=>executeCommand(tx,leaseCommand,async()=>{},async()=>{
          controllerLease=await leases.claim(tx,leaseCommand,claimInput,async(tx,ref)=>{const op=await operations.get(tx,ref.id);return (await actions.getIntent(tx,op.actionRef.id)).purposeNames;});return controllerLease.leaseRef;
        }));
        const controller=new OperationController(),controllerChecks={admit:async(tx:TenantTransaction,op:typeof before)=>{await assertCurrentGrants(tx,{objectRef:op.operationRef,scopeRefs:[scope],action:'abh.operations.apply-reconciliation'},[receiptGrant.grantRef]);}};
        const apply=async(reportRef:EntityRef,workerId=controllerLease!.workerId,fail=false)=>{
          const input={reportRef,workerId,leaseRef:controllerLease!.leaseRef,leaseFencingToken:controllerLease!.fencingToken},cmd=await command('abh.operations.apply-reconciliation',input);let result;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{result=await controller.apply(tx,cmd,before.operationRef,input,controllerChecks);if(fail)throw new Error('after outcome CAS');return result.operationRef;}));return result!;
        };
        await assert.rejects(apply(successfulReport.reconciliationRef),{code:'OPERATION_FACT_CONFLICT'},'a report predating a new conflicting receipt cannot close the operation');
        await assert.rejects(apply(conflicting.reconciliationRef,value.lease.workerId),{code:'PRECONDITION_FAILED'});
        await assert.rejects(apply(conflicting.reconciliationRef,controllerLease!.workerId,true),/after outcome CAS/);
        assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,before.operationRef.id)),before);
        const unknown=await apply(conflicting.reconciliationRef);assert.deepEqual(unknown.position,{lifecycle:'Observing',outcome:'Unknown'});
        await db.transaction(receiver,options(),async tx=>{
          assert.equal((await actions.get(tx,value.action.actionRef.id)).position.outcome,'Unknown');
          assert.equal((await new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!))!.unresolvedOperationRef!.id,unknown.operationRef.id);
        });
        assert.equal((await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
        await assert.rejects(apply(conflicting.reconciliationRef),{code:'VERSION_CONFLICT'});

        assert.equal((await db.transaction(receiver,options(),tx=>reconciliation.get(tx,successfulReport.reconciliationRef))).verdict,'ConfirmedSuccess','old report remains immutable evidence');
        await assert.rejects(db.transaction(receiver,options(),tx=>tx.owner('ReconciliationService')`UPDATE execution.reconciliations SET record=record`),{code:'42501'});
        const revokeIngress=await command('abh.grants.revoke',receiptGrant.grantRef);await run(revokeIngress,async tx=>(await revokeGrant(tx,revokeIngress,receiptGrant.grantRef,[scope])).grantRef);
        await assert.rejects(record(),{code:'EPOCH_REVOKED'});
      });
      await t.test('crashed Worker with an expired Permit recovers Unknown without resending or releasing responsibility',async()=>{
        const value=await ready(),permit=await issue(value),receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'}),fake=new FakeProvider(connector);
        const operation=await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id));
        const input={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        const recover=async(ref=operation.operationRef,worker=input.workerId,fail=false)=>{
          const payload={...input,workerId:worker},cmd=await command('abh.operations.recover',payload);let result;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
            result=await new OperationController().recoverExpired(tx,cmd,ref,payload,{admit:async()=>{}});if(fail)throw new Error('after recovery');return result.operationRef;
          }));return result!;
        };
        const parent=await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id)),cancel=await command('abh.actions.cancel',parent.actionRef);
        const cancelled=await db.transaction(receiver,options(),tx=>actions.requestCancellation(tx,cancel,parent.actionRef,'stop before recovery',async()=>{}));
        assert.equal(cancelled.position.lifecycle,'Reconciling');
        const discovered:EntityRef[]=[];let cursor:string|undefined;
        for(;;){const page=await db.transaction(receiver,options(),tx=>operations.pendingReconciliation(tx,3,cursor));assert.ok(page.length<=3);if(!page.length)break;discovered.push(...page);cursor=page.at(-1)!.id;}
        assert.equal(new Set(discovered.map(ref=>ref.id)).size,discovered.length);assert.ok(discovered.some(ref=>ref.id===operation.operationRef.id));
        const cancelledChild=(await children(cancelled)).find(child=>child.attemptCount===0)!;assert.ok(!discovered.some(ref=>ref.id===cancelledChild.operationRef.id));
        await assert.rejects(db.transaction(execution,options(),tx=>operations.pendingReconciliation(tx)),{code:'PURPOSE_DENIED'});
        await assert.rejects(db.transaction(receiver,options(),tx=>operations.pendingReconciliation(tx,101)),{code:'INVALID_ARGUMENT'});
        const foreign=deriveVerifiedContext({...context().request,purposeOfUse:'abh.operation.reconcile'});assert.deepEqual(await db.transaction(foreign,options(),tx=>operations.pendingReconciliation(tx)),[]);

        await assert.rejects(recover(),{code:'PRECONDITION_FAILED'});
        await f.raw`SELECT pg_sleep(5.1)`;
        await assert.rejects(recover(operation.operationRef,randomUUID()),{code:'PRECONDITION_FAILED'});
        await assert.rejects(recover(operation.operationRef,input.workerId,true),/after recovery/);
        assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,operation.operationRef.id)),operation);
        assert.deepEqual((await db.transaction(receiver,options(),tx=>dispatch.observations(tx,permit.attemptRef))).map(observation=>observation.status),['Created']);
        const recoveryGrant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.recover'],purposeNames:['abh.operation.reconcile']};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${recoveryGrant.grantRef.id},${service.id},${JSON.stringify(recoveryGrant)}::text::jsonb,${recoveryGrant.validFrom},${recoveryGrant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${recoveryGrant.grantRef.id},1)`;
        });
        await assert.rejects(recoverPendingOperation(db,receiver,options(),operation.operationRef,input.workerId,[]),{code:'AUTHORITY_REQUIRED'});
        assert.equal(await recoverPendingOperation(db,receiver,options(),operation.operationRef,randomUUID(),[recoveryGrant.grantRef]),undefined,'another live Worker retains its lease');
        const ingress=await command('abh.operations.recover',{operationRef:operation.operationRef,payload:input}),invoke=(refs=[recoveryGrant.grantRef])=>recoverOperation(db,receiver,options(),ingress,operation.operationRef,input,refs);
        await assert.rejects(invoke([]),{code:'AUTHORITY_REQUIRED'});
        const [unknown,replay]=await Promise.all([invoke(),invoke()]);assert.deepEqual(unknown,replay);assert.deepEqual(unknown.position,{lifecycle:'Observing',outcome:'Unknown'});assert.equal(unknown.attemptCount,1);
        const query=await queryView(value.action.actionRef.id);assert.ok(query.data.unresolvedRefs.some(ref=>ref.id===unknown.operationRef.id));assert.ok(query.data.unresolvedRefs.some(ref=>ref.type==='abh.resource-fence'));
        assert.equal(await recoverPendingOperation(db,receiver,options(),unknown.operationRef,input.workerId,[recoveryGrant.grantRef]),undefined,'Observing is left for independent reconciliation');
        const abandoned=await ready(),abandonedPermit=await issue(abandoned);
        const abandonedOperation=await db.transaction(receiver,options(),tx=>operations.get(tx,abandoned.operation.operationRef.id));
        assert.equal(await recoverPendingOperation(db,receiver,options(),abandonedOperation.operationRef,abandoned.lease.workerId,[recoveryGrant.grantRef]),undefined,'unexpired Permit is not interrupted');
        await f.raw`SELECT pg_sleep(5.1)`;
        const recovered=await recoverPendingOperation(db,receiver,options(),abandonedOperation.operationRef,abandoned.lease.workerId,[recoveryGrant.grantRef]);
        assert.deepEqual(recovered!.position,{lifecycle:'Observing',outcome:'Unknown'});assert.equal(recovered!.attemptCount,1);
        assert.deepEqual((await db.transaction(receiver,options(),tx=>dispatch.observations(tx,abandonedPermit.attemptRef))).map(item=>item.status),['Created','Interrupted']);
        const stop=new AbortController();let pages=0,contexts=0;
        await runRecoveryWorker(db,{workerId:randomUUID(),context:async()=>{contexts++;return receiver;},grantRefs:[recoveryGrant.grantRef],signal:stop.signal,pageSize:1,
          onPage:async result=>{pages++;assert.equal(result.scanned,1);stop.abort();}});
        assert.equal(pages,1);assert.equal(contexts,2,'each item receives a freshly supplied Service context');
        const changedContext=deriveVerifiedContext({...receiver.request,actor:{...receiver.tenant.actor,id:randomUUID()}});let calls=0;
        await assert.rejects(runRecoveryWorker(db,{workerId:randomUUID(),context:async()=>++calls===1?receiver:changedContext,grantRefs:[recoveryGrant.grantRef],signal:new AbortController().signal,pageSize:1}),{code:'FORBIDDEN'});
        const revokeRecovery=await command('abh.grants.revoke',recoveryGrant.grantRef);await run(revokeRecovery,async tx=>(await revokeGrant(tx,revokeRecovery,recoveryGrant.grantRef,[scope])).grantRef);
        await assert.rejects(invoke(),{code:'EPOCH_REVOKED'});
        assert.deepEqual((await db.transaction(receiver,options(),tx=>dispatch.observations(tx,permit.attemptRef))).map(observation=>observation.status),['Created','Interrupted']);
        assert.equal(fake.calls,0);assert.equal((await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id))).position.outcome,'Unknown');
        assert.ok((await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef);
        assert.equal((await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
        await assert.rejects(recover(),{code:'VERSION_CONFLICT'});await assert.rejects(recover(unknown.operationRef),{code:'PRECONDITION_FAILED'});
        await assert.rejects(issue(value),{code:'VERSION_CONFLICT'});
        assert.equal((await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id))).position.lifecycle,'Reconciling');
        assert.equal((await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id))).cancellationRequestedAt,cancelled.cancellationRequestedAt);
        const running=await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id)),all=await db.transaction(receiver,options(),tx=>operations.list(tx,running.actionRef.id)),cmd=await command('abh.actions.aggregate',running.actionRef);
        await assert.rejects(db.transaction(receiver,options(),tx=>actions.aggregate(tx,cmd,running.actionRef,tx=>new ActionResultOwner().finalizeOneShot(tx,cmd,running.actionRef,{operationVersionRefs:all.map(op=>op.operationRef)},
          {aggregationRuleRef:definition.completionPolicyRef,admit:async()=>{},settlement:async()=>{throw new Error('Unknown must not reach settlement');}}))),{code:'PRECONDITION_FAILED'});

      });
      await t.test('automatic capture durably preserves raw responses and failures; persistence retries never call the Provider again',async()=>{
        for(const mode of ['Success','ResponseLost','Malformed','Binary','WrongBinding','CaptureFault'] as const){
          const value=await ready(60,true),permit=await issue(value),fake=new FakeProvider(connector);
          if(mode==='ResponseLost')fake.mode=mode;
          const receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'});
          const grant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.capture-transport'],purposeNames:['abh.operation.reconcile'],issuanceEvidenceRef:scope};
          await db.transaction(c,options(),async tx=>{
            await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${grant.grantRef.id},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
            await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
          });
          let injectFailure=mode==='CaptureFault';
          const captureChecks:TransportCaptureChecks={admit:async(tx,operation)=>{await assertCurrentGrants(tx,{objectRef:operation.operationRef,scopeRefs:[scope],action:'abh.operations.capture-transport'},[grant.grantRef]);},
            artifact:async()=>{if(injectFailure)throw new Error('injected after raw/normalized artifacts');},storage:async()=>({dataClass:'hello.internal',purposeNames,region:'local',retentionPolicyRef:scope}),
            normalize:async(node,permit,raw,observedAt)=>{
              let json;try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}
              if(typeof json.externalId!=='string')throw new CoreError('RAW_RECEIPT_UNSUPPORTED');
              return {resourceOrganizationId:org,operationId:mode==='WrongBinding'?randomUUID():permit.operationRef.id,connectionRef:node.connectionRef,accountRef:node.accountRef,connectorRef:connector,
                providerIdempotencyKey:permit.providerIdempotencyKey,sourceKey:json.externalId,sourceVersion:String(json.version),observedAt,source:{kind:'Response',attemptRef:permit.attemptRef},
                matches:[{externalId:json.externalId,sourceVersion:String(json.version),payloadDigest:permit.payloadDigest,effect:'Applied'}]};
            }};
          const destination:CaptureDestination={context:async()=>receiver,options,checks:captureChecks},claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
          let actualRaw:Uint8Array|undefined;
          const transport={capabilityRef:connector,send:async(input:Parameters<FakeProvider['send']>[0])=>{
            const raw=await fake.send(input);actualRaw=mode==='Malformed'?new TextEncoder().encode('{provider unparseable'):mode==='Binary'?new Uint8Array([0,255,254,128]):raw;return actualRaw;
          }};
          const before=await db.transaction(receiver,options(),async tx=>(await tx.owner('ArtifactStore')`SELECT count(*) AS count FROM data.artifacts`)[0]!.count);
          let captured=await dispatchAndCapture([db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,transport],destination);
          if(mode==='CaptureFault'){
            assert.equal(captured.status,'CapturePending');if(captured.status!=='CapturePending')throw new Error('expected pending evidence');
            assert.deepEqual(Object.keys(captured.pending),['kind']);assert.equal(fake.calls,1);
            assert.equal(await db.transaction(receiver,options(),async tx=>(await tx.owner('ArtifactStore')`SELECT count(*) AS count FROM data.artifacts`)[0]!.count),before,'rolled-back capture leaves no source artifacts');
            assert.deepEqual((await db.transaction(receiver,options(),tx=>dispatch.observations(tx,permit.attemptRef))).map(row=>row.status),['Created']);
            let refreshSignal:AbortSignal|undefined;
            const timedOut=await retryTransportCapture(captured.pending,{...destination,options:()=>({...options(),deadline:Date.now()+30}),context:async opts=>{refreshSignal=opts.signal;return new Promise(()=>{});}});
            assert.equal(timedOut.status,'CapturePending');assert.equal(refreshSignal?.aborted,true);assert.equal(fake.calls,1);
            injectFailure=false;const handle=captured.pending;captured=await retryTransportCapture(handle,destination);assert.equal(captured.status,'Captured');
            await assert.rejects(retryTransportCapture(handle,destination),{code:'PRECONDITION_FAILED'});
          }
          assert.equal(captured.status,'Captured');if(captured.status!=='Captured')throw new Error('capture did not commit');
          const record=captured.capture;assert.equal(record.transportStatus,mode==='ResponseLost'?'TransportFailed':'Responded');
          assert.equal(record.normalization,mode==='ResponseLost'?'NotApplicable':['Malformed','Binary','WrongBinding'].includes(mode)?'Unsupported':'Normalized');
          assert.equal(fake.calls,1);assert.equal(fake.records.length,1);assert.equal(Boolean(record.receiptRef),['Success','CaptureFault'].includes(mode));
          if(actualRaw){
            const raw=await db.transaction(receiver,options(),tx=>artifacts.read(tx,record.rawArtifactRef!,async()=>{}));assert.deepEqual(await decodeReceiptBytes(raw.record,raw.bytes),actualRaw);
            if(record.receiptRef){const receipt=await db.transaction(receiver,options(),tx=>new OperationReceiptOwner().get(tx,record.receiptRef!));
              assert.equal((await db.transaction(receiver,options(),tx=>new OperationReceiptOwner().observation(tx,receipt,async()=>{}))).matches[0]!.externalId,fake.records[0]!.externalId);}
          }
          assert.deepEqual((await db.transaction(receiver,options(),tx=>dispatch.observations(tx,permit.attemptRef))).map(row=>row.status),['Created',record.transportStatus]);
          assert.deepEqual((await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id))).position,{lifecycle:'Dispatching',outcome:'Pending'},'transport evidence is not business finality');
          assert.ok((await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef);
          await assert.rejects(db.transaction(receiver,options(),tx=>tx.owner('OperationController')`UPDATE execution.transport_captures SET record=record`),{code:'42501'});
          await assert.rejects(db.transaction(context(),options(),tx=>new TransportCaptureOwner().get(tx,record.captureRef)),{code:'RESOURCE_NOT_FOUND'});
        }
      });
      await t.test('late capture survives execution revocation, rejects fabricated bytes and never reopens an Interrupted Attempt',async()=>{
        const value=await ready(60,true),permit=await issue(value),fake=new FakeProvider(connector),leaseClaim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
        const observation=await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim:leaseClaim},control,sourceChecks,fake);if(observation.status!=='Responded')throw new Error('expected actual response');
        const receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'});
        const captureChecks:TransportCaptureChecks={admit:async()=>{},artifact:async()=>{},storage:async()=>({dataClass:'hello.internal',purposeNames,region:'local',retentionPolicyRef:scope}),
          normalize:async(node,permit,raw,observedAt)=>{const json=JSON.parse(new TextDecoder().decode(raw));return {resourceOrganizationId:org,operationId:permit.operationRef.id,connectionRef:node.connectionRef,accountRef:node.accountRef,connectorRef:connector,
            providerIdempotencyKey:permit.providerIdempotencyKey,sourceKey:json.externalId,sourceVersion:String(json.version),observedAt,source:{kind:'Response',attemptRef:permit.attemptRef},matches:[{externalId:json.externalId,sourceVersion:String(json.version),payloadDigest:permit.payloadDigest,effect:'Applied'}]};}};
        await assert.rejects(captureTransport(db,receiver,options(),{...observation},captureChecks),{code:'OPERATION_FACT_CONFLICT'});
        const saved=new Uint8Array(observation.raw);observation.raw[0]=0;
        await assert.rejects(captureTransport(db,receiver,options(),observation,captureChecks),{code:'OPERATION_FACT_CONFLICT'});observation.raw.set(saved);
        await f.raw`SELECT pg_sleep(5.1)`;
        const operation=await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id)),recover=await command('abh.operations.recover',operation.operationRef);
        await db.transaction(receiver,options(),tx=>executeCommand(tx,recover,async()=>{},async()=>(await new OperationController().recoverExpired(tx,recover,operation.operationRef,leaseClaim,{admit:async()=>{}})).operationRef));
        const revoke=await command('abh.grants.revoke',value.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,value.grant.grantRef,[scope])).grantRef);
        const release=await command('abh.work-leases.release',value.lease.leaseRef);await db.transaction(receiver,options(),tx=>executeCommand(tx,release,async()=>{},async()=>
          (await leases.release(tx,release,value.lease.leaseRef,value.lease.workerId,value.lease.fencingToken)).leaseRef));
        const record=await captureTransport(db,receiver,options(),observation,captureChecks);assert.equal(record.transportStatus,'Responded');assert.ok(record.receiptRef);
        assert.deepEqual((await db.transaction(receiver,options(),tx=>dispatch.observations(tx,permit.attemptRef))).map(row=>row.status),['Created','Interrupted']);
        assert.deepEqual(await captureTransport(db,receiver,options(),observation,captureChecks),record);assert.equal(fake.calls,1);
        await assert.rejects(captureTransport(db,receiver,options(),observation,{...captureChecks,admit:async()=>{throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
        assert.deepEqual((await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id))).position,{lifecycle:'Observing',outcome:'Unknown'});
      });
      await t.test('current Controller applies conclusive success/no-effect and clears only the matching resource generation',async()=>{
        for(const noEffect of [false,true]){
          const value=await ready(60,true),permit=await issue(value),fake=new FakeProvider(connector),claim={workerId:value.lease.workerId,leaseRef:value.lease.leaseRef,leaseFencingToken:value.lease.fencingToken};
          if(noEffect)fake.mode='Rejected';
          const response=await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim},control,sourceChecks,fake);assert.equal(response.status,'Responded');if(response.status!=='Responded')throw new Error('missing raw');
          const receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'}),scopeChecks={admit:async()=>{},artifact:async()=>{}};
          // This scenario isolates finality application. Source admission/no-effect verification are explicit Connector fixtures.
          const proof=ref('hello.no-effect-proof');
          const normalized:NormalizedOperationObservation={resourceOrganizationId:org,operationId:value.operation.operationRef.id,connectionRef:value.plan.nodes[0]!.connectionRef,accountRef:value.plan.nodes[0]!.accountRef,
            connectorRef:connector,providerIdempotencyKey:permit.providerIdempotencyKey,sourceKey:'fixture-query',sourceVersion:'1',source:{kind:'Query',queryAuthorityRef:ref('abh.execution-authority'),coverage:'Complete',visibleThrough:new Date().toISOString(),noEffectEvidenceRef:proof},observedAt:new Date().toISOString(),
            matches:noEffect?[]:[{externalId:fake.records[0]!.externalId,sourceVersion:'1',payloadDigest:permit.payloadDigest,effect:'Applied'}]};
          const raw=await store(new TextDecoder().decode(response.raw),purposeNames),artifact=await store(JSON.stringify(normalized),purposeNames),receipts=new OperationReceiptOwner();
          const payload={receiptKey:await inputDigest({sourceKey:normalized.sourceKey,sourceVersion:normalized.sourceVersion}),rawArtifactRef:raw.artifactRef,normalizedArtifactRef:artifact.artifactRef},receiptCommand=await command('abh.operations.record-receipt',payload);let receipt;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,receiptCommand,async()=>{},async()=>{
            receipt=await receipts.record(tx,receiptCommand,value.operation.operationRef,payload,{...scopeChecks,normalize:async()=>{}});return receipt.receiptRef;
          }));
          const operation=await db.transaction(receiver,options(),tx=>operations.get(tx,value.operation.operationRef.id));
          const waitingWorker=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.runtime.deliver'}),waitingOwner=new OperationReconciliationWaitOwner(),waits=new DurableWaitOwner();
          const waitGrant:GrantRecord={grantRef:ref('abh.grant'),resourceOrganizationId:org,principalRef:service,scopeRefs:[scope],actionTypes:['abh.runtime.register-wait','abh.runtime.recheck-wait','abh.runtime.cancel-wait','abh.runtime.schedule-wakeup','abh.runtime.cancel-wakeup','abh.runtime.signal','abh.runtime.inspect','abh.operations.notify-wait','abh.runtime.consume-event','abh.runtime.prepare-outbox'],purposeNames:['abh.runtime.deliver'],validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+45_000).toISOString(),issuanceEvidenceRef:scope,status:'Active'};
          await db.transaction(c,options(),async tx=>{
            await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${waitGrant.grantRef.id},${service.id},${JSON.stringify(waitGrant)}::text::jsonb,${waitGrant.validFrom},${waitGrant.validUntil},'Active')`;
            await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${waitGrant.grantRef.id},1)`;
          });
          const directory=new WaitContextDirectory(),ctx=directory.register(waitingWorker,[waitGrant.grantRef]),waitPort=new DurableWaitPort(db,directory,waitingOwner.install(waitGrant.grantRef));
          const waitCall=(action:string,target:EntityRef)=>({callId:randomUUID(),requestContextRef:ctx,target:{objectRef:target,scopeRefs:[scope],action},deadline:new Date(Date.now()+5000).toISOString()}),waitOptions={signal:new AbortController().signal};
          const schedule=async(dueAt:string)=>{
            const input={context:waitCall('abh.runtime.schedule-wakeup',operation.operationRef),ownerRef:operation.operationRef,waitKey:randomUUID(),dueAt,causeRef:operation.operationRef};
            const result=await waitPort.scheduleWakeup(input,waitOptions);assert.equal(result.status,'Completed',JSON.stringify(result));if(result.status!=='Completed')throw new Error('Operation wait failed');return result.data.waitRef;
          };
          const deadlineWait=await schedule(new Date(Date.now()-10).toISOString()),pendingWait=await schedule(new Date(Date.now()+30_000).toISOString()),cancelledWait=await schedule(new Date(Date.now()+30_000).toISOString());
          const waitConsumer=waitingOwner.consumer([waitGrant.grantRef]);
          const consumeWait=async(waitRef:EntityRef,cancel=false)=>{
            const wait=await db.transaction(waitingWorker,options(),tx=>waits.get(tx,waitRef));
            const event=await db.transaction(waitingWorker,options(),async tx=>{const [row]=await tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE aggregate_id=${cancel?wait.waitRef.id:wait.wakeupRef!.id} AND record->>'type'=${cancel?'abh.durable-wait.cancel':'abh.durable-wakeup.created'}`;return readCommittedEvent(tx,ref('abh.event',row!.id));});
            const payload={eventRef:{type:'abh.event' as const,id:event.eventId,version:1 as const},eventDigest:await inputDigest(event)},cmd=await command('abh.runtime.prepare-outbox',payload);
            const routing=await db.transaction(waitingWorker,options(),tx=>new OutboxOwner().prepare(tx,cmd,payload,composeWaitNotificationRouter(ref('hello.routing-rule'),new Map([['abh.operation',waitingOwner.router(ref('hello.routing-rule'),ref('hello.consumer'))],['abh.action',{ruleRef:ref('hello.routing-rule'),eventTypes:['abh.durable-wakeup.created','abh.durable-wait.cancel'],route:async()=>{throw new Error('wrong owner router');}}]])),
              {fenceRefs:async()=>[waitGrant.grantRef],admit:async(tx,_event,permission,targetRef)=>{await assertCurrentGrants(tx,{objectRef:targetRef,scopeRefs:[scope],action:permission},[waitGrant.grantRef]);}}));
            assert.equal(routing.deliveries[0]!.job.jobType,'abh.operation.notify-wait');assert.equal(routing.deliveries[0]!.job.authorityRef,undefined);
            return consumeOutboxDelivery(db,waitingWorker,waitOptions.signal,{jobRef:ref('abh.job'),resourceOrganizationId:org,consumerId:waitConsumer.id,job:routing.deliveries[0]!.job},waitConsumer);
          };
          const timedOut=await consumeWait(deadlineWait);assert.equal((await db.transaction(waitingWorker,options(),tx=>waitingOwner.get(tx,timedOut.resultRef))).outcome,'Deadline');
          assert.equal((await waitPort.cancelWakeup({context:waitCall('abh.runtime.cancel-wakeup',cancelledWait),waitRef:cancelledWait,expectedVersion:cancelledWait.version,reason:'stop notification'},waitOptions)).status,'Completed');
          const cancelled=await consumeWait(cancelledWait,true);assert.equal((await db.transaction(waitingWorker,options(),tx=>waitingOwner.get(tx,cancelled.resultRef))).outcome,'Cancelled');
          assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,operation.operationRef.id)),operation);
          assert.equal((await db.transaction(waitingWorker,options(),tx=>waits.get(tx,pendingWait))).status,'Pending');
          assert.equal(fake.calls,1);assert.ok((await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef);
          if(noEffect){const parent=await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id)),stop=await command('abh.actions.cancel',parent.actionRef);
            await db.transaction(receiver,options(),tx=>actions.requestCancellation(tx,stop,parent.actionRef,'cancel before final observation',async()=>{}));}
          const compareCommand=await command('abh.operations.reconcile',receipt!.receiptRef);let report;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,compareCommand,async()=>{},async()=>{
            report=await new ReconciliationOwner().compare(tx,compareCommand,operation.operationRef,{receiptRefs:[receipt!.receiptRef]},
              {ruleRef:value.plan.nodes[0]!.completionPolicyRef,connectorRef:connector,compareSourceVersions:(a,b)=>Number(a)-Number(b),verifyNoEffect:async observation=>noEffect&&fake.records.length===0&&JSON.parse(new TextDecoder().decode(response.raw)).rejected===true&&observation.source.kind==='Query'&&observation.source.noEffectEvidenceRef?.id===proof.id},scopeChecks);return report.reconciliationRef;
          }));
          const input={reportRef:report!.reconciliationRef,workerId:claim.workerId,leaseRef:claim.leaseRef,leaseFencingToken:claim.leaseFencingToken},cmd=await command('abh.operations.apply-reconciliation',input);
          await assert.rejects(db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
            await new OperationController().apply(tx,cmd,operation.operationRef,input,scopeChecks);throw new Error('after final close');
          })),/after final close/);
          assert.ok((await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef,'failed final transaction rolls back resource release');
          const commit=await command('abh.operations.apply-reconciliation',input);let closed;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,commit,async()=>{},async()=>{closed=await new OperationController().apply(tx,commit,operation.operationRef,input,scopeChecks);return closed.operationRef;}));
          assert.deepEqual(closed!.position,{lifecycle:'Closed',outcome:noEffect?'Failed':'Succeeded'});assert.equal(fake.calls,1);assert.equal(fake.records.length,noEffect?0:1);
          await waitPort.recoverPending(waitCall('abh.runtime.inspect',pendingWait),waitOptions);
          const [notification,replayed]=await Promise.all([consumeWait(pendingWait),consumeWait(pendingWait)]);assert.deepEqual(notification,replayed);
          const notified=await db.transaction(waitingWorker,options(),tx=>waitingOwner.get(tx,notification.resultRef));assert.equal(notified.outcome,'SourceClosed');assert.equal(notified.bindingRef.version,2);
          const revokeWait=await command('abh.grants.revoke',waitGrant.grantRef);await run(revokeWait,async tx=>(await revokeGrant(tx,revokeWait,waitGrant.grantRef,[scope])).grantRef);
          await assert.rejects(consumeWait(pendingWait),{code:'EPOCH_REVOKED'});

          assert.equal((await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.unresolvedOperationRef,undefined);
          assert.equal((await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity,'parent resource settlement is separate and cannot run early');
          assert.equal((await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id))).position.lifecycle,noEffect?'Reconciling':'Executing');
          const running=await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id)),results=new ActionResultOwner(),settlementChecks:ActionFinalizationChecks={
            aggregationRuleRef:definition.completionPolicyRef,admit:async()=>{},settlement:async(_tx,data)=>{
              assert.equal(fake.records.length,noEffect?0:1);assert.equal(data.operations.length,1);assert.equal(data.reports.length,1);
              return data.reservations.map(reservation=>({reservationRef:reservation.reservationRef,actualUsage:noEffect?'0':'1',evidenceRef:data.reports[0]!.receiptRefs[0]!}));
            }};
          const aggregate=async(vector=[closed!.operationRef],checks=settlementChecks,fail=false)=>{
            const input={operationVersionRefs:vector},cmd=await command('abh.actions.aggregate',input);let result;
            await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
              result=await actions.aggregate(tx,cmd,running.actionRef,tx=>results.finalizeOneShot(tx,cmd,running.actionRef,input,checks));if(fail)throw new Error('after final aggregate');return result.actionRef;
            }));return result!;
          };
          await assert.rejects(aggregate([operation.operationRef]),{code:'ACTION_CHILD_VERSION_CONFLICT'});
          await assert.rejects(aggregate([closed!.operationRef],{...settlementChecks,settlement:async()=>[]}),{code:'OBLIGATION_CONFLICT'});
          await assert.rejects(aggregate([closed!.operationRef],{...settlementChecks,settlement:async()=>{throw new CoreError('OBLIGATION_CONFLICT');}}),{code:'OBLIGATION_CONFLICT'});
          await assert.rejects(aggregate([closed!.operationRef],settlementChecks,true),/after final aggregate/);
          const orphan=await command('abh.actions.aggregate',running.actionRef);
          await assert.rejects(db.transaction(receiver,options(),tx=>results.finalizeOneShot(tx,orphan,running.actionRef,{operationVersionRefs:[closed!.operationRef]},settlementChecks)),{code:'INTERNAL_ERROR'});
          assert.equal((await db.transaction(receiver,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
          const final=await aggregate();assert.deepEqual(final.position,{lifecycle:'Closed',outcome:noEffect?'Failed':'Succeeded'});assert.ok(final.resultRef);
          const result=await db.transaction(receiver,options(),tx=>results.get(tx,final.resultRef!));assert.equal(result.resourceSettlements.length,1);assert.equal(result.resourceSettlements[0]!.actualUsage,noEffect?'0':'1');
          const balance=await db.transaction(receiver,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id));assert.match(balance.heldReservation,/^0(?:\.0+)?$/);assert.match(balance.confirmedUsage,noEffect?/^0(?:\.0+)?$/:/^1(?:\.0+)?$/);
          await assert.rejects(aggregate(),{code:'VERSION_CONFLICT'});
          await assert.rejects(db.transaction(receiver,options(),tx=>tx.owner('ActionEngine')`UPDATE execution.action_results SET record=record`),{code:'42501'});

        }
      });
      await t.test('declared parent outputs execute a real two-node plan; late parent evidence blocks T2 and exit',async()=>{
        for(const lateAt of ['none','before-permit','before-exit'] as const){
          const value=await ready(),fake=new FakeProvider(connector),receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'});
          const receiverChecks={admit:async()=>{},artifact:async()=>{}},receipts=new OperationReceiptOwner();
          const persist=async(permit:Awaited<ReturnType<typeof issue>>,raw:Uint8Array,late=false)=>{
            const node=value.plan.nodes.find(n=>n.nodeKey=== (permit.operationRef.id===value.operation.operationRef.id?'publish':'announce'))!;
            const json=JSON.parse(new TextDecoder().decode(raw)),normalized:NormalizedOperationObservation={resourceOrganizationId:org,operationId:permit.operationRef.id,
              connectionRef:node.connectionRef,accountRef:node.accountRef,connectorRef:connector,providerIdempotencyKey:permit.providerIdempotencyKey,
              sourceKey:late?'late-fixture-query':json.externalId,sourceVersion:'1',observedAt:new Date().toISOString(),
              source:late?{kind:'Query',queryAuthorityRef:ref('abh.execution-authority'),coverage:'Partial',visibleThrough:new Date().toISOString()}:{kind:'Response',attemptRef:permit.attemptRef},
              matches:late?json.map((row:{externalId:string;version:number})=>({externalId:row.externalId,sourceVersion:String(row.version),payloadDigest:permit.payloadDigest,effect:'Applied'})):
                [{externalId:json.externalId,sourceVersion:String(json.version),payloadDigest:permit.payloadDigest,effect:'Applied'}]};
            const rawArtifact=await store(new TextDecoder().decode(raw),purposeNames),normalizedArtifact=await store(JSON.stringify(normalized),purposeNames);
            const input={receiptKey:await inputDigest({sourceKey:normalized.sourceKey,sourceVersion:normalized.sourceVersion}),rawArtifactRef:rawArtifact.artifactRef,normalizedArtifactRef:normalizedArtifact.artifactRef},cmd=await command('abh.operations.record-receipt',input);let receipt;
            await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
              receipt=await receipts.record(tx,cmd,permit.operationRef,input,{...receiverChecks,normalize:async(_tx,_node,bytes,observation)=>{
                assert.equal(new TextDecoder().decode(bytes),new TextDecoder().decode(raw));assert.deepEqual(observation,normalized);
              }});return receipt.receiptRef;
            }));return receipt!;
          };
          const close=async(current:typeof value,permit:Awaited<ReturnType<typeof issue>>)=>{
            const leaseClaim={workerId:current.lease.workerId,leaseRef:current.lease.leaseRef,leaseFencingToken:current.lease.fencingToken};
            const response=await dispatchOnce(db,execution,options(),{permitRef:permit.permitRef,claim:leaseClaim},control,sourceChecks,fake);
            assert.equal(response.status,'Responded');if(response.status!=='Responded')throw new Error('missing provider response');
            const receipt=await persist(permit,response.raw),operation=await db.transaction(receiver,options(),tx=>operations.get(tx,permit.operationRef.id));
            const compare=await command('abh.operations.reconcile',receipt.receiptRef);let report;
            await db.transaction(receiver,options(),tx=>executeCommand(tx,compare,async()=>{},async()=>{
              report=await new ReconciliationOwner().compare(tx,compare,operation.operationRef,{receiptRefs:[receipt.receiptRef]},
                {ruleRef:definition.completionPolicyRef,connectorRef:connector,compareSourceVersions:(a,b)=>Number(a)-Number(b),verifyNoEffect:async()=>false},receiverChecks);return report.reconciliationRef;
            }));
            assert.equal(report!.payloadDigest,permit.payloadDigest);assert.deepEqual(report!.permitRef,permit.permitRef);
            assert.equal(report!.confirmedExternal!.externalId,fake.query(permit.providerIdempotencyKey)[0]!.externalId);
            const input={...leaseClaim,reportRef:report!.reconciliationRef},cmd=await command('abh.operations.apply-reconciliation',input);let closed;
            await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{closed=await new OperationController().apply(tx,cmd,operation.operationRef,input,receiverChecks);return closed.operationRef;}));
            return {closed:closed!,report:report!};
          };
          const first=await issue(value),parent=await close(value,first),dependent=(await children(value.action)).find(op=>op.nodeKey==='announce')!;
          const consistent=await command('abh.operations.reconcile',parent.closed.operationRef);
          await db.transaction(receiver,options(),tx=>executeCommand(tx,consistent,async()=>{},async()=>{
            const report=await new ReconciliationOwner().compare(tx,consistent,parent.closed.operationRef,{receiptRefs:parent.report.receiptRefs},
              {ruleRef:definition.completionPolicyRef,connectorRef:connector,compareSourceVersions:(a,b)=>Number(a)-Number(b),verifyNoEffect:async()=>false},receiverChecks);
            assert.equal(report.verdict,'ConfirmedSuccess');return report.reconciliationRef;
          }));
          assert.equal((await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)))!.blockedByReportRef,undefined);
          const child={...value,action:await db.transaction(execution,options(),tx=>actions.get(tx,value.action.actionRef.id)),operation:dependent,lease:await claim(dependent.operationRef)};
          const late=async()=>{
            fake.records.push({...fake.records[0]!,externalId:randomUUID()});await persist(first,new TextEncoder().encode(JSON.stringify(fake.query(first.providerIdempotencyKey))),true);
            const before=await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!));
            const all=await db.transaction(receiver,options(),tx=>receipts.list(tx,parent.closed.operationRef.id));
            const payload={receiptRefs:all.map(receipt=>receipt.receiptRef)},cmd=await command('abh.operations.reconcile',payload);
            const compare=(tx:TenantTransaction)=>new ReconciliationOwner().compare(tx,cmd,parent.closed.operationRef,payload,
              {ruleRef:definition.completionPolicyRef,connectorRef:connector,compareSourceVersions:(a,b)=>Number(a)-Number(b),verifyNoEffect:async()=>false},receiverChecks);
            await assert.rejects(db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
              return (await new ReconciliationOwner().compare(tx,cmd,parent.closed.operationRef,payload,
                {ruleRef:definition.completionPolicyRef,connectorRef:connector,compareSourceVersions:(a,b)=>Number(a)-Number(b),verifyNoEffect:async()=>false},
                {...receiverChecks,admit:async()=>{throw new CoreError('FORBIDDEN');}})).reconciliationRef;
            })),{code:'FORBIDDEN'});
            await assert.rejects(db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
              await compare(tx);throw new Error('rollback terminal conflict');
            })),/rollback terminal conflict/);
            assert.deepEqual(await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)),before);
            let recorded;
            if(lateAt==='before-permit'){
              const grant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.reconcile'],purposeNames:['abh.operation.reconcile']};
              await db.transaction(c,options(),async tx=>{
                await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
                  VALUES (${org},${grant.grantRef.id},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
                await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
              });
              const installation={rule:(node:OperationPlanNode)=>({ruleRef:node.completionPolicyRef,connectorRef:node.connectorRef,
                compareSourceVersions:(a:string,b:string)=>Number(a)-Number(b),verifyNoEffect:async()=>false}),fenceRefs:async()=>[],checks:receiverChecks};
              assert.ok((await db.transaction(receiver,options(),tx=>new ReconciliationOwner().pendingClosed(tx))).some(ref=>ref.id===parent.closed.operationRef.id));
              const stop=new AbortController();let compared=0,pages=0;
              await runTerminalReconciliationWorker(db,{context:async()=>receiver,signal:stop.signal,grantRefs:[grant.grantRef],installation,
                pageSize:1,intervalMs:1,onPage:async page=>{compared+=page.compared;pages++;if(!page.scanned)stop.abort();}});
              assert.ok(compared>0);assert.ok(pages>1);
              const pending=await db.transaction(receiver,options(),tx=>new ReconciliationOwner().pendingClosed(tx));assert.equal(pending.length,0);
              const resultRef=await compareClosedOperation(db,receiver,options(),parent.closed.operationRef,[grant.grantRef],installation);
              recorded={receipt:{resultRef}};
              const revoke=await command('abh.grants.revoke',grant.grantRef);
              await db.transaction(c,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[scope]));
              await assert.rejects(compareClosedOperation(db,receiver,options(),parent.closed.operationRef,[grant.grantRef],installation),{code:'EPOCH_REVOKED'});
            }else recorded=await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await compare(tx)).reconciliationRef));
            const slot=await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!));
            assert.deepEqual(slot!.blockedByReportRef,recorded.receipt.resultRef);
            assert.deepEqual(slot!.unresolvedOperationRef,before!.unresolvedOperationRef,'late contradiction must preserve a newer unresolved Operation');
            assert.equal(slot!.fencingToken,before!.fencingToken);
            if(lateAt!=='before-permit'){
              const replay=await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{throw new Error('must not run');}));
              assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt.resultRef,recorded.receipt.resultRef);
            }
            assert.deepEqual(await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)),slot);
            assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,parent.closed.operationRef.id)),parent.closed,'terminal conclusion is immutable');
            const events=await db.transaction(receiver,options(),tx=>tx.owner('DurableExecution')`SELECT record FROM data.outbox WHERE record->>'causationId'=(
              SELECT record->>'causationId' FROM data.outbox WHERE record->'aggregateRef'->>'id'=${recorded.receipt.resultRef.id} LIMIT 1)`);
            assert.deepEqual(events.map(row=>row.record.type).sort(),['abh.reconciliation.created','abh.resource-fence.blocked']);
            {
              const owner=new ExceptionOwner(),reportRef={...recorded.receipt.resultRef,type:'abh.reconciliation' as const},responsibilityRef=ref('abh.responsibility-assignment');
              if(lateAt==='before-exit'){
                const assignment={responsibilityRef,resourceOrganizationId:org,principalRef:ref('abh.principal',c.tenant.actor.id),responsibilityType:'Exception' as const,scopeRefs:[scope],
                  validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),templateRef:scope,status:'Active' as const};
                const cmd=await command('abh.responsibilities.assign',assignment);await run(cmd,tx=>assignResponsibility(tx,cmd,assignment));
              }
              const proposal=await db.transaction(receiver,options(),tx=>owner.proposal(tx,reportRef));
              const request:ResponsibilityRequestRecord={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,kind:'Exception',subjectRef:proposal.sourceRef,
                proposalDigest:proposal.proposalDigest,evidenceRefs:[reportRef],requiredSlots:[{slotId:'review',responsibilityType:'Exception',responsibleOrganizationId:org,
                  selectionMode:'ANY',required:true,dependsOnSlotIds:[],seats:[{seatId:'reviewer',responsibilityRefs:[responsibilityRef]}]}],
                routeRevision:1,decisionRefs:[],expiresAt:new Date(Date.now()+60000).toISOString(),status:'Unresolved'};
              const unsigned:DecisionPackage={requestRef:request.requestRef,routeRevision:1,slotId:'review',subjectRef:proposal.sourceRef,proposalDigest:proposal.proposalDigest,
                question:'Review contradictory evidence',recommendation:'Keep the resource frozen pending verified correction',alternatives:[],impactUpperBound:proposal.impactUpperBound,
                risks:['A responsibility decision alone cannot undo the external effect.'],evidenceRefs:[reportRef],validUntil:request.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)};
              const payload={reportRef,responsibility:{request,packages:[{...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)}]}};
              const grant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),actionTypes:['abh.exceptions.open-terminal'],purposeNames:['abh.operation.reconcile']};
              await db.transaction(c,options(),async tx=>{
                await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
                  VALUES (${org},${grant.grantRef.id},${service.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
                await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${grant.grantRef.id},1)`;
              });
              // Reviewer qualification is installed fixture policy; active local assignment is validated by DecisionOwner.
              const installation={fenceRefs:async()=>[],eligibility:{lock:async()=>{},candidate:async()=>true,submit:async()=>[ref('abh.grant')],revalidate:async()=>{},conditions:async()=>[]}};
              const cmd={...await command('abh.exceptions.open-terminal',payload),idempotencyKey:`exception/${reportRef.id}`};
              await assert.rejects(openTerminalException(db,receiver,options(),cmd,payload,[],installation),{code:'AUTHORITY_REQUIRED'});
              const tampered={...payload,responsibility:{...payload.responsibility,request:{...request,proposalDigest:'sha256:'+'0'.repeat(64)}}};
              await assert.rejects(openTerminalException(db,receiver,options(),await command('abh.exceptions.open-terminal',tampered),tampered,[grant.grantRef],installation),{code:'DECISION_PACKAGE_INCOMPLETE'});
              await assert.rejects(db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,()=>owner.admit(tx,payload,[grant.grantRef],installation),async()=>{
                await owner.open(tx,cmd,payload,[grant.grantRef],installation);throw new Error('exception rollback');
              })),/exception rollback/);
              await assert.rejects(db.transaction(receiver,options(),tx=>new DecisionOwner().getRequest(tx,request.requestRef.id)),{code:'RESOURCE_NOT_FOUND'});
              if(lateAt==='before-permit'){
                assert.ok((await db.transaction(receiver,options(),tx=>owner.pending(tx))).some(ref=>ref.id===reportRef.id));
                const stop=new AbortController(),peerStop=new AbortController();let opened=0,peerOpened=0,peerScanned!:()=>void,committed!:()=>void;
                const scanned=new Promise<void>(resolve=>{peerScanned=resolve;}),created=new Promise<void>(resolve=>{committed=resolve;});
                const alternateRequest={...request,requestRef:ref('abh.responsibility-request')};
                const alternateUnsigned={...unsigned,requestRef:alternateRequest.requestRef};
                const alternate={reportRef,responsibility:{request:alternateRequest,packages:[{...alternateUnsigned,packageDigest:await digestContract('DecisionPackage',alternateUnsigned)}]}};
                const peer=runExceptionWorker(db,{context:async()=>receiver,signal:peerStop.signal,grantRefs:[grant.grantRef],installation,pageSize:1,intervalMs:1,
                  route:async ref=>{assert.deepEqual(ref,reportRef);peerScanned();await created;return alternate;},
                  onPage:async page=>{peerOpened+=page.opened;if(!page.scanned)peerStop.abort();}});
                try{
                  await scanned;
                  await runExceptionWorker(db,{context:async()=>receiver,signal:stop.signal,grantRefs:[grant.grantRef],installation,pageSize:1,intervalMs:1,
                    route:async ref=>{assert.deepEqual(ref,reportRef);return payload;},onPage:async page=>{opened+=page.opened;committed();if(!page.scanned)stop.abort();}});
                  await peer;
                }finally{committed();stop.abort();peerStop.abort();await peer;}
                assert.equal(opened,1);assert.equal(peerOpened,0);assert.equal((await db.transaction(receiver,options(),tx=>owner.pending(tx))).length,0);
                await assert.rejects(db.transaction(receiver,options(),tx=>new DecisionOwner().getRequest(tx,alternateRequest.requestRef.id)),{code:'RESOURCE_NOT_FOUND'});
              }
              const exception=await openTerminalException(db,receiver,options(),cmd,payload,[grant.grantRef],installation);
              assert.equal(exception.category,'TerminalContradiction');assert.deepEqual(exception.blockedScopeRefs,proposal.blockedScopeRefs);
              await assert.rejects(db.transaction(context(),options(),tx=>owner.get(tx,exception.exceptionRef)),{code:'RESOURCE_NOT_FOUND'});
              const opened=await db.transaction(receiver,options(),tx=>new DecisionOwner().getRequest(tx,exception.requestRef.id));
              assert.equal(opened.status,lateAt==='before-exit'?'Open':'Unresolved');
              const inspect=()=>db.transaction(receiver,options(),tx=>owner.inspect(tx,exception.exceptionRef,async(tx,record)=>{
                await assertCurrentGrants(tx,{objectRef:record.reportRef,scopeRefs:[scope],action:'abh.exceptions.open-terminal'},[grant.grantRef]);
              }));
              const inspected=await inspect();
              assert.equal(inspected.responsibility.status,opened.status);assert.equal(inspected.technical.dispatchBlocked,true);
              assert.deepEqual(inspected.technical.position,parent.closed.position);
              assert.deepEqual(inspected.technical.unresolvedOperationRef,slot!.unresolvedOperationRef);
              await assert.rejects(db.transaction(receiver,options(),tx=>owner.inspect(tx,exception.exceptionRef,async()=>{throw new CoreError('FORBIDDEN');})),{code:'FORBIDDEN'});
              if(lateAt==='before-exit'){
                const human=deriveVerifiedContext({...c.request,purposeOfUse:'abh.operation.reconcile'}),decisions=new DecisionOwner();
                const decision=await db.transaction(human,options(),tx=>decisions.getDecision(tx,opened.decisionRefs[0]!.id));
                const submission={response:'Approved' as const,conditionRefs:[],packageDigest:decision.package.packageDigest},cmd=await command('abh.decisions.submit',submission);
                await db.transaction(human,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>(await decisions.submit(tx,cmd,decision.decisionRef,submission,installation.eligibility)).decision.decisionRef));
                assert.equal((await db.transaction(receiver,options(),tx=>decisions.getRequest(tx,opened.requestRef.id))).status,'Closed');
                const closedView=await inspect();assert.equal(closedView.responsibility.status,'Closed');assert.equal(closedView.technical.dispatchBlocked,true);
                assert.ok(closedView.responsibility.requestRef.version>inspected.responsibility.requestRef.version);
                assert.deepEqual(closedView.technical,inspected.technical);
                assert.deepEqual(await db.transaction(receiver,options(),tx=>operations.get(tx,parent.closed.operationRef.id)),parent.closed);
              }
              assert.deepEqual(await openTerminalException(db,receiver,options(),cmd,payload,[grant.grantRef],installation),exception);
              const currentRequest=await db.transaction(receiver,options(),tx=>new DecisionOwner().getRequest(tx,exception.requestRef.id));
              try{
                // Maintenance fault injection: a different evidence binding must not be reported as this Exception's status.
                await f.admin`UPDATE human.requests SET record=${JSON.stringify({...currentRequest,evidenceRefs:[ref('abh.reconciliation')]})}::text::jsonb
                  WHERE resource_organization_id=${org} AND id=${exception.requestRef.id}`;
                await assert.rejects(inspect(),{code:'OPERATION_FACT_CONFLICT'});
              }finally{
                await f.admin`UPDATE human.requests SET record=${JSON.stringify(currentRequest)}::text::jsonb WHERE resource_organization_id=${org} AND id=${exception.requestRef.id}`;
              }
              await assert.rejects(openTerminalException(db,receiver,options(),await command('abh.exceptions.open-terminal',payload),payload,[grant.grantRef],installation),{code:'IDEMPOTENCY_CONFLICT'});
              await assert.rejects(db.transaction(receiver,options(),tx=>tx.owner('HumanGateway')`UPDATE human.exceptions SET record=record`),{code:'42501'});
              assert.deepEqual(await db.transaction(receiver,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[0]!)),slot);
              const revoke=await command('abh.grants.revoke',grant.grantRef);await db.transaction(c,options(),tx=>revokeGrant(tx,revoke,grant.grantRef,[scope]));
              await assert.rejects(openTerminalException(db,receiver,options(),cmd,payload,[grant.grantRef],installation),{code:'EPOCH_REVOKED'});
              await assert.rejects(inspect(),{code:'EPOCH_REVOKED'});
            }
          };
          if(lateAt==='before-permit'){
            const before=await counts();await late();await assert.rejects(issue(child),{code:'PRECONDITION_FAILED'});assert.deepEqual(await counts(),before);assert.equal(fake.calls,1);continue;
          }
          // Installed mapping, Domain admission and current access to source bytes are all mandatory at T2.
          const before=await counts();
          await assert.rejects(issue(child,undefined,undefined,{...sourceChecks,bindings:{...sourceChecks.bindings!,outputs:async()=>[]}}),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
          await assert.rejects(issue(child,undefined,undefined,{...sourceChecks,bindings:{...sourceChecks.bindings!,validate:async()=>{throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');}}}),{code:'ACTION_PLAN_SCOPE_EXCEEDED'});
          await assert.rejects(issue(child,undefined,undefined,{...sourceChecks,artifact:async(_tx,record)=>{if(parent.report.observationRefs.some((ref:EntityRef)=>ref.id===record.artifactRef.id))throw new CoreError('FORBIDDEN');}}),{code:'FORBIDDEN'});
          assert.deepEqual(await counts(),before);
          const second=await issue(child);assert.notEqual(second.payloadRef.id,value.plan.nodes[1]!.payloadRef.id);assert.notEqual(second.payloadDigest,value.plan.nodes[1]!.payloadDigest);
          assert.ok(second.dependencyRefs.some(ref=>ref.id===parent.closed.operationRef.id&&ref.version===parent.closed.operationRef.version));
          assert.ok(second.dependencyRefs.some(ref=>ref.id===parent.report.reconciliationRef.id));assert.equal(second.resourceFencingToken,2);
          const resolved=await db.transaction(execution,options(),tx=>artifacts.read(tx,second.payloadRef,async()=>{}));
          assert.deepEqual(JSON.parse(new TextDecoder().decode(resolved.bytes)),{message:'authorized fixture',externalId:fake.records[0]!.externalId});
          assert.equal(JSON.parse(new TextDecoder().decode((await db.transaction(execution,options(),tx=>artifacts.read(tx,value.plan.nodes[1]!.payloadRef,async()=>{}))).bytes)).externalId,undefined);
          if(lateAt==='before-exit'){
            await late();await assert.rejects(close(child,second),{code:'PRECONDITION_FAILED'});assert.equal(fake.calls,1);
            assert.equal((await db.transaction(execution,options(),tx=>operations.get(tx,dependent.operationRef.id))).position.lifecycle,'Dispatching');
            assert.ok((await db.transaction(execution,options(),tx=>new ResourceFenceOwner().lock(tx,value.plan.nodes[1]!)))!.unresolvedOperationRef);continue;
          }
          await close(child,second);assert.equal(fake.calls,2);assert.equal(fake.records.length,2);
          assert.deepEqual(JSON.parse(new TextDecoder().decode(fake.records[1]!.payload)),{message:'authorized fixture',externalId:fake.records[0]!.externalId});
        const running=await db.transaction(receiver,options(),tx=>actions.get(tx,value.action.actionRef.id)),all=await children(running),cmd=await command('abh.actions.aggregate',running.actionRef);let final;
          await db.transaction(receiver,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
            final=await actions.aggregate(tx,cmd,running.actionRef,tx=>new ActionResultOwner().finalizeOneShot(tx,cmd,running.actionRef,{operationVersionRefs:all.map(op=>op.operationRef)},
              {aggregationRuleRef:definition.completionPolicyRef,admit:async()=>{},settlement:async(_tx,data)=>data.reservations.map(reservation=>({reservationRef:reservation.reservationRef,actualUsage:String(fake.records.length),evidenceRef:data.reports[1]!.receiptRefs[0]!}))}));return final.actionRef;
          }));assert.deepEqual(final!.position,{lifecycle:'Closed',outcome:'Succeeded'});
          const balance=await db.transaction(receiver,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id));assert.match(balance.heldReservation,/^0(?:\.0+)?$/);assert.match(balance.confirmedUsage,/^2(?:\.0+)?$/);
        }
      });
      await t.test('expired short Snapshot refresh preserves original authority, Attempts and resource holds while later independent nodes proceed',async()=>{
        const value=await ready(5,'independent'),firstPermit=await issue(value),old=await db.transaction(execution,options(),tx=>resolver.get(tx,value.action.authorizationSnapshotRef!));
        const running=await db.transaction(execution,options(),tx=>actions.get(tx,value.action.actionRef.id)),refresh=new ActionSnapshotRefresh(assets),before=await count();
        const renew=async(fail=false)=>{const cmd=await command('abh.actions.refresh-authorization',running.actionRef);let next;
          await db.transaction(execution,options(),tx=>executeCommand(tx,cmd,async()=>{},async()=>{
            next=await actions.refreshAuthorization(tx,cmd,running.actionRef,tx=>refresh.refreshOneShot(tx,cmd,running.actionRef,checks));if(fail)throw new Error('after refresh');return next.actionRef;
          }));return next!;
        };
        await assert.rejects(renew(true),/after refresh/);assert.deepEqual(await count(),before);
        const orphan=await command('abh.actions.refresh-authorization',running.actionRef);
        await assert.rejects(db.transaction(execution,options(),tx=>refresh.refreshOneShot(tx,orphan,running.actionRef,checks)),{code:'INTERNAL_ERROR'});
        await assert.rejects(db.transaction(execution,options(),tx=>actions.refreshAuthorization(tx,orphan,running.actionRef,async()=>({kind:'IssuedActionRefresh'}))),{code:'AUTHORITY_REQUIRED'});
        const deny=await configurePolicy('Mandatory','abh_fixture/decision');binding=await activate(deny,binding.bindingRef.version);
        await assert.rejects(renew(),{code:'POLICY_DENIED'});assert.deepEqual(await count(),before);binding=await activate(mandatory,binding.bindingRef.version);
        await f.raw`SELECT pg_sleep(5.1)`;
        const renewed=await renew(),snapshot=await db.transaction(execution,options(),tx=>resolver.get(tx,renewed.authorizationSnapshotRef!));
        assert.deepEqual(renewed.position,running.position);assert.deepEqual(renewed.executionAuthorityRef,running.executionAuthorityRef);assert.deepEqual(renewed.pinSetRef,running.pinSetRef);assert.deepEqual(renewed.planRef,running.planRef);
        assert.deepEqual(snapshot.previousSnapshotRef,old.snapshotRef);assert.deepEqual(snapshot.resourceOriginSnapshotRef,old.snapshotRef);
        assert.equal(snapshot.reservationRefs[0]!.id,old.reservationRefs[0]!.id);assert.ok(snapshot.reservationRefs[0]!.version>old.reservationRefs[0]!.version);assert.ok(Date.parse(snapshot.validUntil)>Date.parse(old.validUntil));
        assert.equal((await count())[2],before[2]);
        const balance=await db.transaction(execution,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id));assert.equal(balance.heldReservation,impact.resourceRequirements[0]!.quantity);
        const pending=(await children(renewed)).find(op=>op.nodeKey==='announce')!,lease=await claim(pending.operationRef),nextPermit=await issue({...value,action:renewed,operation:pending,lease});
        assert.deepEqual(nextPermit.snapshotRef,snapshot.snapshotRef);assert.equal(nextPermit.ordinal,1);
        assert.deepEqual(await db.transaction(execution,options(),tx=>dispatch.getPermit(tx,firstPermit.permitRef)),firstPermit);
        assert.ok((await children(renewed)).every(op=>op.attemptCount===1));
        await assert.rejects(issue({...value,action:renewed}),{code:'VERSION_CONFLICT'});
      });
      await t.test('zero-dispatch cleanup preserves original pins/plan and reauthorization never doubles the hold',async()=>{
        const value=await ready(),cleanup=new ActionCleanupOwner(),checks={fenceRefs:async()=>[],admit:async()=>{}};
        const clean=async(mode:'Cancel'|'Reauthorize'|'Expire',fail=false)=>{const input={mode,reason:'fixture cleanup'},cmd=await command('abh.actions.cleanup',input);let result;
          await run(cmd,async tx=>{result=await actions.cleanupAuthorized(tx,cmd,value.action.actionRef,tx=>cleanup.cleanup(tx,cmd,value.action.actionRef,input,checks));if(fail)throw new Error('after cleanup');return result.actionRef;});return result!;
        };
        await assert.rejects(clean('Expire'),{code:'PRECONDITION_FAILED'},'snapshot expiry alone cannot expire the original intent');
        await assert.rejects(clean('Cancel',true),/after cleanup/);
        const orphan=await command('abh.actions.cleanup',value.action.actionRef);
        await assert.rejects(db.transaction(c,options(),tx=>cleanup.cleanup(tx,orphan,value.action.actionRef,{mode:'Cancel',reason:'fixture'},checks)),{code:'INTERNAL_ERROR'});
        assert.equal((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
        assert.ok((await children(value.action)).every(op=>op.position.lifecycle==='Pending'));
        const validated=await clean('Reauthorize');assert.equal(validated.position.lifecycle,'Validated');assert.equal(validated.authorizationSnapshotRef,undefined);assert.equal(validated.executionAuthorityRef,undefined);
        assert.deepEqual(validated.planRef,value.action.planRef);assert.deepEqual(validated.pinSetRef,value.action.pinSetRef);
        assert.match((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,/^0(?:\.0+)?$/);
        const renewed=await authorize(validated);assert.equal(renewed.position.lifecycle,'Authorized');assert.notEqual(renewed.authorizationSnapshotRef!.id,value.action.authorizationSnapshotRef!.id);
        assert.equal((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
        await db.transaction(execution,options(),async tx=>{
          const old=await resolver.get(tx,value.action.authorizationSnapshotRef!);assert.equal((await ledgerOwner.getReservation(tx,old.reservationRefs[0]!.id)).status,'Released');
          const current=await resolver.get(tx,renewed.authorizationSnapshotRef!);assert.equal((await ledgerOwner.getReservation(tx,current.reservationRefs[0]!.id)).status,'Held');
        });
        const revoke=await command('abh.grants.revoke',value.grant.grantRef);await run(revoke,async tx=>(await revokeGrant(tx,revoke,value.grant.grantRef,[scope])).grantRef);
        const cancellationGrant:GrantRecord={...value.grant,grantRef:ref('abh.grant'),principalRef:ref('abh.principal',c.tenant.actor.id),actionTypes:['abh.actions.cancel'],purposeNames:['abh.action.prepare']};
        await db.transaction(c,options(),async tx=>{
          await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${cancellationGrant.grantRef.id},${c.tenant.actor.id},${JSON.stringify(cancellationGrant)}::text::jsonb,${cancellationGrant.validFrom},${cancellationGrant.validUntil},'Active')`;
          await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${cancellationGrant.grantRef.id},1)`;
        });
        const payload={reason:'withdraw after revocation'},cancel=await command('abh.actions.cancel',{actionRef:renewed.actionRef,payload});
        const invoke=()=>cancelAction(db,c,options(),cancel,renewed.actionRef,payload,[cancellationGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{}});
        await f.admin`CREATE FUNCTION execution.fixture_reject_cancel_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture cleanup rollback'; END; $$`;
        await f.admin`CREATE TRIGGER fixture_reject_cancel_cleanup BEFORE INSERT ON execution.action_cleanups FOR EACH ROW EXECUTE FUNCTION execution.fixture_reject_cancel_cleanup()`;
        try{await assert.rejects(invoke(),/fixture cleanup rollback/);}finally{await f.admin`DROP TRIGGER fixture_reject_cancel_cleanup ON execution.action_cleanups`;await f.admin`DROP FUNCTION execution.fixture_reject_cancel_cleanup()`;}
        assert.equal((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,impact.resourceRequirements[0]!.quantity);
        const results=await Promise.all([invoke(),invoke()]);assert.equal(results.filter(result=>result.replayed).length,1);assert.deepEqual(results[0]!.actionRef,results[1]!.actionRef);assert.equal(results[0]!.commandId,cancel.commandId);
        const cancelled=await db.transaction(c,options(),tx=>actions.get(tx,renewed.actionRef.id));

        assert.equal(cancelled!.position.lifecycle,'Cancelled');assert.ok((await children(cancelled!)).every(op=>op.position.lifecycle==='Cancelled'));
        const racing=await ready(),racePayload={reason:'race public cancellation'},raceCommand=await command('abh.actions.cancel',{actionRef:racing.action.actionRef,payload:racePayload});
        const races=await Promise.allSettled([issue(racing),cancelAction(db,c,options(),raceCommand,racing.action.actionRef,racePayload,[cancellationGrant.grantRef],{fenceRefs:async()=>[],admit:async()=>{}})]);
        assert.equal(races.filter(result=>result.status==='fulfilled').length,1);
        const raceAction=await db.transaction(c,options(),tx=>actions.get(tx,racing.action.actionRef.id)),raceBalance=await db.transaction(c,options(),tx=>ledgerOwner.get(tx,racing.budget.ledger.ledgerRef.id));
        if(raceAction.position.lifecycle==='Cancelled')assert.match(raceBalance.heldReservation,/^0(?:\.0+)?$/);else{assert.equal(raceAction.position.lifecycle,'Executing');assert.equal(raceBalance.heldReservation,impact.resourceRequirements[0]!.quantity);}

        assert.match((await db.transaction(c,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id))).heldReservation,/^0(?:\.0+)?$/);
      });
      await t.test('cleanup competes with Permit under the same fences; no committed Permit can be treated as zero-dispatch',async()=>{
        const value=await ready(),cleanup=new ActionCleanupOwner(),checks={fenceRefs:async()=>[],admit:async()=>{}},input={mode:'Cancel' as const,reason:'race stop'},cmd=await command('abh.actions.cleanup',input);
        const races=await Promise.allSettled([issue(value),run(cmd,async tx=>(await actions.cleanupAuthorized(tx,cmd,value.action.actionRef,tx=>cleanup.cleanup(tx,cmd,value.action.actionRef,input,checks))).actionRef)]);
        assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
        const action=await db.transaction(c,options(),tx=>actions.get(tx,value.action.actionRef.id)),balance=await db.transaction(c,options(),tx=>ledgerOwner.get(tx,value.budget.ledger.ledgerRef.id));
        if(action.position.lifecycle==='Cancelled'){
          assert.match(balance.heldReservation,/^0(?:\.0+)?$/);assert.ok((await children(action)).every(op=>op.attemptCount===0&&op.position.lifecycle==='Cancelled'));
        }else{
          assert.equal(action.position.lifecycle,'Executing');assert.equal(balance.heldReservation,impact.resourceRequirements[0]!.quantity);
          assert.equal((await children(action)).filter(op=>op.attemptCount===1).length,1);
          const next=await command('abh.actions.cleanup',action.actionRef);await assert.rejects(run(next,async tx=>(await actions.cleanupAuthorized(tx,next,action.actionRef,tx=>cleanup.cleanup(tx,next,action.actionRef,input,checks))).actionRef),{code:'PRECONDITION_FAILED'});
        }
      });
      await t.test('unconfirmed parent dependencies and existing unresolved resource slots block dispatch',async()=>{
        const value=await ready(),before=await counts(),dependent=(await children(value.action)).find(op=>op.nodeKey==='announce')!,dependentLease=await claim(dependent.operationRef);
        await assert.rejects(issue({...value,operation:dependent,lease:dependentLease}),{code:'PRECONDITION_FAILED'});assert.deepEqual(await counts(),before);
        const cmd=await command('abh.operations.issue-permit',value.operation.operationRef),node=value.plan.nodes[0]!;
        await db.transaction(execution,options(),tx=>new ResourceFenceOwner().occupy(tx,cmd,node,ref('abh.operation'),purposeNames));
        await assert.rejects(issue(value),{code:'PRECONDITION_FAILED'});
        assert.equal((await children(value.action)).find(op=>op.nodeKey==='publish')!.attemptCount,0);
      });
    });
    await t.test('foreign Workspace Authority or Service Grant cannot authorize an Action',async()=>{
      const next=await setup(),preparedAction=await prepared(next.envelope),before=await count();
      const authorityId=preparedAction.authority.authorityRef.id,grantId=preparedAction.grant.grantRef.id;
      for(const entity of ['authority','grant']){
        if(entity==='authority')await f.admin`UPDATE control.execution_authorities SET workspace_id=${randomUUID()} WHERE resource_organization_id=${org} AND id=${authorityId}`;
        else await f.admin`UPDATE control.grants SET workspace_id=${randomUUID()} WHERE resource_organization_id=${org} AND id=${grantId}`;
        try{
          await assert.rejects(authorize(preparedAction.action),{code:'AUTHORITY_REQUIRED'});assert.deepEqual(await count(),before);
        }finally{
          await f.admin`UPDATE control.execution_authorities SET workspace_id=NULL WHERE resource_organization_id=${org} AND id=${authorityId}`;
          await f.admin`UPDATE control.grants SET workspace_id=NULL WHERE resource_organization_id=${org} AND id=${grantId}`;
        }
      }
    });
    await t.test('approval Grant in another Workspace rejects completed proof at T1 without creating execution facts',async()=>{
      const next=await setup(),preparedAction=await prepared(next.envelope),before=await count();
      await f.admin`UPDATE control.grants SET workspace_id=${randomUUID()} WHERE resource_organization_id=${org} AND id=${approvalGrant.grantRef.id}`;
      try{
        await assert.rejects(authorize(preparedAction.action),{code:'AUTHORITY_REQUIRED'});assert.deepEqual(await count(),before);
        assert.equal((await db.transaction(execution,options(),tx=>actions.get(tx,preparedAction.action.actionRef.id))).position.lifecycle,'Validated');
      }finally{await f.admin`UPDATE control.grants SET workspace_id=NULL WHERE resource_organization_id=${org} AND id=${approvalGrant.grantRef.id}`;}
    });
    await t.test('revoked approval Grant rejects a previously complete Decision proof at T1',async()=>{
      const next=await setup(),preparedAction=await prepared(next.envelope),before=await count();
      const cmd=await command('abh.grants.revoke',approvalGrant.grantRef);await run(cmd,async tx=>(await revokeGrant(tx,cmd,approvalGrant.grantRef,[scope])).grantRef);
      await assert.rejects(authorize(preparedAction.action),{code:'EPOCH_REVOKED'});assert.deepEqual(await count(),before);
      assert.equal((await db.transaction(execution,options(),tx=>actions.get(tx,preparedAction.action.actionRef.id))).position.lifecycle,'Validated');
    });
  });
  await t.test('Assignment pause blocks remaining plan creation and preserves pinned evidence',async()=>{
    const {action,plan,pins}=await prepare(),cmd=await command('abh.assignments.pause',assignment.assignmentRef);
    await run(cmd,tx=>releases.stop(tx,cmd,assignment.assignmentRef,ref('abh.decision')));
    await assert.rejects(register(action,plan),{code:'RELEASE_SCOPE_MISMATCH'});assert.equal((await children(action)).length,0);
    assert.deepEqual(await db.transaction(c,options(),tx=>releases.getPinSet(tx,action.actionRef)),pins);
  });
});
