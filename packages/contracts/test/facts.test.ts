import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateContract } from '../src/schema.ts';
import { lintCatalog } from '../scripts/foundation.mjs';
import { readSources } from '../scripts/generate.mjs';

const id='00000000-0000-4000-8000-000000000001';
const ref=(type:string)=>({type,id,version:1});
const ledger={ledgerRef:ref('abh.ledger'),resourceOrganizationId:id,scopeRef:ref('abh.organization'),resourceType:'abh.resource.cost',meteringMode:'cumulative',unit:'abh.unit.credit',periodRef:ref('abh.period'),limit:'100',confirmedUsage:'0',heldReservation:'0',openCommitment:'0',status:'Open'};

test('ledger facts keep decimals exact and reject capacity usage or commitment',()=> {
  assert.equal(validateContract('LedgerRecord',ledger).success,true);
  for (const patch of [{limit:100},{limit:'-1'},{limit:'1.0000000000001'},{limit:'1e10'},{status:'Unknown'},
    {meteringMode:'capacity',confirmedUsage:'1'},{meteringMode:'capacity',openCommitment:'1'}]) {
    assert.equal(validateContract('LedgerRecord',{...ledger,...patch}).success,false);
  }
  assert.equal(validateContract('LedgerRecord',{...ledger,limit:'99999999999999999999999999.999999999999'}).success,true);
});
test('organization facts and grant dates reject invalid local relationships',()=> {
  const organization={organizationRef:ref('abh.organization'),resourceOrganizationId:id,name:'Test',homeRegion:'local',status:'Active'};
  assert.equal(validateContract('OrganizationRecord',organization).success,true);
  assert.equal(validateContract('OrganizationRecord',{...organization,resourceOrganizationId:'00000000-0000-4000-8000-000000000002'}).success,false);
  const grant={grantRef:ref('abh.grant'),resourceOrganizationId:id,principalRef:ref('abh.principal'),scopeRefs:[ref('abh.organization')],actionTypes:['abh.actions.propose'],purposeNames:['abh.action.prepare'],validFrom:'2026-09-07T00:00:00Z',validUntil:'2026-09-08T00:00:00Z',issuanceEvidenceRef:ref('abh.decision'),status:'Active'};
  assert.equal(validateContract('GrantRecord',grant).success,true);
  assert.equal(validateContract('GrantRecord',{...grant,validUntil:grant.validFrom}).success,false);
  assert.equal(validateContract('GrantRecord',{...grant,actionTypes:[]}).success,false);
});
test('immutable audit, receipt, fence and ledger entries have closed contracts',()=> {
  const digest='sha256:'+'a'.repeat(64),time='2026-09-07T00:00:00Z';
  const records={
    AuditRecord:{auditRef:ref('abh.audit'),resourceOrganizationId:id,actingOrganizationId:id,actor:{type:'Human',id},action:'abh.actions.propose',targetRef:ref('abh.action'),outcome:'abh.outcome.committed',relatedRefs:[],digest,recordedAt:time,correlationId:id},
    CommandReceipt:{commandRef:ref('abh.command'),resourceOrganizationId:id,actorPrincipalId:id,commandType:'abh.actions.propose',idempotencyKey:'test-key',inputDigest:digest,resultRef:ref('abh.action'),committedAt:time},
    FenceRecord:{fenceRef:ref('abh.fence'),resourceOrganizationId:id,scopeRef:ref('abh.organization'),epoch:1,stopFlag:false},
    LedgerEntryRecord:{entryRef:ref('abh.ledger-entry'),resourceOrganizationId:id,ledgerRef:ref('abh.ledger'),entryKey:'test-key',kind:'Reserve',limitDelta:'0',usageDelta:'0',heldDelta:'1',commitmentDelta:'0',sourceRef:ref('abh.reservation'),evidenceRefs:[],effectiveAt:time,recordedAt:time},
  } as const;
  for (const name of Object.keys(records) as (keyof typeof records)[]) {
    assert.equal(validateContract(name,records[name]).success,true,name);
    assert.equal(validateContract(name,{...records[name],rawSql:'sensitive-sentinel'}).success,false,name);
  }
});
test('explicit events must use a registered aggregate and its actual Owner',async()=> {
  const source=await readSources();
  for (const event of [{type:'abh.bad.created',aggregateType:'abh.bad',owner:'Control'},
    {type:'abh.ledger.bad',aggregateType:'abh.ledger',owner:'Control'}]) {
    const protocol=structuredClone(source.protocol);protocol.events.push(event);
    assert.throws(()=>lintCatalog(source.catalog,{},source.states,protocol,source.manifest.version),/event aggregate/);
  }
});

test('Workspace includes its owner and distinct participants; static release slots are unique',()=> {
  const participant={...ref('abh.organization'),id:'00000000-0000-4000-8000-000000000002'};
  const workspace={workspaceRef:ref('abh.workspace'),resourceOrganizationId:id,participantOrganizationRefs:[ref('abh.organization'),participant],scopeContractRef:ref('abh.artifact'),consentEvidenceRefs:[ref('abh.decision'),{...ref('abh.decision'),id:participant.id}],status:'Active',scopeEpoch:1,validUntil:'2026-09-08T00:00:00Z'};
  assert.equal(validateContract('WorkspaceRecord',workspace).success,true);
  assert.equal(validateContract('WorkspaceRecord',{...workspace,participantOrganizationRefs:[participant,{...participant,version:2}]}).success,false);
  const asset={behaviorSlot:'hello.connector',capabilityExactRefs:[{kind:'Connector',id:'hello.connector',version:'0.1.0',digest:'sha256:'+'a'.repeat(64)}]};
  const release={releaseRef:ref('abh.release'),resourceOrganizationId:id,assets:[asset],gateRefs:[ref('abh.artifact')],compatibilityRef:ref('abh.artifact'),status:'Ready'};
  assert.equal(validateContract('ReleaseRecord',release).success,true);
  assert.equal(validateContract('ReleaseRecord',{...release,assets:[asset,{...asset,capabilityExactRefs:[{...asset.capabilityExactRefs[0],version:'0.2.0'}]}]}).success,false);
  const assignment={assignmentRef:ref('abh.assignment'),resourceOrganizationId:id,releaseRef:release.releaseRef,scopeRefs:[ref('abh.organization')],scopeTier:'Organization',status:'Active',selectable:true,executionAllowed:true,evidenceRefs:[ref('abh.decision')]};
  assert.equal(validateContract('StaticAssignmentRecord',assignment).success,true);
  assert.equal(validateContract('StaticAssignmentRecord',{...assignment,status:'Paused'}).success,false);
  assert.equal(validateContract('StaticAssignmentRecord',{...assignment,status:'Retired',selectable:false}).success,true,'normal retirement preserves explicitly retained old execution eligibility');
});

test('commitment facts preserve finite bounds and require zero remaining at closure',()=> {
  const commitment={commitmentRef:ref('abh.commitment'),resourceOrganizationId:id,ledgerRef:ref('abh.ledger'),subjectRef:ref('abh.action'),policyRef:ref('abh.artifact'),upperBound:'9007199254740993.000000000001',remaining:'9007199254740993.000000000001',evidenceRefs:[ref('abh.artifact')],status:'Open'};
  assert.equal(validateContract('CommitmentRecord',commitment).success,true);
  assert.equal(validateContract('CommitmentRecord',{...commitment,remaining:'9007199254740993.000000000002'}).success,false);
  assert.equal(validateContract('CommitmentRecord',{...commitment,status:'Closed'}).success,false);
  assert.equal(validateContract('CommitmentRecord',{...commitment,status:'Closed',remaining:'0.00'}).success,true);
});

test('responsibility routes freeze unique seats and acyclic dependencies',()=> {
  const responsibilityRef=ref('abh.responsibility-assignment');
  const slot={slotId:'approve',responsibilityType:'Authorization',responsibleOrganizationId:id,selectionMode:'ALL',required:true,seats:[{seatId:'first',responsibilityRefs:[responsibilityRef]}],dependsOnSlotIds:[]};
  const request={requestRef:ref('abh.responsibility-request'),resourceOrganizationId:id,kind:'Authorization',subjectRef:ref('abh.action'),proposalDigest:'sha256:'+'a'.repeat(64),evidenceRefs:[ref('abh.artifact')],requiredSlots:[slot],routeRevision:1,decisionRefs:[],expiresAt:'2026-09-08T00:00:00Z',status:'Unresolved'};
  assert.equal(validateContract('ResponsibilityRequestRecord',request).success,true);
  for(const slots of [
    [slot,{...slot,responsibleOrganizationId:'00000000-0000-4000-8000-000000000002'}],
    [{...slot,dependsOnSlotIds:['approve']}],
    [{...slot,required:false}],
    [{...slot,selectionMode:'ANY',seats:[...slot.seats,{seatId:'second',responsibilityRefs:[responsibilityRef]}]}],
  ])assert.equal(validateContract('ResponsibilityRequestRecord',{...request,requiredSlots:slots}).success,false);
});

test('dispatch permits have exact single-attempt bindings and a positive maximum five-second exit window',()=>{
  const permit={permitRef:ref('abh.dispatch-permit'),resourceOrganizationId:id,actionRef:ref('abh.action'),operationRef:ref('abh.operation'),attemptRef:ref('abh.attempt'),ordinal:1,
    snapshotRef:ref('abh.authorization-snapshot'),workerId:id,leaseRef:ref('abh.work-lease'),leaseFencingToken:1,resourceFenceRef:ref('abh.resource-fence'),resourceFencingToken:1,
    connectorRef:{kind:'Connector',id:'hello.connector',version:'0.1.0',digest:'sha256:'+'a'.repeat(64)},payloadRef:ref('abh.artifact'),payloadDigest:'sha256:'+'b'.repeat(64),
    providerIdempotencyKey:'stable-key',dependencyRefs:[],policyEvaluationRefs:[ref('abh.policy-evaluation'),{...ref('abh.policy-evaluation'),id:'00000000-0000-4000-8000-000000000002'}],
    issuedAt:'2026-09-07T00:00:00.123456Z',expiresAt:'2026-09-07T00:00:05.123456Z',digest:'sha256:'+'c'.repeat(64)};
  assert.equal(validateContract('DispatchPermitRecord',permit).success,true);
  for(const patch of [{expiresAt:'2026-09-07T00:00:05.123457Z'},{expiresAt:permit.issuedAt},{expiresAt:'2026-09-07T00:00:00Z'},
    {ordinal:0},{ordinal:5},{leaseFencingToken:0},{policyEvaluationRefs:[]},{connectorRef:{...permit.connectorRef,kind:'Compiler'}},{rawCredential:'secret'}]){
    assert.equal(validateContract('DispatchPermitRecord',{...permit,...patch}).success,false);
  }
});

test('only confirmed success binds a selected external identity and source version',()=>{
  const report={reconciliationRef:ref('abh.reconciliation'),resourceOrganizationId:id,operationRef:ref('abh.operation'),observationRefs:[ref('abh.artifact')],
    comparisonRuleRef:ref('hello.completion-policy'),verdict:'ConfirmedSuccess',reason:'Confirmed exact mutation',recordedAt:'2026-09-07T00:00:00Z',receiptRefs:[ref('abh.operation-receipt')],
    planRef:ref('abh.operation-plan'),permitRef:ref('abh.dispatch-permit'),payloadDigest:'sha256:'+'a'.repeat(64),digest:'sha256:'+'b'.repeat(64)};
  assert.equal(validateContract('OperationReconciliationRecord',report).success,false);
  const confirmedExternal={externalId:'remote-1',sourceVersion:'2'};
  assert.equal(validateContract('OperationReconciliationRecord',{...report,confirmedExternal}).success,true);
  for(const verdict of ['ConfirmedNoEffect','Pending','Ambiguous','Conflicting']){
    assert.equal(validateContract('OperationReconciliationRecord',{...report,verdict}).success,true);
    assert.equal(validateContract('OperationReconciliationRecord',{...report,verdict,confirmedExternal}).success,false);
  }
});

test('transport capture separates raw response evidence from parsed receipts and failure labels',()=>{
  const base={captureRef:ref('abh.transport-capture'),resourceOrganizationId:id,attemptRef:ref('abh.attempt'),exitRef:ref('abh.dispatch-exit'),observationRef:ref('abh.attempt-observation'),
    observedAt:'2026-09-07T00:00:00Z',digest:'sha256:'+'a'.repeat(64),transportStatus:'Responded',normalization:'Normalized',rawArtifactRef:ref('abh.artifact'),receiptRef:ref('abh.operation-receipt')};
  assert.equal(validateContract('TransportCaptureRecord',base).success,true);
  const {receiptRef,rawArtifactRef,...without}=base;
  assert.equal(validateContract('TransportCaptureRecord',{...without,rawArtifactRef,normalization:'Unsupported'}).success,true);
  assert.equal(validateContract('TransportCaptureRecord',{...without,transportStatus:'Interrupted',normalization:'NotApplicable'}).success,true);
  for(const invalid of [{...base,rawArtifactRef:undefined},{...base,receiptRef:undefined},{...base,normalization:'Unsupported'},{...base,transportStatus:'TransportFailed'}]){
    assert.equal(validateContract('TransportCaptureRecord',invalid).success,false);
  }
});

test('Outbox routing freezes unique consumers and binds every job to the same committed source',()=>{
  const eventRef=ref('abh.event'),job={jobType:'abh.action.advance',targetRef:ref('abh.action'),commandRef:ref('abh.command'),dedupeKey:'fixture-route',notBefore:'2026-09-07T00:00:00Z',deadline:'2026-09-07T01:00:00Z',causeRef:eventRef};
  const delivery={consumerId:'hello.first',consumerRef:ref('hello.consumer'),job};
  const routing={routingRef:ref('abh.outbox-routing'),resourceOrganizationId:id,eventRef,eventDigest:'sha256:'+'a'.repeat(64),routingRuleRef:ref('hello.routing-rule'),deliveries:[delivery],preparedAt:'2026-09-07T00:00:00Z',digest:'sha256:'+'b'.repeat(64)};
  assert.equal(validateContract('OutboxRoutingRecord',routing).success,true);
  assert.equal(validateContract('OutboxRoutingRecord',{...routing,deliveries:[]}).success,false);
  assert.equal(validateContract('OutboxRoutingRecord',{...routing,deliveries:[delivery,{...delivery,consumerRef:{...delivery.consumerRef,version:2}}]}).success,false);
  assert.equal(validateContract('OutboxRoutingRecord',{...routing,deliveries:[{...delivery,job:{...job,causeRef:{...eventRef,version:2}}}]}).success,false);
});


test('Decision effect intent never claims application without a target Owner receipt',()=>{
  const record={effectRef:ref('abh.decision-effect'),resourceOrganizationId:id,requestRef:ref('abh.responsibility-request'),routeRevision:1,effectKey:'action-authority',decisionRefs:[ref('abh.decision')],completionEvidenceRef:ref('abh.request-completion-evidence'),targetOwner:'Control',targetRef:ref('abh.action'),commandRef:ref('abh.command'),originatingCommandRef:ref('abh.command'),status:'Pending',recordedAt:'2026-09-08T00:00:00Z'};
  assert.equal(validateContract('DecisionEffectIntentRecord',record).success,true);
  for(const patch of [{status:'Applied'},{receiptRef:ref('abh.receipt')},{decisionRefs:[]},{completionEvidenceRef:ref('abh.decision')},{targetOwner:'Arbitrary'},{effectKey:''},{routeRevision:0}])assert.equal(validateContract('DecisionEffectIntentRecord',{...record,...patch}).success,false);
});


test('Control effect receipt requires the complete Grant and Authority result',()=>{
  const record={receiptRef:ref('abh.command'),resourceOrganizationId:id,effectRef:ref('abh.decision-effect'),requestRef:ref('abh.responsibility-request'),completionEvidenceRef:ref('abh.request-completion-evidence'),authorityRef:ref('abh.execution-authority'),grantRefs:[ref('abh.grant')],inputDigest:'sha256:'+'a'.repeat(64),status:'Applied',appliedAt:'2026-09-08T00:00:00Z'};
  assert.equal(validateContract('DecisionEffectReceiptRecord',record).success,true);
  for(const patch of [{grantRefs:[]},{authorityRef:ref('abh.grant')},{status:'Pending'},{receiptRef:ref('abh.decision')},{inputDigest:'not-a-digest'},{appliedAt:undefined}])assert.equal(validateContract('DecisionEffectReceiptRecord',{...record,...patch}).success,false);
});
