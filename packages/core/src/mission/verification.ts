import {randomUUID} from 'node:crypto';
import type {EntityRef,SubmitVerificationPayload,VerificationReport} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

const missionPurposeNames=['abh.mission.manage'];
const taskPurposeNames=['abh.mission.manage','abh.runtime.deliver','abh.verification.submit'];

export class VerificationOwner {
 async submit(tx:TenantTransaction,command:CommandIdentity,input:SubmitVerificationPayload):Promise<VerificationReport>{
  contract('SubmitVerificationPayload',structuredClone(input));
  const c=tx.context.tenant;
  const [taskRow]=await tx.owner('MissionController')`SELECT record,version,status FROM core.tasks
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.taskRef.id} AND deleted_at IS NULL
     AND ${c.purposeOfUse}=ANY(${taskPurposeNames}) FOR UPDATE`;
  if(!taskRow)throw new CoreError('RESOURCE_NOT_FOUND');
  const task=contract('TaskRecord',taskRow.record);
  if(task.taskRef.id!==input.taskRef.id||task.taskRef.version!==input.taskRef.version
    ||task.taskRef.version!==Number(taskRow.version)||task.status!==taskRow.status||task.status!=='Verifying')
    throw new CoreError('PRECONDITION_FAILED');
  const [invocationRow]=await tx.owner('MissionController')`SELECT record,status FROM core.invocations
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.invocationRef.id}
     AND task_id=${task.taskRef.id} AND deleted_at IS NULL`;
  const invocation=invocationRow?contract('InvocationRecord',invocationRow.record):undefined;
  if(!invocation||invocation.taskRef.id!==task.taskRef.id||invocation.status!=='Succeeded')
    throw new CoreError('PRECONDITION_FAILED');
  const reportRef={type:'abh.verification-report' as const,id:randomUUID(),version:1};
  const resultDigest=await digestBytes(new TextEncoder().encode(canonicalJson(input.resultArtifactRef)));
  const unsigned={reportRef,resourceOrganizationId:c.resourceOrganizationId,taskRef:input.taskRef,
   invocationRef:input.invocationRef,resultArtifactRef:input.resultArtifactRef,resultDigest,
   verdict:input.verdict,...(input.evidenceRefs?.length?{evidenceRefs:input.evidenceRefs}:{}),
   verifiedAt:new Date().toISOString()};
  const report=contract('VerificationReport',{...unsigned,
   digest:await digestContract('VerificationReport',{...unsigned,digest:'sha256:'+'0'.repeat(64)})});
  await tx.owner('MissionController')`INSERT INTO core.verification_reports(resource_organization_id,id,workspace_id,purpose_names,record,task_id,invocation_id,verdict)
    VALUES (${c.resourceOrganizationId},${reportRef.id},${c.workspaceId??null},${missionPurposeNames},${JSON.stringify(report)}::text::jsonb,${input.taskRef.id},${input.invocationRef.id},${input.verdict})`;
  const status=input.verdict==='Pass'?'Verifying':'Failed';
  const updatedTask=contract('TaskRecord',{...task,status,updatedAt:new Date().toISOString(),
   taskRef:{...task.taskRef,version:task.taskRef.version+(status===task.status?0:1)}});
  if(status!==task.status)await tx.owner('MissionController')`UPDATE core.tasks SET version=${updatedTask.taskRef.version},status=${status},
    record=${JSON.stringify(updatedTask)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${task.taskRef.id}
      AND version=${task.taskRef.version} AND status='Verifying'`;
  await appendChange(tx,{command,target:report.reportRef,eventType:'abh.verification.created',changedFields:['verdict'],
   relatedRefs:[updatedTask.taskRef,invocation.invocationRef,input.resultArtifactRef]});
  return report;
 }
}
