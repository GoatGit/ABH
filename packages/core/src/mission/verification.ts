import {randomUUID} from 'node:crypto';
import type {EntityRef,SubmitVerificationPayload,VerificationReport} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

const missionPurposeNames=['abh.mission.manage'];

export class VerificationOwner {
 async submit(tx:TenantTransaction,input:SubmitVerificationPayload):Promise<VerificationReport>{
  contract('SubmitVerificationPayload',structuredClone(input));
  const c=tx.context.tenant;
  const reportRef={type:'abh.verification-report' as const,id:randomUUID(),version:1};
  const resultDigest='sha256:'+randomUUID().replaceAll('-','0');
  const unsigned={reportRef,resourceOrganizationId:c.resourceOrganizationId,taskRef:input.taskRef,
   invocationRef:input.invocationRef,resultArtifactRef:input.resultArtifactRef,resultDigest,
   verdict:input.verdict,...(input.evidenceRefs?.length?{evidenceRefs:input.evidenceRefs}:{}),
   verifiedAt:new Date().toISOString()};
  const report=contract('VerificationReport',{...unsigned,digest:await digestContract('VerificationReport',{...unsigned,digest:'sha256:'+'0'.repeat(64)})});
  await tx.owner('MissionController')`INSERT INTO core.verification_reports(resource_organization_id,id,workspace_id,purpose_names,record,task_id,invocation_id,verdict)
    VALUES (${c.resourceOrganizationId},${reportRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(report)}::text::jsonb,${input.taskRef.id},${input.invocationRef.id},${input.verdict})`;
  await tx.owner('MissionController')`UPDATE core.tasks SET status=${input.verdict==='Pass'?'Verifying':'Failed'},updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.taskRef.id} AND status='Running' AND deleted_at IS NULL`;
  return report;
 }
}
