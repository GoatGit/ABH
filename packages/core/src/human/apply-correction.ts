import { randomUUID } from 'node:crypto';
import type { ApplyCorrectionCommand, ApplyCorrectionPayload, CorrectionApplicationRecord,
  CorrectionRecord, EntityRef, GraphRevisionRecord, LearningSignalRecord, MissionRecord,
  ProposeGraphPatchPayload } from '@abh/contracts';
import { digestContract } from '@abh/contracts/digest';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import { appendChange, contract, executeCommand, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import { requireVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { refKey, sameRef } from '../execution/shared.ts';
import { CorrectionOwner } from './corrections.ts';
import { MissionOwner } from '../mission/missions.ts';
import { RunOwner } from '../mission/runs.ts';
import { LearningOwner } from '../mission/learning.ts';
import { canonicalJson } from '@abh/contracts/digest';

export interface CorrectionApplyInstallation {
  grants(context: VerifiedContext, command: ApplyCorrectionCommand, options: TransactionOptions): Promise<readonly EntityRef[]>;
  authority(tx: TenantTransaction, correction: CorrectionRecord, options: TransactionOptions): Promise<void>;
}

async function getApplication(tx: TenantTransaction, ref: EntityRef): Promise<CorrectionApplicationRecord> {
  contract('EntityRef',ref);if(ref.type!=='abh.correction-application')throw new CoreError('INVALID_ARGUMENT');
  const c=tx.context.tenant;
  const [row]=await tx.owner('HumanGateway')`SELECT record,version,correction_id FROM human.correction_applications
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('CorrectionApplicationRecord',row.record);
  if(!sameRef(record.applicationRef,ref)||record.applicationRef.version!==Number(row.version)
    ||record.correctionRef.id!==String(row.correction_id)||record.resourceOrganizationId!==c.resourceOrganizationId
    ||await digestContract('CorrectionApplicationRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
  return record;
}

/** Read side for Subject Owner applications; the original candidate remains immutable. */
export class CorrectionApplicationOwner {
  async getApplication(tx: TenantTransaction, ref: EntityRef): Promise<CorrectionApplicationRecord> {
    return getApplication(tx, ref);
  }
  /** Exception governance reads only the digest-verified application fact, not its applicant purpose scope. */
  async getGovernanceApplication(tx: TenantTransaction, ref: EntityRef): Promise<CorrectionApplicationRecord> {
    contract('EntityRef',ref);if(ref.type!=='abh.correction-application')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const [row]=await tx.owner('HumanGateway')`SELECT record,version,correction_id FROM human.correction_applications
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('CorrectionApplicationRecord',row.record);
    if(!sameRef(record.applicationRef,ref)||record.applicationRef.version!==Number(row.version)
      ||record.correctionRef.id!==String(row.correction_id)||record.resourceOrganizationId!==c.resourceOrganizationId
      ||await digestContract('CorrectionApplicationRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return record;
  }
}

async function validateIntent(tx: TenantTransaction, correctionRef: EntityRef, payload: ApplyCorrectionPayload,
  grantRefs: readonly EntityRef[], authority: CorrectionApplyInstallation['authority'],
  options: TransactionOptions): Promise<CorrectionRecord> {
  const c=tx.context.tenant;
  if(c.actor.type!=='Human'||!['abh.mission.manage','abh.runtime.deliver','abh.learning.capture']
    .includes(c.purposeOfUse))throw new CoreError('FORBIDDEN');
  const organization={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[organization,{type:'abh.principal',id:c.actor.id,version:1},
    payload.subjectRef,...grantRefs,...payload.evidenceRefs]);
  await assertCurrentGrants(tx,{objectRef:correctionRef,scopeRefs:[organization],action:'abh.corrections.apply'},grantRefs);
  const correction=await new CorrectionOwner().get(tx,correctionRef);
  if(correction.targetOwner==='Capability'&&!payload.candidate)throw new CoreError('PRECONDITION_FAILED');
  if(!sameRef(correction.subjectRef,payload.subjectRef)
    ||(correction.targetOwner==='Domain'?(correction.subjectRef.type!=='abh.mission'||c.purposeOfUse!=='abh.mission.manage'):
      correction.targetOwner==='Run'?(correction.subjectRef.type!=='abh.run'||c.purposeOfUse!=='abh.runtime.deliver'):
      correction.targetOwner==='Memory'?(correction.subjectRef.type!=='abh.learning-signal'||
        c.purposeOfUse!=='abh.learning.capture'):
      correction.targetOwner==='Capability'?(correction.subjectRef.type!=='abh.learning-case'||
        !payload.candidate||!sameRef(payload.candidate.caseRef,correction.subjectRef)||
        payload.candidate.baseVersion!==correction.subjectVersion):true))
    throw new CoreError('PRECONDITION_FAILED');
  const [existing]=await tx.owner('HumanGateway')`SELECT count(*)::int AS count FROM human.correction_applications
    WHERE resource_organization_id=${c.resourceOrganizationId} AND correction_id=${correction.correctionRef.id}
      AND deleted_at IS NULL`;
  if(Number(existing!.count)>0){
    await authority(tx,correction,options);
    return correction;
  }
  if(correction.targetOwner==='Memory'){
    const [applied]=await tx.owner('HumanGateway')`SELECT count(*)::int AS count
      FROM human.correction_applications WHERE resource_organization_id=${c.resourceOrganizationId}
        AND subject_id=${correction.subjectRef.id} AND deleted_at IS NULL`;
    if(Number(applied!.count)>0)throw new CoreError('PRECONDITION_FAILED');
  }
  if(correction.targetOwner==='Domain'){
    const missionOwner=new MissionOwner(),mission=await missionOwner.get(tx,payload.subjectRef.id);
    if(mission.missionRef.version!==correction.subjectVersion
      ||!sameRef(mission.goalArtifactRef,correction.beforeRef))throw new CoreError('CORRECTION_STALE');
  }else{
    if(correction.targetOwner==='Run'){
      const run=await new RunOwner().get(tx,payload.subjectRef.id);
      if(run.runRef.version!==correction.subjectVersion)throw new CoreError('CORRECTION_STALE');
      await readRunGraphCorrection(tx,correction);
    }else if(correction.targetOwner==='Memory')await readMemoryCorrection(tx,correction);
  }
  if(correction.targetOwner==='Capability'){
    const learningCase=await new LearningOwner().getCase(tx,payload.candidate!.caseRef);
    if(learningCase.caseRef.version!==payload.candidate!.baseVersion)throw new CoreError('CORRECTION_STALE');
    await new InlineArtifactOwner().read(tx,correction.beforeRef,async record=>{
      if(record.status!=='Available'||!sameRef(record.ownerRef,correction.subjectRef))throw new CoreError('CORRECTION_STALE');
    });
    await new InlineArtifactOwner().read(tx,correction.proposedAfterRef,async record=>{
      if(record.status!=='Available'||!sameRef(record.ownerRef,correction.subjectRef))
        throw new CoreError('PRECONDITION_FAILED');
    });
  }
  await authority(tx,correction,options);
  return correction;
}

async function loadLearningSignal(tx:TenantTransaction,id:string):Promise<LearningSignalRecord>{
  const c=tx.context.tenant;
  const [row]=await tx.owner('LearningController')`SELECT record,version FROM core.learning_signals
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
    `;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const record=contract('LearningSignalRecord',row.record);
  if(record.signalRef.id!==id||record.signalRef.version!==Number(row.version)
    ||record.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('INTERNAL_ERROR');
  return record;
}

async function readMemoryCorrection(tx:TenantTransaction,correction:CorrectionRecord):Promise<LearningSignalRecord>{
  const signal=await loadLearningSignal(tx,correction.subjectRef.id);
  if(signal.signalRef.version!==correction.subjectVersion)throw new CoreError('CORRECTION_STALE');
  const artifacts=new InlineArtifactOwner();
  const before=await artifacts.read(tx,correction.beforeRef,async record=>{
    if(!sameRef(record.ownerRef,correction.subjectRef)||record.mediaType!=='application/json')
      throw new CoreError('PRECONDITION_FAILED');
  });
  const snapshot=parseJsonObject(before.bytes);
  if(canonicalJson(snapshot)!==canonicalJson(signal))throw new CoreError('CORRECTION_STALE');
  await artifacts.read(tx,correction.proposedAfterRef,async record=>{
    if(!sameRef(record.ownerRef,correction.subjectRef)||record.mediaType!=='application/json')
      throw new CoreError('PRECONDITION_FAILED');
  });
  return signal;
}

async function applyMemoryCorrection(tx:TenantTransaction,command:CommandIdentity,
  correction:CorrectionRecord):Promise<LearningSignalRecord>{
  const prior=await readMemoryCorrection(tx,correction),c=tx.context.tenant;
  const [clock]=await tx.owner('LearningController')`SELECT clock_timestamp() AS now`;
  const signal=contract('LearningSignalRecord',{
    signalRef:{type:'abh.learning-signal',id:randomUUID(),version:1},
    resourceOrganizationId:c.resourceOrganizationId,sourceEventRef:prior.sourceEventRef,
    signalType:prior.signalType,artifactRefs:[correction.proposedAfterRef],scopeRef:prior.scopeRef,
    purposeOfUse:prior.purposeOfUse,...(prior.quality===undefined?{}:{quality:prior.quality}),
    capturedAt:clock!.now.toISOString()});
  await tx.owner('LearningController')`INSERT INTO core.learning_signals
    (resource_organization_id,id,workspace_id,purpose_names,record,signal_type)
    VALUES (${c.resourceOrganizationId},${signal.signalRef.id},${c.workspaceId??null},
      ARRAY[${c.purposeOfUse}],${JSON.stringify(signal)}::text::jsonb,${signal.signalType})`;
  await appendChange(tx,{command,target:signal.signalRef,eventType:'abh.learning-signal.corrected',
    changedFields:['artifactRefs'],relatedRefs:[correction.correctionRef,prior.signalRef,
      correction.proposedAfterRef]});
  return signal;
}

async function readRunGraphCorrection(tx:TenantTransaction,correction:CorrectionRecord):Promise<ProposeGraphPatchPayload>{
  const artifacts=new InlineArtifactOwner();
  const [latest]=await tx.owner('MissionController')`SELECT record FROM core.graph_revisions
    WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND run_id=${correction.subjectRef.id}
    AND deleted_at IS NULL ORDER BY revision DESC LIMIT 1 FOR UPDATE`;
  if(!latest)throw new CoreError('PRECONDITION_FAILED');
  const graph=contract('GraphRevisionRecord',latest.record);
  if(graph.runRef.id!==correction.subjectRef.id)
    throw new CoreError('INTERNAL_ERROR');
  if(graph.runRef.version!==correction.subjectVersion)throw new CoreError('CORRECTION_STALE');
  const before=await artifacts.read(tx,correction.beforeRef,async record=>{
    if(!sameRef(record.ownerRef,correction.subjectRef)||record.mediaType!=='application/json')
      throw new CoreError('PRECONDITION_FAILED');
  });
  const snapshot=parseJsonObject(before.bytes);
  if(canonicalJson(snapshot)!==canonicalJson({nodes:graph.nodes,edges:graph.edges,
    supersededNodeKeys:graph.supersededNodeKeys}))throw new CoreError('CORRECTION_STALE');
  const proposed=await artifacts.read(tx,correction.proposedAfterRef,async record=>{
    if(!sameRef(record.ownerRef,correction.subjectRef)||record.mediaType!=='application/json')
      throw new CoreError('PRECONDITION_FAILED');
  });
  let patch:unknown;
  try{patch=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(proposed.bytes));}
  catch{throw new CoreError('INVALID_ARGUMENT');}
  const payload=contract('ProposeGraphPatchPayload',patch);
  if(!sameRef(payload.runRef,correction.subjectRef)||payload.baseRevision!==graph.revision
    ||!sameRef(payload.rationaleRef,correction.beforeRef))throw new CoreError('PRECONDITION_FAILED');
  return payload;
}

function parseJsonObject(bytes:Uint8Array):Record<string,unknown>{
  try{
    const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(typeof value!=='object'||value===null||Array.isArray(value))throw new Error('not object');
    return value as Record<string,unknown>;
  }catch{throw new CoreError('INVALID_ARGUMENT');}
}

export async function applyCorrection(database: Database, context: VerifiedContext, options: TransactionOptions,
  supplied: ApplyCorrectionCommand, grantRefs: readonly EntityRef[],
  installation: CorrectionApplyInstallation): Promise<CorrectionApplicationRecord> {
  requireVerifiedContext(context);
  const input=contract('ApplyCorrectionCommand',structuredClone(supplied)),refs=structuredClone(grantRefs),
    payload=contract('ApplyCorrectionPayload',structuredClone(input.payload));
  if(input.type!=='abh.corrections.apply'||input.target.type!=='abh.correction')throw new CoreError('INVALID_ARGUMENT');
  const correctionRef={type:'abh.correction' as const,id:input.target.id,version:input.expectedVersion};
  const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
    digest:await inputDigest({...payload,correctionRef:input.target,expectedVersion:input.expectedVersion})};
  const authority=installation.authority;
  let record:CorrectionApplicationRecord|undefined;
  const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,
    async()=>{await validateIntent(tx,correctionRef,payload,refs,authority,options);},
    async()=>{
      const correction=await validateIntent(tx,correctionRef,payload,refs,authority,options);
      await new InlineArtifactOwner().lockSources(tx,[correction.proposedAfterRef]);
      await new InlineArtifactOwner().read(tx,correction.proposedAfterRef,async artifact=>{
        if(artifact.status!=='Available'||!sameRef(artifact.ownerRef,correction.subjectRef))throw new CoreError('PRECONDITION_FAILED');
      });
      let resultRef:EntityRef,resultVersion:number,purposeNames:string[];
      if(correction.targetOwner==='Run'){
        const patch=await readRunGraphCorrection(tx,correction);
        const revision=await new RunOwner().proposeGraphPatch(tx,command,{...correction.subjectRef},patch);
        resultRef={...revision.revisionRef};resultVersion=revision.revision;
        purposeNames=['abh.runtime.deliver','abh.correction.propose'];
      }else if(correction.targetOwner==='Memory'){
        const signal=await applyMemoryCorrection(tx,command,correction);
        resultRef={...signal.signalRef};resultVersion=signal.signalRef.version;
        purposeNames=['abh.learning.capture','abh.correction.propose'];
      }else if(correction.targetOwner==='Capability'){
        const candidate=await new LearningOwner().createCandidate(tx,command,{
          caseRef:{...correction.subjectRef},assetKind:payload.candidate!.assetKind,
          baseVersion:correction.subjectVersion,candidateArtifactRef:{...correction.proposedAfterRef},
          scopeRef:{...payload.candidate!.scopeRef},risk:payload.candidate!.risk});
        resultRef={...candidate.candidateRef};resultVersion=candidate.candidateRef.version;
        purposeNames=['abh.learning.capture','abh.correction.propose'];
      }else{
        const missionOwner=new MissionOwner(),mission=await missionOwner.get(tx,correction.subjectRef.id);
        const conditions=await missionOwner.conditions(tx,mission.conditionRef);
        const revised:MissionRecord=await missionOwner.reviseGoal(tx,{...correction.subjectRef},
          {...correction.proposedAfterRef},{
            successConditionRef:{...conditions.successConditionRef},stopConditionRef:{...conditions.stopConditionRef},
            triggerPolicyRef:{...conditions.triggerPolicyRef},resourceEnvelopeRef:{...conditions.resourceEnvelopeRef},
          },payload.authorityRef);
        resultRef={...revised.missionRef};resultVersion=revised.missionRef.version;
        purposeNames=['abh.mission.manage','abh.correction.propose'];
      }
      const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
      const unsigned=contract('CorrectionApplicationRecord',{
        applicationRef:{type:'abh.correction-application',id:randomUUID(),version:1},
        resourceOrganizationId:tx.context.tenant.resourceOrganizationId,correctionRef:{...correction.correctionRef},
        subjectRef:{...correction.subjectRef},subjectVersionBefore:correction.subjectVersion,
        targetOwner:correction.targetOwner,authorityRef:{...payload.authorityRef},evidenceRefs:payload.evidenceRefs,
        resultRef,resultVersion,
        receiptRef:{type:'abh.command',id:command.commandId,version:1},
        appliedBy:tx.context.tenant.actor,appliedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
      record=contract('CorrectionApplicationRecord',{...unsigned,digest:await digestContract('CorrectionApplicationRecord',unsigned)});
      await tx.owner('HumanGateway')`INSERT INTO human.correction_applications
        (resource_organization_id,id,workspace_id,purpose_names,record,correction_id,subject_id,result_id,receipt_id)
        VALUES (${record.resourceOrganizationId},${record.applicationRef.id},${tx.context.tenant.workspaceId??null},
          ${purposeNames},${JSON.stringify(record)}::text::jsonb,
          ${record.correctionRef.id},${record.subjectRef.id},${record.resultRef.id},${record.receiptRef.id})`;
      const relatedRefs=[...new Map([record.correctionRef,{...correction.beforeRef},
        {...correction.proposedAfterRef},record.authorityRef,...record.evidenceRefs]
        .map(ref=>[refKey(ref),ref])).values()];
      await appendChange(tx,{command,target:record.applicationRef,eventType:'abh.correction.applied',
        changedFields:['subjectRef','resultRef','resultVersion'],relatedRefs});
      return record.applicationRef;
    }));
  return record??await database.transaction(context,options,async tx=>await getApplication(tx,result.receipt.resultRef));
}
