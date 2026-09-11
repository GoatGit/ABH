import type {PackInspectionJobRecord,PackInspectionLeaseLossEvidence,WorkLeaseRecord} from '@abh/contracts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {measurePackInspectionElapsed} from './inspection-timeout.ts';
export class PackInspectionLeaseStillCurrentError extends CoreError {constructor(){super('PRECONDITION_FAILED');}}
/** Deterministic assessment of an Owner-locked lease observation. Never mint this
 * evidence from queue timeouts or an exception string; storage authority is needed. */
export function assessPackInspectionLeaseLoss(input:PackInspectionJobRecord,observed:WorkLeaseRecord,assessedAt:string):PackInspectionLeaseLossEvidence {
 const {job,elapsedMs,expired}=measurePackInspectionElapsed(input,assessedAt),lease=contract('WorkLeaseRecord',structuredClone(observed));
 if(job.status!=='Running'||!job.lease)throw new CoreError('PRECONDITION_FAILED');
 const micros=(v:string)=>{const t=Date.parse(v.slice(0,19)+'Z');if(!Number.isFinite(t))throw new CoreError('INVALID_ARGUMENT');return BigInt(t)*1000n+BigInt((v.slice(19,-1).replace('.','')||'0').padEnd(6,'0'));};
 const held=job.lease;
 if(lease.resourceOrganizationId!==job.resourceOrganizationId||lease.targetRef.type!==job.packRef.type||lease.targetRef.id!==job.packRef.id||lease.targetRef.version!==job.packRef.version||
  lease.leaseRef.id!==held.leaseRef.id||lease.leaseRef.version<held.leaseRef.version||lease.fencingToken<held.fencingToken||
  lease.leaseRef.version-held.leaseRef.version<lease.fencingToken-held.fencingToken||lease.fencingToken===held.fencingToken&&lease.workerId!==held.workerId)throw new CoreError('PRECONDITION_FAILED');
 const replaced=lease.fencingToken>job.lease.fencingToken;
 if(!replaced&&micros(assessedAt)<micros(lease.leaseUntil))throw new PackInspectionLeaseStillCurrentError();
 return contract('PackInspectionLeaseLossEvidence',{job,observedLease:lease,assessedAt,elapsedMs,cause:replaced?'Replaced':'Expired',disposition:elapsedMs>=job.budget.maxDurationMs?'BudgetExhausted':expired?'Expired':'InspectionFailed'});
}
