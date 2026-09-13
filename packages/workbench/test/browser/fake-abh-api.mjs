import http from 'node:http';

const org='00000000-0000-4000-8000-0000000000c1';
const missionId='00000000-0000-4000-8000-0000000000m1'.replace('m','1');
const decisionId='00000000-0000-4000-8000-0000000000d1'.replace('d','1');
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
const digest='sha256:'+'b'.repeat(64);
const asOf='2026-09-11T10:00:00.000Z';
const entity=(type,id,version=1)=>({type,id,version});
const ref=type=>entity(type,'00000000-0000-4000-8000-0000000000f1');
const workflow={kind:'Workflow',id:'demo.workflow',version:'1.0.0',digest};
const actor={type:'Human',id:'00000000-0000-4000-8000-0000000000a1'};
const mission=()=>{
  const missionRef=entity('abh.mission',missionId,missionVersion);
  return {
    missionRef,resourceOrganizationId:org,
    goalArtifactRef:ref('abh.artifact'),goalDigest:digest,goalRevision:2,
    domainType:'demo.project',workflowRef:workflow,
    conditionRef:ref('abh.mission-conditions'),
    responsibilityScopeRefs:[ref('abh.organization')],
    status:missionStatus,stopEpoch:1,pauseRequested:missionStatus==='Paused',
    cleanupStatus:missionStatus==='Cancelled'?'Pending':'NotRequired',
    purposeNames:['abh.runtime.deliver'],createdBy:actor,createdAt:asOf,updatedAt:asOf,
    authorityRef:ref('abh.mission-authority'),
  };
};
const decisionPackage={
  requestRef:ref('abh.responsibility-request'),routeRevision:1,slotId:'reviewer',
  subjectRef:entity('abh.action','00000000-0000-4000-8000-0000000000a5',2),
  proposalDigest:digest,question:'Publish the approved customer brief?',
  recommendation:'Publish after the final compliance check.',
  alternatives:['Keep the brief private.','Request another revision.'],
  impactUpperBound:{scopeRefs:[ref('abh.organization')],resourceRequirements:[],maxMoney:[],
    description:'Publishes one reviewed brief; no financial spend.'},
  risks:['The destination may acknowledge late.'],evidenceRefs:[ref('abh.artifact')],
  validUntil:'2026-09-12T10:00:00.000Z',allowedResponses:['Approved','Rejected'],
  packageDigest:digest,
};
let decision={
  decisionRef:entity('abh.decision',decisionId,1),package:decisionPackage,status:'Pending',
  effectSummaries:[],availableActions:[],
};
const queryMeta={asOf,watermark:'42',stale:false};
let inboxAvailable=true;
let lateStaleReads=0;
let actionVersion=4,actionLifecycle='Reconciling',actionOutcome='Unknown';
let missionVersion=3,missionStatus='Active';
let runningVersion=1,runningStatus='Running',runningTaskStatus='Running';
let runStream;
let organizationStream;
const actionView=()=>({
  actionRef:entity('abh.action',actionId,actionVersion),actionType:'demo.publish',
  position:{lifecycle:actionLifecycle,outcome:actionOutcome},
  authorizationSummary:{authorityRef:ref('abh.execution-authority')},
  operationSummary:[{operationRef:ref('abh.operation'),
    position:{lifecycle:'Observing',outcome:'Unknown'}}],
  unresolvedRefs:actionOutcome==='Unknown'?[ref('abh.operation')]:[],
  availableActions:[],
});
const missionView=()=>({mission:mission(),
  conditions:{conditionRef:ref('abh.mission-conditions'),resourceOrganizationId:org,
    missionRef:entity('abh.mission',missionId,missionVersion),goalRevision:2,
    successConditionRef:ref('abh.condition'),stopConditionRef:ref('abh.condition'),
    triggerPolicyRef:ref('abh.policy'),resourceEnvelopeRef:ref('abh.resource-envelope'),digest},
  pendingTriggers:[],blockers:[],
  availableActions:missionStatus==='Active'
    ?['pause','cancel','block','revise-goal','close']
    :missionStatus==='Draft'?['activate']:missionStatus==='Paused'?['resume','cancel']:[],asOf});
const run=(id,status,executionMode,version,triggerKey='demo.trigger')=>({
  runRef:entity('abh.run',id,version),resourceOrganizationId:org,
  missionRef:entity('abh.mission',missionId,missionVersion),
  triggerKey,goalRevision:2,stopEpoch:1,
  workflowRef:{kind:'Workflow',id:'demo.workflow',version:'1.0.0',digest},
  assignmentSnapshotRef:ref('abh.assignment'),executionMode,status,
  progressBudgetSeconds:900,progressDeadline:'2026-09-11T10:15:00.000Z',
  createdBy:actor,createdAt:asOf,updatedAt:asOf,
});
const runs=()=>[run(runId,'Completed','Production',2),
  run(runningRunId,runningStatus,'Production',runningVersion,'cancel.trigger'),
  run(queuedRunId,'Queued','Shadow',1)];
const learningCandidate=()=>({
  candidateRef:entity('abh.learning-candidate',candidateId,1),resourceOrganizationId:org,
  caseRef:entity('abh.learning-case','00000000-0000-4000-8000-000000000033',1),
  assetKind:'model.prompt',baseVersion:3,
  candidateArtifactRef:entity('abh.artifact','00000000-0000-4000-8000-000000000034',1),
  scopeRef:entity('abh.organization',org,1),risk:'learning.low',status:'Draft',
  producer:actor,receiptRef:entity('abh.command','00000000-0000-4000-8000-000000000035',1),
  createdAt:asOf,digest,
});
const evaluationRun=(id=evaluationRunId,receiptId='00000000-0000-4000-8000-000000000038')=>({
  runRef:entity('abh.evaluation-run',id,1),resourceOrganizationId:org,
  candidateRef:entity('abh.learning-candidate',candidateId,1),
  profileRef:entity('abh.evaluation-profile','00000000-0000-4000-8000-000000000036',1),
  baselineRef:entity('abh.artifact','00000000-0000-4000-8000-000000000037',1),
  retryOfRef:entity('abh.evaluation-run','00000000-0000-4000-8000-000000000039',1),
  assignmentUnit:'evaluation.scenario',seed:42,executionRefs:[],status:'Queued',
  requestedBy:actor,receiptRef:entity('abh.command',receiptId,1),
  createdAt:asOf,expiresAt:'2026-09-11T11:00:00.000Z',digest,
});
const inconclusiveEvaluationRun=()=>({...evaluationRun(inconclusiveEvaluationRunId,
  '00000000-0000-4000-8000-00000000003e'),status:'Inconclusive'});
let requestedEvaluationRuns=[];
const evaluationRuns=()=>[evaluationRun(),inconclusiveEvaluationRun(),...requestedEvaluationRuns];
let learningReleaseAssignments=[];
const learningGate=()=>({
  gateRef:entity('abh.learning-gate','00000000-0000-4000-8000-00000000003b',1),
  resourceOrganizationId:org,
  candidateRef:entity('abh.learning-candidate',candidateId,1),
  profileRef:entity('abh.evaluation-profile','00000000-0000-4000-8000-000000000036',1),
  evaluationRefs:[entity('abh.evaluation-run',evaluationRunId,1)],
  metricThresholds:[{name:'demo.accuracy',minimum:0.9}],metricValues:[{name:'demo.accuracy',value:0.94}],
  baselineMetricValues:[{name:'demo.accuracy',value:0.9}],
  uncertainty:[{metric:'demo.accuracy',method:'WilsonScore',confidenceLevel:0.95,estimate:0.94,
    lowerBound:0.91,upperBound:0.97,sampleCount:42}],
  limitations:[{code:'demo.static-dataset',detail:'结果仅适用冻结数据集'}],
  findings:[{metric:'demo.accuracy',actual:0.94,minimum:0.9,outcome:'Pass',lowerBound:0.91,
    baseline:0.9,relativeLift:0.0444,lowerRelativeLift:0.0111}],
  verdict:'Pass',signedBy:actor,createdAt:asOf,digest,
});
const task=(id,runRef,nodeKey,kind,status,required,attempt)=>({
  taskRef:entity('abh.task',id,1),resourceOrganizationId:org,runRef,
  nodeKey:nodeKey,kind,inputRefs:[ref('abh.artifact')],status,required,
  attemptOrdinal:attempt,createdAt:asOf,updatedAt:asOf,
});
const runView=id=>{
  const completed=run(runId,'Completed','Production',2),queued=run(queuedRunId,'Queued','Shadow',1);
  const running=run(runningRunId,runningStatus,'Production',runningVersion,'cancel.trigger');
  if(id===runId)return {run:completed,tasks:[
    task(completedTaskId,completed.runRef,'demo.publish','DomainCommand','Succeeded',true,1),
    task(queuedTaskId,completed.runRef,'demo.audit','Wait','Skipped',false,1),
  ],asOf};
  if(id===runningRunId)return {run:running,tasks:[
    task(runningTaskId,running.runRef,'demo.execute','DomainCommand',runningTaskStatus,true,1),
  ],asOf};
  return {run:queued,tasks:[
    task(queuedTaskId,queued.runRef,'demo.publish','DomainCommand','Ready',true,1),
  ],asOf};
};
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
let compensationSubmitted=false;
const eventStreams=new Set();

const json=(response,status,value)=>{response.writeHead(status,
  {'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));};
const error=(code,category,message)=>({success:false,error:{code,category,message,
  retryable:false,correlationId:'00000000-0000-4000-8000-0000000000e0'}});
const forbidden=response=>json(response,403,error('FORBIDDEN','Authorization','denied'));
const organizationTokens={
  'browser-e2e':'organization-a',
  'browser-e2e-b':'organization-b',
};
const settingsView=()=>({
  asOf,source:'fake governance service',
  organization:{organizationId:org,label:'Organization A',
    collaborationBoundary:'single resource organization'},
  members:[],purposes:[],connections:[],
  automation:[{key:'demo.agent',label:'审批自动化',level:'assistive',
    enabled:settingsAutomationEnabled}],
  commands:[{key:'demo.enable-automation',label:'启用审批自动化',
    description:'为演示组织启用人工确认后的自动化。',
    requiresConfirmation:true,
    inputSchema:{type:'object',required:['automationKey','enabled'],
      additionalProperties:false,
      properties:{automationKey:{type:'string',const:'demo.agent'},
        enabled:{type:'boolean',const:true}}},
    initialData:{automationKey:'demo.agent',enabled:true}}],
});
const compensationTemplate=()=>({
  key:'demo.compensate',label:'撤销发布',description:'Revoke the failed publication.',
  actionType:'demo.retract-publication',
  targetRefs:[entity('abh.artifact','00000000-0000-4000-8000-000000000031',1)],
  sourceVersionRefs:[entity('abh.action',actionId,actionVersion)],
  artifact:{ownerRef:entity('abh.organization',org,1),dataClass:'publication.record',
    purposeNames:['abh.runtime.deliver'],sourceRefs:[entity('abh.action',actionId,actionVersion)],
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
    return json(response,200,{missions:isOrganizationA?[mission()]:[],asOf});
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.actions.get'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{success:true,data:actionView(),meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname===`/v1/actions/${actionId}`){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{success:true,data:actionView(),meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname==='/v1/actions'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{success:true,data:[actionView()],meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.missions.get'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,missionView());
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.projections.get'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{projection,asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.runs.list'){
    if(!isOrganizationA)return forbidden(response);
    return json(response,200,{runs:runs(),asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.learning-candidates.list'){
    if(!isOrganizationA)return forbidden(response);
    const candidates=[learningCandidate()];
    return json(response,200,{candidates,counts:{Draft:candidates.length},asOf});
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
    const selected=[learningGate()].filter(item=>!candidate||item.candidateRef.id===candidate);
    return json(response,200,{gates:selected,counts:{Pass:selected.length},asOf});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.learning-gates.get'){
    if(!isOrganizationA)return forbidden(response);
    if(url.searchParams.get('id')!=='00000000-0000-4000-8000-00000000003b')
      return forbidden(response);
    return json(response,200,learningGate());
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
        ||candidate?.type!=='abh.learning-candidate'||candidate.id!==candidateId
        ||candidate.version!==1||baseline?.type!=='abh.artifact'
        ||baseline.id!=='00000000-0000-4000-8000-000000000037'||baseline.version!==1)
        return forbidden(response);
      let run=requestedEvaluationRuns.at(-1);
      if(!run){
        run=evaluationRun(requestedEvaluationRunId,
          '00000000-0000-4000-8000-00000000003a');
        requestedEvaluationRuns.push(run);
      }
      json(response,201,{success:true,data:{objectRef:run.runRef,
        commandId:run.receiptRef.id,evaluationRun:run}});
    });
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.evaluation-runs.get'){
    if(!isOrganizationA)return forbidden(response);
    if(url.searchParams.get('id')!==inconclusiveEvaluationRunId)return forbidden(response);
    return json(response,200,inconclusiveEvaluationRun());
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
      const current=learningReleaseAssignments.at(-1);
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
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.runs.get'){
    if(!isOrganizationA)return forbidden(response);
    const id=url.searchParams.get('id')??'';
    if(id!==runId&&id!==runningRunId&&id!==queuedRunId)
      return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown run'));
    return json(response,200,runView(url.searchParams.get('id')??''));
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
    learningReleaseAssignments=[];
    settingsAutomationEnabled=false;
    compensationSubmitted=false;
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
      if(body.actionId!==actionId||body.actionVersion!==actionVersion)
        return forbidden(response);
      json(response,200,compensationTemplate());
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
      if(body.target?.type!=='abh.mission'||body.target?.id!==missionId
        ||version!==missionVersion
        ||body.payload?.reasonCode!=='abh.workbench.user.cancel')return forbidden(response);
      missionVersion+=1;missionStatus='Cancelled';
      json(response,200,mission());
    });
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.runs.cancel'){
    if(!isOrganizationA)return forbidden(response);
    return readJsonRequest(request,response,body=>{
      const version=Number(String(request.headers['if-match']??'').replaceAll('"',''));
      if(body.target?.type!=='abh.run'||body.target?.id!==runningRunId||version!==runningVersion
        ||body.payload?.reasonCode!=='abh.workbench.user.cancel')return forbidden(response);
      runningVersion+=1;runningStatus='Cancelled';runningTaskStatus='Cancelled';
      json(response,200,run(runningRunId,runningStatus,'Production',
        runningVersion,'cancel.trigger'));
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
  const missionEvent=url.pathname===`/v1/events/abh.mission/${missionId}`;
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
  const decisionEvent=url.pathname===`/v1/events/abh.decision/${decisionId}`;
  const actionEvent=url.pathname===`/v1/events/abh.action/${actionId}`;
  const runEvent=url.pathname===`/v1/events/abh.run/${runningRunId}`;
  if(request.method==='GET'&&(missionEvent||decisionEvent||actionEvent||runEvent)){
    const subject=missionEvent?'mission':decisionEvent?'decision':runEvent?'run':'action';
    lastEventId=typeof request.headers['last-event-id']==='string'
      ?request.headers['last-event-id']:'';
    response.writeHead(200,{'content-type':'text/event-stream',
      'cache-control':'no-cache, no-store, no-transform',connection:'keep-alive'});
    eventStreams.add(response);
    if(runEvent)runStream=response;
    const cursor=++eventSequence;
    response.write(`retry: 100\nid: ${subject}-${cursor}\nevent: projection_changed\ndata: {}\n\n`);
    response.on('close',()=>{
      eventStreams.delete(response);
      if(runStream===response)runStream=undefined;
    });
    return;
  }
  const organizationEvent=url.pathname===`/v1/events/abh.organization/${org}`;
  if(request.method==='GET'&&organizationEvent){
    lastEventId=typeof request.headers['last-event-id']==='string'
      ?request.headers['last-event-id']:'';
    response.writeHead(200,{'content-type':'text/event-stream',
      'cache-control':'no-cache, no-store, no-transform',connection:'keep-alive'});
    eventStreams.add(response);
    organizationStream=response;
    response.write(': connected\n\n');
    response.on('close',()=>{
      eventStreams.delete(response);
      if(organizationStream===response)organizationStream=undefined;
    });
    return;
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.decisions.list-inbox'){
    const items=isOrganizationA&&inboxAvailable&&decision.status==='Pending'?[decision]:[];
    return json(response,200,{success:true,data:items,meta:queryMeta});
  }
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.decisions.get'){
    if(!isOrganizationA)return forbidden(response);
    if(lateStaleReads>0){
      lateStaleReads-=1;
      return json(response,200,{success:true,data:{...decision,status:'Pending',
        decisionRef:{...decision.decisionRef,version:1}},meta:queryMeta});
    }
    return json(response,200,{success:true,data:decision,meta:queryMeta});
  }
  if(request.method==='POST'&&url.pathname==='/v1/commands/abh.decisions.submit'){
    if(!isOrganizationA)return forbidden(response);
    let body='';
    request.on('data',chunk=>{body+=chunk;});
    request.on('end',()=>{
      if(request.headers['if-match']!==`"${decision.decisionRef.version}"`)
        return json(response,409,error('VERSION_CONFLICT','Conflict','changed'));
      const payload=JSON.parse(body).payload;
      if(payload.packageDigest!==digest||payload.response!=='Approved'
        ||typeof payload.reason!=='string'||payload.reason.length===0
        ||!Array.isArray(payload.conditionRefs))return forbidden(response);
      decision={...decision,status:'Approved',decisionRef:{...decision.decisionRef,version:2}};
      json(response,200,{success:true,data:{objectRef:entity('abh.decision',decisionId,2),
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
      compensationSubmitted=true;
      json(response,202,{success:true,data:{objectRef:entity('abh.action',
        '00000000-0000-4000-8000-0000000000e5',1),
        trackingRef:entity('abh.action','00000000-0000-4000-8000-0000000000e5',1),
        commandId:'00000000-0000-4000-8000-0000000000e6'}});
    });
  }
  json(response,404,{success:false,error:{code:'RESOURCE_NOT_FOUND',message:'missing',
    retryable:false,remediation:[]}});
});

const port=Number(process.env.FAKE_ABH_PORT??18777);
server.listen(port,'127.0.0.1',()=>{
  console.log(`fake ABH API on http://127.0.0.1:${port}`);
});
