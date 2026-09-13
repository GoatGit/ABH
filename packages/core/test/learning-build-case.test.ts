import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {BuildCaseCommand,BuildCasePayload,BuildGateCommand,BuildGatePayload,CreateCandidateCommand,CreateCandidatePayload,EntityRef,
  ConfigureLearningCandidateReleaseCommand,ConfigureLearningReleasePayload,EvaluationProfileRecord,GrantRecord,
  LearningSignalRecord,ReleaseRecord,RequestEvaluationCommand,RequestEvaluationPayload,StaticAssignmentRecord,
  RetryEvaluationCommand,StoreInlineArtifactPayload,SubmitEvaluationResultCommand,
  SubmitEvaluationResultPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import {InlineArtifactOwner} from '../src/data/artifacts.ts';
import {inputDigest,type CommandIdentity} from '../src/data/journal.ts';
import {buildCase} from '../src/mission/build-case.ts';
import {createCandidate} from '../src/mission/create-candidate.ts';
import {requestEvaluation} from '../src/mission/request-evaluation.ts';
import {buildGate} from '../src/mission/build-gate.ts';
import {submitEvaluationResult} from '../src/mission/submit-evaluation-result.ts';
import {retryEvaluation} from '../src/mission/retry-evaluation.ts';
import {configureLearningCandidateRelease} from '../src/release/learning.ts';
import {LearningOwner} from '../src/mission/learning.ts';
import {createCoreHttpApp} from '../src/server/http.ts';
import {recoverEvaluationRunsOnce,type EvaluationDispatcher} from '../src/mission/evaluation-recovery-worker.ts';
import {createMissionQueryHandlers,type MissionHttpInstallation} from '../src/server/mission-http.ts';
import {LearningCursorCodec} from '../src/server/learning-cursor.ts';
import {PurposeOwner} from '../src/control/purposes.ts';
import {createAbhClient} from '../src/client.ts';
import {IdentityIngress} from '../src/identity/ingress.ts';
import {deriveVerifiedContext} from '../src/internal/context.ts';
import type {VerifiedContext} from '../src/internal/context.ts';
import {CoreError} from '../src/internal/errors.ts';
import {createDatabaseFixture,context,options} from './database-fixture.ts';

const ref=<T extends string>(type:T,id:string=randomUUID(),version=1)=>({type,id,version});
const artifactCommand=async(input:StoreInlineArtifactPayload):Promise<CommandIdentity>=>({
  type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:randomUUID(),
  digest:await inputDigest({purpose:'test',input})});

test('learning cases require governed signals and current evidence',{timeout:120_000},async t=>{
 const f=await createDatabaseFixture();t.after(()=>f.close());
 const db=f.database,c=deriveVerifiedContext({...context().request,purposeOfUse:'abh.learning.capture'});
 const org=c.tenant.resourceOrganizationId,principal=ref('abh.principal',c.tenant.actor.id),scope=ref('abh.organization',org);
 const grant=ref('abh.grant'),domainOwner=ref('abh.domain'),otherScope=ref('abh.workspace');
 const evaluator=ref('abh.principal'),gatePrincipal=ref('abh.principal'),producerEvaluationGrant=ref('abh.grant'),
   evaluationGrant=ref('abh.grant'),gateGrant=ref('abh.grant'),evaluatorGateGrant=ref('abh.grant');
 const service=ref('abh.principal'),serviceGrant=ref('abh.grant');
 const validFrom=new Date(Date.now()-1000).toISOString(),validUntil=new Date(Date.now()+60_000).toISOString();
 const learningOwner=new LearningOwner();
  const grantRecord:GrantRecord={grantRef:ref('abh.grant',grant.id),resourceOrganizationId:org,principalRef:principal,
   scopeRefs:[scope],actionTypes:['abh.learning.build-case','abh.learning.create-candidate','abh.learning.read'],purposeNames:['abh.learning.capture'],
   validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'};
 const signal=(id:string,scopeValue:EntityRef=scope,purpose='abh.learning.capture'):LearningSignalRecord=>({
   signalRef:ref('abh.learning-signal',id),resourceOrganizationId:org,sourceEventRef:ref('abh.correction'),
   signalType:'memory.correction',artifactRefs:[],scopeRef:scopeValue,purposeOfUse:purpose,capturedAt:validFrom});
 const first=signal(randomUUID()),second=signal(randomUUID());
 await db.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.organizations(resource_organization_id,id,name,home_region,status)
    VALUES (${org},${org},'learning','local','Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
    VALUES (${org},${principal.id},'producer','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
    VALUES (${org},${randomUUID()},${principal.id},1,'Active')`;
 for(const value of [scope,principal,grant])
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
  VALUES (${org},${grant.id},${principal.id},${JSON.stringify(grantRecord)}::text::jsonb,${validFrom},${validUntil},'Active')`;
 });
 await f.admin`INSERT INTO core.learning_signals
   (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,signal_type)
   VALUES (${org},${first.signalRef.id},${null},${principal.id},${principal.id},ARRAY['abh.learning.capture'],
     ${JSON.stringify(first)}::text::jsonb,${first.signalType}),
   (${org},${second.signalRef.id},${null},${principal.id},${principal.id},ARRAY['abh.learning.capture'],
     ${JSON.stringify(second)}::text::jsonb,${second.signalType})`;
 const store=async(content:string)=>{const inline=new InlineArtifactOwner();
   const input:StoreInlineArtifactPayload={ownerRef:scope,mediaType:'application/json',content,
     purposeNames:['abh.learning.capture'],dataClass:'abh.data.internal',sourceRefs:[first.signalRef],
     region:'local',retentionPolicyRef:ref('abh.retention-policy')};
   return db.transaction(c,options(),async tx=>await inline.store(tx,await artifactCommand(input),input,async()=>{}));};
 const evidence=await store('{"rootCause":true}'),counter=await store('{"counterEvidence":true}');
 const capability=await store('{"candidate":true}');
 const payload:BuildCasePayload={signalRefs:[first.signalRef,second.signalRef],rootCauseCode:'learning.test-root',
   evidenceRefs:[evidence.artifactRef],counterEvidenceRefs:[counter.artifactRef],domainOwnerRef:domainOwner};
 const command=(value=payload):BuildCaseCommand=>({type:'abh.learning.build-case',schemaVersion:'0.1.0',
   commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload:value});
 const invoke=(value=command(),grants:readonly EntityRef[]=[grant],contextValue=c)=>
   buildCase(db,contextValue,options(),value,grants);
 await assert.rejects(invoke(command(),[]),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(invoke(command({...payload,evidenceRefs:[ref('abh.artifact')]})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 const mixedScope=signal(randomUUID(),otherScope);
 await f.admin`INSERT INTO core.learning_signals
   (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,signal_type)
   VALUES (${org},${mixedScope.signalRef.id},${null},${principal.id},${principal.id},ARRAY['abh.learning.capture'],
     ${JSON.stringify(mixedScope)}::text::jsonb,${mixedScope.signalType})`;
 await assert.rejects(invoke(command({...payload,signalRefs:[first.signalRef,mixedScope.signalRef]})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 const withdrawn=signal(randomUUID(),scope,'abh.retired-purpose');
 await f.admin`INSERT INTO core.learning_signals
   (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,signal_type)
   VALUES (${org},${withdrawn.signalRef.id},${null},${principal.id},${principal.id},ARRAY['abh.retired-purpose'],
     ${JSON.stringify(withdrawn)}::text::jsonb,${withdrawn.signalType})`;
 await assert.rejects(invoke(command({...payload,signalRefs:[first.signalRef,withdrawn.signalRef]})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 const stable=command(),accepted=await invoke(stable);
 assert.deepEqual(accepted.signalRefs,payload.signalRefs);assert.equal(accepted.rootCauseCode,payload.rootCauseCode);
 assert.equal(accepted.digest.startsWith('sha256:'),true);assert.deepEqual(await invoke(stable),accepted);
 const foreignContext=deriveVerifiedContext({...context(randomUUID()).request,purposeOfUse:'abh.learning.capture'});
 await assert.rejects(buildCase(db,foreignContext,options(),command(),[ref('abh.grant')]),{code:'FORBIDDEN'});
 const candidatePayload:CreateCandidatePayload={caseRef:accepted.caseRef,assetKind:'model.prompt',baseVersion:1,
   candidateArtifactRef:capability.artifactRef,scopeRef:scope,risk:'learning.low'};
 const candidateCommand=(value=candidatePayload):CreateCandidateCommand=>({type:'abh.learning.create-candidate',
   schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
   target:{type:'abh.organization',id:org},payload:value});
 const candidateInvoke=(value=candidateCommand(),grants:readonly EntityRef[]=[grant],contextValue=c)=>
   createCandidate(db,contextValue,options(),value,grants);
 await assert.rejects(candidateInvoke(candidateCommand(),[]),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(candidateInvoke(candidateCommand({...candidatePayload,
   caseRef:{...accepted.caseRef,version:2}})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 await assert.rejects(candidateInvoke(candidateCommand({...candidatePayload,caseRef:ref('abh.learning-case')})),
   {code:'CASE_EVIDENCE_INCOMPLETE'});
 await assert.rejects(candidateInvoke(candidateCommand({...candidatePayload,scopeRef:otherScope})),
   {code:'CANDIDATE_SCOPE_EXCEEDED'});
 await assert.rejects(candidateInvoke(candidateCommand({...candidatePayload,
   candidateArtifactRef:{...evidence.artifactRef,version:1}})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 const stableCandidate=candidateCommand(),acceptedCandidate=await candidateInvoke(stableCandidate);
 assert.equal(acceptedCandidate.status,'Draft');assert.equal(acceptedCandidate.assetKind,candidatePayload.assetKind);
 assert.equal(acceptedCandidate.digest.startsWith('sha256:'),true);
 assert.deepEqual(await candidateInvoke(stableCandidate),acceptedCandidate);
 await f.admin`UPDATE data.artifacts SET purpose_names=ARRAY['abh.learning.capture','abh.learning.evaluate','abh.learning.gate']`;
 await db.transaction(c,options(),async tx=>{
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
    VALUES (${org},${evaluator.id},'evaluator','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
    VALUES (${org},${randomUUID()},${evaluator.id},1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
    VALUES (${org},${gatePrincipal.id},'gate','Human',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
    VALUES (${org},${randomUUID()},${gatePrincipal.id},1,'Active')`;
  const grantValue=(id:string,principalId:string,actionTypes:readonly string[]=[
    'abh.learning.request-evaluation','abh.learning.retry-evaluation','abh.learning.submit-evaluation-result',
    'abh.learning.read']):GrantRecord=>({
    grantRef:ref('abh.grant',id),resourceOrganizationId:org,
    principalRef:ref('abh.principal',principalId),scopeRefs:[scope],actionTypes:[...actionTypes],
    purposeNames:['abh.learning.evaluate'],validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'});
  const gateGrantValue=(id:string,principalId:string):GrantRecord=>({grantRef:ref('abh.grant',id),resourceOrganizationId:org,
    principalRef:ref('abh.principal',principalId),scopeRefs:[scope],
    actionTypes:['abh.learning.build-gate','abh.learning.read'],
    purposeNames:['abh.learning.gate'],validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'});
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
    VALUES (${org},${randomUUID()},'abh.principal',${evaluator.id},1),(${org},${randomUUID()},'abh.principal',${gatePrincipal.id},1),
      (${org},${randomUUID()},'abh.grant',${evaluationGrant.id},1),(${org},${randomUUID()},'abh.grant',${producerEvaluationGrant.id},1),
      (${org},${randomUUID()},'abh.grant',${gateGrant.id},1),(${org},${randomUUID()},'abh.grant',${evaluatorGateGrant.id},1)`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
    VALUES (${org},${producerEvaluationGrant.id},${principal.id},${JSON.stringify(grantValue(producerEvaluationGrant.id,principal.id))}::text::jsonb,${validFrom},${validUntil},'Active'),
      (${org},${evaluationGrant.id},${evaluator.id},${JSON.stringify(grantValue(evaluationGrant.id,evaluator.id))}::text::jsonb,${validFrom},${validUntil},'Active')`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
    VALUES (${org},${gateGrant.id},${gatePrincipal.id},${JSON.stringify(gateGrantValue(gateGrant.id,gatePrincipal.id))}::text::jsonb,${validFrom},${validUntil},'Active'),
      (${org},${evaluatorGateGrant.id},${evaluator.id},${JSON.stringify(gateGrantValue(evaluatorGateGrant.id,evaluator.id))}::text::jsonb,${validFrom},${validUntil},'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
    VALUES (${org},${service.id},'evaluation worker','Service',1,'Active')`;
  await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
    VALUES (${org},${randomUUID()},${service.id},1,'Active')`;
  await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
    VALUES (${org},${randomUUID()},'abh.principal',${service.id},1),(${org},${randomUUID()},'abh.grant',${serviceGrant.id},1)`;
  await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
    VALUES (${org},${serviceGrant.id},${service.id},${JSON.stringify(grantValue(serviceGrant.id,service.id,
      ['abh.learning.request-evaluation','abh.learning.retry-evaluation','abh.learning.expire-evaluation','abh.learning.read']))}::text::jsonb,
      ${validFrom},${validUntil},'Active')`;
 });
 const evaluatorContext=deriveVerifiedContext({...context(org,evaluator.id).request,purposeOfUse:'abh.learning.evaluate'});
 const producerEvaluationContext=deriveVerifiedContext({...context(org,principal.id).request,purposeOfUse:'abh.learning.evaluate'});
 const approvedAt=new Date().toISOString();
 const profile=(id:string):EvaluationProfileRecord=>({profileRef:ref('abh.evaluation-profile',id),
   resourceOrganizationId:org,assetKind:candidatePayload.assetKind,risk:candidatePayload.risk,
   suiteRef:evidence.artifactRef,datasetSnapshotRef:counter.artifactRef,evaluatorRef:evaluator,
	   metricThresholdRef:evidence.artifactRef,metricThresholds:[{name:'evaluation.accuracy',minimum:0.95}],
	   stoppingRuleRef:counter.artifactRef,
	   assignmentUnit:'evaluation.scenario',minimumSamples:30,confidenceLevel:0.95,minimumRelativeLift:0.02,
	   approvedBy:{type:'Human',id:evaluator.id},
   approvedAt,digest:'sha256:'+'0'.repeat(64)});
 const evaluationCommand=(value:{candidateRef:EntityRef;baselineRef:EntityRef}):RequestEvaluationCommand=>
   ({type:'abh.learning.request-evaluation',schemaVersion:'0.1.0',commandId:randomUUID(),idempotencyKey:randomUUID(),
     target:{type:'abh.organization',id:org},payload:value});
 const evaluationInvoke=(value:RequestEvaluationCommand,grants:readonly EntityRef[]=[evaluationGrant],
   contextValue=evaluatorContext)=>requestEvaluation(db,contextValue,options(),value,grants);
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef}),[]),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef}),[producerEvaluationGrant],producerEvaluationContext),
   {code:'EVALUATOR_IDENTITY_INVALID'});
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:acceptedCandidate.candidateArtifactRef})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:ref('abh.artifact')})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef})),{code:'EVALUATION_PROFILE_UNAVAILABLE'});
 const insertProfile=async(id:string,suiteRef:EntityRef=evidence.artifactRef)=>{const value=profile(id);
   const record:EvaluationProfileRecord={...value,suiteRef};record.digest=await digestContract('EvaluationProfileRecord',{
     ...record,digest:'sha256:'+'0'.repeat(64)});
   await f.admin`INSERT INTO core.evaluation_profiles
     (resource_organization_id,id,workspace_id,purpose_names,record,asset_kind,risk,approved_at,created_by,updated_by)
     VALUES (${org},${record.profileRef.id},${null},ARRAY['abh.learning.capture','abh.learning.evaluate','abh.learning.gate'],
       ${JSON.stringify(record)}::text::jsonb,${record.assetKind},${record.risk},${record.approvedAt},${evaluator.id},${evaluator.id})`;return record;};
 const badProfile=await insertProfile(randomUUID(),ref('abh.artifact'));
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef})),{code:'CASE_EVIDENCE_INCOMPLETE'});
 await insertProfile(randomUUID());
 await assert.rejects(evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef})),{code:'EVALUATION_PROFILE_AMBIGUOUS'});
 await f.admin`DELETE FROM core.evaluation_profiles WHERE id=${badProfile.profileRef.id}`;
 const stableEvaluation=evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef}),acceptedEvaluation=await evaluationInvoke(stableEvaluation);
 assert.equal(acceptedEvaluation.status,'Queued');assert.equal(acceptedEvaluation.assignmentUnit,'evaluation.scenario');
 assert.equal(acceptedEvaluation.digest.startsWith('sha256:'),true);
 assert.deepEqual(await evaluationInvoke(stableEvaluation),acceptedEvaluation);
 const workerContext=deriveVerifiedContext({...context(org,service.id).request,
   actor:{type:'Service',id:service.id},purposeOfUse:'abh.learning.evaluate'});
 const workerInput=(dispatcher:EvaluationDispatcher,grantRefs:readonly EntityRef[]=[serviceGrant])=>({
   workerId:service.id,context:async()=>workerContext,grantRefs,dispatcher,
   signal:new AbortController().signal,pageSize:10,leaseSeconds:1,maxAttempts:5,transactionTimeoutMs:5000});
 const dispatcher=(callback:EvaluationDispatcher['dispatch']):EvaluationDispatcher=>({dispatch:callback});
 await assert.rejects(recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>{throw new Error('unauthorized dispatch')}),[])),
   {code:'AUTHORITY_REQUIRED'});
 const acceptedDispatches:EntityRef[]=[];
 const acceptedRecovery=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async value=>{
   acceptedDispatches.push(value.run.runRef);return 'Accepted';})));
 assert.deepEqual(acceptedRecovery,{scanned:1,dispatched:1,unknown:0,expired:0});
 assert.deepEqual(acceptedDispatches,[acceptedEvaluation.runRef]);
 const [releasedLease]=await f.admin`SELECT fencing_token::int AS token,lease_until<=clock_timestamp() AS expired
   FROM runtime.work_leases WHERE resource_organization_id=${org} AND target_id=${acceptedEvaluation.runRef.id}`;
 assert.equal(releasedLease!.token,1);assert.equal(releasedLease!.expired,true);
 const takeoverRecovery=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async value=>{
   acceptedDispatches.push(value.run.runRef);return 'Accepted';})));
 assert.deepEqual(takeoverRecovery,{scanned:1,dispatched:1,unknown:0,expired:0});
 assert.equal(acceptedDispatches.length,2);
 const unknownRecovery=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>'Unknown')));
 assert.deepEqual(unknownRecovery,{scanned:1,dispatched:0,unknown:1,expired:0});
 const activeRecovery=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>{
   throw new Error('must not duplicate an active lease');})));
 assert.deepEqual(activeRecovery,{scanned:1,dispatched:0,unknown:0,expired:0});
 const [unknownLease]=await f.admin`SELECT lease_until>clock_timestamp() AS active
   FROM runtime.work_leases WHERE resource_organization_id=${org} AND target_id=${acceptedEvaluation.runRef.id}`;
 assert.equal(unknownLease!.active,true);
 const attemptRun=await evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef}));
 const attemptTarget=attemptRun.runRef.id;
 const attemptAccepted=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>'Accepted')));
 assert.equal(attemptAccepted.dispatched,1);
 await f.admin`UPDATE runtime.work_leases SET fencing_token=5,lease_until=clock_timestamp()-interval '1 second'
   WHERE resource_organization_id=${org} AND target_id=${attemptTarget}`;
 const attemptExpiry=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>{
   throw new Error('attempt limit must not dispatch');})));
 assert.equal(attemptExpiry.expired,1);
 const attemptRunAfter=await db.transaction(evaluatorContext,options(),tx=>learningOwner.getEvaluationRun(
   tx,{type:'abh.evaluation-run',id:attemptTarget,version:2}));
 assert.equal(attemptRunAfter.status,'Inconclusive');
 const expiredRun=await evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef}));
 const expiredAt=new Date(Date.now()-1000).toISOString();
 const expiredDigest=await digestContract('EvaluationRunRecord',{...expiredRun,expiresAt:expiredAt,
   digest:'sha256:'+'0'.repeat(64)});
 await f.admin`UPDATE core.evaluation_runs SET record=${JSON.stringify({...expiredRun,
   expiresAt:expiredAt,digest:expiredDigest})}::text::jsonb,
   expires_at=clock_timestamp()-interval '1 second' WHERE resource_organization_id=${org}
     AND id=${expiredRun.runRef.id}`;
 const clockExpiry=await recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>{
   throw new Error('expired runs must not dispatch');})));
 assert.equal(clockExpiry.expired,1);
 const expiredRunRef={...expiredRun.runRef,version:2};
 await f.admin`INSERT INTO core.learning_withdrawals(resource_organization_id,id,purpose_names,purpose_name,record,command_id,created_by,updated_by)
   VALUES (${org},${randomUUID()},ARRAY['abh.learning.evaluate'],'abh.learning.evaluate',
     ${JSON.stringify({resourceOrganizationId:org,purposeName:'abh.learning.evaluate'})}::text::jsonb,
     ${randomUUID()},${principal.id},${principal.id})`;
 try{
   await assert.rejects(recoverEvaluationRunsOnce(db,workerInput(dispatcher(async()=>'Accepted'))),
     {code:'LEARNING_PURPOSE_DENIED'});
 }finally{await f.admin`DELETE FROM core.learning_withdrawals WHERE resource_organization_id=${org}
   AND purpose_name='abh.learning.evaluate'`;}
 const retryCommand=(payload:{runRef:EntityRef}):RetryEvaluationCommand=>({
   type:'abh.learning.retry-evaluation',schemaVersion:'0.1.0',commandId:randomUUID(),
   idempotencyKey:randomUUID(),target:{type:'abh.organization',id:org},payload});
 const retryInvoke=(value:RetryEvaluationCommand,grants:readonly EntityRef[]=[evaluationGrant],
   contextValue=evaluatorContext)=>retryEvaluation(db,contextValue,options(),value,grants);
 await assert.rejects(retryInvoke(retryCommand({runRef:ref('abh.evaluation-run')})),
   {code:'RESOURCE_NOT_FOUND'});
 const retryCommandAccepted=retryCommand({runRef:expiredRunRef});
 await assert.rejects(retryInvoke(retryCommandAccepted),{code:'PRECONDITION_FAILED'});
 const retryCandidateEvidence=await store('{"retryCandidate":true}');
 const retryCandidate=await candidateInvoke(candidateCommand({...candidatePayload,
   candidateArtifactRef:retryCandidateEvidence.artifactRef}));
 const retryOriginal=await evaluationInvoke(evaluationCommand({candidateRef:retryCandidate.candidateRef,
   baselineRef:counter.artifactRef}));
 const retryOriginalDigest=await digestContract('EvaluationRunRecord',{...retryOriginal,
   status:'Inconclusive',runRef:{...retryOriginal.runRef,version:2},digest:'sha256:'+'0'.repeat(64)});
 await f.admin`UPDATE core.evaluation_runs SET status='Inconclusive',version=2,
   record=${JSON.stringify({...retryOriginal,status:'Inconclusive',runRef:{...retryOriginal.runRef,version:2},
     digest:retryOriginalDigest})}::text::jsonb WHERE resource_organization_id=${org}
     AND id=${retryOriginal.runRef.id}`;
 await assert.rejects(retryInvoke(retryCommand({runRef:{...retryOriginal.runRef,version:2}}),
   [producerEvaluationGrant],producerEvaluationContext),{code:'EVALUATOR_IDENTITY_INVALID'});
 const retryCommandAcceptedExact=retryCommand({runRef:{...retryOriginal.runRef,version:2}});
 const acceptedRetry=await retryInvoke(retryCommandAcceptedExact);
 assert.equal(acceptedRetry.status,'Queued');
 assert.deepEqual(acceptedRetry.candidateRef,retryCandidate.candidateRef);
 assert.deepEqual(acceptedRetry.profileRef,retryOriginal.profileRef);
 assert.deepEqual(acceptedRetry.baselineRef,retryOriginal.baselineRef);
 assert.deepEqual(acceptedRetry.retryOfRef,{...retryOriginal.runRef,version:2});
 assert.notEqual(acceptedRetry.seed,retryOriginal.seed);
 assert.deepEqual(await retryInvoke(retryCommandAcceptedExact),acceptedRetry);
 await assert.rejects(retryInvoke(retryCommand({runRef:{...retryOriginal.runRef,version:2}})),
   {code:'PRECONDITION_FAILED'});
 const resultPayload=(runRef:EntityRef,completedSamples:number,failedSamples=0,accuracy=0.93):SubmitEvaluationResultPayload=>({
   runRef,artifactRefs:[evidence.artifactRef,counter.artifactRef],
   executionRefs:[ref('abh.invocation'),ref('abh.invocation')],
	   metricValues:[{name:'evaluation.accuracy',value:accuracy}],completedSamples,failedSamples,
	   baselineMetricValues:[{name:'evaluation.accuracy',value:0.93}],baselineCompletedSamples:30,
	   baselineFailedSamples:0,
	   dataDigest:'sha256:'+'0'.repeat(64),evaluatorPrincipal:evaluator});
 const resultCommand=(payload:SubmitEvaluationResultPayload,expectedVersion=1):SubmitEvaluationResultCommand=>({
   type:'abh.learning.submit-evaluation-result',schemaVersion:'0.1.0',commandId:randomUUID(),
   idempotencyKey:randomUUID(),target:{type:'abh.evaluation-run',id:payload.runRef.id},
   expectedVersion,payload});
 const resultInvoke=(value:SubmitEvaluationResultCommand,grants:readonly EntityRef[]=[evaluationGrant],
   contextValue=evaluatorContext)=>submitEvaluationResult(db,contextValue,options(),value,grants);
 await assert.rejects(resultInvoke(resultCommand({...resultPayload(acceptedEvaluation.runRef,29),
	   evaluatorPrincipal:ref('abh.principal')})),{code:'EVALUATOR_IDENTITY_INVALID'});
 const {baselineCompletedSamples:_count,...missingBaselineCount}=resultPayload(acceptedEvaluation.runRef,30);
 await assert.rejects(resultInvoke(resultCommand(missingBaselineCount)),{code:'INVALID_ARGUMENT'});
 const {baselineMetricValues:_values,...missingBaselineValues}=resultPayload(acceptedEvaluation.runRef,30);
 await assert.rejects(resultInvoke(resultCommand(missingBaselineValues)),{code:'INVALID_ARGUMENT'});
 const inconclusiveCommand=resultCommand(resultPayload(acceptedEvaluation.runRef,29)),acceptedInconclusive=
   await resultInvoke(inconclusiveCommand);
 assert.equal(acceptedInconclusive.status,'Inconclusive');assert.equal(acceptedInconclusive.completedSamples,29);
 assert.equal(acceptedInconclusive.digest.startsWith('sha256:'),true);
 assert.deepEqual(await resultInvoke(inconclusiveCommand),acceptedInconclusive);
 await assert.rejects(resultInvoke(resultCommand(resultPayload({...expiredRun.runRef,version:2},29),2)),
   {code:'PRECONDITION_FAILED'});
 await assert.rejects(resultInvoke(resultCommand(resultPayload({...acceptedEvaluation.runRef,version:2},29),2)),
   {code:'PRECONDITION_FAILED'});
const completedRun=await evaluationInvoke(evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:counter.artifactRef}));
const completedCommand=resultCommand(resultPayload(completedRun.runRef,30)),acceptedCompleted=
   await resultInvoke(completedCommand);
assert.equal(acceptedCompleted.status,'Completed');assert.equal(acceptedCompleted.failedSamples,0);
assert.deepEqual(await resultInvoke(completedCommand),acceptedCompleted);
 await assert.rejects(retryInvoke(retryCommand({runRef:{...completedRun.runRef,version:2}})),
   {code:'PRECONDITION_FAILED'});
 const gateContext=deriveVerifiedContext({...context(org,gatePrincipal.id).request,purposeOfUse:'abh.learning.gate'});
 const evaluatorGateContext=deriveVerifiedContext({...context(org,evaluator.id).request,purposeOfUse:'abh.learning.gate'});
 const gatePayload=(candidateRef:EntityRef,evaluationRefs:EntityRef[]):BuildGatePayload=>({candidateRef,evaluationRefs});
 const gateCommand=(payload:BuildGatePayload):BuildGateCommand=>({type:'abh.learning.build-gate',schemaVersion:'0.1.0',
   commandId:randomUUID(),idempotencyKey:randomUUID(),target:{type:'abh.learning-candidate',id:payload.candidateRef.id},
   expectedVersion:payload.candidateRef.version,payload});
 const gateInvoke=(value:BuildGateCommand,grants:readonly EntityRef[]=[gateGrant],
   contextValue=gateContext)=>buildGate(db,contextValue,options(),value,grants);
 const secondCandidatePayload={...candidatePayload,candidateArtifactRef:evidence.artifactRef};
 const secondCandidate=await candidateInvoke(candidateCommand(secondCandidatePayload));
 const secondRun=await evaluationInvoke(evaluationCommand({candidateRef:secondCandidate.candidateRef,
   baselineRef:counter.artifactRef}));
 const secondResult=await resultInvoke(resultCommand(resultPayload(secondRun.runRef,30,0,0.97)));
 const secondInconclusiveRun=await evaluationInvoke(evaluationCommand({candidateRef:secondCandidate.candidateRef,
   baselineRef:capability.artifactRef}));
 const secondInconclusiveResult=await resultInvoke(resultCommand(resultPayload(
   secondInconclusiveRun.runRef,30,1,0.97)));
 await assert.rejects(gateInvoke(gateCommand(gatePayload(acceptedCandidate.candidateRef,[acceptedCompleted.resultRef])),
   [evaluatorGateGrant],evaluatorGateContext),{code:'GATE_EVIDENCE_INVALID'});
 await assert.rejects(gateInvoke(gateCommand(gatePayload(secondCandidate.candidateRef,[acceptedCompleted.resultRef]))),
   {code:'GATE_EVIDENCE_INVALID'});
 const failedGateCommand=gateCommand(gatePayload(acceptedCandidate.candidateRef,[acceptedCompleted.resultRef]));
 const failedGate=await gateInvoke(failedGateCommand);
 assert.equal(failedGate.verdict,'Fail');assert.equal(failedGate.findings[0]!.outcome,'Fail');
 assert.equal(failedGate.signedBy.id,gatePrincipal.id);
 assert.deepEqual(await gateInvoke(failedGateCommand),failedGate);
 const inconclusiveGateCommand=gateCommand(gatePayload(secondCandidate.candidateRef,
   [secondResult.resultRef,secondInconclusiveResult.resultRef]));
 const inconclusiveGate=await gateInvoke(inconclusiveGateCommand);
 assert.equal(inconclusiveGate.verdict,'Inconclusive');
 assert.deepEqual(await gateInvoke(inconclusiveGateCommand),inconclusiveGate);
 const thirdCandidate=await candidateInvoke(candidateCommand({...candidatePayload,
   candidateArtifactRef:counter.artifactRef}));
 const thirdRun=await evaluationInvoke(evaluationCommand({candidateRef:thirdCandidate.candidateRef,
   baselineRef:evidence.artifactRef}));
 const thirdResult=await resultInvoke(resultCommand(resultPayload(thirdRun.runRef,500,0,0.97)));
 const passedGateCommand=gateCommand(gatePayload(thirdCandidate.candidateRef,[thirdResult.resultRef]));
 const passedGate=await gateInvoke(passedGateCommand);
 const passedFinding=passedGate.findings[0],passedUncertainty=passedGate.uncertainty[0];
 assert.equal(passedGate.verdict,'Pass');assert.equal(passedGate.findings[0]!.actual,0.97);
 assert.equal(passedFinding!.baseline,0.93);
 assert.equal((passedFinding?.relativeLift??-1)>0.02,true);
 assert.equal(passedUncertainty!.method,'WilsonScore');
 assert.equal(passedUncertainty!.confidenceLevel,0.95);
 assert.equal(passedUncertainty!.upperBound>passedUncertainty!.lowerBound,true);
 assert.deepEqual(passedGate.limitations.map(value=>value.code),
   ['evaluation.frozen-dataset','evaluation.no-causal-adjustment']);
 assert.deepEqual(await gateInvoke(passedGateCommand),passedGate);
 const releasePrincipal=ref('abh.principal'),releaseGrant=ref('abh.grant'),producerReleaseGrant=ref('abh.grant'),
   evaluatorReleaseGrant=ref('abh.grant'),assignmentGrant=ref('abh.grant');
 const releaseContext=deriveVerifiedContext({...context(org,releasePrincipal.id).request,
   purposeOfUse:'abh.release.manage'});
 const producerReleaseContext=deriveVerifiedContext({...context(org,c.tenant.actor.id).request,
   purposeOfUse:'abh.release.manage'});
 const evaluatorReleaseContext=deriveVerifiedContext({...context(org,evaluator.id).request,
   purposeOfUse:'abh.release.manage'});
 await db.transaction(c,options(),async tx=>{
   await tx.owner('Identity')`INSERT INTO identity.principals(resource_organization_id,id,display_name,identity_kind,credential_epoch,status)
     VALUES (${org},${releasePrincipal.id},'release-authority','Human',1,'Active')`;
   await tx.owner('Identity')`INSERT INTO identity.memberships(resource_organization_id,id,principal_id,membership_epoch,status)
     VALUES (${org},${randomUUID()},${releasePrincipal.id},1,'Active')`;
   for(const value of [releasePrincipal,releaseGrant,producerReleaseGrant,evaluatorReleaseGrant,assignmentGrant])
     await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
       VALUES (${org},${randomUUID()},${value.type},${value.id},1)`;
   const authorityGrant=(principalId:string,grantRef:{type:'abh.grant';id:string;version:number},
     actionTypes:readonly string[]=['abh.releases.configure-learning-candidate']):GrantRecord=>({grantRef,
     resourceOrganizationId:org,principalRef:{type:'abh.principal',id:principalId,version:1},scopeRefs:[scope],
     actionTypes:[...actionTypes],purposeNames:['abh.release.manage'],
     validFrom,validUntil,issuanceEvidenceRef:scope,status:'Active'});
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
     VALUES (${org},${releaseGrant.id},${releasePrincipal.id},${JSON.stringify(authorityGrant(releasePrincipal.id,releaseGrant))}::text::jsonb,${validFrom},${validUntil},'Active'),
       (${org},${producerReleaseGrant.id},${c.tenant.actor.id},${JSON.stringify(authorityGrant(c.tenant.actor.id,producerReleaseGrant))}::text::jsonb,${validFrom},${validUntil},'Active'),
       (${org},${evaluatorReleaseGrant.id},${evaluator.id},${JSON.stringify(authorityGrant(evaluator.id,evaluatorReleaseGrant))}::text::jsonb,${validFrom},${validUntil},'Active')`;
   await tx.owner('Control')`INSERT INTO control.grants(resource_organization_id,id,principal_id,record,valid_from,valid_until,status)
    VALUES (${org},${assignmentGrant.id},${releasePrincipal.id},${JSON.stringify(authorityGrant(releasePrincipal.id,assignmentGrant,
      ['abh.release.manage']))}::text::jsonb,${validFrom},${validUntil},'Active')`;
 });
 const releasePayload=(candidateRef:EntityRef=thirdCandidate.candidateRef,gateRef:EntityRef=passedGate.gateRef,
   releaseId:string=randomUUID()):ConfigureLearningReleasePayload=>{
   const release:ReleaseRecord={releaseRef:ref('abh.release',releaseId),resourceOrganizationId:org,
     assets:[{behaviorSlot:'learning.policy',capabilityExactRefs:[{kind:'BehaviorPolicy',id:'learning.passed-candidate',
       version:'0.1.0',digest:'sha256:'+'c'.repeat(64)}]}],gateRefs:[gateRef],
     compatibilityRef:ref('abh.artifact'),status:'Ready'};
   const assignment:StaticAssignmentRecord={assignmentRef:ref('abh.assignment'),resourceOrganizationId:org,
     releaseRef:release.releaseRef,scopeRefs:[scope],scopeTier:'Organization',status:'Active',
     selectable:true,executionAllowed:true,evidenceRefs:[gateRef]};
   return {candidateRef,gateRef,release,assignment};
 };
 const releaseCommand=(payload:ConfigureLearningReleasePayload=releasePayload()):ConfigureLearningCandidateReleaseCommand=>({
   type:'abh.releases.configure-learning-candidate',schemaVersion:'0.1.0',commandId:randomUUID(),
   idempotencyKey:randomUUID(),target:{type:'abh.release',id:payload.release.releaseRef.id},payload});
 const releaseInvoke=(value:ConfigureLearningCandidateReleaseCommand=releaseCommand(),
   grants:readonly EntityRef[]=[releaseGrant],contextValue=releaseContext)=>
   configureLearningCandidateRelease(db,contextValue,options(),value,grants);
 await assert.rejects(releaseInvoke(releaseCommand(),[]),{code:'AUTHORITY_REQUIRED'});
 await assert.rejects(releaseInvoke(releaseCommand(releasePayload(
	   thirdCandidate.candidateRef,passedGate.gateRef)),[producerReleaseGrant],producerReleaseContext),
   {code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(releaseInvoke(releaseCommand(releasePayload(
	   thirdCandidate.candidateRef,passedGate.gateRef)),[evaluatorReleaseGrant],evaluatorReleaseContext),
   {code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(releaseInvoke(releaseCommand(releasePayload(
   thirdCandidate.candidateRef,ref('abh.learning-gate')))),{code:'RESOURCE_NOT_FOUND'});
 await assert.rejects(releaseInvoke(releaseCommand(releasePayload(
   acceptedCandidate.candidateRef,failedGate.gateRef))),{code:'PRECONDITION_FAILED'});
 await assert.rejects(releaseInvoke(releaseCommand(releasePayload(
   thirdCandidate.candidateRef,inconclusiveGate.gateRef))),{code:'PRECONDITION_FAILED'});
 const missingGateLink=releasePayload();missingGateLink.release.gateRefs=[ref('abh.artifact')];
 await assert.rejects(releaseInvoke(releaseCommand(missingGateLink)),{code:'PRECONDITION_FAILED'});
 const wrongAssignment=releasePayload();wrongAssignment.assignment.releaseRef=ref('abh.release');
 await assert.rejects(releaseInvoke(releaseCommand(wrongAssignment)),{code:'PRECONDITION_FAILED'});
 const acceptedReleaseCommand=releaseCommand();
 const configured=await releaseInvoke(acceptedReleaseCommand);
 assert.equal(configured.status,'Active');assert.equal(configured.releaseRef.version,2);
 assert.equal(configured.selectable,true);assert.equal(configured.executionAllowed,true);
 assert.deepEqual(await releaseInvoke(acceptedReleaseCommand),configured);
 const [releaseRows]=await f.admin`SELECT count(*)::int AS count FROM release.releases
   WHERE resource_organization_id=${org} AND id=${configured.releaseRef.id}`;
 const [assignmentRows]=await f.admin`SELECT count(*)::int AS count FROM release.assignments
	   WHERE resource_organization_id=${org} AND id=${configured.assignmentRef.id}`;
 assert.deepEqual({releases:releaseRows!.count,assignments:assignmentRows!.count},{releases:1,assignments:1});
 const [releaseLedger]=await f.admin`SELECT
   (SELECT count(*) FROM data.command_receipts WHERE resource_organization_id=${org}
     AND record->>'commandType'='abh.releases.configure-learning-candidate') AS receipts,
   (SELECT count(*) FROM data.outbox WHERE resource_organization_id=${org}
     AND record->>'type'='abh.release.created' AND record->'aggregateRef'->>'id'=${configured.releaseRef.id}) AS created,
   (SELECT count(*) FROM data.outbox WHERE resource_organization_id=${org}
     AND record->>'type'='abh.release.ready' AND record->'aggregateRef'->>'id'=${configured.releaseRef.id}) AS ready,
   (SELECT count(*) FROM data.outbox WHERE resource_organization_id=${org}
     AND record->>'type'='abh.assignment.created' AND record->'aggregateRef'->>'id'=${configured.assignmentRef.id}) AS assigned`;
 assert.deepEqual(releaseLedger,{receipts:'1',created:'1',ready:'1',assigned:'1'});
 let learningReadAvailable=true;
 const learningReadGrant=async(context:VerifiedContext)=>
   learningReadAvailable?[{type:'abh.grant' as const,id:(context.tenant.purposeOfUse==='abh.learning.capture'?grant:
     context.tenant.purposeOfUse==='abh.learning.evaluate'?evaluationGrant:gateGrant).id,version:1}]:[];
 const learningCursor=new LearningCursorCodec('abh.learning-signals.list',new Uint8Array(32).fill(9));
 const queryInstall:MissionHttpInstallation={grants:async()=>[],definition:null as never,activation:null as never,
   fenceRefs:async()=>[]};
 queryInstall.learningLists={
   signals:{cursor:learningCursor,grants:learningReadGrant},
   cases:{cursor:new LearningCursorCodec('abh.learning-cases.list',new Uint8Array(32).fill(9)),grants:learningReadGrant},
   candidates:{cursor:new LearningCursorCodec('abh.learning-candidates.list',new Uint8Array(32).fill(9)),grants:learningReadGrant},
   evaluationRuns:{cursor:new LearningCursorCodec('abh.evaluation-runs.list',new Uint8Array(32).fill(9)),grants:learningReadGrant},
   gates:{cursor:new LearningCursorCodec('abh.learning-gates.list',new Uint8Array(32).fill(9)),grants:learningReadGrant}};
 const queries=createMissionQueryHandlers(db,queryInstall);
 const currentRun=await queries['abh.evaluation-runs.get'](
   evaluatorContext,options(),completedRun.runRef.id);
 assert.equal(currentRun.status,'Completed');assert.equal(currentRun.runRef.version,2);
 assert.deepEqual(await queries['abh.evaluation-results.get'](
   evaluatorContext,options(),acceptedCompleted.resultRef.id),acceptedCompleted);
 assert.deepEqual(await queries['abh.evaluation-results.get'](
   gateContext,options(),secondResult.resultRef.id),secondResult);
 assert.deepEqual(await queries['abh.learning-gates.get'](
   gateContext,options(),passedGate.gateRef.id),passedGate);
 const candidateRuns=await queries['abh.evaluation-runs.list'](
   evaluatorContext,options(),{candidateId:acceptedCandidate.candidateRef.id});
 assert.equal(candidateRuns.runs.length,4);
 assert.deepEqual(Object.values(candidateRuns.counts).reduce((sum,value)=>sum+value,0),4);
 assert.equal(candidateRuns.runs.every(run=>run.candidateRef.id===acceptedCandidate.candidateRef.id),true);
 const inconclusiveRuns=await queries['abh.evaluation-runs.list'](
   evaluatorContext,options(),{candidateId:acceptedCandidate.candidateRef.id,runStatus:'Inconclusive'});
 assert.equal(inconclusiveRuns.runs.length,3);
 const acceptedGates=await queries['abh.learning-gates.list'](
   gateContext,options(),{candidateId:acceptedCandidate.candidateRef.id});
 assert.deepEqual(acceptedGates.gates.map(gate=>gate.gateRef.id),[failedGate.gateRef.id]);
 await assert.rejects(queries['abh.evaluation-runs.get'](
   gateContext,options(),completedRun.runRef.id),{code:'RESOURCE_NOT_FOUND'});
 const issuer='learning.http.fixture',audience='abh.test',identitySubject=randomUUID(),
   identityDigest=await inputDigest([issuer,identitySubject]);
 const releaseIdentitySubject=randomUUID(),releaseIdentityDigest=await inputDigest([issuer,releaseIdentitySubject]);
 await f.admin`INSERT INTO deployment.identity_locations
   (identity_digest,resource_organization_id,principal_id,principal_version)
   VALUES (${identityDigest},${org},${principal.id},1)`;
 await f.admin`INSERT INTO deployment.identity_locations
   (identity_digest,resource_organization_id,principal_id,principal_version)
   VALUES (${releaseIdentityDigest},${org},${releasePrincipal.id},1)`;
 const releaseIdentity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{
   issuer,audience,subject:releaseIdentitySubject,identityKind:'Human',authnStrength:{level:'SingleFactor'},
   credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),
   evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
 const releaseHttpApp=createCoreHttpApp({database:db,identity:releaseIdentity,credentials:async request=>{
   if(String(request.headers.authorization)!=='Bearer release')throw new CoreError('UNAUTHENTICATED');
   return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.release.manage'};},
   releases:{configureLearningCandidate:{grants:async()=>[releaseGrant]}},
   assignments:{pause:{grants:async()=>[assignmentGrant]},
     get:{grants:async()=>[assignmentGrant]},
     list:{cursor:new LearningCursorCodec('abh.assignments.list',new Uint8Array(32).fill(11)),
       grants:async()=>[assignmentGrant]}}});
 t.after(()=>releaseHttpApp.close());
 const sendRelease=()=>releaseHttpApp.inject({method:'POST',
   url:'/v1/commands/abh.releases.configure-learning-candidate',
   headers:{authorization:'Bearer release','idempotency-key':acceptedReleaseCommand.idempotencyKey},
   payload:{target:acceptedReleaseCommand.target,payload:acceptedReleaseCommand.payload}});
 const releaseHttpResponse=await sendRelease();
 assert.equal(releaseHttpResponse.statusCode,201,releaseHttpResponse.body);
 assert.deepEqual(releaseHttpResponse.json(),configured);
 const releaseClient=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer release'}),
   fetch:async(url,init)=>{const injected=await releaseHttpApp.inject({method:init?.method as 'POST',
     url:new URL(String(url)).pathname+new URL(String(url)).search,
     headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
     return new Response(injected.body,{status:injected.statusCode,
       headers:{'content-type':String(injected.headers['content-type'])}});}});
 assert.deepEqual(await releaseClient.releases.configureLearningCandidate({
   releaseId:acceptedReleaseCommand.target.id,idempotencyKey:acceptedReleaseCommand.idempotencyKey,
   payload:acceptedReleaseCommand.payload}),configured);
 const activeList=await releaseClient.assignments.list({releaseId:configured.releaseRef.id});
 assert.deepEqual(activeList.assignments.map(item=>item.assignmentRef.id),[configured.assignmentRef.id]);
 assert.deepEqual(activeList.counts,{Active:1,Paused:0});
 assert.deepEqual(await releaseClient.assignments.get(configured.assignmentRef.id),configured);
 const paused=await releaseClient.assignments.pause({
   id:configured.assignmentRef.id,expectedVersion:configured.assignmentRef.version,
   idempotencyKey:randomUUID(),
   payload:{reason:'Release validation paused pending operations review.',evidenceRef:passedGate.gateRef}});
 assert.equal(paused.status,'Paused');assert.equal(paused.selectable,false);assert.equal(paused.executionAllowed,false);
 assert.equal(paused.stopReason,'Release validation paused pending operations review.');
 assert.deepEqual(paused.stopEvidenceRef,passedGate.gateRef);
 assert.deepEqual(await releaseClient.assignments.get(configured.assignmentRef.id),paused);
 const pausedList=await releaseClient.assignments.list({releaseId:configured.releaseRef.id,assignmentStatus:'Paused'});
 assert.deepEqual(pausedList.assignments.map(item=>item.assignmentRef.id),[configured.assignmentRef.id]);
 assert.deepEqual(pausedList.counts,{Active:0,Paused:1});
 const identity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{
   issuer,audience,subject:identitySubject,identityKind:'Human',authnStrength:{level:'SingleFactor'},
   credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),
   evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
 const app=createCoreHttpApp({database:db,identity,credentials:async request=>{
   if(String(request.headers.authorization)!=='Bearer learning')throw new CoreError('UNAUTHENTICATED');
   return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.learning.capture'};},
   learning:{buildCase:{grants:async()=>[grant]},createCandidate:{grants:async()=>[grant]}}});
 t.after(()=>app.close());
 const httpCommand=command(),httpKey=randomUUID(),send=()=>app.inject({method:'POST',
   url:'/v1/commands/abh.learning.build-case',headers:{authorization:'Bearer learning','idempotency-key':httpKey},
   payload:{target:httpCommand.target,payload:httpCommand.payload}});
 const response=await send();assert.equal(response.statusCode,201,response.body);
 const httpCase=response.json();assert.deepEqual((await send()).json(),httpCase);
 const client=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer learning'}),
   fetch:async(url,init)=>{const injected=await app.inject({method:init?.method as 'POST',
     url:new URL(String(url)).pathname+new URL(String(url)).search,
     headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
     return new Response(injected.body,{status:injected.statusCode,
       headers:{'content-type':String(injected.headers['content-type'])}});}});
 assert.deepEqual(await client.learning.buildCase({organizationId:org,idempotencyKey:httpKey,payload:httpCommand.payload}),httpCase);
 const candidateHttpCommand=candidateCommand(),candidateKey=randomUUID(),sendCandidate=()=>app.inject({method:'POST',
   url:'/v1/commands/abh.learning.create-candidate',headers:{authorization:'Bearer learning','idempotency-key':candidateKey},
   payload:{target:candidateHttpCommand.target,payload:candidateHttpCommand.payload}});
 const candidateResponse=await sendCandidate();
 assert.equal(candidateResponse.statusCode,201,candidateResponse.body);
 const httpCandidate=candidateResponse.json();assert.deepEqual((await sendCandidate()).json(),httpCandidate);
 assert.deepEqual(await client.learning.createCandidate({organizationId:org,idempotencyKey:candidateKey,
   payload:candidateHttpCommand.payload}),httpCandidate);
 const evaluatorIdentitySubject=randomUUID(),evaluatorIdentityDigest=await inputDigest([issuer,evaluatorIdentitySubject]);
 await f.admin`INSERT INTO deployment.identity_locations
   (identity_digest,resource_organization_id,principal_id,principal_version)
   VALUES (${evaluatorIdentityDigest},${org},${evaluator.id},1)`;
 const evaluatorIdentity=new IdentityIngress(db,{verify:async()=>({status:'Completed',data:{
   issuer,audience,subject:evaluatorIdentitySubject,identityKind:'Human',authnStrength:{level:'SingleFactor'},
   credentialEpoch:1,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),
   evidenceRef:ref('abh.identity-evidence')}})},{issuer,audience});
 const evaluationApp=createCoreHttpApp({database:db,identity:evaluatorIdentity,credentials:async request=>{
   if(String(request.headers.authorization)!=='Bearer evaluator')throw new CoreError('UNAUTHENTICATED');
   return {credentialRef:ref('abh.credential'),organizationId:org,purpose:'abh.learning.evaluate'};},
   learning:{requestEvaluation:{grants:async()=>[evaluationGrant]},
     retryEvaluation:{grants:async()=>[evaluationGrant]}}});
 t.after(()=>evaluationApp.close());
 const evaluationHttpCommand=evaluationCommand({candidateRef:acceptedCandidate.candidateRef,
   baselineRef:evidence.artifactRef}),evaluationKey=randomUUID(),
   sendEvaluation=()=>evaluationApp.inject({method:'POST',url:'/v1/commands/abh.learning.request-evaluation',
     headers:{authorization:'Bearer evaluator','idempotency-key':evaluationKey},
     payload:{target:evaluationHttpCommand.target,payload:evaluationHttpCommand.payload}});
 const evaluationResponse=await sendEvaluation();
 assert.equal(evaluationResponse.statusCode,201,evaluationResponse.body);
 const httpEvaluation=evaluationResponse.json();
 assert.deepEqual((await sendEvaluation()).json(),httpEvaluation);
 const evaluationClient=createAbhClient({baseUrl:'https://fixture.test',headers:async()=>({authorization:'Bearer evaluator'}),
   fetch:async(url,init)=>{const injected=await evaluationApp.inject({method:init?.method as 'POST',
     url:new URL(String(url)).pathname+new URL(String(url)).search,
     headers:Object.fromEntries(new Headers(init?.headers)),payload:String(init?.body)});
     return new Response(injected.body,{status:injected.statusCode,
       headers:{'content-type':String(injected.headers['content-type'])}});}});
 assert.deepEqual(await evaluationClient.learning.requestEvaluation({organizationId:org,
   idempotencyKey:evaluationKey,payload:evaluationHttpCommand.payload}),httpEvaluation);
 const retryHttpCommand=retryCommandAcceptedExact,sendRetry=()=>evaluationApp.inject({method:'POST',
   url:'/v1/commands/abh.learning.retry-evaluation',
   headers:{authorization:'Bearer evaluator','idempotency-key':retryHttpCommand.idempotencyKey},
   payload:{target:retryHttpCommand.target,payload:retryHttpCommand.payload}});
 const retryResponse=await sendRetry();
 assert.equal(retryResponse.statusCode,201,retryResponse.body);
 const httpRetry=retryResponse.json();
 assert.deepEqual(httpRetry.data.evaluationRun,acceptedRetry);
 assert.deepEqual((await sendRetry()).json(),httpRetry);
 assert.deepEqual(await evaluationClient.learning.retryEvaluation({organizationId:org,
   idempotencyKey:retryHttpCommand.idempotencyKey,payload:retryHttpCommand.payload}),httpRetry);
 const [counts]=await f.admin`SELECT
  (SELECT count(*) FROM core.learning_cases) AS cases,
  (SELECT count(*) FROM core.learning_candidates) AS candidates,
   (SELECT count(*) FROM core.evaluation_profiles) AS profiles,
   (SELECT count(*) FROM core.evaluation_runs) AS runs,
   (SELECT count(*) FROM core.evaluation_results) AS results,
   (SELECT count(*) FROM core.learning_gates) AS gates,
  (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.learning-case.created') AS events,
   (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.learning-candidate.created') AS candidate_events,
 (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.evaluation-run.created') AS run_events,
  (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.evaluation-run.expired') AS expiry_events,
  (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.evaluation-result.created') AS result_events,
   (SELECT count(*) FROM data.outbox WHERE record->>'type'='abh.learning-gate.created') AS gate_events,
   (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.build-case') AS receipts,
   (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.create-candidate') AS candidate_receipts,
 (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.request-evaluation') AS run_receipts,
  (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.retry-evaluation') AS retry_receipts,
  (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.expire-evaluation') AS expiry_receipts,
  (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.submit-evaluation-result') AS result_receipts,
  (SELECT count(*) FROM data.command_receipts WHERE record->>'commandType'='abh.learning.build-gate') AS gate_receipts`;
 assert.deepEqual(counts,{cases:'2',candidates:'5',profiles:'1',runs:'10',results:'5',gates:'3',events:'2',
  candidate_events:'5',run_events:'10',expiry_events:'2',result_events:'5',gate_events:'3',receipts:'2',
  candidate_receipts:'5',run_receipts:'9',retry_receipts:'1',expiry_receipts:'2',result_receipts:'5',gate_receipts:'3'});
 const filteredSignal={...signal(randomUUID()),signalType:'quality.regression'};
 await f.admin`INSERT INTO core.learning_signals
   (resource_organization_id,id,workspace_id,created_by,updated_by,purpose_names,record,signal_type)
   VALUES (${org},${filteredSignal.signalRef.id},${null},${principal.id},${principal.id},ARRAY['abh.learning.capture'],
     ${JSON.stringify(filteredSignal)}::text::jsonb,${filteredSignal.signalType})`;
 const signalList=await queries['abh.learning-signals.list'](c,options(),{limit:2});
 assert.equal(signalList.signals.length,2);
 assert.deepEqual(signalList.counts,{'memory.correction':3,'quality.regression':1});
 assert.ok(signalList.cursor);
 const signalPage2=await queries['abh.learning-signals.list'](c,options(),
   {limit:2,cursor:signalList.cursor!});
 assert.equal(signalPage2.signals.length,2);
 assert.deepEqual(signalPage2.counts,{'memory.correction':3,'quality.regression':1});
 assert.ok(!signalPage2.cursor);
 const filteredSignals=await queries['abh.learning-signals.list'](c,options(),
   {signalType:'quality.regression'});
 assert.deepEqual(filteredSignals.signals,[filteredSignal]);
 assert.deepEqual(filteredSignals.counts,{'quality.regression':1});
 const scopedSignals=await queries['abh.learning-signals.list'](c,options(),{scopeId:otherScope.id});
 assert.equal(scopedSignals.signals.length,1);assert.deepEqual(scopedSignals.counts,{'memory.correction':1});
 await assert.rejects(queries['abh.learning-signals.list'](c,options(),
   {scopeId:otherScope.id,cursor:signalList.cursor!}),{code:'INVALID_ARGUMENT'});
 learningReadAvailable=false;
 await assert.rejects(queries['abh.learning-signals.list'](c,options()),{code:'AUTHORITY_REQUIRED'});
 learningReadAvailable=true;
 const caseList=await queries['abh.learning-cases.list'](c,options(),{limit:1});
 assert.equal(caseList.cases.length,1);assert.deepEqual(caseList.counts,{'learning.test-root':2});
 assert.ok(caseList.cursor);
 const casePage2=await queries['abh.learning-cases.list'](c,options(),{limit:1,cursor:caseList.cursor!});
 assert.equal(casePage2.cases.length,1);assert.ok(!casePage2.cursor);
 assert.deepEqual((await queries['abh.learning-cases.list'](c,options(),
   {rootCauseCode:'learning.test-root'})).counts,{'learning.test-root':2});
 const candidateFirst=await queries['abh.learning-candidates.list'](evaluatorContext,options(),{limit:2});
 assert.equal(candidateFirst.candidates.length,2);
 assert.deepEqual(candidateFirst.counts,{Draft:5});
 assert.ok(candidateFirst.cursor);
 const candidateSecond=await queries['abh.learning-candidates.list'](evaluatorContext,options(),
   {limit:3,cursor:candidateFirst.cursor!});
 assert.equal(candidateSecond.candidates.length,3);assert.deepEqual(candidateSecond.counts,{Draft:5});
 assert.ok(!candidateSecond.cursor);
 for(const purposeContext of [c,evaluatorContext,gateContext])
  assert.equal((await queries['abh.learning-candidates.list'](purposeContext,options(),
    {assetKind:'model.prompt',candidateStatus:'Draft'})).candidates.length,5);
 const capturePurposeId=randomUUID();
 await db.transaction(c,options(),async tx=>{
   await tx.owner('Control')`INSERT INTO control.purposes
     (resource_organization_id,id,name,purpose_names,record,status)
     VALUES (${org},${capturePurposeId},'abh.learning.capture',ARRAY['abh.learning.capture'],
       ${JSON.stringify({purposeRef:{type:'abh.purpose',id:capturePurposeId,version:1},
       resourceOrganizationId:org,name:'abh.learning.capture',status:'Active',evidenceRefs:[scope],
       })}::text::jsonb,'Active')`;
   await tx.owner('Control')`INSERT INTO control.fences
     (resource_organization_id,id,scope_type,scope_id,epoch)
     VALUES (${org},${randomUUID()},'abh.purpose',${capturePurposeId},1)`;
 });
 await assert.rejects(db.transaction(evaluatorContext,options(),
   tx=>learningOwner.withdrawRevokedPurpose(tx,'abh.learning.capture')),{code:'PRECONDITION_FAILED'});
 await db.transaction(c,options(),async tx=>await new PurposeOwner().revoke(tx,
   {type:'abh.purposes.revoke',commandId:randomUUID(),idempotencyKey:randomUUID(),
     digest:await inputDigest({type:'abh.purpose',id:capturePurposeId,version:1})},
     {type:'abh.purpose',id:capturePurposeId,version:1},
   [scope],async()=>{}));
 const [withdrawals]=await f.admin`SELECT count(*)::int AS count FROM core.learning_withdrawals
   WHERE resource_organization_id=${org} AND purpose_name='abh.learning.capture'`;
 assert.equal(withdrawals!.count,1);
 await assert.rejects(queries['abh.learning-signals.list'](c,options()),{code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(db.transaction(c,options(),tx=>learningOwner.getCase(tx,accepted.caseRef)),
   {code:'LEARNING_PURPOSE_DENIED'});
 const withdrawLearningPurpose=async(purposeName:string)=>{
   const purposeId=randomUUID();
   await db.transaction(c,options(),async tx=>{
     await tx.owner('Control')`INSERT INTO control.purposes
       (resource_organization_id,id,name,purpose_names,record,status)
       VALUES (${org},${purposeId},${purposeName},ARRAY[${purposeName}],
         ${JSON.stringify({purposeRef:{type:'abh.purpose',id:purposeId,version:1},
           resourceOrganizationId:org,name:purposeName,status:'Active',evidenceRefs:[scope]})}::text::jsonb,'Active')`;
     await tx.owner('Control')`INSERT INTO control.fences
       (resource_organization_id,id,scope_type,scope_id,epoch)
       VALUES (${org},${randomUUID()},'abh.purpose',${purposeId},1)`;
   });
   await db.transaction(c,options(),async tx=>await new PurposeOwner().revoke(tx,
     {type:'abh.purposes.revoke',commandId:randomUUID(),idempotencyKey:randomUUID(),
       digest:await inputDigest({type:'abh.purpose',id:purposeId,version:1})},
       {type:'abh.purpose',id:purposeId,version:1},[scope],async()=>{}));
 };
 await withdrawLearningPurpose('abh.learning.evaluate');
 await assert.rejects(queries['abh.evaluation-runs.get'](
   evaluatorContext,options(),completedRun.runRef.id),{code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(queries['abh.evaluation-results.get'](
   evaluatorContext,options(),acceptedCompleted.resultRef.id),{code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(queries['abh.evaluation-results.get'](
   gateContext,options(),secondResult.resultRef.id),{code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(queries['abh.learning-candidates.list'](
   evaluatorContext,options()),{code:'LEARNING_PURPOSE_DENIED'});
 assert.deepEqual(await queries['abh.learning-gates.get'](
   gateContext,options(),passedGate.gateRef.id),passedGate);
 await withdrawLearningPurpose('abh.learning.gate');
 await assert.rejects(queries['abh.learning-gates.get'](
   gateContext,options(),passedGate.gateRef.id),{code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(queries['abh.learning-candidates.list'](
	   gateContext,options()),{code:'LEARNING_PURPOSE_DENIED'});
 await assert.rejects(releaseInvoke(acceptedReleaseCommand),{code:'LEARNING_PURPOSE_DENIED'});
});
