import { randomUUID } from 'node:crypto';
import type { ArtifactRecord,CorrectionRecord,EntityRef,ProposeCorrectionCommand,ProposeCorrectionPayload } from '@abh/contracts';
import { digestContract } from '@abh/contracts/digest';
import type { Database,TenantTransaction,TransactionOptions } from '../data/uow.ts';
import { appendChange,contract,executeCommand,inputDigest,type CommandIdentity } from '../data/journal.ts';
import { assertCurrentGrants } from '../control/grants.ts';
import { lockFences } from '../control/fences.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { requireVerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import { refKey,sameRef } from '../execution/shared.ts';
import { currentResponsibility } from './responsibilities.ts';

function sameSubject(scope:EntityRef,subject:EntityRef):boolean{
  return scope.type===subject.type&&scope.id===subject.id;
}

/** Immutable correction candidate. Applying it remains a separate Subject Owner decision. */
export class CorrectionOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<CorrectionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.correction')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT record,version FROM human.corrections
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('CorrectionRecord',rows[0].record);
    if(!sameRef(record.correctionRef,ref)||record.correctionRef.version!==Number(rows[0].version)
      ||record.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('CorrectionRecord',record)!==record.digest)
      throw new CoreError('INTERNAL_ERROR');
    return record;
  }

  async #verifySubject(tx:TenantTransaction,payload:ProposeCorrectionPayload):Promise<void>{
    if(payload.subjectRef.version!==payload.expectedVersion)
      throw new CoreError('CORRECTION_STALE');
    const c=tx.context.tenant;
    const rows=await tx.owner('ArtifactStore')`SELECT record,version,status FROM data.artifacts
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${payload.beforeRef.id} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      FOR UPDATE`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    const current=contract('ArtifactRecord',rows[0].record);
    if(Number(rows[0].version)!==payload.beforeRef.version||current.status!=='Available'
      ||!sameRef(current.ownerRef,payload.subjectRef))throw new CoreError('CORRECTION_STALE');
  }

  async admit(tx:TenantTransaction,payload:ProposeCorrectionPayload,grantRefs:readonly EntityRef[]):Promise<void>{
    contract('ProposeCorrectionPayload',payload);const c=tx.context.tenant;
    if(c.actor.type!=='Human'||c.purposeOfUse!==payload.purpose||payload.purpose!=='abh.correction.propose')throw new CoreError('FORBIDDEN');
    const responsibility=await currentResponsibility(tx,payload.responsibilityRef,c.workspaceId??null);
    if(!responsibility||responsibility.principalRef.id!==c.actor.id||responsibility.responsibilityType!=='Correction'
      ||!responsibility.scopeRefs.some(scope=>sameSubject(scope,payload.subjectRef)))throw new CoreError('AUTHORITY_REQUIRED');
    const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    const correctionRef={type:'abh.correction' as const,id:randomUUID(),version:1};
    await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},payload.responsibilityRef,
      ...grantRefs,...payload.evidenceRefs]);
    await assertCurrentGrants(tx,{objectRef:correctionRef,scopeRefs:[scope],action:'abh.corrections.propose'},grantRefs);
    await this.#verifySubject(tx,payload);
    await new InlineArtifactOwner().read(tx,payload.newArtifactRef,async record=>{
      const targetPurpose=payload.targetOwner==='Domain'?'abh.mission.manage':
        payload.targetOwner==='Memory'||payload.targetOwner==='Capability'
          ?'abh.learning.capture':'abh.runtime.deliver';
      if(record.status!=='Available'||!sameRef(record.ownerRef,payload.subjectRef)
        ||!record.purposeNames.includes(targetPurpose))throw new CoreError('PRECONDITION_FAILED');
    });
  }

  async propose(tx:TenantTransaction,command:CommandIdentity,payload:ProposeCorrectionPayload,
    grantRefs:readonly EntityRef[]):Promise<CorrectionRecord>{
    await this.admit(tx,payload,grantRefs);const c=tx.context.tenant;
    const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('CorrectionRecord',{correctionRef:{type:'abh.correction',id:randomUUID(),version:1},
      resourceOrganizationId:c.resourceOrganizationId,subjectRef:payload.subjectRef,subjectVersion:payload.expectedVersion,
      beforeRef:payload.beforeRef,proposedAfterRef:payload.newArtifactRef,targetOwner:payload.targetOwner,
      reason:payload.reason,evidenceRefs:payload.evidenceRefs,responsibilityRef:payload.responsibilityRef,
      purpose:payload.purpose,receiptRef:{type:'abh.command',id:command.commandId,version:1},proposedBy:c.actor,
      proposedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const record=contract('CorrectionRecord',{...unsigned,digest:await digestContract('CorrectionRecord',unsigned)});
    await tx.owner('HumanGateway')`INSERT INTO human.corrections
      (resource_organization_id,id,workspace_id,purpose_names,record,subject_id,subject_version,before_artifact_id,
       proposed_artifact_id,responsibility_id,target_owner)
      VALUES (${c.resourceOrganizationId},${record.correctionRef.id},${c.workspaceId??null},
        ARRAY[${c.purposeOfUse},'abh.decision.review','abh.runtime.deliver','abh.mission.manage','abh.learning.capture'],${JSON.stringify(record)}::text::jsonb,
        ${record.subjectRef.id},${record.subjectVersion},${record.beforeRef.id},${record.proposedAfterRef.id},${record.responsibilityRef.id},
        ${record.targetOwner})`;
    const relatedRefs=[...new Map([record.subjectRef,record.beforeRef,record.proposedAfterRef,
      record.responsibilityRef,...record.evidenceRefs].map(ref=>[refKey(ref),ref])).values()];
    await appendChange(tx,{command,target:record.correctionRef,eventType:'abh.correction.proposed',
      changedFields:['subjectRef','subjectVersion','beforeRef','proposedAfterRef'],relatedRefs});
    return record;
  }
}

export async function proposeCorrection(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ProposeCorrectionCommand,grantRefs:readonly EntityRef[]):Promise<CorrectionRecord>{
  requireVerifiedContext(context);
  if(context.tenant.actor.type!=='Human')throw new CoreError('FORBIDDEN');
  const input=contract('ProposeCorrectionCommand',structuredClone(supplied)),refs=structuredClone([...grantRefs]),
    payload=contract('ProposeCorrectionPayload',structuredClone(input.payload));
  if(input.type!=='abh.corrections.propose'||input.target.type!=='abh.correction')
    throw new CoreError('INVALID_ARGUMENT');
  const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
    digest:await inputDigest(payload)},owner=new CorrectionOwner();
  const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,
    async()=>await owner.admit(tx,payload,refs),
    async()=>(await owner.propose(tx,command,payload,refs)).correctionRef));
  return database.transaction(context,options,async tx=>await owner.get(tx,result.receipt.resultRef));
}
