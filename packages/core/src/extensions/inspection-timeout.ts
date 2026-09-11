import type {PackInspectionJobRecord,PackInspectionTimeoutEvidence} from '@abh/contracts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
/** Shared conservative wall-clock accounting; caller supplies the database time. */
export function measurePackInspectionElapsed(input:PackInspectionJobRecord,assessedAt:string) {
 const job=contract('PackInspectionJobRecord',structuredClone(input));contract('Time',assessedAt);
 if(!['Pending','Running','Waiting'].includes(job.status))throw new CoreError('PRECONDITION_FAILED');
 const micros=(value:string)=>{const seconds=Date.parse(value.slice(0,19)+'Z');if(!Number.isFinite(seconds))throw new CoreError('INVALID_ARGUMENT');return BigInt(seconds)*1000n+BigInt((value.slice(19,-1).replace('.','')||'0').padEnd(6,'0'));};
 const assessed=micros(assessedAt),expiry=micros(job.expiresAt),delta=assessed-micros(job.updatedAt);
 if(delta<0n)throw new CoreError('PRECONDITION_FAILED');
 const elapsed=BigInt(job.budget.elapsedMs)+(job.status==='Running'?(delta+999n)/1000n:0n);
 if(elapsed>BigInt(Number.MAX_SAFE_INTEGER))throw new CoreError('LIMIT_EXCEEDED');
 return {job,elapsedMs:Number(elapsed),expired:assessed>=expiry};
}
/** A deterministic projection of a DB-time assessment, not a clock authority. */
export function assessPackInspectionTimeout(input:PackInspectionJobRecord,assessedAt:string):PackInspectionTimeoutEvidence {
 const {job,elapsedMs,expired}=measurePackInspectionElapsed(input,assessedAt);
 const cause=elapsedMs>=job.budget.maxDurationMs?'BudgetExhausted':'Expired';
 if(cause==='Expired'&&!expired)throw new CoreError('PRECONDITION_FAILED');
 return contract('PackInspectionTimeoutEvidence',{job,assessedAt,elapsedMs,cause});
}
