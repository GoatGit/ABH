import {checkSignedConnectorQuery} from './signed-connector-query.ts';
import {dispatchPackAndCapture,retryTransportCapture,type CaptureDestination} from '../src/execution/dispatch-and-capture.ts';
import {TransportCaptureOwner} from '../src/execution/transport-capture.ts';
import {assertCurrentGrants} from '../src/control/grants.ts';
import {DispatchOwner} from '../src/execution/dispatch.ts';
import {DispatchAuthorizationResolver} from '../src/control/dispatch.ts';
import {WorkLeaseOwner} from '../src/durable/work-leases.ts';
import {OperationOwner} from '../src/execution/operations.ts';
import {dispatchPackOnce,type InstalledPackDispatch} from '../src/execution/dispatch-pack-once.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {EntityRef,OperationPlan,GrantRecord,CapabilityRef} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import {createContractCatalog} from '@abh/contracts/catalog';
import type {Database} from '../src/data/uow.ts';
import {contract,inputDigest,executeCommand} from '../src/data/journal.ts';
import {deriveVerifiedContext,type VerifiedContext} from '../src/internal/context.ts';
import {ActionOwner} from '../src/execution/actions.ts';
import {DecisionOwner} from '../src/human/decisions.ts';
import {ExecutionAuthorityOwner} from '../src/control/authority.ts';
import {ResourceEnvelopeOwner} from '../src/resources/envelopes.ts';
import {PurposeOwner} from '../src/control/purposes.ts';
import {ConnectionOwner} from '../src/identity/connections.ts';
import {InstalledPolicyAssets} from '../src/control/policy-assets.ts';
import {PolicyOwner} from '../src/control/policy-owner.ts';
import {ActionAuthorizationResolver} from '../src/control/snapshots.ts';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {options} from './database-fixture.ts';

/** Real Action approval, authority issuance and T1. Deployment/Domain governance
 * remains test-installed, independently of the signed Connector installation. */
export async function checkSignedConnectorAuthorization(database:Database,business:VerifiedContext,input:{actionRef:EntityRef;plan:OperationPlan;behavior:CapabilityRef;responsibilityRef:EntityRef;reviewGrant:GrantRecord;packApprovalRef:EntityRef;installation:Omit<InstalledPackDispatch,'readGrants'>}){
 const ref=<T extends string>(type:T)=>({type,id:randomUUID(),version:1}),identity=async(type:string,value:unknown)=>({type,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(value)});
 const org=business.tenant.resourceOrganizationId,scope={type:'abh.organization',id:org,version:1},actions=new ActionOwner(),decisions=new DecisionOwner();
 const action=await database.transaction(business,options(),tx=>actions.get(tx,input.actionRef.id)),intent=await database.transaction(business,options(),tx=>actions.getIntent(tx,input.actionRef.id)),purposeNames=intent.purposeNames;
 const request=contract('ResponsibilityRequestRecord',{requestRef:ref('abh.responsibility-request'),resourceOrganizationId:org,kind:'Authorization',subjectRef:action.actionRef,proposalDigest:action.payloadDigest,evidenceRefs:[action.payloadArtifactRef,input.plan.planRef],requiredSlots:[{slotId:'execute',responsibilityType:'Authorization',responsibleOrganizationId:org,selectionMode:'ALL',required:true,dependsOnSlotIds:[],seats:[{seatId:'reviewer',responsibilityRefs:[input.responsibilityRef]}]}],routeRevision:1,decisionRefs:[],expiresAt:input.reviewGrant.validUntil,status:'Unresolved'});
 const unsigned=contract('DecisionPackage',{requestRef:request.requestRef,routeRevision:1,slotId:'execute',subjectRef:action.actionRef,proposalDigest:action.payloadDigest,question:'Execute the signed Connector plan?',recommendation:'Inspect bounded operation',alternatives:['Reject'],impactUpperBound:input.plan.impactUpperBound,risks:['External effect'],evidenceRefs:request.evidenceRefs,validUntil:request.expiresAt,allowedResponses:['Approved','Rejected'],packageDigest:'sha256:'+'0'.repeat(64)});
 const pkg={...unsigned,packageDigest:await digestContract('DecisionPackage',unsigned)},proposal={request,packages:[pkg]},open=await identity('abh.responsibility-requests.open',proposal);
 const eligibility={lock:async()=>{},candidate:async()=>true,submit:async()=>[input.reviewGrant.grantRef],revalidate:async()=>{},conditions:async()=>[]};
 const opened=await database.transaction(business,options(),tx=>decisions.open(tx,open,proposal,eligibility));
 const review=deriveVerifiedContext({...business.request,purposeOfUse:'abh.decision.review'}),decision=await database.transaction(review,options(),tx=>decisions.getDecision(tx,opened.decisionRefs[0]!.id));
 const submission={response:'Approved' as const,packageDigest:pkg.packageDigest,conditionRefs:[]},submit=await identity('abh.decisions.submit',{decisionRef:decision.decisionRef,submission});
 const result=await database.transaction(review,options(),tx=>decisions.submit(tx,submit,decision.decisionRef,submission,eligibility));
 const approval=result.completion!.completionEvidenceRef;assert.notDeepEqual(approval,input.packApprovalRef);
 const purpose=contract('PurposeRecord',{purposeRef:ref('abh.purpose'),resourceOrganizationId:org,name:'abh.action.execute',evidenceRefs:[scope],status:'Active'}),catalog=createContractCatalog();assert.ok(catalog.success);
 const purposeCommand=await identity('abh.purposes.configure',purpose);
 await database.transaction(business,options(),tx=>new PurposeOwner().configure(tx,purposeCommand,purpose,catalog.data,async()=>{}));
 // This plan declares no metered resources; it still requires an explicit envelope.
 const unsignedEnvelope=contract('ResourceEnvelopeRecord',{envelopeRef:ref('abh.resource-envelope'),resourceOrganizationId:org,scopeRefs:[scope],bindings:[],evidenceRefs:[approval],purposeNames,digest:'sha256:'+'0'.repeat(64)});
 const envelope={...unsignedEnvelope,digest:await digestContract('ResourceEnvelopeRecord',unsignedEnvelope)},envelopeCommand=await identity('abh.resource-envelopes.configure',envelope);
 await database.transaction(business,options(),tx=>new ResourceEnvelopeOwner().configure(tx,envelopeCommand,envelope,async()=>{}));
 const serviceGrant:GrantRecord={...input.reviewGrant,grantRef:ref('abh.grant'),principalRef:action.executionPrincipalRef,actionTypes:[action.actionType],purposeNames,issuanceEvidenceRef:approval};
 const unsignedAuthority=contract('ExecutionAuthority',{authorityRef:ref('abh.execution-authority'),resourceOrganizationId:org,executionPrincipalRef:action.executionPrincipalRef,allowedProposerRefs:[{type:'abh.principal',id:business.tenant.actor.id,version:1}],binding:{kind:'Action',actionRef:action.actionRef,payloadDigest:action.payloadDigest},grantRefs:[serviceGrant.grantRef],scopeRefs:[scope],purposeRefs:[purpose.purposeRef],actionTypes:[action.actionType],resourceEnvelopeRef:envelope.envelopeRef,validFrom:serviceGrant.validFrom,validUntil:serviceGrant.validUntil,stopConditions:[],issuanceEvidenceRef:approval,effectKey:'signed-connector-execution',issuedBy:business.tenant.actor,sourceVersionRefs:[action.actionRef],issuanceDigest:'sha256:'+'0'.repeat(64),status:'Active'});
 const authority={...unsignedAuthority,issuanceDigest:await digestContract('ExecutionAuthority',unsignedAuthority)},effect={authority,serviceGrant},effectCommand=await identity('abh.execution-authority.issue-effect',effect),authorityChecks={lock:async()=>{},scope:async()=>{},decision:async()=>{}};
 const wrongUnsigned={...authority,issuanceEvidenceRef:{...input.packApprovalRef,type:'abh.request-completion-evidence' as const}},wrongAuthority={...wrongUnsigned,issuanceDigest:await digestContract('ExecutionAuthority',wrongUnsigned)};
 await assert.rejects(database.transaction(business,options(),tx=>new ExecutionAuthorityOwner().issueEffect(tx,effectCommand,{authority:wrongAuthority,serviceGrant:{...serviceGrant,issuanceEvidenceRef:input.packApprovalRef}},authorityChecks)),{code:'EXECUTION_AUTHORITY_SCOPE_EXCEEDED'});
 const issued=await database.transaction(business,options(),tx=>new ExecutionAuthorityOwner().issueEffect(tx,effectCommand,effect,authorityChecks));assert.deepEqual(issued,authority);
 const node=input.plan.nodes[0]!,connection=contract('ConnectionRecord',{connectionRef:node.connectionRef,resourceOrganizationId:org,providerName:'org.example.signed.provider',providerTenantId:'signed-fixture',accountRefs:[node.accountRef],scopeRefs:[scope],connectorRefs:input.plan.connectorRefs,secretRef:ref('abh.secret'),evidenceRefs:[scope],purposeNames,status:'Active'}),connectionCommand=await identity('abh.connections.configure',connection);
 await database.transaction(business,options(),tx=>new ConnectionOwner().configure(tx,connectionCommand,connection,async()=>{}));
 const assets=new InstalledPolicyAssets();
 try{
  const provenance=JSON.parse(await readFile(new URL('./fixtures/policy-provenance.json',import.meta.url),'utf8'));
  const manifest=contract('CompiledPolicyManifest',{formatVersion:'0.1.0',wasmDigest:provenance.wasmDigest,sourceDigest:provenance.sourceDigest,compilerName:'OPA',compilerVersion:'1.20.2',compilerDigest:'sha256:54e7008e696d39e8e4f96594e2b71bcbe45fd9a4f838102bcf1240638bf3fbe1',entrypoints:['abh_fixture/action_decision','abh_fixture/empty_behavior','abh_fixture/scope_decision']});
  const content=canonicalJson(manifest),artifactInput={ownerRef:scope,mediaType:'application/json',content,dataClass:'abh.data.internal',purposeNames,sourceRefs:[scope],region:'local',retentionPolicyRef:scope},artifactCommand=await identity('abh.artifacts.store-inline',artifactInput);
  const artifact=await database.transaction(business,options(),tx=>new InlineArtifactOwner().store(tx,artifactCommand,artifactInput,async()=>{}));
  await assets.install(new TextEncoder().encode(content),await readFile(new URL('./fixtures/policy.wasm',import.meta.url)),new AbortController().signal);
  const policies=new PolicyOwner(),policyChecks={lock:async()=>{},publish:async()=>{},activate:async()=>{}};
  for(const kind of ['Mandatory','Behavior'] as const){
   const unsignedPolicy=contract('PolicyVersionRecord',{policyVersionRef:ref('abh.policy-version'),resourceOrganizationId:org,kind,artifactRef:artifact.artifactRef,manifestDigest:artifact.contentDigest,wasmDigest:manifest.wasmDigest,entrypoint:kind==='Mandatory'?'abh_fixture/action_decision':'abh_fixture/empty_behavior',inputSchemaName:'ActionPolicyInput',ownerRef:scope,releaseEvidenceRefs:[scope],...(kind==='Behavior'?{behaviorCapabilityRef:input.behavior}:{}),digest:'sha256:'+'0'.repeat(64)});
   const policy={...unsignedPolicy,digest:await digestContract('PolicyVersionRecord',unsignedPolicy)},command=await identity('abh.policies.configure',policy);
   await database.transaction(business,options(),tx=>policies.configure(tx,command,{policy,purposeNames},assets,policyChecks));
   if(kind==='Mandatory'){
    const activation={policyVersionRef:policy.policyVersionRef,evidenceRefs:[scope],purposeNames},command=await identity('abh.policies.activate-mandatory',activation);
    await database.transaction(business,options(),tx=>policies.activateMandatory(tx,command,activation,policyChecks));
   }
  }
  const execution=deriveVerifiedContext({...business.request,requestId:randomUUID(),actor:{type:'Service',id:action.executionPrincipalRef.id},purposeOfUse:'abh.action.execute'});
  const readGrant:GrantRecord={...serviceGrant,grantRef:ref('abh.grant'),actionTypes:['abh.capabilities.read'],purposeNames:['abh.action.execute']};
  await database.transaction(business,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${readGrant.grantRef.id},${readGrant.principalRef.id},${JSON.stringify(readGrant)}::text::jsonb,${readGrant.validFrom},${readGrant.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${readGrant.grantRef.id},1)`;
  });
  const resolver=new ActionAuthorizationResolver(assets),checks={fenceRefs:async()=>[readGrant.grantRef],sources:async()=>[],artifact:async()=>{},obligations:async(_tx:unknown,refs:EntityRef[])=>assert.equal(refs.length,0)};
  const command=await identity('abh.actions.request-authorization',action.actionRef);
  await database.transaction(execution,options(),tx=>executeCommand(tx,command,async()=>{},async()=> (await actions.authorize(tx,command,action.actionRef,tx=>resolver.authorizeOneShot(tx,command,action.actionRef,checks))).actionRef));
  const authorized=await database.transaction(execution,options(),tx=>actions.get(tx,action.actionRef.id));assert.equal(authorized.position.lifecycle,'Authorized');assert.deepEqual(authorized.executionAuthorityRef,authority.authorityRef);
  const snapshot=await database.transaction(execution,options(),tx=>resolver.get(tx,authorized.authorizationSnapshotRef!));assert.equal(snapshot.planDigest,input.plan.digest);assert.equal(snapshot.policyEvaluationRefs.length,2);assert.deepEqual(snapshot.reservationRefs,[]);
  assert.ok(snapshot.epochVector.some(fence=>fence.scopeRef.id===readGrant.grantRef.id));
  const operations=new OperationOwner(),operation=(await database.transaction(execution,options(),tx=>operations.list(tx,action.actionRef.id)))[0]!;
  const leaseInput={targetRef:operation.operationRef,workerId:randomUUID(),leaseSeconds:30},leaseCommand=await identity('abh.work-leases.claim',leaseInput);
  const lease=await database.transaction(execution,options(),tx=>new WorkLeaseOwner().claim(tx,leaseCommand,leaseInput,async()=>purposeNames));
  const permitInput={snapshotRef:snapshot.snapshotRef,workerId:lease.workerId,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken},permitCommand=await identity('abh.operations.issue-permit',permitInput);
  const dispatch=new DispatchOwner(),control=new DispatchAuthorizationResolver(assets),dispatchChecks={...checks,target:async()=>{}};
  const permitReceipt=await database.transaction(execution,options(),tx=>executeCommand(tx,permitCommand,async()=>{},async()=> (await dispatch.issue(tx,permitCommand,operation.operationRef,permitInput,tx=>control.authorize(tx,permitCommand,operation.operationRef,snapshot.snapshotRef,dispatchChecks))).permitRef));
  const permit=await database.transaction(execution,options(),tx=>dispatch.getPermit(tx,permitReceipt.receipt.resultRef));assert.deepEqual(permit.connectorRef,input.plan.connectorRefs[0]);
  const exitInput={permitRef:permit.permitRef,claim:{workerId:lease.workerId,leaseRef:lease.leaseRef,leaseFencingToken:lease.fencingToken}},installation={...input.installation,readGrants:[readGrant.grantRef]};
  const receiver=deriveVerifiedContext({...execution.request,requestId:randomUUID(),purposeOfUse:'abh.operation.reconcile'}),captureGrant:GrantRecord={...serviceGrant,grantRef:ref('abh.grant'),actionTypes:['abh.operations.capture-transport'],purposeNames:['abh.operation.reconcile']};
  await database.transaction(business,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status) VALUES (${org},${captureGrant.grantRef.id},${captureGrant.principalRef.id},${JSON.stringify(captureGrant)}::text::jsonb,${captureGrant.validFrom},${captureGrant.validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${org},${randomUUID()},'abh.grant',${captureGrant.grantRef.id},1)`;
  });
  let failCapture=true;
  const destination:CaptureDestination={context:async()=>receiver,options,checks:{
   admit:async(tx,operation)=>{await assertCurrentGrants(tx,{objectRef:operation.operationRef,scopeRefs:[scope],action:'abh.operations.capture-transport'},[captureGrant.grantRef]);},
   artifact:async()=>{if(failCapture)throw new Error('signed capture persistence fault');},storage:async()=>({dataClass:'abh.data.internal',purposeNames,region:'local',retentionPolicyRef:scope}),
   normalize:async(node,permit,raw,observedAt)=>{
    assert.deepEqual(JSON.parse(new TextDecoder().decode(raw)),{accepted:true});
    return {resourceOrganizationId:org,operationId:permit.operationRef.id,connectionRef:node.connectionRef,accountRef:node.accountRef,connectorRef:node.connectorRef,providerIdempotencyKey:permit.providerIdempotencyKey,
     sourceKey:'signed-provider-response',sourceVersion:'1',observedAt,source:{kind:'Response',attemptRef:permit.attemptRef},matches:[{externalId:'signed-provider-response',sourceVersion:'1',payloadDigest:permit.payloadDigest,effect:'Pending'}]};
   },
  }};
  const pending=await dispatchPackAndCapture([database,execution,options(),exitInput,control,dispatchChecks,installation],destination);assert.equal(pending.status,'CapturePending');
  if(pending.status!=='CapturePending')throw new Error('expected capture retry');failCapture=false;
  const captured=await retryTransportCapture(pending.pending,destination);assert.equal(captured.status,'Captured');
  if(captured.status!=='Captured')throw new Error('capture did not recover');
  assert.equal(captured.capture.normalization,'Normalized');assert.ok(captured.capture.rawArtifactRef);assert.ok(captured.capture.receiptRef);
  assert.deepEqual(await database.transaction(receiver,options(),tx=>new TransportCaptureOwner().get(tx,captured.capture.captureRef)),captured.capture);
  await assert.rejects(retryTransportCapture(pending.pending,destination),{code:'PRECONDITION_FAILED'});
  await assert.rejects(dispatchPackOnce(database,execution,options(),exitInput,control,dispatchChecks,installation));

  const query=await checkSignedConnectorQuery(database,receiver,assets,{operationRef:operation.operationRef,dispatchGrant:serviceGrant,claim:exitInput.claim,installation});
  return {...query,manifestBytes:new TextEncoder().encode(content)};
 }finally{await assets.close();}
}
