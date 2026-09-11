import {randomUUID} from 'node:crypto';
import type {CaptureSignalPayload,LearningSignalRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

const learningPurposeNames=['abh.learning.capture'];

export class LearningOwner {
 async captureSignal(tx:TenantTransaction,input:CaptureSignalPayload):Promise<LearningSignalRecord>{
  contract('CaptureSignalPayload',structuredClone(input));
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.learning.capture')throw new CoreError('LEARNING_PURPOSE_DENIED');
  const signalRef={type:'abh.learning-signal' as const,id:randomUUID(),version:1};
  const signal:LearningSignalRecord={signalRef,resourceOrganizationId:c.resourceOrganizationId,
   sourceEventRef:input.sourceEventRef,signalType:input.signalType,
   artifactRefs:input.artifactRefs,scopeRef:input.scopeRef,purposeOfUse:input.purposeOfUse,
   capturedAt:new Date().toISOString()};
  await tx.owner('MissionController')`INSERT INTO core.learning_signals(resource_organization_id,id,workspace_id,purpose_names,record,signal_type)
    VALUES (${c.resourceOrganizationId},${signalRef.id},${c.workspaceId??null},${learningPurposeNames},${JSON.stringify(signal)}::text::jsonb,${input.signalType})`;
  return signal;
 }
}
