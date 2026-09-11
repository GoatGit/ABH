import type {PackInspectionJobRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {describeTransition} from '@abh/contracts/states';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

const instant = (value:string) => {
  const [seconds,fraction='']=value.slice(0,-1).split('.');
  return `${seconds}.${fraction.padEnd(6,'0')}`;
};
/** Local snapshot consistency only. The persistent Owner must separately enforce
 * current authority, CAS, lease fencing and actual Artifact provenance. */
export function validatePackInspectionJobTransition(previous:PackInspectionJobRecord,next:PackInspectionJobRecord):PackInspectionJobRecord {
  const before=contract('PackInspectionJobRecord',structuredClone(previous));
  const after=contract('PackInspectionJobRecord',structuredClone(next));
  const invalid=()=>{throw new CoreError('PRECONDITION_FAILED');};
  if(!describeTransition('PackInspectionJob',before.status,after.status))invalid();
  for(const key of ['resourceOrganizationId','packRef','packageDigest','environmentDigest','deploymentVersion','kind','requestedBy','commandId','idempotencyKey','requestedAt','expiresAt'] as const)
    if(canonicalJson(before[key])!==canonicalJson(after[key]))invalid();
  if(before.jobRef.id!==after.jobRef.id || before.jobRef.version+1!==after.jobRef.version)invalid();
  if(instant(after.updatedAt)<instant(before.updatedAt))invalid();
  if(before.budget.maxAttempts!==after.budget.maxAttempts || before.budget.maxDurationMs!==after.budget.maxDurationMs || after.budget.elapsedMs<before.budget.elapsedMs)invalid();
  const starts=after.status==='Running';
  if(after.budget.attempts!==before.budget.attempts+(starts?1:0))invalid();
  if(starts && (before.budget.attempts>=before.budget.maxAttempts || before.budget.elapsedMs>=before.budget.maxDurationMs))invalid();
  return after;
}
