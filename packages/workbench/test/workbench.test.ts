import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AbhClientError} from '@abh/core/client';
import {cancelActionIdempotencyKey,decisionIdempotencyKey,missionIdempotencyKey} from '../src/lib/keys.ts';
import {errorText} from '../src/lib/errors.ts';
import {denyAllIdentityAdapter} from '../src/lib/identity.ts';
import {isOrganizationChoice,parseOrganizationSelection} from '../src/lib/organization.ts';
import {validateCompensationInput,validateCompensationTemplate} from '../src/lib/compensation-validation.ts';
import {compensationIdempotencyKey,pauseAssignmentIdempotencyKey,releaseLearningCandidateIdempotencyKey,rollbackAssignmentIdempotencyKey,requestEvaluationIdempotencyKey,
  retryEvaluationIdempotencyKey} from '../src/lib/keys.ts';
import {contractDecisionFormsAdapter} from '../src/lib/decision-forms.ts';
import {
  validateDecisionFormInput,validateDecisionFormTemplate,
} from '../src/lib/decision-forms-validation.ts';
import {actionPositionLabel,canCancelAction} from '../src/lib/action-view.ts';
import {
  decisionQueryKey,missionProjectionFieldSet,overviewInboxQueryKey,
  overviewMissionsQueryKey,projectionEventPath,projectionEventPathWithCursor,projectionQueryKey,
  actionQueryKey,
  actionListQueryKey,
  runQueryKey,
} from '../src/lib/query-keys.ts';

test('decision mutations derive stable idempotency keys from protected intent',()=>{
  const input={decisionId:'00000000-0000-4000-8000-000000000001',version:3,
    response:'Approved',packageDigest:'sha256:'+'0'.repeat(64),reason:'urgent',
    conditionRefs:[{type:'abh.condition',id:'00000000-0000-4000-8000-000000000002',version:2}],
    reauthProofRef:{type:'abh.reauth-proof',id:'00000000-0000-4000-8000-000000000003',version:1}};
  assert.equal(decisionIdempotencyKey(input),decisionIdempotencyKey(input));
  assert.notEqual(decisionIdempotencyKey(input),decisionIdempotencyKey({...input,reason:'changed'}));
  assert.notEqual(decisionIdempotencyKey(input),decisionIdempotencyKey({...input,conditionRefs:[]}));
  assert.notEqual(decisionIdempotencyKey(input),decisionIdempotencyKey({...input,reauthProofRef:undefined}));
  assert.equal(missionIdempotencyKey({missionId:'00000000-0000-4000-8000-000000000002',version:2,
    action:'pause'}),missionIdempotencyKey({missionId:'00000000-0000-4000-8000-000000000002',
    version:2,action:'pause'}));
  assert.notEqual(missionIdempotencyKey({missionId:'00000000-0000-4000-8000-000000000002',version:2,
    action:'cancel',reason:'stop'}),
    missionIdempotencyKey({missionId:'00000000-0000-4000-8000-000000000002',version:2,
      action:'cancel',reason:'restart'}));
  assert.equal(missionIdempotencyKey({missionId:'00000000-0000-4000-8000-000000000002',version:2,
    action:'cancel',reason:'stop',evidenceRefs:[{type:'abh.action',id:'00000000-0000-4000-8000-000000000021',version:1}]}),
    missionIdempotencyKey({missionId:'00000000-0000-4000-8000-000000000002',version:2,
      action:'cancel',reason:'stop',evidenceRefs:[{version:1,id:'00000000-0000-4000-8000-000000000021',type:'abh.action'}]}));
});

test('action cancellation binds version and normalized protected reason',()=>{
  const actionId='00000000-0000-4000-8000-000000000003',reason='stop before release';
  const key=cancelActionIdempotencyKey({actionId,version:4,reason});
  assert.equal(key,cancelActionIdempotencyKey({actionId,version:4,reason}));
  assert.notEqual(key,cancelActionIdempotencyKey({actionId,version:5,reason}));
  assert.notEqual(key,cancelActionIdempotencyKey({actionId,version:4,reason:'changed'}));
  assert.match(key,/^wb\/[0-9a-f-]{36}\/4\/cancel\/[0-9a-f]{64}$/);
});

test('evaluation requests derive stable keys from candidate and baseline versions',()=>{
  const input={candidateId:'00000000-0000-4000-8000-000000000031',candidateVersion:2,
    baselineArtifactId:'00000000-0000-4000-8000-000000000037',baselineVersion:5};
  const key=requestEvaluationIdempotencyKey(input);
  assert.equal(key,requestEvaluationIdempotencyKey(input));
  assert.notEqual(key,requestEvaluationIdempotencyKey({...input,candidateVersion:3}));
  assert.notEqual(key,requestEvaluationIdempotencyKey({...input,baselineVersion:6}));
  assert.match(key,/^wb\/[0-9a-f-]{36}\/2\/evaluation\/[0-9a-f]{64}$/);
});

test('evaluation retries bind the exact predecessor run version',()=>{
  const runId='00000000-0000-4000-8000-000000000032';
  const key=retryEvaluationIdempotencyKey({runId,version:2});
  assert.equal(key,retryEvaluationIdempotencyKey({runId,version:2}));
  assert.notEqual(key,retryEvaluationIdempotencyKey({runId,version:3}));
  assert.equal(key,`wb/${runId}/2/retry`);
});

test('learning release keys bind evidence and frozen capability intent',()=>{
  const input={candidateId:'00000000-0000-4000-8000-000000000031',candidateVersion:1,
    gateId:'00000000-0000-4000-8000-00000000003b',gateVersion:1,behaviorSlot:'learning.policy',
    capabilityId:'learning.passed-candidate',capabilityVersion:'0.1.0',
    capabilityDigest:`sha256:${'c'.repeat(64)}`,
    compatibilityArtifactId:'00000000-0000-4000-8000-000000000037',
    compatibilityArtifactVersion:1};
  const key=releaseLearningCandidateIdempotencyKey(input);
  assert.equal(key,releaseLearningCandidateIdempotencyKey(input));
  assert.notEqual(key,releaseLearningCandidateIdempotencyKey({...input,capabilityDigest:`sha256:${'d'.repeat(64)}`}));
  assert.match(key,/^wb\/[0-9a-f-]{36}\/1\/release\/[0-9a-f]{64}$/);
});

test('assignment pause keys bind reason and server-selected evidence',()=>{
  const input={assignmentId:'00000000-0000-4000-8000-000000000041',version:1,
    reason:'operations review',evidenceRef:{type:'abh.learning-gate',
      id:'00000000-0000-4000-8000-00000000003b',version:1}};
  const key=pauseAssignmentIdempotencyKey(input);
  assert.equal(key,pauseAssignmentIdempotencyKey(input));
  assert.notEqual(key,pauseAssignmentIdempotencyKey({...input,reason:'changed'}));
  assert.notEqual(key,pauseAssignmentIdempotencyKey({...input,evidenceRef:{
    ...input.evidenceRef,version:2}}));
  assert.match(key,/^wb\/[0-9a-f-]{36}\/1\/pause\/[0-9a-f]{64}$/);
});

test('assignment rollback keys bind predecessor and server-derived evidence',()=>{
  const input={assignmentId:'00000000-0000-4000-8000-000000000041',version:2,
    reason:'canary regression',previousReleaseRef:{type:'abh.release',
      id:'00000000-0000-4000-8000-000000000042',version:2},
    gateRefs:[{type:'abh.learning-gate',id:'00000000-0000-4000-8000-00000000003b',version:1}],
    compatibilityRef:{type:'abh.artifact',id:'00000000-0000-4000-8000-000000000037',version:1}};
  const key=rollbackAssignmentIdempotencyKey(input);
  assert.equal(key,rollbackAssignmentIdempotencyKey(input));
  assert.equal(key,rollbackAssignmentIdempotencyKey({...input,gateRefs:[input.gateRefs[0]]}));
  assert.notEqual(key,rollbackAssignmentIdempotencyKey({...input,reason:'changed'}));
  assert.notEqual(key,rollbackAssignmentIdempotencyKey({
    ...input,previousReleaseRef:{...input.previousReleaseRef,version:3}}));
  assert.notEqual(key,rollbackAssignmentIdempotencyKey({
    ...input,compatibilityRef:{...input.compatibilityRef,version:2}}));
  assert.match(key,/^wb\/[0-9a-f-]{36}\/2\/rollback\/[0-9a-f]{64}$/);
});

test('workbench maps bounded ABH errors and denies identity by default',async()=>{
  const error=new AbhClientError('ABH_ERROR','Responded',{
    success:false,error:{code:'FORBIDDEN',message:'denied',retryable:false,remediation:[]},
  } as never);
  assert.equal(errorText(error),'FORBIDDEN');
  assert.equal(await denyAllIdentityAdapter.resolve(new Headers()),null);
});

test('action detail presents server-authoritative state and operations',()=>{
  assert.equal(actionPositionLabel({lifecycle:'Executing',outcome:'Unknown'}),'执行中 · 结果待确认');
  assert.equal(canCancelAction({availableActions:['abh.actions.cancel']} as never),true);
  assert.equal(canCancelAction({availableActions:[]} as never),false);
});

test('live projection caches and subscriptions are partitioned by authorization context',()=>{
  const identity={actorId:'actor-1',actingOrganizationId:'org-1',resourceOrganizationId:'org-1',workspaceId:'workspace-1',
    purposeOfUse:'abh.runtime.deliver',authorizationDigest:'auth-1'};
  const key=projectionQueryKey(identity,'abh.mission','mission-1',missionProjectionFieldSet);
  assert.deepEqual(key,projectionQueryKey({...identity},'abh.mission','mission-1',missionProjectionFieldSet));
  assert.notDeepEqual(key,projectionQueryKey({...identity,authorizationDigest:'auth-2'},
    'abh.mission','mission-1',missionProjectionFieldSet));
  assert.notDeepEqual(key,projectionQueryKey({...identity,actingOrganizationId:'org-2'},
    'abh.mission','mission-1',missionProjectionFieldSet));
  assert.notDeepEqual(key,projectionQueryKey({...identity,resourceOrganizationId:'org-3'},
    'abh.mission','mission-1',missionProjectionFieldSet));
  assert.equal(projectionEventPath('abh.mission','mission-1'),'/api/events/abh.mission/mission-1');
});

test('projection recovery cursors remain bounded and encoded',()=>{
  assert.equal(projectionEventPathWithCursor('abh.mission','mission-1','cursor/1'),
    '/api/events/abh.mission/mission-1?lastEventId=cursor%2F1');
  assert.equal(projectionEventPathWithCursor('abh.mission','mission-1',''),
    '/api/events/abh.mission/mission-1');
  assert.equal(projectionEventPathWithCursor('abh.mission','mission-1','x'.repeat(65)),
    '/api/events/abh.mission/mission-1');
});

test('overview caches are partitioned by authorization context',()=>{
  const identity={actorId:'actor-1',actingOrganizationId:'org-1',resourceOrganizationId:'org-1',workspaceId:'workspace-1',
    purposeOfUse:'abh.runtime.deliver',authorizationDigest:'auth-1'};
  const missions=overviewMissionsQueryKey(identity);
  const inbox=overviewInboxQueryKey(identity);
  assert.deepEqual(missions,overviewMissionsQueryKey({...identity}));
  assert.deepEqual(inbox,overviewInboxQueryKey({...identity}));
  assert.notDeepEqual(missions,overviewMissionsQueryKey({...identity,authorizationDigest:'auth-2'}));
  assert.notDeepEqual(missions,overviewMissionsQueryKey({...identity,actorId:'actor-2'}));
  assert.notDeepEqual(missions,overviewMissionsQueryKey({...identity,resourceOrganizationId:'org-3'}));
  assert.notDeepEqual(inbox,overviewInboxQueryKey({...identity,actingOrganizationId:'org-2'}));
});

test('decision state caches remain isolated by authorization context',()=>{
  const identity={actorId:'actor-1',actingOrganizationId:'org-1',resourceOrganizationId:'org-1',workspaceId:'workspace-1',
    purposeOfUse:'abh.decisions.read',authorizationDigest:'auth-1'};
  const key=decisionQueryKey(identity,'decision-1');
  assert.deepEqual(key,decisionQueryKey({...identity},'decision-1'));
  assert.notDeepEqual(key,decisionQueryKey({...identity,authorizationDigest:'auth-2'},'decision-1'));
  assert.notDeepEqual(key,decisionQueryKey({...identity,actorId:'actor-2'},'decision-1'));
  assert.notDeepEqual(key,decisionQueryKey({...identity,resourceOrganizationId:'org-2'},'decision-1'));
});

test('action state caches remain isolated by authorization context',()=>{
  const identity={actorId:'actor-1',actingOrganizationId:'org-1',resourceOrganizationId:'org-1',
    workspaceId:'workspace-1',purposeOfUse:'abh.actions.read',authorizationDigest:'auth-1'};
  const key=actionQueryKey(identity,'action-1');
  assert.deepEqual(key,actionQueryKey({...identity},'action-1'));
  assert.notDeepEqual(key,actionQueryKey({...identity,authorizationDigest:'auth-2'},'action-1'));
  assert.notDeepEqual(key,actionQueryKey({...identity,actorId:'actor-2'},'action-1'));
  assert.notDeepEqual(key,actionQueryKey({...identity,actingOrganizationId:'org-2'},'action-1'));
  assert.notDeepEqual(key,actionQueryKey({...identity,resourceOrganizationId:'org-2'},'action-1'));
});

test('action list caches isolate identity and every paging filter',()=>{
  const identity={actorId:'actor-1',actingOrganizationId:'org-1',resourceOrganizationId:'org-1',
    workspaceId:'workspace-1',purposeOfUse:'abh.actions.read',authorizationDigest:'auth-1'};
  const filters={missionId:'mission-1',lifecycle:'Executing',outcome:'Unknown',
    cursor:'ic1.next'};
  const key=actionListQueryKey(identity,filters);
  assert.deepEqual(key,actionListQueryKey({...identity},filters));
  assert.notDeepEqual(key,actionListQueryKey({...identity,authorizationDigest:'auth-2'},filters));
  assert.notDeepEqual(key,actionListQueryKey(identity,{...filters,cursor:'ic1.old'}));
  assert.notDeepEqual(key,actionListQueryKey(identity,{...filters,lifecycle:'Closed'}));
  assert.notDeepEqual(key,actionListQueryKey(identity,{...filters,outcome:'Succeeded'}));
  assert.notDeepEqual(key,actionListQueryKey(identity,{...filters,missionId:'mission-2'}));
});

test('run state caches isolate authorization context and subscribe with a bounded subject',()=>{
  const identity={actorId:'actor-1',actingOrganizationId:'org-1',resourceOrganizationId:'org-1',
    workspaceId:'workspace-1',purposeOfUse:'abh.mission.manage',authorizationDigest:'auth-1'};
  const key=runQueryKey(identity,'run-1');
  assert.deepEqual(key,runQueryKey({...identity},'run-1'));
  assert.notDeepEqual(key,runQueryKey({...identity,authorizationDigest:'auth-2'},'run-1'));
  assert.notDeepEqual(key,runQueryKey({...identity,actorId:'actor-2'},'run-1'));
  assert.equal(projectionEventPath('abh.run','00000000-0000-4000-8000-000000000001'),
    '/api/events/abh.run/00000000-0000-4000-8000-000000000001');
});

test('organization cookies are parsed as untrusted selection hints only',()=>{
  const selection=parseOrganizationSelection({
    actingOrganizationId:'00000000-0000-4000-8000-000000000001',
    resourceOrganizationId:'00000000-0000-4000-8000-000000000002',
    workspaceId:'00000000-0000-4000-8000-000000000003',
  });
  assert.deepEqual(selection,{actingOrganizationId:'00000000-0000-4000-8000-000000000001',
    resourceOrganizationId:'00000000-0000-4000-8000-000000000002',
    workspaceId:'00000000-0000-4000-8000-000000000003'});
  assert.equal(parseOrganizationSelection({actingOrganizationId:'org',
    resourceOrganizationId:'00000000-0000-4000-8000-000000000002'}),undefined);
  assert.equal(parseOrganizationSelection({
    actingOrganizationId:'00000000-0000-4000-8000-000000000001',
    resourceOrganizationId:'00000000-0000-4000-8000-000000000002',workspaceId:'bad'}),undefined);
  assert.equal(isOrganizationChoice({key:'org-a',actingOrganizationId:'00000000-0000-4000-8000-000000000001',
    resourceOrganizationId:'00000000-0000-4000-8000-000000000002'}),true);
  assert.equal(isOrganizationChoice({key:'',actingOrganizationId:'00000000-0000-4000-8000-000000000001',
    resourceOrganizationId:'00000000-0000-4000-8000-000000000002'}),false);
});

test('compensation templates and input are validated against the registered schema',()=>{
  const entity={type:'abh.action',id:'00000000-0000-4000-8000-000000000001',version:2};
  const template={
    key:'refund-order',label:'发起补偿',description:'创建一个新的补偿 Action',
    actionType:'demo.order.refund',targetRefs:[entity],sourceVersionRefs:[entity],
    artifact:{ownerRef:entity,dataClass:'business',purposeNames:['abh.runtime.deliver'],
      sourceRefs:[entity],region:'cn-east-1',retentionPolicyRef:entity},
    inputSchema:{type:'object',properties:{reason:{type:'string',minLength:1,maxLength:100}},
      required:['reason'],additionalProperties:false},
    initialData:{reason:''},
  };
  assert.equal(validateCompensationTemplate(template),true);
  assert.equal(validateCompensationTemplate({...template,
    artifact:{...template.artifact,sourceRefs:[{type:'abh.organization',
      id:'00000000-0000-4000-8000-000000000002',version:1}]}}),true);
  assert.equal(validateCompensationInput(template.inputSchema,{reason:'valid'}).success,true);
  assert.equal(validateCompensationInput(template.inputSchema,{reason:''}).success,false);
  assert.notEqual(compensationIdempotencyKey({sourceActionId:'action',sourceActionVersion:1,
    templateKey:'refund-order',intent:{reason:'a'}}),compensationIdempotencyKey({
    sourceActionId:'action',sourceActionVersion:1,templateKey:'refund-order',intent:{reason:'b'}}));
});
