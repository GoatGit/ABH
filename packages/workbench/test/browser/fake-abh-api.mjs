import http from 'node:http';

const org='00000000-0000-4000-8000-0000000000c1';
const missionId='00000000-0000-4000-8000-0000000000m1'.replace('m','1');
const decisionId='00000000-0000-4000-8000-0000000000d1'.replace('d','1');
const runId='00000000-0000-4000-8000-0000000000r1'.replace('r','1');
const queuedRunId='00000000-0000-4000-8000-0000000000q1'.replace('q','1');
const completedTaskId='00000000-0000-4000-8000-0000000000t1'.replace('t','1');
const queuedTaskId='00000000-0000-4000-8000-0000000000s1'.replace('s','1');
const actionId='00000000-0000-4000-8000-000000000021';
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
    status:missionStatus,stopEpoch:1,
    pauseRequested:missionStatus==='Paused',
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
const run=(id,status,executionMode,version)=>({
  runRef:entity('abh.run',id,version),resourceOrganizationId:org,
  missionRef:entity('abh.mission',missionId,missionVersion),
  triggerKey:'demo.trigger',goalRevision:2,stopEpoch:1,
  workflowRef:{kind:'Workflow',id:'demo.workflow',version:'1.0.0',digest},
  assignmentSnapshotRef:ref('abh.assignment'),executionMode,status,
  createdBy:actor,createdAt:asOf,updatedAt:asOf,
});
const runs=()=>[run(runId,'Completed','Production',2),run(queuedRunId,'Queued','Shadow',1)];
const task=(id,runRef,nodeKey,kind,status,required,attempt)=>({
  taskRef:entity('abh.task',id,1),resourceOrganizationId:org,runRef,
  nodeKey:nodeKey,kind,inputRefs:[ref('abh.artifact')],status,required,
  attemptOrdinal:attempt,createdAt:asOf,updatedAt:asOf,
});
const runView=id=>{
  const completed=run(runId,'Completed','Production',2),queued=run(queuedRunId,'Queued','Shadow',1);
  if(id===runId)return {run:completed,tasks:[
    task(completedTaskId,completed.runRef,'demo.publish','DomainCommand','Succeeded',true,1),
    task(queuedTaskId,completed.runRef,'demo.audit','Wait','Skipped',false,1),
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
  if(request.method==='GET'&&url.pathname==='/v1/queries/abh.runs.get'){
    if(!isOrganizationA)return forbidden(response);
    const id=url.searchParams.get('id')??'';
    if(id!==runId&&id!==queuedRunId)return json(response,404,error('RESOURCE_NOT_FOUND','NotFound','unknown run'));
    return json(response,200,runView(url.searchParams.get('id')??''));
  }
  if(request.method==='GET'&&url.pathname==='/v1/testing/reset-state'){
    if(!isOrganizationA)return forbidden(response);
    decision={...decision,status:'Pending',decisionRef:{...decision.decisionRef,version:1}};
    inboxAvailable=true;lateStaleReads=0;eventSequence=0;lastEventId='';
    reconnectEventPending=false;eventStreams.clear();
    actionVersion=4;actionLifecycle='Reconciling';actionOutcome='Unknown';
    missionVersion=3;missionStatus='Active';
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
  const decisionEvent=url.pathname===`/v1/events/abh.decision/${decisionId}`;
  if(request.method==='GET'&&(missionEvent||decisionEvent)){
    const subject=missionEvent?'mission':'decision';
    lastEventId=typeof request.headers['last-event-id']==='string'
      ?request.headers['last-event-id']:'';
    response.writeHead(200,{'content-type':'text/event-stream',
      'cache-control':'no-cache, no-store, no-transform',connection:'keep-alive'});
    eventStreams.add(response);
    const cursor=++eventSequence;
    response.write(`retry: 100\nid: ${subject}-${cursor}\nevent: projection_changed\ndata: {}\n\n`);
    response.on('close',()=>eventStreams.delete(response));
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
