import type {PackInspectionFailureEvidence,PackInspectionJobRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {MigrationInspectionCleanupError} from './inspect-migration-target.ts';
import {measurePackInspectionElapsed} from './inspection-timeout.ts';
type Phase=PackInspectionFailureEvidence['phase'];
type Captured=Pick<PackInspectionFailureEvidence,'job'|'phase'|'classification'|'cleanupUnacknowledged'>;
/** Process-local capability. Serialization and cloning deliberately lose authority. */
export interface PackInspectionFailure {readonly kind:'PackInspectionFailure'}
const failures=new WeakMap<PackInspectionFailure,Captured>();
/** Capture only a rejected actual attempt, including its awaited finalizers. The
 * callback must own execution; accepting an arbitrary exception is not evidence. */
export async function observePackInspectionAttempt<T>(input:PackInspectionJobRecord,attempt:(phase:(value:Phase)=>void)=>Promise<T>):Promise<
 {ok:true;value:T}|{ok:false;failure:PackInspectionFailure;error:unknown}>{
 const job=contract('PackInspectionJobRecord',structuredClone(input));
 if(job.status!=='Running'||!job.lease)throw new CoreError('PRECONDITION_FAILED');
 let phase:Phase='Preparation';
 try{return {ok:true,value:await attempt(value=>{if(!['Preparation','Inspection','Completion'].includes(value))throw new CoreError('INVALID_ARGUMENT');phase=value;})};}
 catch(error){
  // Bounded traversal handles nested/cyclic aggregates without persisting text.
  const queue:unknown[]=[error],seen=new Set<unknown>();let cleanupUnacknowledged=false;
  for(let i=0;i<queue.length&&i<64;i++){
   const item=queue[i];if(seen.has(item))continue;seen.add(item);
   try{
    if(item instanceof MigrationInspectionCleanupError)cleanupUnacknowledged=true;
    if(item instanceof AggregateError){
     const descriptor=Object.getOwnPropertyDescriptor(item,'errors');
     if(Array.isArray(descriptor?.value)){
      // Read only own data entries; never invoke exception accessors or iterators.
      for(let index=0;index<64;index++){
       const child=Object.getOwnPropertyDescriptor(descriptor.value,String(index));
       if(child&&'value' in child)queue.push(child.value);
      }
     }
    }
   }catch{/* Opaque/revoked proxies remain unknown; metadata cannot replace the failure. */}
  }
  let classification:Captured['classification']='UnexpectedFailure';
  try{
   if(error instanceof CoreError){
    const code=Object.getOwnPropertyDescriptor(error,'code');
    if(code&&'value' in code&&typeof code.value==='string')classification=code.value==='DEPENDENCY_TIMEOUT'?'DependencyTimeout':'Rejected';
   }
  }catch{/* Preserve the original thrown value even if it cannot be inspected. */}
  const failure=Object.freeze({kind:'PackInspectionFailure' as const});
  failures.set(failure,{job,phase,classification,cleanupUnacknowledged});return {ok:false,failure,error};
 }
}
export function matchPackInspectionFailure(failure:PackInspectionFailure):Captured {
 const captured=failures.get(failure);if(!captured)throw new CoreError('PRECONDITION_FAILED');return structuredClone(captured);
}
export function assessPackInspectionFailure(failure:PackInspectionFailure,job:PackInspectionJobRecord,assessedAt:string):PackInspectionFailureEvidence {
 const captured=matchPackInspectionFailure(failure);
 if(canonicalJson(captured.job)!==canonicalJson(job))throw new CoreError('VERSION_CONFLICT');
 const spent=measurePackInspectionElapsed(job,assessedAt);
 return contract('PackInspectionFailureEvidence',{...captured,assessedAt,elapsedMs:spent.elapsedMs,disposition:spent.elapsedMs>=job.budget.maxDurationMs?'BudgetExhausted':spent.expired?'Expired':'InspectionFailed'});
}
