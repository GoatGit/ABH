import type {EntityRef,PackInspectionJobRecord} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {PackInspectionJobOwner} from './inspection-jobs.ts';
import {measurePackInspectionElapsed} from './inspection-timeout.ts';

export interface PackInspectionDeliveryResolution {
 /** Execute applies only to the delivered exact Pending/Waiting version.
  * Progressed requires independent discovery of the newer retry version.
  * Running is not an acknowledgement of successful execution.
  * Expire requires the formal expiry command before any terminal acknowledgement. */
 disposition:'Execute'|'Progressed'|'Running'|'Terminal'|'Expire';
 job:PackInspectionJobRecord;
}
/** Resolve an untrusted version hint against tenant storage and current admission.
 * No mutation, lease claim, queue acknowledgement or inspection certification.
 * The result is a snapshot: all subsequent commands still require exact CAS.
 * The host admission must authorize the current Job, installation and evidence,
 * including terminal reads; queue runtime authority alone is insufficient. */
export async function resolvePackInspectionDelivery(
 tx:TenantTransaction,deliveryRef:EntityRef,admit:(job:PackInspectionJobRecord)=>Promise<void>,
):Promise<PackInspectionDeliveryResolution>{
 const ref=contract('EntityRef',structuredClone(deliveryRef));
 const job=await new PackInspectionJobOwner().readCurrent(tx,ref,admit);
 if(['Succeeded','Failed','Cancelled'].includes(job.status))return {disposition:'Terminal',job};
 const [clock]=await tx.owner('PackLoader')`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
 const measured=measurePackInspectionElapsed(job,clock!.now as string);
 tx.assertActive();
 if(measured.expired||measured.elapsedMs>=job.budget.maxDurationMs)return {disposition:'Expire',job};
 if(job.status==='Running')return {disposition:'Running',job};
 return {disposition:job.jobRef.version===ref.version?'Execute':'Progressed',job};
}
