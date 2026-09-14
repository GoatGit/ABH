import http from 'node:http';

// Demo dataset for `pnpm dev:demo`. Every e2e-pinned identifier keeps its exact behavior;
// additional entities only extend the lists so all workbench pages render with data.
const org='00000000-0000-4000-8000-0000000000c1';
const missionId='00000000-0000-4000-8000-000000000011';
const decisionId='00000000-0000-4000-8000-000000000011';
const runId='00000000-0000-4000-8000-0000000000r1'.replace('r','1');
const queuedRunId='00000000-0000-4000-8000-0000000000q1'.replace('q','1');
const runningRunId='00000000-0000-4000-8000-0000000000c2';
const completedTaskId='00000000-0000-4000-8000-0000000000t1'.replace('t','1');
const queuedTaskId='00000000-0000-4000-8000-0000000000s1'.replace('s','1');
const runningTaskId='00000000-0000-4000-8000-0000000000c3';
const actionId='00000000-0000-4000-8000-000000000021';
const candidateId='00000000-0000-4000-8000-000000000031';
const evaluationRunId='00000000-0000-4000-8000-000000000032';
const inconclusiveEvaluationRunId='00000000-0000-4000-8000-00000000003d';
const requestedEvaluationRunId='00000000-0000-4000-8000-000000000039';
const approvedDecisionId='00000000-0000-4000-8000-0000000000d9';
const digest='sha256:'+'b'.repeat(64);
const asOf='2026-09-11T10:00:00.000Z';
const entity=(type,id,version=1)=>({type,id,version});
const ref=type=>entity(type,'00000000-0000-4000-8000-0000000000f1');
const workflow={kind:'Workflow',id:'demo.workflow',version:'1.0.0',digest};
const actor={type:'Human',id:'00000000-0000-4000-8000-0000000000a1'};
const queryMeta={asOf,watermark:'42',stale:false};

// ---- Missions: one registry entry per demo mission; m1 is the e2e-pinned mission. ----
let missionVersion=3,missionStatus='Active';
const missionSeeds=[
  {id:missionId,domainType:'demo.project',status:()=>missionStatus,version:()=>missionVersion,
    goalRevision:2,stopEpoch:1,pendingTriggers:[],blockers:[],
    actions:()=>missionStatus==='Active'
      ?['pause','cancel','block','revise-goal','close']
      :missionStatus==='Draft'?['activate']:missionStatus==='Paused'?['resume','cancel']:[]},
  {id:'00000000-0000-4000-8000-000000000012',domainType:'demo.billing',status:()=>'Paused',
    version:()=>2,goalRevision:1,stopEpoch:0,pendingTriggers:[],blockers:[],
    actions:()=>['resume','cancel']},
  {id:'00000000-0000-4000-8000-000000000013',domainType:'demo.inventory',status:()=>'Blocked',
    version:()=>4,goalRevision:3,stopEpoch:2,
    pendingTriggers:[],
    blockers:[{blockerRef:entity('abh.mission-blocker','00000000-0000-4000-8000-000000000081',1),
      resourceOrganizationId:org,
      missionRef:entity('abh.mission','00000000-0000-4000-8000-000000000013',4),
      blockerType:'demo.provider-unavailable',
      sourceEvidenceRef:ref('abh.operation'),required:true,resolved:false}],
    actions:()=>['cancel']},
  {id:'00000000-0000-4000-8000-000000000014',domainType:'demo.report',status:()=>'Draft',
    version:()=>1,goalRevision:1,stopEpoch:0,pendingTriggers:[],blockers:[],
    actions:()=>['activate']},
  {id:'00000000-0000-4000-8000-000000000015',domainType:'demo.archive',status:()=>'Completed',
    version:()=>5,goalRevision:2,stopEpoch:1,pendingTriggers:[],blockers:[],
    actions:()=>[]},
  {id:'00000000-0000-4000-8000-000000000016',domainType:'demo.legacy',status:()=>'Cancelled',
    version:()=>2,goalRevision:1,stopEpoch:3,pendingTriggers:[],blockers:[],
    actions:()=>[]},
];
const mission=id=>{
  const seed=missionSeeds.find(entry=>entry.id===id);
  if(!seed)return undefined;
  const missionRef=entity('abh.mission',seed.id,seed.version());
  return {
    missionRef,resourceOrganizationId:org,
    goalArtifactRef:ref('abh.artifact'),goalDigest:digest,goalRevision:seed.goalRevision,
    domainType:seed.domainType,workflowRef:workflow,
    conditionRef:ref('abh.mission-conditions'),
    responsibilityScopeRefs:[ref('abh.organization')],
    status:seed.status(),stopEpoch:seed.stopEpoch,pauseRequested:seed.status()==='Paused',
    cleanupStatus:seed.status()==='Cancelled'?'Pending':'NotRequired',
    purposeNames:['abh.runtime.deliver'],createdBy:actor,createdAt:asOf,updatedAt:asOf,
    authorityRef:seed.status()==='Draft'?undefined:ref('abh.mission-authority'),
  };
};
const missionViewFor=id=>{
  const seed=missionSeeds.find(entry=>entry.id===id);
  if(!seed)return undefined;
  const record=mission(id);
  return {mission:record,
    conditions:{conditionRef:ref('abh.mission-conditions'),resourceOrganizationId:org,
      missionRef:record.missionRef,goalRevision:seed.goalRevision,
      successConditionRef:ref('abh.condition'),stopConditionRef:ref('abh.condition'),
      triggerPolicyRef:ref('abh.policy'),resourceEnvelopeRef:ref('abh.resource-envelope'),digest},
    pendingTriggers:seed.pendingTriggers,blockers:seed.blockers,
    availableActions:seed.actions(),asOf};
};

// ---- Decisions: d1 is the e2e-pinned pending approval; two more pending + one approved. ----
const decisionPackage=(question,slotId,subjectId,impact)=>({
  requestRef:ref('abh.responsibility-request'),routeRevision:1,slotId,
  subjectRef:entity('abh.action',subjectId,2),
  proposalDigest:digest,question,
  recommendation:'Review the impact summary before deciding.',
  alternatives:['Keep the current state.','Request another revision.'],
  impactUpperBound:{scopeRefs:[ref('abh.organization')],resourceRequirements:[],maxMoney:impact.money,
    description:impact.description},
  risks:impact.risks,evidenceRefs:[ref('abh.artifact')],
  validUntil:'2026-09-12T10:00:00.000Z',allowedResponses:['Approved','Rejected'],
  packageDigest:digest,
});
let decision={
  decisionRef:entity('abh.decision',decisionId,1),
  package:decisionPackage('Publish the approved customer brief?','reviewer',
    '00000000-0000-4000-8000-0000000000a5',
    {money:[],description:'Publishes one reviewed brief; no financial spend.',
      risks:['The destination may acknowledge late.']}),
  status:'Pending',effectSummaries:[],availableActions:[],
};
const extraDecisions=[
  {id:'00000000-0000-4000-8000-0000000000d2',
    package:decisionPackage('Approve the Q3 marketing spend of ¥50,000?','approver',
      '00000000-0000-4000-8000-0000000000a6',
      {money:[{amount:'50000.00',currency:'CNY'}],
        description:'Commits quarterly media spend against the approved budget.',
        risks:['Actual platform spend may exceed the reserved amount.']})},
  {id:'00000000-0000-4000-8000-0000000000d3',
    package:decisionPackage('Grant read access to the analytics warehouse?','security-reviewer',
      '00000000-0000-4000-8000-0000000000a7',
      {money:[],description:'Grants one principal read access to aggregated analytics.',
        risks:['Access persists until the next review.','Row-level policies may lag grant approval.']})},
];
const decisionById=id=>{
  if(id===decisionId)return decision;
  const extra=extraDecisions.find(entry=>entry.id===id);
  if(extra)return {...extra,decisionRef:entity('abh.decision',extra.id,1),
    status:'Pending',effectSummaries:[],availableActions:[]};
  if(id===approvedDecisionId)return {...decision,decisionRef:entity('abh.decision',id,2),
    status:'Approved'};
  return undefined;
};

// ---- Actions: 021 is e2e-pinned; the rest cover lifecycle/outcome variety. ----
let actionVersion=4,actionLifecycle='Reconciling',actionOutcome='Unknown';
const operation=(id,lifecycle,outcome)=>({operationRef:entity('abh.operation',id,1),
  position:{lifecycle,outcome}});
const actionSeeds=[
  {id:actionId,type:'demo.publish',version:()=>actionVersion,lifecycle:()=>actionLifecycle,
    outcome:()=>actionOutcome,operations:()=>[operation('00000000-0000-4000-8000-000000000051',
      'Observing','Unknown')],available:()=>[]},
  {id:'00000000-0000-4000-8000-000000000022',type:'demo.notify',version:()=>3,
    lifecycle:()=>'Closed',outcome:()=>'Succeeded',
    operations:()=>[operation('00000000-0000-4000-8000-000000000052','Closed','Succeeded'),
      operation('00000000-0000-4000-8000-000000000053','Closed','Succeeded')],
    available:()=>[]},
  {id:'00000000-0000-4000-8000-000000000023',type:'demo.ingest',version:()=>2,
    lifecycle:()=>'Executing',outcome:()=>'Pending',
    operations:()=>[operation('00000000-0000-4000-8000-000000000054','Dispatching','Unknown')],
    available:()=>['abh.actions.cancel']},
  {id:'00000000-0000-4000-8000-000000000024',type:'demo.reconcile',version:()=>2,
    lifecycle:()=>'Closed',outcome:()=>'Failed',
    operations:()=>[operation('00000000-0000-4000-8000-000000000055','Closed','Failed')],
    available:()=>[]},
  {id:'00000000-0000-4000-8000-000000000025',type:'demo.export',version:()=>1,
    lifecycle:()=>'Authorized',outcome:()=>'NotStarted',
    operations:()=>[operation('00000000-0000-4000-8000-000000000056','Dispatching','Pending')],
    available:()=>['abh.actions.cancel']},
  {id:'00000000-0000-4000-8000-000000000026',type:'demo.cleanup',version:()=>2,
    lifecycle:()=>'Cancelled',outcome:()=>'NotStarted',
    operations:()=>[operation('00000000-0000-4000-8000-000000000057','Pending','NotStarted')],
    available:()=>[]},
  {id:'00000000-0000-4000-8000-000000000027',type:'demo.enrich',version:()=>3,
    lifecycle:()=>'Closed',outcome:()=>'PartiallySucceeded',
    operations:()=>[operation('00000000-0000-4000-8000-000000000058','Closed','Succeeded'),
      operation('00000000-0000-4000-8000-000000000059','Closed','Failed')],
    available:()=>[]},
  {id:'00000000-0000-4000-8000-000000000028',type:'demo.validate',version:()=>1,
    lifecycle:()=>'Rejected',outcome:()=>'NotStarted',
    operations:()=>[],available:()=>[]},
];
const actionView=id=>{
  const seed=actionSeeds.find(entry=>entry.id===id);
  if(!seed)return undefined;
  const outcome=seed.outcome();
  return {
    actionRef:entity('abh.action',seed.id,seed.version()),actionType:seed.type,
    position:{lifecycle:seed.lifecycle(),outcome},
    authorizationSummary:{authorityRef:seed.lifecycle()==='Proposed'
      ?undefined:ref('abh.execution-authority')},
    operationSummary:seed.operations(),
    unresolvedRefs:outcome==='Unknown'||outcome==='Pending'?[ref('abh.operation')]:[],
    availableActions:seed.available(),
  };
};
const compensationActionIds=new Set([actionId,'00000000-0000-4000-8000-000000000024',
  '00000000-0000-4000-8000-000000000027']);

// ---- Runs: m1 keeps its e2e-pinned runs; other missions get their own history. ----
let runningVersion=1,runningStatus='Running',runningTaskStatus='Running';
const run=(id,status,executionMode,version,triggerKey='demo.trigger',missionRefId=missionId)=>({
  runRef:entity('abh.run',id,version),resourceOrganizationId:org,
  missionRef:entity('abh.mission',missionRefId,mission(missionRefId)?.missionRef.version??1),
  triggerKey,goalRevision:2,stopEpoch:1,
  workflowRef:{kind:'Workflow',id:'demo.workflow',version:'1.0.0',digest},
  assignmentSnapshotRef:ref('abh.assignment'),executionMode,status,
  progressBudgetSeconds:900,progressDeadline:'2026-09-11T10:15:00.000Z',
  createdBy:actor,createdAt:asOf,updatedAt:asOf,
});
const runSeeds=[
  {id:runId,status:()=>'Completed',mode:'Production',version:()=>2,trigger:'demo.trigger',
    mission:missionId},
  {id:runningRunId,status:()=>runningStatus,mode:'Production',version:()=>runningVersion,
    trigger:'cancel.trigger',mission:missionId},
  {id:queuedRunId,status:()=>'Queued',mode:'Shadow',version:()=>1,trigger:'demo.trigger',
    mission:missionId},
  {id:'00000000-0000-4000-8000-000000000074',status:()=>'Waiting',
    mode:'Production',version:()=>1,trigger:'billing.cycle',
    mission:'00000000-0000-4000-8000-000000000012'},
  {id:'00000000-0000-4000-8000-000000000075',status:()=>'Completed',
    mode:'Production',version:()=>3,trigger:'archive.sweep',
    mission:'00000000-0000-4000-8000-000000000015'},
  {id:'00000000-0000-4000-8000-000000000076',status:()=>'Cancelled',
    mode:'Shadow',version:()=>1,trigger:'archive.scan',
    mission:'00000000-0000-4000-8000-000000000015'},
];
const runsFor=missionRefId=>runSeeds.filter(seed=>seed.mission===missionRefId)
  .map(seed=>run(seed.id,seed.status(),seed.mode,seed.version(),seed.trigger,seed.mission));
const task=(id,runRef,nodeKey,kind,status,required,attempt)=>({
  taskRef:entity('abh.task',id,1),resourceOrganizationId:org,runRef,
  nodeKey:nodeKey,kind,inputRefs:[ref('abh.artifact')],status,required,
  attemptOrdinal:attempt,createdAt:asOf,updatedAt:asOf,
});
const runView=id=>{
  const seed=runSeeds.find(entry=>entry.id===id);
  if(!seed)return undefined;
  const runRef=entity('abh.run',id,seed.version());
  if(id===runId)return {run:run(id,'Completed','Production',2,'demo.trigger',missionId),tasks:[
    task(completedTaskId,runRef,'demo.publish','DomainCommand','Succeeded',true,1),
    task(queuedTaskId,runRef,'demo.audit','Wait','Skipped',false,1),
  ],asOf};
  if(id===runningRunId)return {run:run(id,runningStatus,'Production',runningVersion,
    'cancel.trigger',missionId),tasks:[
    task(runningTaskId,runRef,'demo.execute','DomainCommand',runningTaskStatus,true,1),
  ],asOf};
  if(id===queuedRunId)return {run:run(id,'Queued','Shadow',1,'demo.trigger',missionId),tasks:[
    task(queuedTaskId,runRef,'demo.publish','DomainCommand','Ready',true,1),
  ],asOf};
  if(id==='00000000-0000-4000-8000-000000000074'){
    const waiting=run(id,'Waiting','Production',1,'billing.cycle',
      '00000000-0000-4000-8000-000000000012');
    return {run:waiting,tasks:[
      task('00000000-0000-4000-8000-000000000061',runRef,'billing.emit','DomainCommand',
        'Waiting',true,1),
      task('00000000-0000-4000-8000-000000000062',runRef,'billing.confirm','Wait',
        'Blocked',false,1),
    ],asOf};
  }
  if(id==='00000000-0000-4000-8000-000000000075'){
    const done=run(id,'Completed','Production',3,'archive.sweep',
      '00000000-0000-4000-8000-000000000015');
    return {run:done,tasks:[
      task('00000000-0000-4000-8000-000000000063',runRef,'archive.scan','DomainCommand',
        'Succeeded',true,1),
      task('00000000-0000-4000-8000-000000000064',runRef,'archive.verify','DomainCommand',
        'Succeeded',true,2),
    ],asOf};
  }
  const cancelled=run(id,'Cancelled','Shadow',1,'archive.scan',
    '00000000-0000-4000-8000-000000000015');
  return {run:cancelled,tasks:[
    task('00000000-0000-4000-8000-000000000065',runRef,'archive.stage','DomainCommand',
      'Cancelled',true,1),
  ],asOf};
};

// ---- Learning: c31 is e2e-pinned; extra candidates add Pass/Failed variety. ----
const learningCandidate=(id,assetKind,baseVersion,artifactSuffix)=>({
  candidateRef:entity('abh.learning-candidate',id,1),resourceOrganizationId:org,
  caseRef:entity('abh.learning-case','00000000-0000-4000-8000-000000000033',1),
  assetKind,baseVersion,
  candidateArtifactRef:entity('abh.artifact',`00000000-0000-4000-8000-0000000000${artifactSuffix}`,1),
  scopeRef:entity('abh.organization',org,1),risk:'learning.low',status:'Draft',
  producer:actor,receiptRef:entity('abh.command','00000000-0000-4000-8000-000000000035',1),
  createdAt:asOf,digest,
});
const candidates=()=>[
  learningCandidate(candidateId,'model.prompt',3,'34'),
  learningCandidate('00000000-0000-4000-8000-000000000041','retriever.index',7,'42'),
  learningCandidate('00000000-0000-4000-8000-000000000043','classifier.intents',2,'44'),
];
const evaluationRun=(id=evaluationRunId,receiptId='00000000-0000-4000-8000-000000000038',
  candidate=candidateId,status='Queued',version=1)=>({
  runRef:entity('abh.evaluation-run',id,version),resourceOrganizationId:org,
  candidateRef:entity('abh.learning-candidate',candidate,1),
  profileRef:entity('abh.evaluation-profile','00000000-0000-4000-8000-000000000036',1),
  baselineRef:entity('abh.artifact','00000000-0000-4000-8000-000000000037',1),
  retryOfRef:entity('abh.evaluation-run','00000000-0000-4000-8000-000000000039',1),
  assignmentUnit:'evaluation.scenario',seed:42,executionRefs:[],status,
  requestedBy:actor,receiptRef:entity('abh.command',receiptId,1),
  createdAt:asOf,expiresAt:'2026-09-11T11:00:00.000Z',digest,
});
let requestedEvaluationRuns=[];
const evaluationRuns=()=>[
  evaluationRun(),
  evaluationRun(inconclusiveEvaluationRunId,'00000000-0000-4000-8000-00000000003e',
    candidateId,'Inconclusive'),
  evaluationRun('00000000-0000-4000-8000-000000000045',
    '00000000-0000-4000-8000-000000000046','00000000-0000-4000-8000-000000000041','Completed',2),
  evaluationRun('00000000-0000-4000-8000-000000000047',
    '00000000-0000-4000-8000-000000000048','00000000-0000-4000-8000-000000000043','Completed',3),
  ...requestedEvaluationRuns,
];
const learningGate=(candidate=candidateId,evaluation=evaluationRunId,verdict='Pass',
  version=1,gateId='00000000-0000-4000-8000-00000000003b',
  bounds={lower:0.91,upper:0.97,estimate:0.94})=>({
  gateRef:entity('abh.learning-gate',gateId,version),
  resourceOrganizationId:org,
  candidateRef:entity('abh.learning-candidate',candidate,1),
  profileRef:entity('abh.evaluation-profile','00000000-0000-4000-8000-000000000036',1),
  evaluationRefs:[entity('abh.evaluation-run',evaluation,1)],
  metricThresholds:[{name:'demo.accuracy',minimum:0.9}],metricValues:[{name:'demo.accuracy',value:bounds.estimate}],
  baselineMetricValues:[{name:'demo.accuracy',value:0.9}],
  uncertainty:[{metric:'demo.accuracy',method:'WilsonScore',confidenceLevel:0.95,
    estimate:bounds.estimate,lowerBound:bounds.lower,upperBound:bounds.upper,sampleCount:42}],
  limitations:[{code:'demo.static-dataset',detail:'结果仅适用冻结数据集'}],
  findings:[{metric:'demo.accuracy',actual:bounds.estimate,minimum:0.9,outcome:verdict,
    lowerBound:bounds.lower,baseline:0.9,relativeLift:0.0444,lowerRelativeLift:0.0111}],
  verdict:verdict,signedBy:actor,createdAt:asOf,digest,
});
const gates=()=>[
  learningGate(),
  learningGate('00000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000045','Pass',2,
    '00000000-0000-4000-8000-000000000049',
    {lower:0.88,upper:0.95,estimate:0.92}),
];
let learningReleaseAssignments=[
  {assignmentRef:entity('abh.assignment','00000000-0000-4000-8000-000000000071',1),
    resourceOrganizationId:org,
    releaseRef:entity('abh.release','00000000-0000-4000-8000-000000000072',1),
    scopeRefs:[entity('abh.organization',org,1)],scopeTier:'Organization',status:'Paused',
    selectable:false,executionAllowed:false,
    evidenceRefs:[entity('abh.learning-gate','00000000-0000-4000-8000-00000000003b',1),
      entity('abh.artifact','00000000-0000-4000-8000-000000000037',1)],
    stopReason:'Superseded by the reviewed candidate; kept for rollback evidence.'},
];

// ---- Projection (m1), settings, compensation. ----
let projection={projectionType:'abh.projection.mission-summary',
  subjectRef:entity('abh.mission',missionId,missionVersion),resourceOrganizationId:org,
  schemaVersion:1,watermark:42,stale:false,
  data:{missionRef:entity('abh.mission',missionId,missionVersion),goalDigest:digest,
    domainType:'demo.project',status:'Active',goalRevision:2,
    pendingTriggerCount:3,blockerCount:1,updatedAt:asOf},
  availableActions:missionStatus==='Active'
    ?['pause','cancel','block','revise-goal','close']
    :missionStatus==='Draft'?['activate']:missionStatus==='Paused'?['resume','cancel']:[],asOf};
let eventSequence=0,lastEventId='',reconnectEventPending=false;
let settingsAutomationEnabled=false;
let inboxAvailable=true;
let lateStaleReads=0;
let runStream;
let organizationStream;
const eventStreams=new Set();

const settingsView=()=>({
  asOf,source:'fake governance service',
  organization:{organizationId:org,label:'Organization A',
    collaborationBoundary:'single resource organization with approved external connectors'},
  members:[
    {id:'00000000-0000-4000-8000-0000000000a1',label:'Hello Operator',role:'operator',
      status:'Active'},
    {id:'00000000-0000-4000-8000-0000000000a8',label:'Compliance Reviewer',role:'approver',
      status:'Active'},
    {id:'00000000-0000-4000-8000-0000000000a9',label:'Platform Administrator',role:'admin',
      status:'Active'},
  ],
  purposes:[
    {label:'Mission 管理',name:'abh.mission.manage',enabled:true},
    {label:'运行投递',name:'abh.runtime.deliver',enabled:true},
  ],
  connections:[
    {id:'00000000-0000-4000-8000-000000000091',label:'Inventory Provider',kind:'http',
      status:'Active',scopeNames:['demo.inventory.read']},
    {id:'00000000-0000-4000-8000-000000000092',label:'Billing Gateway',kind:'http',
      status:'Active',scopeNames:['demo.billing.commit']},
  ],
  automation:[
    {key:'demo.agent',label:'审批自动化',level:'assistive',
      enabled:settingsAutomationEnabled},
    {key:'demo.enrichment',label:'数据补全自动化',level:'autonomous',enabled:true},
  ],
  commands:[{key:'demo.enable-automation',label:'启用审批自动化',
    description:'为演示组织启用人工确认后的自动化。',
    requiresConfirmation:true,
    inputSchema:{type:'object',required:['automationKey','enabled'],
      additionalProperties:false,
      properties:{automationKey:{type:'string',const:'demo.agent'},
        enabled:{type:'boolean',const:true}}},
    initialData:{automationKey:'demo.agent',enabled:true}}],
});
const compensationTemplate=actionRef=>({
  key:'demo.compensate',label:'撤销发布',description:'Revoke the failed publication.',
  actionType:'demo.retract-publication',
  targetRefs:[entity('abh.artifact','00000000-0000-4000-8000-000000000031',1)],
  sourceVersionRefs:[actionRef],
  artifact:{ownerRef:entity('abh.organization',org,1),dataClass:'publication.record',
    purposeNames:['abh.runtime.deliver'],sourceRefs:[actionRef],
    region:'global',retentionPolicyRef:entity('abh.retention-policy',
      '00000000-0000-4000-8000-000000000041',1)},
  inputSchema:{type:'object',required:['publicationId'],additionalProperties:false,
    properties:{publicationId:{type:'string',minLength:1}}},
  uiSchema:{type:'Control',scope:'#/properties/publicationId'},
  initialData:{publicationId:'publication-1'},
});
const emitOrganizationChange=()=>{
  if(!organizationStream)return;
  organizationStream.write(
    `id: organization-${++eventSequence}\nevent: projection_changed\ndata: {}\n\n`);
};
const readJsonRequest=(request,response,onBody)=>{
  let body='';
  request.on('data',chunk=>{body+=chunk;});
  request.on('end',()=>{
    onBody(JSON.parse(body));
  });
};

const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');
  const authorization=typeof request.headers.authorization==='string'
    ?request.headers.authorization.replace(/^Bearer\s+/i,''):'';
  const organization=organizationTokens[authorization];
  if(!organization)return forbidden(response);
  const isOrganizationA=organization==='organization-a';
  if(request.method==='GET'&&url.pathname==='/healthz')return response.writeHead(204).end();
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.missions.list')
    return json(response,200,{missions:isOrganizationA
      ?missionSeeds.map(seed=>mission(seed.id)).filter(Boolean):[],asOf});
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.missions.get'){
    if(!isOrganizationA)return forbidden(response);
    const view=missionViewFor(url.searchParams.get('id')??'');
    if(!view)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown mission'));
    return json(response,200,view);
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.actions.get'){
    if(!isOrganizationA)return forbidden(response);
    const view=actionView(url.searchParams.get('id')??'');
    if(!view)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown action'));
    return json(response,200,{success:true,data:view,meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname.startsWith('/v1/actions/')){
    if(!isOrganizationA)return forbidden(response);
    const view=actionView(url.pathname.split('/')[3]??'');
    if(!view)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown action'));
    return json(response,200,{success:true,data:view,meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname==='/v1/actions'){
    if(!isOrganizationA)return forbidden(response);
    const lifecycle=url.searchParams.get('lifecycle');
    const selected=actionSeeds.map(seed=>actionView(seed.id))
      .filter(item=>!lifecycle||item.position.lifecycle===lifecycle);
    return json(response,200,{success:true,data:selected,meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.projections.get'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{projection,asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.runs.list'){
    if(!isOrganizationA)return forbidden(response);
    const missionFilter=url.searchParams.get('missionId');
    const selected=missionFilter?runsFor(missionFilter):runSeeds.map(seed=>
      run(seed.id,seed.status(),seed.mode,seed.version(),seed.trigger,seed.mission));
    return json(response,200,{runs:selected,asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.runs.get'){
    if(!isOrganizationA)return forbidden(response);
    const id=url.searchParams.get('id')??'';
    const view=runView(id);
    if(!view)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown run'));
    return json(response,200,view);
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.learning-candidates.list'){
    if(!isOrganizationA)return forbidden(response);
    const list=candidates();
    return json(response,200,{candidates:list,counts:{Draft:list.length},asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.evaluation-runs.list'){
    if(!isOrganizationA)return forbidden(response);
    const candidate=url.searchParams.get('candidateId');
    const status=url.searchParams.get('runStatus');
    const selected=evaluationRuns().filter(item=>(!candidate||item.candidateRef.id===candidate)
      &&(!status||item.status===status));
    return json(response,200,{runs:selected,counts:{Queued:selected.length},asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.learning-gates.list'){
    if(!isOrganizationA)return forbidden(response);
    const candidate=url.searchParams.get('candidateId');
    const selected=gates().filter(item=>!candidate||item.candidateRef.id===candidate);
    return json(response,200,{gates:selected,counts:{Pass:selected.length},asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.learning-gates.get'){
    if(!isOrganizationA)return forbidden(response);
    const gate=gates().find(item=>item.gateRef.id===url.searchParams.get('id'));
    if(!gate)return forbidden(response);
    return json(response,200,gate);
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.assignments.list'){
    if(!isOrganizationA)return forbidden(response);
    const release=url.searchParams.get('releaseId');
    const status=url.searchParams.get('assignmentStatus');
    const selected=learningReleaseAssignments.filter(item=>
      (!release||item.releaseRef.id===release)&&(!status||item.status===status));
    return json(response,200,{assignments:selected,
      counts:{Active:selected.filter(item=>item.status==='Active').length,
        Paused:selected.filter(item=>item.status==='Paused').length},asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.assignments.get'){
    if(!isOrganizationA)return forbidden(response);
    const current=learningReleaseAssignments.find(item=>
      item.assignmentRef.id===url.searchParams.get('id'));
    if(!current)
      return forbidden(response);
    return json(response,200,current);
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.learning.request-evaluation'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const idempotencyKey=request.headers['idempotency-key'];
      const candidate=body.target?.id===org&&body.payload?.candidateRef;
      const baseline=body.payload?.baselineRef;
      if(typeof idempotencyKey!=='string'||idempotencyKey.length===0
        ||candidate?.type!=='abh.learning-candidate'
        ||!candidates().some(item=>item.candidateRef.id===candidate.id)
        ||candidate.version!==1||baseline?.type!=='abh.artifact'
        ||baseline.id!=='00000000-0000-4000-8000-000000000037'||baseline.version!==1)
        return forbidden(response);
      let run=requestedEvaluationRuns.at(-1);
      if(!run){
        run=evaluationRun(requestedEvaluationRunId,
          '00000000-0000-4000-8000-00000000003a',candidate.id);
        requestedEvaluationRuns.push(run);
      }
      json(response,201,{success:true,data:{objectRef:run.runRef,
        commandId:run.receiptRef.id,evaluationRun:run}});
    });
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.evaluation-runs.get'){
    if(!isOrganizationA)return forbidden(response);
    const run=evaluationRuns().find(item=>item.runRef.id===url.searchParams.get('id'));
    if(!run)return forbidden(response);
    return json(response,200,run);
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.releases.configure-learning-candidate'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const release=body.payload?.release,assignment=body.payload?.assignment;
      const valid=body.target?.type==='abh.release'&&body.target?.id===release?.releaseRef?.id
        &&release?.releaseRef?.version===1&&release?.status==='Ready'
        &&release?.candidateRef===undefined&&body.payload?.candidateRef?.id===candidateId
        &&body.payload?.candidateRef?.version===1
        &&body.payload?.gateRef?.type==='abh.learning-gate'
        &&body.payload?.gateRef?.id==='00000000-0000-4000-8000-00000000003b'
        &&body.payload?.gateRef?.version===1
        &&release?.assets?.[0]?.behaviorSlot==='learning.policy'
        &&release?.assets?.[0]?.capabilityExactRefs?.[0]?.kind==='BehaviorPolicy'
        &&release?.assets?.[0]?.capabilityExactRefs?.[0]?.id==='learning.passed-candidate'
        &&release?.assets?.[0]?.capabilityExactRefs?.[0]?.version==='0.1.0'
        &&/^sha256:[0-9a-f]{64}$/.test(release?.assets?.[0]?.capabilityExactRefs?.[0]?.digest??'')
        &&assignment?.scopeTier==='Organization'&&assignment?.status==='Active'
        &&assignment?.selectable===true&&assignment?.executionAllowed===true
        &&assignment?.releaseRef?.id===release?.releaseRef?.id;
      if(typeof request.headers['idempotency-key']!=='string'
        ||request.headers['idempotency-key'].length===0||!valid)return forbidden(response);
      const created={
        assignmentRef:assignment.assignmentRef,resourceOrganizationId:org,
        releaseRef:{...release.releaseRef,version:2},
        scopeRefs:assignment.scopeRefs,scopeTier:'Organization',status:'Active',
        selectable:true,executionAllowed:true,evidenceRefs:assignment.evidenceRefs,
      };
      learningReleaseAssignments.push(created);
      return json(response,201,created);
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.assignments.pause'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const version=Number(String(request.headers['if-match']??'').replaceAll('"',''));
      const current=learningReleaseAssignments.filter(item=>item.status==='Active').at(-1);
      const evidence=current?.evidenceRefs?.at(-1);
      if(!current||current.status!=='Active'||current.assignmentRef.version!==version
        ||body.target?.type!=='abh.assignment'||body.target?.id!==current.assignmentRef.id
        ||body.payload?.evidenceRef?.type!==evidence?.type
        ||body.payload?.evidenceRef?.id!==evidence?.id
        ||body.payload?.evidenceRef?.version!==evidence?.version
        ||typeof body.payload?.reason!=='string'||body.payload.reason.length===0
        ||typeof request.headers['idempotency-key']!=='string'
        ||request.headers['idempotency-key'].length===0)return forbidden(response);
      const paused={
        ...current,assignmentRef:{...current.assignmentRef,version:version+1},
        status:'Paused',selectable:false,executionAllowed:false,
        stopReason:body.payload.reason,stopEvidenceRef:evidence,
      };
      learningReleaseAssignments.splice(learningReleaseAssignments.indexOf(current),1,paused);
      return json(response,200,paused);
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.assignments.rollback'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const version=Number(String(request.headers['if-match']??'').replaceAll('"',''));
      const current=learningReleaseAssignments.find(item=>item.status==='Active');
      const previous=learningReleaseAssignments.find(item=>
        item.releaseRef.id===body.payload?.previousReleaseRef?.id);
      const gates=previous?.evidenceRefs?.filter(item=>item.type==='abh.learning-gate')??[];
      const compatibility=previous?.evidenceRefs?.filter(item=>item.type==='abh.artifact')??[];
      if(!current||current.status!=='Active'||current.assignmentRef.version!==version
        ||body.target?.type!=='abh.assignment'||body.target?.id!==current.assignmentRef.id
        ||!previous||previous.releaseRef.id===current.releaseRef.id
        ||previous.releaseRef.version!==body.payload?.previousReleaseRef?.version
        ||body.payload?.gateRefs?.length!==gates.length
        ||body.payload?.gateRefs?.some((item,index)=>item.type!==gates[index].type
          ||item.id!==gates[index].id||item.version!==gates[index].version)
        ||body.payload?.compatibilityRef?.type!==compatibility[0]?.type
        ||body.payload?.compatibilityRef?.id!==compatibility[0]?.id
        ||body.payload?.compatibilityRef?.version!==compatibility[0]?.version
        ||typeof body.payload?.reason!=='string'||body.payload.reason.length===0
        ||typeof request.headers['idempotency-key']!=='string'
        ||request.headers['idempotency-key'].length===0)return forbidden(response);
      const paused={...current,assignmentRef:{...current.assignmentRef,version:version+1},
        status:'Paused',selectable:false,executionAllowed:false,
        stopReason:body.payload.reason,stopEvidenceRef:gates[0]};
      const replacement={assignmentRef:entity('abh.assignment',crypto.randomUUID(),1),
        resourceOrganizationId:org,releaseRef:previous.releaseRef,
        scopeRefs:current.scopeRefs,scopeTier:current.scopeTier,status:'Active',
        selectable:true,executionAllowed:true,
        evidenceRefs:[...gates,compatibility[0]],
        rollbackOfAssignmentRef:paused.assignmentRef,
        rollbackFromReleaseRef:current.releaseRef};
      learningReleaseAssignments.splice(
        learningReleaseAssignments.indexOf(current),1,paused,replacement);
      return json(response,200,replacement);
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.learning.retry-evaluation'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const idempotencyKey=request.headers['idempotency-key'];
      const target=body.target?.id===org;
      const run=body.payload?.runRef;
      if(typeof idempotencyKey!=='string'||idempotencyKey.length===0||!target
        ||run?.type!=='abh.evaluation-run'||run.id!==inconclusiveEvaluationRunId
        ||run.version!==1)return forbidden(response);
      const retry=evaluationRun(requestedEvaluationRunId,
        '00000000-0000-4000-8000-00000000003a');
      json(response,201,{success:true,data:{objectRef:retry.runRef,
        commandId:retry.receiptRef.id,evaluationRun:retry}});
    });
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/reset-state'){
    if(!isOrganizationA)return forbidden(response);
    decision={...decision,status:'Pending',decisionRef:{...decision.decisionRef,version:1}};
    inboxAvailable=true;lateStaleReads=0;eventSequence=0;lastEventId='';
    reconnectEventPending=false;eventStreams.clear();
    actionVersion=4;actionLifecycle='Reconciling';actionOutcome='Unknown';
    missionVersion=3;missionStatus='Active';
    runningVersion=1;runningStatus='Running';runningTaskStatus='Running';
    requestedEvaluationRuns=[];
    learningReleaseAssignments=[learningReleaseAssignments[0]];
    settingsAutomationEnabled=false;
    projection={...projection,watermark:42,
      data:{...projection.data,pendingTriggerCount:3,blockerCount:1}};
    return json(response,200,{success:true});
  }
  if(request.method==='POST'&&url.pathname==='/v1/testing/settings/resolve'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,settingsView());
  }
  if(request.method==='POST'&&url.pathname==='/v1/testing/compensation/resolve'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const seed=actionSeeds.find(entry=>entry.id===body.actionId);
      if(!seed||!compensationActionIds.has(body.actionId)
        ||body.actionVersion!==seed.version())return forbidden(response);
      json(response,200,compensationTemplate(entity('abh.action',body.actionId,seed.version())));
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.artifacts.store-inline'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      if(body.target?.id!==org||typeof body.payload?.content!=='string')
        return forbidden(response);
      json(response,201,{success:true,data:{objectRef:entity('abh.artifact',
        '00000000-0000-4000-8000-0000000000e3',2),
        commandId:'00000000-0000-4000-8000-0000000000e4'}});
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.missions.cancel'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const version=Number(String(request.headers['if-match']??'').replaceAll('"',''));
      const seed=missionSeeds.find(entry=>entry.id===body.target?.id);
      if(body.target?.type!=='abh.mission'||!seed
        ||version!==seed.version()
        ||body.payload?.reasonCode!=='abh.workbench.user.cancel')return forbidden(response);
      if(seed.id===missionId){missionVersion+=1;missionStatus='Cancelled';}
      json(response,200,mission(seed.id));
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.missions.pause'
    ||request.method==='POST'&&url.pathname==='/v1/commands/abh.missions.resume'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const version=Number(String(request.headers['if-match']??'').replaceAll('"',''));
      const seed=missionSeeds.find(entry=>entry.id===body.target?.id);
      const pausing=url.pathname.endsWith('pause');
      if(body.target?.type!=='abh.mission'||!seed
        ||version!==seed.version()
        ||(pausing?seed.status()!=='Active':seed.status()!=='Paused')
        ||(pausing&&body.payload?.reasonCode!=='abh.workbench.user.pause'))
        return forbidden(response);
      if(seed.id===missionId){
        missionVersion+=1;
        missionStatus=pausing?'Paused':'Active';
      }
      json(response,200,mission(seed.id));
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.runs.cancel'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const version=Number(String(request.headers['if-match']??'').replaceAll('"',''));
      const seed=runSeeds.find(entry=>entry.id===body.target?.id);
      if(body.target?.type!=='abh.run'||!seed
        ||version!==seed.version()
        ||body.payload?.reasonCode!=='abh.workbench.user.cancel')return forbidden(response);
      if(seed.id===runningRunId){
        runningVersion+=1;runningStatus='Cancelled';runningTaskStatus='Cancelled';
      }
      json(response,200,run(seed.id,'Cancelled',seed.mode,seed.version()+1,seed.trigger,
        seed.mission));
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/testing/settings/commands/demo.enable-automation'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,()=>{
      settingsAutomationEnabled=true;
      response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      response.write(JSON.stringify({success:true}));
      response.end();
    });
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/arm-late-response'){
    if(!isOrganizationA)return forbidden(response);
    decision={...decision,status:'Approved',decisionRef:{...decision.decisionRef,version:2}};
    lateStaleReads=1;
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/action-update'){
    if(!isOrganizationA)return forbidden(response);
    actionVersion=5;actionLifecycle='Closed';actionOutcome='Succeeded';
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/action-update-failed'){
    if(!isOrganizationA)return forbidden(response);
    actionVersion=5;actionLifecycle='Closed';actionOutcome='Failed';
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/inbox-consume'){
    if(!isOrganizationA)return forbidden(response);
    inboxAvailable=false;
    emitOrganizationChange();
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/organization-action-update'){
    if(!isOrganizationA)return forbidden(response);
    actionVersion=5;actionLifecycle='Closed';actionOutcome='Succeeded';
    emitOrganizationChange();
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/projection-update'){
    if(!isOrganizationA)return forbidden(response);
    projection={...projection,watermark:43,
      data:{...projection.data,pendingTriggerCount:4,blockerCount:2}};
    reconnectEventPending=true;
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/sse-disconnect'){
    if(!isOrganizationA)return forbidden(response);
    for(const stream of [...eventStreams])stream.end();
    eventStreams.clear();
    return json(response,200,{success:true});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/sse-state'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{lastEventId,connections:eventStreams.size,
      reconnectEventPending});
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/run-complete'){
    if(!isOrganizationA)return forbidden(response);
    runningVersion+=1;
    runningStatus='Completed';
    runningTaskStatus='Succeeded';
    if(runStream){
      runStream.write(`id: run-${++eventSequence}\nevent: projection_changed\ndata: {}\n\n`);
    }
    return json(response,200,{success:true});
  }
  const subjectMatch=/^\/v1\/events\/(abh\.[a-z-]+)\/([0-9a-f-]{36})$/.exec(url.pathname);
  if(request.method==='GET'&&subjectMatch&&isOrganizationA){
    const [,subjectType,subjectId]=subjectMatch;
    const known=subjectType==='abh.organization'
      ?subjectId===org
      :(subjectType==='abh.mission'&&mission(subjectId))
        ||(subjectType==='abh.decision'&&decisionById(subjectId))
        ||(subjectType==='abh.action'&&actionView(subjectId))
        ||(subjectType==='abh.run'&&runView(subjectId));
    if(!known)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown subject'));
    const subject=subjectType.replace(/^abh\./,'');
    lastEventId=typeof request.headers['last-event-id']==='string'
      ?request.headers['last-event-id']:'';
    response.writeHead(200,{'content-type':'text/event-stream',
      'cache-control':'no-cache, no-store, no-transform',connection:'keep-alive'});
    eventStreams.add(response);
    if(subjectType==='abh.run'&&subjectId===runningRunId)runStream=response;
    if(subjectType==='abh.organization')organizationStream=response;
    const cursor=++eventSequence;
    response.write(`retry: 100\nid: ${subject}-${cursor}\nevent: projection_changed\ndata: {}\n\n`);
    response.on('close',()=>{
      eventStreams.delete(response);
      if(runStream===response)runStream=undefined;
      if(organizationStream===response)organizationStream=undefined;
    });
    return;
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.decisions.list-inbox'){
    const pendingExtra=extraDecisions.map(({id,package:inboxPackage})=>({
      decisionRef:entity('abh.decision',id,1),package:inboxPackage,status:'Pending',
      effectSummaries:[],availableActions:[]}));
    const items=isOrganizationA&&inboxAvailable
      ?[decision,...pendingExtra].filter(item=>item.status==='Pending')
      :[];
    return json(response,200,{success:true,data:items,meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.decisions.get'){
    if(!isOrganizationA)return forbidden(response);
    if(lateStaleReads>0&&url.searchParams.get('id')===decisionId){
      lateStaleReads-=1;
      return json(response,200,{success:true,data:{...decision,status:'Pending',
        decisionRef:{...decision.decisionRef,version:1}},meta:queryMeta});
    }
    const view=decisionById(url.searchParams.get('id')??'');
    if(!view)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown decision'));
    return json(response,200,{success:true,data:view,meta:queryMeta});
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.decisions.submit'){
    if(!isOrganizationA)return forbidden(response);
    let body='';
    request.on('data',chunk=>{body+=chunk;});
    request.on('end',()=>{
      const id=JSON.parse(body).target?.id??decisionId;
      const current=decisionById(id);
      if(!current)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown decision'));
      if(request.headers['if-match']!==`"${current.decisionRef.version}"`)
        return json(response,409,error('VERSION_CONFLICT','Conflict','changed'));
      const payload=JSON.parse(body).payload;
      if(payload.packageDigest!==digest||payload.response!=='Approved'
        ||typeof payload.reason!=='string'||payload.reason.length===0
        ||!Array.isArray(payload.conditionRefs))return forbidden(response);
      if(id===decisionId){
        decision={...decision,status:'Approved',decisionRef:{...decision.decisionRef,version:2}};
      }
      json(response,200,{success:true,data:{objectRef:entity('abh.decision',id,
        current.decisionRef.version+1),
        commandId:'00000000-0000-4000-8000-0000000000e1',status:'Approved',
        effectTrackingRefs:[entity('abh.decision-effect','00000000-0000-4000-8000-0000000000e2')]}});
    });
    return;
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.actions.propose'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      if(body.target?.id!==org||typeof request.headers['idempotency-key']!=='string'
        ||request.headers['idempotency-key'].length===0
        ||body.payload?.payloadRef?.id!=='00000000-0000-4000-8000-0000000000e3')
      return forbidden(response);
      json(response,202,{success:true,data:{objectRef:entity('abh.action',
        '00000000-0000-4000-8000-0000000000e5',1),
        trackingRef:entity('abh.action','00000000-0000-4000-8000-0000000000e5',1),
        commandId:'00000000-0000-4000-8000-0000000000e6'}});
    });
  }
  json(response,404,{success:false,error:{code:'RESOURCE_NOT_FOUND',message:'missing',
    retryable:false,remediation:[]}});
});

const organizationTokens={
  'browser-e2e':'organization-a',
  'browser-e2e-b':'organization-b',
};
const json=(response,status,value)=>{response.writeHead(status,
  {'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));};
const error=(code,category,message)=>({success:false,error:{code,category,message,
  retryable:false,correlationId:'00000000-0000-4000-8000-0000000000e0'}});
const forbidden=response=>json(response,403,error('FORBIDDEN','Authorization','denied'));

const port=Number(process.env.FAKE_ABH_PORT??18777);
server.listen(port,'127.0.0.1',()=>{
  console.log(`fake ABH API on http://127.0.0.1:${port}`);
});
