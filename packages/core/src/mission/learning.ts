import {randomInt,randomUUID} from 'node:crypto';
import type {BuildCasePayload,BuildGatePayload,CaptureSignalPayload,CreateCandidatePayload,EntityRef,
  EvaluationGateArtifactRecord,EvaluationProfileRecord,EvaluationResultRecord,EvaluationRunRecord,
  ExpireEvaluationPayload,
  LearningCandidateListResult,LearningCaseListResult,LearningSignalListResult,
  LearningCandidateRecord,LearningCaseRecord,LearningSignalRecord,RequestEvaluationPayload,
  RetryEvaluationPayload,
  ListLearningCandidatesQuery,ListLearningCasesQuery,ListLearningSignalsQuery,ListEvaluationRunsQuery,
  ListLearningGatesQuery,
  SubmitEvaluationResultPayload} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {sameRef} from '../execution/shared.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';

const learningPurposeNames=['abh.learning.capture'];
const candidatePurposeNames=['abh.learning.capture','abh.learning.evaluate','abh.learning.gate'];
type MetricAggregate={name:string;estimate:number;samples:number;baseline?:number;baselineSamples:number};
type MetricValue=EvaluationResultRecord['metricValues'][number];
type GateFinding=EvaluationGateArtifactRecord['findings'][number];
type GateUncertainty=EvaluationGateArtifactRecord['uncertainty'][number];
const confidenceZ={0.8:1.2815515655446004,0.9:1.6448536269514722,
  0.95:1.959963984540054,0.99:2.5758293035489004} as const;
const round12=(value:number)=>Math.round(value*1e12)/1e12;
function wilson(estimate:number,samples:number,confidenceLevel:EvaluationProfileRecord['confidenceLevel']){
  if(!Number.isInteger(samples)||samples<=0||estimate<0||estimate>1)throw new CoreError('INTERNAL_ERROR');
  const z=confidenceZ[confidenceLevel],denominator=1+z*z/samples,center=(estimate+z*z/(2*samples))/denominator;
  const half=z*Math.sqrt(estimate*(1-estimate)/samples+z*z/(4*samples*samples))/denominator;
  return {lower:round12(Math.max(0,center-half)),upper:round12(Math.min(1,center+half))};
}
function aggregateMetricValues(values:readonly MetricValue[],samples:readonly number[],name:string):MetricAggregate|undefined{
  let weighted=0,total=0;
  if(values.length!==samples.length)throw new CoreError('GATE_EVIDENCE_INVALID');
  values.forEach((value,index)=>{if(value.name!==name)return;const samplesForValue=samples[index];
    if(samplesForValue===undefined||!Number.isInteger(samplesForValue)||samplesForValue<0)throw new CoreError('GATE_EVIDENCE_INVALID');
    if(samplesForValue===0)return;
    weighted+=value.value*samplesForValue;total+=samplesForValue;});
  return total===0?undefined:{name,estimate:round12(weighted/total),samples:total,baselineSamples:0};
}
function metricAggregate(values:readonly MetricValue[],samples:number,name:string):MetricAggregate|undefined{
  const matching=values.filter(value=>value.name===name);
  if(matching.length===0)return undefined;
  if(matching.length>1)throw new CoreError('GATE_EVIDENCE_INVALID');
  return {name,estimate:matching[0]!.value,samples,baselineSamples:0};
}
type LearningListRow={id:string;record:unknown;created_at:string;counts:Record<string,number>|null};
type LearningOwnerListInput<T extends {cursor?:string}>=Omit<T,'cursor'>&{after?:{createdAt:string;id:string}};
type LearningListPage<RecordType>={
  records:RecordType[];counts:Record<string,number>;next?:{createdAt:string;id:string};
};
export interface RecoveryEvaluationRun{
  record:EvaluationRunRecord;active:boolean;fencingToken:number;
}

export class LearningOwner {
 async #ensurePurposesAvailable(tx:TenantTransaction,purposeNames:readonly string[]):Promise<void>{
  const rows=await tx.owner('LearningController')`SELECT 1 FROM core.learning_withdrawals
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId}
      AND purpose_name=ANY(${purposeNames}::text[]) LIMIT 1`;
  if(rows.length>0)throw new CoreError('LEARNING_PURPOSE_DENIED');
 }

 async captureSignal(tx:TenantTransaction,input:CaptureSignalPayload):Promise<LearningSignalRecord>{
  contract('CaptureSignalPayload',structuredClone(input));
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.capture')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  const signalRef={type:'abh.learning-signal' as const,id:randomUUID(),version:1};
  const signal:LearningSignalRecord={signalRef,resourceOrganizationId:c.resourceOrganizationId,
   sourceEventRef:input.sourceEventRef,signalType:input.signalType,
   artifactRefs:input.artifactRefs,scopeRef:input.scopeRef,purposeOfUse:input.purposeOfUse,
   capturedAt:new Date().toISOString()};
  await tx.owner('MissionController')`INSERT INTO core.learning_signals(resource_organization_id,id,workspace_id,purpose_names,record,signal_type)
    VALUES (${c.resourceOrganizationId},${signalRef.id},${c.workspaceId??null},${learningPurposeNames},${JSON.stringify(signal)}::text::jsonb,${input.signalType})`;
  return signal;
 }

 async buildCase(tx:TenantTransaction,command:CommandIdentity,input:BuildCasePayload):Promise<LearningCaseRecord>{
  contract('BuildCasePayload',structuredClone(input));const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  const uniqueIds=new Set(input.signalRefs.map(ref=>ref.id));
  if(uniqueIds.size!==input.signalRefs.length)throw new CoreError('INVALID_ARGUMENT');
 const records:LearningSignalRecord[]=[];
  for(const ref of input.signalRefs){
   const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.learning_signals
     WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
       AND ${c.purposeOfUse}=ANY(purpose_names) AND version=${ref.version}
       AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
   if(!row)throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
   const record=contract('LearningSignalRecord',row.record);
   if(!sameRef(record.signalRef,ref)||record.signalRef.version!==Number(row.version)
     ||record.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
   records.push(record);
  }
  const scopes=new Set(records.map(record=>JSON.stringify(record.scopeRef)));
  const purposes=new Set(records.map(record=>record.purposeOfUse));
  if(scopes.size!==1||purposes.size!==1||records.some(record=>record.purposeOfUse!=='abh.learning.capture'))
    throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  if([...input.evidenceRefs,...input.counterEvidenceRefs].some(ref=>ref.type!=='abh.artifact'))
    throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const unsigned=contract('LearningCaseRecord',{caseRef:{type:'abh.learning-case',id:randomUUID(),version:1},
    resourceOrganizationId:c.resourceOrganizationId,signalRefs:input.signalRefs,rootCauseCode:input.rootCauseCode,
    evidenceRefs:input.evidenceRefs,counterEvidenceRefs:input.counterEvidenceRefs,
    domainOwnerRef:input.domainOwnerRef,receiptRef:{type:'abh.command',id:command.commandId,version:1},
    builtBy:c.actor,builtAt:clock!.now.toISOString(),
    digest:'sha256:'+'0'.repeat(64)});
  const record=contract('LearningCaseRecord',{...unsigned,digest:await digestContract('LearningCaseRecord',unsigned)});
  await tx.owner('LearningController')`INSERT INTO core.learning_cases
    (resource_organization_id,id,workspace_id,purpose_names,record,root_cause_code,receipt_id)
    VALUES (${c.resourceOrganizationId},${record.caseRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
      ${JSON.stringify(record)}::text::jsonb,${record.rootCauseCode},${command.commandId})`;
  const relatedRefs=[...new Map([...record.signalRefs,record.domainOwnerRef,...record.evidenceRefs,
    ...record.counterEvidenceRefs].map(ref=>[JSON.stringify(ref),ref])).values()];
  await appendChange(tx,{command,target:record.caseRef,eventType:'abh.learning-case.created',
    changedFields:['signalRefs','rootCauseCode'],relatedRefs});
  return record;
 }

 async getCase(tx:TenantTransaction,ref:EntityRef):Promise<LearningCaseRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.learning_cases
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('LearningCaseRecord',row.record);
  if(!sameRef(record.caseRef,ref)||record.caseRef.version!==Number(row.version)||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('LearningCaseRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;

 }

 async createCandidate(tx:TenantTransaction,command:CommandIdentity,input:CreateCandidatePayload):Promise<LearningCandidateRecord>{
  contract('CreateCandidatePayload',structuredClone(input));const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  if(c.purposeOfUse!=='abh.learning.capture')throw new CoreError('LEARNING_PURPOSE_DENIED');
  let learningCase:LearningCaseRecord;
  try{learningCase=await this.getCase(tx,input.caseRef);}
  catch(error){if(error instanceof CoreError)throw new CoreError('CASE_EVIDENCE_INCOMPLETE');throw error;}
  const scopeRows:unknown[]=[];
  for(const signalRef of learningCase.signalRefs){
   const [row]=await tx.owner('LearningController')`SELECT record FROM core.learning_signals
     WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
       AND ${c.purposeOfUse}=ANY(purpose_names) AND id=${signalRef.id}
       AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
   if(row)scopeRows.push(row);
  }
  const scopeRecords=scopeRows.map(row=>{const record=contract('LearningSignalRecord',(row as {record:unknown}).record);
    if(!learningCase.signalRefs.some(ref=>sameRef(ref,record.signalRef)))throw new CoreError('INTERNAL_ERROR');
    return record;});
  const scopes=new Set(scopeRecords.map(record=>JSON.stringify(record.scopeRef)));
  if(scopeRows.length!==learningCase.signalRefs.length||scopes.size!==1||
    !scopeRecords.some(record=>sameRef(record.scopeRef,input.scopeRef)))throw new CoreError('CANDIDATE_SCOPE_EXCEEDED');
  if(input.candidateArtifactRef.type!=='abh.artifact')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const [artifact]=await tx.owner('ArtifactStore')`SELECT record,version FROM data.artifacts
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.candidateArtifactRef.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND version=${input.candidateArtifactRef.version}
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!artifact)throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const candidateArtifact=contract('ArtifactRecord',artifact.record);
  if(!sameRef(candidateArtifact.artifactRef,input.candidateArtifactRef)||candidateArtifact.status!=='Available')
    throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const unsigned=contract('LearningCandidateRecord',{candidateRef:{type:'abh.learning-candidate',id:randomUUID(),version:1},
    resourceOrganizationId:c.resourceOrganizationId,caseRef:input.caseRef,assetKind:input.assetKind,
    baseVersion:input.baseVersion,candidateArtifactRef:input.candidateArtifactRef,scopeRef:input.scopeRef,
    risk:input.risk,status:'Draft',producer:c.actor,receiptRef:{type:'abh.command',id:command.commandId,version:1},
    createdAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
  const record=contract('LearningCandidateRecord',{...unsigned,digest:await digestContract('LearningCandidateRecord',unsigned)});
  await tx.owner('LearningController')`INSERT INTO core.learning_candidates
    (resource_organization_id,id,workspace_id,purpose_names,record,case_id,asset_kind,status,receipt_id)
    VALUES (${c.resourceOrganizationId},${record.candidateRef.id},${c.workspaceId??null},ARRAY['abh.learning.capture','abh.learning.evaluate','abh.learning.gate'],
      ${JSON.stringify(record)}::text::jsonb,${record.caseRef.id},${record.assetKind},${record.status},${command.commandId})`;
  await appendChange(tx,{command,target:record.candidateRef,eventType:'abh.learning-candidate.created',
    changedFields:['status','candidateArtifactRef'],relatedRefs:[record.caseRef,record.candidateArtifactRef]});
  return record;
 }

 async getCandidate(tx:TenantTransaction,ref:EntityRef):Promise<LearningCandidateRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.learning_candidates
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('LearningCandidateRecord',row.record);
  if(!sameRef(record.candidateRef,ref)||record.candidateRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
  ||await digestContract('LearningCandidateRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async #availableArtifact(tx:TenantTransaction,ref:EntityRef):Promise<void>{
  if(ref.type!=='abh.artifact')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const c=tx.context.tenant;
  const [row]=await tx.owner('ArtifactStore')`SELECT record,version FROM data.artifacts
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND version=${ref.version}
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const artifact=contract('ArtifactRecord',row.record);
  if(!sameRef(artifact.artifactRef,ref)||artifact.status!=='Available')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
 }

 async #candidateForUpdate(tx:TenantTransaction,ref:EntityRef):Promise<LearningCandidateRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  await tx.owner('LearningController')`SELECT pg_advisory_xact_lock(hashtextextended(
    ${`${c.resourceOrganizationId}:${ref.id}`},0))`;
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.learning_candidates
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('LearningCandidateRecord',row.record);
  if(!sameRef(record.candidateRef,ref)||record.candidateRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('LearningCandidateRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async getProfile(tx:TenantTransaction,ref:EntityRef):Promise<EvaluationProfileRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,[c.purposeOfUse]);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.evaluation_profiles
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('EVALUATION_PROFILE_UNAVAILABLE');
  const record=contract('EvaluationProfileRecord',row.record);
  if(!sameRef(record.profileRef,ref)||record.profileRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('EvaluationProfileRecord',record)!==record.digest)throw new CoreError('EVALUATION_PROFILE_UNAVAILABLE');
  return record;
 }

 async requestEvaluation(tx:TenantTransaction,command:CommandIdentity,input:RequestEvaluationPayload):Promise<EvaluationRunRecord>{
  contract('RequestEvaluationPayload',structuredClone(input));const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.evaluate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture','abh.learning.evaluate']);
  const candidate=await this.#candidateForUpdate(tx,input.candidateRef);
  if(candidate.status!=='Draft')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  if(candidate.producer.id===c.actor.id)throw new CoreError('EVALUATOR_IDENTITY_INVALID');
  if(sameRef(candidate.candidateArtifactRef,input.baselineRef))throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  await this.#availableArtifact(tx,input.baselineRef);
  const rows=await tx.owner('LearningController')`SELECT id,record,version FROM core.evaluation_profiles
    WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND asset_kind=${candidate.assetKind} AND risk=${candidate.risk}
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY id`;
  if(rows.length===0)throw new CoreError('EVALUATION_PROFILE_UNAVAILABLE');
  if(rows.length>1)throw new CoreError('EVALUATION_PROFILE_AMBIGUOUS');
  const profile=await this.getProfile(tx,{type:'abh.evaluation-profile',id:String(rows[0]!.id),
    version:Number(rows[0]!.version)});
  if(profile.assetKind!==candidate.assetKind||profile.risk!==candidate.risk||
    profile.evaluatorRef.id!==c.actor.id||profile.evaluatorRef.id===candidate.producer.id||
    profile.evaluatorRef.type!=='abh.principal')
    throw new CoreError('EVALUATOR_IDENTITY_INVALID');
  for(const ref of [profile.suiteRef,profile.datasetSnapshotRef,profile.metricThresholdRef,profile.stoppingRuleRef])
    await this.#availableArtifact(tx,ref);
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const expiresAt=new Date(clock!.now.getTime()+60*60*1000).toISOString();
  const unsigned=contract('EvaluationRunRecord',{runRef:{type:'abh.evaluation-run',id:randomUUID(),version:1},
    resourceOrganizationId:c.resourceOrganizationId,candidateRef:input.candidateRef,profileRef:profile.profileRef,
    baselineRef:input.baselineRef,assignmentUnit:profile.assignmentUnit,seed:randomInt(0,2147483648),
    executionRefs:[],status:'Queued',requestedBy:c.actor,
    receiptRef:{type:'abh.command',id:command.commandId,version:1},createdAt:clock!.now.toISOString(),expiresAt,
    digest:'sha256:'+'0'.repeat(64)});
  const record=contract('EvaluationRunRecord',{...unsigned,digest:await digestContract('EvaluationRunRecord',unsigned)});
  await tx.owner('LearningController')`INSERT INTO core.evaluation_runs
    (resource_organization_id,id,workspace_id,purpose_names,record,candidate_id,profile_id,status,receipt_id,expires_at)
    VALUES (${c.resourceOrganizationId},${record.runRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
      ${JSON.stringify(record)}::text::jsonb,${record.candidateRef.id},${record.profileRef.id},${record.status},${command.commandId},${record.expiresAt})`;
  await appendChange(tx,{command,target:record.runRef,eventType:'abh.evaluation-run.created',
    changedFields:['status','profileRef','baselineRef','seed'],
    relatedRefs:[record.candidateRef,record.profileRef,record.baselineRef]});
  return record;
 }

 async retryEvaluation(tx:TenantTransaction,command:CommandIdentity,input:RetryEvaluationPayload):Promise<EvaluationRunRecord>{
  contract('RetryEvaluationPayload',structuredClone(input));const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.evaluate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture','abh.learning.evaluate']);
  if(input.runRef.type!=='abh.evaluation-run'||input.runRef.version<1)throw new CoreError('INVALID_ARGUMENT');
  const predecessor=await this.#evaluationRunForUpdate(tx,input.runRef);
  if(predecessor.status!=='Inconclusive')throw new CoreError('PRECONDITION_FAILED');
  const candidate=await this.#candidateForUpdate(tx,predecessor.candidateRef);
  if(candidate.status!=='Draft')throw new CoreError('CASE_EVIDENCE_INCOMPLETE');
  const queued=await tx.owner('LearningController')`SELECT 1 FROM core.evaluation_runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND candidate_id=${candidate.candidateRef.id}
      AND deleted_at IS NULL AND status='Queued' LIMIT 1`;
  if(queued.length>0)throw new CoreError('PRECONDITION_FAILED');
  const profile=await this.getProfile(tx,predecessor.profileRef);
  if(profile.profileRef.id!==predecessor.profileRef.id
    ||profile.profileRef.version!==predecessor.profileRef.version
    ||profile.assetKind!==candidate.assetKind||profile.risk!==candidate.risk
    ||profile.evaluatorRef.id!==c.actor.id||profile.evaluatorRef.id===candidate.producer.id
    ||predecessor.requestedBy.id!==c.actor.id
    ||profile.evaluatorRef.type!=='abh.principal'
    ||sameRef(candidate.candidateArtifactRef,predecessor.baselineRef))
    throw new CoreError('EVALUATOR_IDENTITY_INVALID');
  await this.#availableArtifact(tx,predecessor.baselineRef);
  for(const ref of [profile.suiteRef,profile.datasetSnapshotRef,profile.metricThresholdRef,profile.stoppingRuleRef])
    await this.#availableArtifact(tx,ref);
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const expiresAt=new Date(clock!.now.getTime()+60*60*1000).toISOString();
  const unsigned=contract('EvaluationRunRecord',{runRef:{type:'abh.evaluation-run',id:randomUUID(),version:1},
    resourceOrganizationId:c.resourceOrganizationId,candidateRef:predecessor.candidateRef,
    profileRef:predecessor.profileRef,baselineRef:predecessor.baselineRef,retryOfRef:predecessor.runRef,
    assignmentUnit:predecessor.assignmentUnit,seed:randomInt(0,2147483648),executionRefs:[],
    status:'Queued',requestedBy:c.actor,receiptRef:{type:'abh.command',id:command.commandId,version:1},
    createdAt:clock!.now.toISOString(),expiresAt,digest:'sha256:'+'0'.repeat(64)});
  const record=contract('EvaluationRunRecord',{...unsigned,digest:await digestContract('EvaluationRunRecord',unsigned)});
  await tx.owner('LearningController')`INSERT INTO core.evaluation_runs
    (resource_organization_id,id,workspace_id,purpose_names,record,candidate_id,profile_id,status,receipt_id,expires_at)
    VALUES (${c.resourceOrganizationId},${record.runRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
      ${JSON.stringify(record)}::text::jsonb,${record.candidateRef.id},${record.profileRef.id},${record.status},
      ${command.commandId},${record.expiresAt})`;
  await appendChange(tx,{command,target:record.runRef,eventType:'abh.evaluation-run.created',
    changedFields:['status','profileRef','baselineRef','seed','retryOfRef'],
    relatedRefs:[record.candidateRef,record.profileRef,record.baselineRef,predecessor.runRef]});
  return record;
 }

 async getEvaluationRun(tx:TenantTransaction,ref:EntityRef):Promise<EvaluationRunRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.evaluate']);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.evaluation_runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('EvaluationRunRecord',row.record);
  if(!sameRef(record.runRef,ref)||record.runRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('EvaluationRunRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async #evaluationRunForUpdate(tx:TenantTransaction,ref:EntityRef):Promise<EvaluationRunRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.evaluate']);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.evaluation_runs
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('EvaluationRunRecord',row.record);
  if(!sameRef(record.runRef,ref)||record.runRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('EvaluationRunRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async expireEvaluationRun(tx:TenantTransaction,command:CommandIdentity,input:ExpireEvaluationPayload):Promise<EvaluationRunRecord>{
  contract('ExpireEvaluationPayload',structuredClone(input));const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.evaluate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture','abh.learning.evaluate']);
  if(input.runRef.type!=='abh.evaluation-run'||input.runRef.version<1)throw new CoreError('INVALID_ARGUMENT');
 const run=await this.#evaluationRunForUpdate(tx,input.runRef);
 if(run.status!=='Queued')throw new CoreError('PRECONDITION_FAILED');
 const next=contract('EvaluationRunRecord',{...run,status:'Inconclusive' as const,
    runRef:{...run.runRef,version:run.runRef.version+1},
    digest:'sha256:'+'0'.repeat(64)});
  const record=contract('EvaluationRunRecord',{...next,
    digest:await digestContract('EvaluationRunRecord',{...next})});
  const changed=await tx.owner('LearningController')`UPDATE core.evaluation_runs
    SET status=${record.status},version=${record.runRef.version},record=${JSON.stringify(record)}::text::jsonb,
      updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${run.runRef.id}
      AND version=${run.runRef.version} RETURNING id`;
  if(!changed[0])throw new CoreError('VERSION_CONFLICT');
  await appendChange(tx,{command,target:record.runRef,eventType:'abh.evaluation-run.expired',
    changedFields:['status'],relatedRefs:[run.candidateRef,run.profileRef]});
 return record;
 }

 async recoveryEvaluationRuns(tx:TenantTransaction,limit:number):Promise<RecoveryEvaluationRun[]>{
  const c=tx.context.tenant;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture','abh.learning.evaluate']);
  const rows=await tx.owner('LearningController')`SELECT r.record,r.version,
      EXISTS(SELECT 1 FROM runtime.work_leases lease
        WHERE lease.resource_organization_id=r.resource_organization_id
          AND lease.target_type='abh.evaluation-run' AND lease.target_id=r.id
          AND lease.deleted_at IS NULL AND lease.lease_until>clock_timestamp()
          AND ${c.purposeOfUse}=ANY(lease.purpose_names)) AS active,
      COALESCE((SELECT lease.fencing_token::integer FROM runtime.work_leases lease
        WHERE lease.resource_organization_id=r.resource_organization_id
          AND lease.target_type='abh.evaluation-run' AND lease.target_id=r.id
          AND lease.deleted_at IS NULL ORDER BY lease.fencing_token DESC LIMIT 1),0) AS fencing_token
    FROM core.evaluation_runs r
    WHERE r.resource_organization_id=${c.resourceOrganizationId} AND r.deleted_at IS NULL AND r.status='Queued'
      AND ${c.purposeOfUse}=ANY(r.purpose_names)
      AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)
      AND NOT EXISTS(SELECT 1 FROM core.learning_withdrawals w
        WHERE w.resource_organization_id=r.resource_organization_id
          AND w.purpose_name=ANY(ARRAY['abh.learning.capture','abh.learning.evaluate']))
    ORDER BY r.created_at,r.id LIMIT ${limit}`;
  return await Promise.all(rows.map(async row=>{
    const record=contract('EvaluationRunRecord',row.record);
    if(record.runRef.version!==Number(row.version)||record.status!=='Queued'
      ||record.resourceOrganizationId!==c.resourceOrganizationId
      ||await digestContract('EvaluationRunRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return {record,active:row.active===true,fencingToken:Number(row.fencing_token)};
  }));
}

 async submitEvaluationResult(tx:TenantTransaction,command:CommandIdentity,input:SubmitEvaluationResultPayload):Promise<EvaluationResultRecord>{
  contract('SubmitEvaluationResultPayload',structuredClone(input));const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.evaluate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.evaluate']);
  const run=await this.#evaluationRunForUpdate(tx,input.runRef);
  if(run.status!=='Queued'||run.runRef.version!==1)throw new CoreError('PRECONDITION_FAILED');
  const profile=await this.getProfile(tx,run.profileRef),candidate=await this.getCandidate(tx,run.candidateRef);
  if(!sameRef(profile.evaluatorRef,input.evaluatorPrincipal)||input.evaluatorPrincipal.type!=='abh.principal'
    ||profile.evaluatorRef.id!==c.actor.id||candidate.producer.id===c.actor.id)
    throw new CoreError('EVALUATOR_IDENTITY_INVALID');
  for(const ref of input.artifactRefs)await this.#availableArtifact(tx,ref);
  const hasBaseline=input.baselineMetricValues!==undefined||input.baselineCompletedSamples!==undefined
    ||input.baselineFailedSamples!==undefined;
  if(hasBaseline&&(!input.baselineMetricValues||input.baselineCompletedSamples===undefined
    ||input.baselineFailedSamples===undefined))throw new CoreError('INVALID_ARGUMENT');
  if(hasBaseline&&(new Set(input.baselineMetricValues!.map(value=>value.name)).size!==input.baselineMetricValues!.length
    ||input.baselineFailedSamples!>=input.baselineCompletedSamples!))throw new CoreError('INVALID_ARGUMENT');
  if(profile.minimumRelativeLift>0&&!hasBaseline)throw new CoreError('INVALID_ARGUMENT');
  const status=input.completedSamples>=profile.minimumSamples&&input.failedSamples===0?'Completed':'Inconclusive';
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const resultRef={type:'abh.evaluation-result' as const,id:randomUUID(),version:1};
  const unsignedResult=contract('EvaluationResultRecord',{resultRef,resourceOrganizationId:c.resourceOrganizationId,
    runRef:run.runRef,candidateRef:run.candidateRef,profileRef:run.profileRef,status,
    artifactRefs:input.artifactRefs,executionRefs:input.executionRefs,metricValues:input.metricValues,
    ...(hasBaseline?{baselineMetricValues:input.baselineMetricValues,
      baselineCompletedSamples:input.baselineCompletedSamples,
      baselineFailedSamples:input.baselineFailedSamples}:{}),
    completedSamples:input.completedSamples,failedSamples:input.failedSamples,dataDigest:input.dataDigest,
    evaluatorPrincipal:input.evaluatorPrincipal,receiptRef:{type:'abh.command',id:command.commandId,version:1},
    submittedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
  const result=contract('EvaluationResultRecord',{...unsignedResult,
    digest:await digestContract('EvaluationResultRecord',unsignedResult)});
  await tx.owner('LearningController')`INSERT INTO core.evaluation_results
    (resource_organization_id,id,workspace_id,purpose_names,record,run_id,status,receipt_id)
    VALUES (${c.resourceOrganizationId},${result.resultRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse},'abh.learning.gate'],
      ${JSON.stringify(result)}::text::jsonb,${result.runRef.id},${result.status},${command.commandId})`;
  const nextRun=contract('EvaluationRunRecord',{...run,status,resultRef,executionRefs:input.executionRefs});
  const updatedRun:EvaluationRunRecord={...nextRun,runRef:{...run.runRef,version:2},
    digest:await digestContract('EvaluationRunRecord',{...nextRun,runRef:{...run.runRef,version:2}})};
  const changed=await tx.owner('LearningController')`UPDATE core.evaluation_runs
    SET status=${updatedRun.status},result_id=${result.resultRef.id},version=2,
      record=${JSON.stringify(updatedRun)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${run.runRef.id} AND version=${run.runRef.version}
    RETURNING id`;
  if(!changed[0])throw new CoreError('VERSION_CONFLICT');
  await appendChange(tx,{command,target:result.resultRef,eventType:'abh.evaluation-result.created',
    changedFields:['status','metricValues','resultRef'],
    relatedRefs:[result.runRef,result.candidateRef,result.profileRef,...result.artifactRefs]});
  return result;
 }

 async getEvaluationResult(tx:TenantTransaction,ref:EntityRef):Promise<EvaluationResultRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,
    c.purposeOfUse==='abh.learning.gate'?['abh.learning.evaluate','abh.learning.gate']:['abh.learning.evaluate']);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.evaluation_results
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('EvaluationResultRecord',row.record);
  if(!sameRef(record.resultRef,ref)||record.resultRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('EvaluationResultRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async buildGate(tx:TenantTransaction,command:CommandIdentity,input:BuildGatePayload):Promise<EvaluationGateArtifactRecord>{
  contract('BuildGatePayload',structuredClone(input));const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.gate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture','abh.learning.evaluate','abh.learning.gate']);
  if(command.type!=='abh.learning.build-gate'||input.candidateRef.type!=='abh.learning-candidate'
    ||input.candidateRef.version<1)throw new CoreError('INVALID_ARGUMENT');
  const candidate=await this.getCandidate(tx,input.candidateRef);
  if(candidate.status!=='Draft')throw new CoreError('GATE_EVIDENCE_INVALID');
  const [existing]=await tx.owner('LearningController')`SELECT id FROM core.learning_gates
    WHERE resource_organization_id=${c.resourceOrganizationId} AND candidate_id=${candidate.candidateRef.id}
      AND deleted_at IS NULL`;
  if(existing)throw new CoreError('PRECONDITION_FAILED');
  const results:EvaluationResultRecord[]=[];const artifacts:EntityRef[]=[];
  for(const ref of input.evaluationRefs){
    const result=await this.getEvaluationResult(tx,ref);
    if(!sameRef(result.candidateRef,candidate.candidateRef))throw new CoreError('GATE_EVIDENCE_INVALID');
    results.push(result);artifacts.push(...result.artifactRefs);
  }
  const profileIds=new Set(results.map(result=>result.profileRef.id));
  if(profileIds.size!==1)throw new CoreError('GATE_EVIDENCE_INVALID');
  const [profileRow]=await tx.owner('LearningController')`SELECT record,version FROM core.evaluation_profiles
    WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
      AND id=${results[0]!.profileRef.id} AND version=${results[0]!.profileRef.version}
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!profileRow)throw new CoreError('GATE_POLICY_INCOMPLETE');
  const profile=contract('EvaluationProfileRecord',profileRow.record);
  if(!sameRef(profile.profileRef,results[0]!.profileRef)||profile.profileRef.version!==Number(profileRow.version)
    ||await digestContract('EvaluationProfileRecord',profile)!==profile.digest)throw new CoreError('GATE_POLICY_INCOMPLETE');
  if(profile.metricThresholds.length===0||new Set(profile.metricThresholds.map(value=>value.name)).size!==profile.metricThresholds.length)
    throw new CoreError('GATE_POLICY_INCOMPLETE');
  const signedBy={type:'Human' as const,id:c.actor.id};
  if(signedBy.id===candidate.producer.id||signedBy.id===profile.evaluatorRef.id)throw new CoreError('GATE_EVIDENCE_INVALID');
  await new InlineArtifactOwner().lockSources(tx,artifacts);
  const candidateSamples=results.map(result=>result.completedSamples-result.failedSamples);
  const allMetricValues=results.flatMap(result=>result.metricValues);
  const baselineResults=results.filter(result=>(result.baselineMetricValues??[]).length>0);
  const baselineMetricValues=baselineResults.flatMap(result=>result.baselineMetricValues??[]);
  const aggregates=profile.metricThresholds.map(threshold=>{
    const candidate=aggregateMetricValues(allMetricValues,candidateSamples,threshold.name);
    if(!candidate)return undefined;
    let baseline:MetricAggregate|undefined;
    if(baselineResults.length>0){
      const baselineSamples=baselineResults.map(result=>{
        if(result.baselineCompletedSamples===undefined||result.baselineFailedSamples===undefined)throw new CoreError('GATE_EVIDENCE_INVALID');
        return result.baselineCompletedSamples-result.baselineFailedSamples;
      });
      baseline=aggregateMetricValues(baselineMetricValues,baselineSamples,threshold.name);
    }
    const interval=wilson(candidate.estimate,candidate.samples,profile.confidenceLevel);
    const finding:GateFinding={metric:threshold.name,actual:candidate.estimate,minimum:threshold.minimum,
      lowerBound:interval.lower,outcome:interval.lower>=threshold.minimum?'Pass':'Fail'};
    const uncertainty:GateUncertainty={metric:threshold.name,method:'WilsonScore',
      confidenceLevel:profile.confidenceLevel,estimate:candidate.estimate,
      lowerBound:interval.lower,upperBound:interval.upper,sampleCount:candidate.samples};
    if(baseline){
      const baselineInterval=wilson(baseline.estimate,baseline.samples,profile.confidenceLevel);
      const relativeLift=round12((candidate.estimate-baseline.estimate)/baseline.estimate);
      const lowerRelativeLift=round12((interval.lower-baselineInterval.lower)/baselineInterval.lower);
      finding.baseline=baseline.estimate;finding.baselineLowerBound=baselineInterval.lower;
      finding.relativeLift=relativeLift;finding.lowerRelativeLift=lowerRelativeLift;
      if(profile.minimumRelativeLift>0&&(relativeLift<profile.minimumRelativeLift||lowerRelativeLift<profile.minimumRelativeLift))
        finding.outcome='Fail';
    }else if(profile.minimumRelativeLift>0)finding.outcome='Fail';
    return {finding,uncertainty};
  });
  const aggregatedMetricValues=profile.metricThresholds.map((threshold,index):MetricValue=>({
    name:threshold.name,value:aggregates[index]?.finding.actual??0}));
  const baselineMetricValueList=profile.metricThresholds.map((threshold,index):MetricValue=>({
    name:threshold.name,value:aggregates[index]?.finding.baseline??0}));
  const findings=aggregates.map((value,index):GateFinding=>value?.finding??{
    metric:profile.metricThresholds[index!]!.name,minimum:profile.metricThresholds[index!]!.minimum,outcome:'Missing'});
  const verdict=results.some(result=>result.status==='Inconclusive')||findings.some(finding=>finding.outcome==='Missing')
    ?'Inconclusive':findings.some(finding=>finding.outcome==='Fail')?'Fail':'Pass';
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const gateRef={type:'abh.learning-gate' as const,id:randomUUID(),version:1};
  const unsigned=contract('EvaluationGateArtifactRecord',{gateRef,resourceOrganizationId:c.resourceOrganizationId,
    candidateRef:candidate.candidateRef,profileRef:profile.profileRef,evaluationRefs:input.evaluationRefs,
    metricThresholds:profile.metricThresholds,metricValues:aggregatedMetricValues,
    baselineMetricValues:profile.minimumRelativeLift>0?baselineMetricValueList:[],
    uncertainty:aggregates.flatMap(value=>value?[value.uncertainty]:[]),
    limitations:[{code:'evaluation.frozen-dataset',detail:'The interval applies only to the frozen evaluation dataset.'},
      {code:'evaluation.no-causal-adjustment',detail:'The comparison does not adjust for interference outside the assignment unit.'}],
    findings,verdict,signedBy,
    createdAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
  const record=contract('EvaluationGateArtifactRecord',{...unsigned,digest:await digestContract('EvaluationGateArtifactRecord',unsigned)});
  await tx.owner('LearningController')`INSERT INTO core.learning_gates
    (resource_organization_id,id,workspace_id,purpose_names,record,candidate_id,profile_id,verdict,receipt_id)
    VALUES (${c.resourceOrganizationId},${gateRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
      ${JSON.stringify(record)}::text::jsonb,${candidate.candidateRef.id},${profile.profileRef.id},${verdict},${command.commandId})`;
  await appendChange(tx,{command,target:gateRef,eventType:'abh.learning-gate.created',
    changedFields:['verdict','metricValues','findings'],
    relatedRefs:[candidate.candidateRef,profile.profileRef,...input.evaluationRefs]});
  return record;
 }

 async getEvaluationGate(tx:TenantTransaction,ref:EntityRef):Promise<EvaluationGateArtifactRecord>{
  contract('EntityRef',ref);const c=tx.context.tenant;
  await this.#ensurePurposesAvailable(tx,['abh.learning.gate']);
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.learning_gates
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('EvaluationGateArtifactRecord',row.record);
  if(!sameRef(record.gateRef,ref)||record.gateRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('EvaluationGateArtifactRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
 }

 async withdrawRevokedPurpose(tx:TenantTransaction,purposeName:string):Promise<void>{
  if(!['abh.learning.capture','abh.learning.evaluate','abh.learning.gate'].includes(purposeName))
    throw new CoreError('INVALID_ARGUMENT');
  const [purpose]=await tx.owner('Control')`SELECT status FROM control.purposes
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND name=${purposeName}
      AND deleted_at IS NULL`;
  if(!purpose)throw new CoreError('RESOURCE_NOT_FOUND');
  if(purpose.status!=='Revoked')throw new CoreError('PRECONDITION_FAILED');
  const [commandId]=await tx.owner('LearningController')`SELECT gen_random_uuid() AS id`;
  await tx.owner('LearningController')`INSERT INTO core.learning_withdrawals
    (resource_organization_id,id,purpose_names,record,purpose_name,command_id)
    VALUES (${tx.context.tenant.resourceOrganizationId},${commandId!.id},ARRAY[${purposeName}],
      ${JSON.stringify({purposeName,withdrawnAt:new Date().toISOString()})}::text::jsonb,
      ${purposeName},${commandId!.id})
    ON CONFLICT (resource_organization_id,purpose_name) DO NOTHING`;
 }

 async listSignals(tx:TenantTransaction,input:LearningOwnerListInput<ListLearningSignalsQuery>):Promise<LearningListPage<LearningSignalRecord>>{
  const {after,...query}=structuredClone(input);void after;
  contract('ListLearningSignalsQuery',query);const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.capture')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  const rows=await tx.owner('LearningController')`WITH eligible AS MATERIALIZED (
      SELECT id,record,created_at,signal_type FROM core.learning_signals
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${input.signalType??null}::text IS NULL OR signal_type=${input.signalType??null})
        AND (${input.scopeId??null}::uuid IS NULL OR record->'scopeRef'->>'id'=${input.scopeId??null}::text)
    ), counts AS (
      SELECT signal_type AS key,count(*)::integer AS count FROM eligible GROUP BY signal_type
    ), matching AS MATERIALIZED (
      SELECT id,record,created_at FROM eligible
      WHERE (${input.after?.id??null}::uuid IS NULL OR (created_at,id)<(${input.after?.createdAt??null}::text::timestamptz,${input.after?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${(input.limit??25)+1}
    ), aggregate AS (SELECT jsonb_object_agg(key,count) AS counts FROM counts)
    SELECT matching.id,matching.record,
      to_char(matching.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
      aggregate.counts FROM matching CROSS JOIN aggregate ORDER BY matching.created_at DESC,matching.id DESC`;
  const page=rows.slice(0,input.limit??25),last=page.at(-1);
  return {records:page.map(row=>contract('LearningSignalRecord',row.record)),counts:rows[0]?.counts??{},
    ...(rows.length>(input.limit??25))&&last?{next:{createdAt:last.created_at,id:last.id}}:{}};
 }

 async listCases(tx:TenantTransaction,input:LearningOwnerListInput<ListLearningCasesQuery>):Promise<LearningListPage<LearningCaseRecord>>{
  const {after,...query}=structuredClone(input);void after;
  contract('ListLearningCasesQuery',query);const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.capture')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.capture']);
  const rows=await tx.owner('LearningController')`WITH eligible AS MATERIALIZED (
      SELECT id,record,created_at,root_cause_code FROM core.learning_cases
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${input.rootCauseCode??null}::text IS NULL OR root_cause_code=${input.rootCauseCode??null})
        AND (${input.scopeId??null}::uuid IS NULL OR record->'scopeRef'->>'id'=${input.scopeId??null}::text)
    ), counts AS (
      SELECT root_cause_code AS key,count(*)::integer AS count FROM eligible GROUP BY root_cause_code
    ), matching AS MATERIALIZED (
      SELECT id,record,created_at FROM eligible
      WHERE (${input.after?.id??null}::uuid IS NULL OR (created_at,id)<(${input.after?.createdAt??null}::text::timestamptz,${input.after?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${(input.limit??25)+1}
    ), aggregate AS (SELECT jsonb_object_agg(key,count) AS counts FROM counts)
    SELECT matching.id,matching.record,
      to_char(matching.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
      aggregate.counts FROM matching CROSS JOIN aggregate ORDER BY matching.created_at DESC,matching.id DESC`;
  const page=rows.slice(0,input.limit??25),last=page.at(-1);
  return {records:page.map(row=>contract('LearningCaseRecord',row.record)),counts:rows[0]?.counts??{},
    ...(rows.length>(input.limit??25))&&last?{next:{createdAt:last.created_at,id:last.id}}:{}};
 }

 async listCandidates(tx:TenantTransaction,input:LearningOwnerListInput<ListLearningCandidatesQuery>):Promise<LearningListPage<LearningCandidateRecord>>{
  const {after,...query}=structuredClone(input);void after;
  contract('ListLearningCandidatesQuery',query);const c=tx.context.tenant;
  if(!candidatePurposeNames.includes(c.purposeOfUse))throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,candidatePurposeNames);
  const rows:LearningListRow[]=await tx.owner('LearningController')`WITH eligible AS MATERIALIZED (
      SELECT id,record,created_at,status FROM core.learning_candidates
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${input.candidateStatus??null}::text IS NULL OR status=${input.candidateStatus??null})
        AND (${input.assetKind??null}::text IS NULL OR asset_kind=${input.assetKind??null})
        AND (${input.scopeId??null}::uuid IS NULL OR record->'scopeRef'->>'id'=${input.scopeId??null}::text)
    ), counts AS (
      SELECT status AS key,count(*)::integer AS count FROM eligible GROUP BY status
    ), matching AS MATERIALIZED (
      SELECT id,record,created_at FROM eligible
      WHERE (${input.after?.id??null}::uuid IS NULL OR (created_at,id)<(${input.after?.createdAt??null}::text::timestamptz,${input.after?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${(input.limit??25)+1}
    ), aggregate AS (SELECT jsonb_object_agg(key,count) AS counts FROM counts)
    SELECT matching.id,matching.record,
      to_char(matching.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
      aggregate.counts FROM matching CROSS JOIN aggregate ORDER BY matching.created_at DESC,matching.id DESC`;
  const page=rows.slice(0,input.limit??25),last=page.at(-1);
  return {records:page.map(row=>contract('LearningCandidateRecord',row.record)),counts:rows[0]?.counts??{},
    ...(rows.length>(input.limit??25))&&last?{next:{createdAt:last.created_at,id:last.id}}:{}};
}

 async listEvaluationRuns(tx:TenantTransaction,input:LearningOwnerListInput<ListEvaluationRunsQuery>):
   Promise<LearningListPage<EvaluationRunRecord>>{
  const {after,...query}=structuredClone(input);void after;
  contract('ListEvaluationRunsQuery',query);const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.evaluate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.evaluate']);
  const rows:LearningListRow[]=await tx.owner('LearningController')`WITH eligible AS MATERIALIZED (
      SELECT id,record,created_at,status FROM core.evaluation_runs
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${input.candidateId??null}::uuid IS NULL OR candidate_id=${input.candidateId??null}::uuid)
        AND (${input.runStatus??null}::text IS NULL OR status=${input.runStatus??null})
    ), counts AS (
      SELECT status AS key,count(*)::integer AS count FROM eligible GROUP BY status
    ), matching AS MATERIALIZED (
      SELECT id,record,created_at FROM eligible
      WHERE (${input.after?.id??null}::uuid IS NULL OR (created_at,id)<(${input.after?.createdAt??null}::text::timestamptz,${input.after?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${(input.limit??25)+1}
    ), aggregate AS (SELECT jsonb_object_agg(key,count) AS counts FROM counts)
    SELECT matching.id,matching.record,
      to_char(matching.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
      aggregate.counts FROM matching CROSS JOIN aggregate ORDER BY matching.created_at DESC,matching.id DESC`;
  const page=rows.slice(0,input.limit??25),last=page.at(-1);
  return {records:page.map(row=>contract('EvaluationRunRecord',row.record)),counts:rows[0]?.counts??{},
    ...(rows.length>(input.limit??25))&&last?{next:{createdAt:last.created_at,id:last.id}}:{}};
 }

 async listGates(tx:TenantTransaction,input:LearningOwnerListInput<ListLearningGatesQuery>):
   Promise<LearningListPage<EvaluationGateArtifactRecord>>{
  const {after,...query}=structuredClone(input);void after;
  contract('ListLearningGatesQuery',query);const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.gate')throw new CoreError('LEARNING_PURPOSE_DENIED');
  await this.#ensurePurposesAvailable(tx,['abh.learning.gate']);
  const rows:LearningListRow[]=await tx.owner('LearningController')`WITH eligible AS MATERIALIZED (
      SELECT id,record,created_at,verdict FROM core.learning_gates
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)
        AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
        AND (${input.candidateId??null}::uuid IS NULL OR candidate_id=${input.candidateId??null}::uuid)
        AND (${input.verdict??null}::text IS NULL OR verdict=${input.verdict??null})
    ), counts AS (
      SELECT verdict AS key,count(*)::integer AS count FROM eligible GROUP BY verdict
    ), matching AS MATERIALIZED (
      SELECT id,record,created_at FROM eligible
      WHERE (${input.after?.id??null}::uuid IS NULL OR (created_at,id)<(${input.after?.createdAt??null}::text::timestamptz,${input.after?.id??null}::uuid))
      ORDER BY created_at DESC,id DESC LIMIT ${(input.limit??25)+1}
    ), aggregate AS (SELECT jsonb_object_agg(key,count) AS counts FROM counts)
    SELECT matching.id,matching.record,
      to_char(matching.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
      aggregate.counts FROM matching CROSS JOIN aggregate ORDER BY matching.created_at DESC,matching.id DESC`;
  const page=rows.slice(0,input.limit??25),last=page.at(-1);
  return {records:page.map(row=>contract('EvaluationGateArtifactRecord',row.record)),counts:rows[0]?.counts??{},
    ...(rows.length>(input.limit??25))&&last?{next:{createdAt:last.created_at,id:last.id}}:{}};
 }
}
