import {lockFences} from '../control/fences.ts';
import {requireObservationLease,snapshotPackInspectionLease,type PackInspectionLeaseBinding} from './inspection-leases.ts';
import type postgres from 'postgres';
import type {ArtifactRecord,EntityRef,StoreInlineArtifactPayload} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {inspectMigrationTarget,requireMigrationInspectionDisposal,type MigrationInspectionTarget} from './inspect-migration-target.ts';
import {matchInstalledMigrationState,type InstalledMigrationState} from './verify-installed-migration-state.ts';
import {persistMigrationState} from './persist-migration-state.ts';
import {readRevalidatedMigrationState} from './read-migration-state.ts';
export interface InstalledMigrationInspectionRun {
 /** All additional inspection Control fences, declared before lease fences and aggregate locks. */
 fenceRefs?(tx:TenantTransaction):Promise<EntityRef[]>;
 /** Must call the installed verifier in this UoW and on this guarded target. */
 inspect(tx:TenantTransaction,connection:postgres.ReservedSql,options:TransactionOptions):Promise<InstalledMigrationState>;
 retention:Pick<StoreInlineArtifactPayload,'dataClass'|'region'|'retentionPolicyRef'>;
 admit(refs:readonly EntityRef[]):Promise<void>;
 read(artifact:ArtifactRecord):Promise<void>;
 recovery?:{artifactRef:EntityRef;sources:readonly [EntityRef,EntityRef,EntityRef,EntityRef]};
 /** Explicit scheduler ownership; checked after actual inspection and in the independent result transaction. */
 lease?:PackInspectionLeaseBinding;
}
/** Installed observation workflow, not Enable or SQL execution. Owns target even
 * when input preparation or management transaction admission fails. New inspection
 * commits its read/admission UoW and closes target before an independent Artifact
 * command persists it. Persistence failure may be retried by inspecting again;
 * recovery rereads saved bytes and current actual state without replaying SQL.
 */
export async function runInstalledMigrationInspection(database:Database,context:VerifiedContext,options:TransactionOptions,target:MigrationInspectionTarget,run:InstalledMigrationInspectionRun){
 const dispose=target.dispose.bind(target);let handed=false,failed=false,failure:unknown;
 try{
  const lease=run.lease?snapshotPackInspectionLease(run.lease):undefined;
  const limits={...options},retention=structuredClone(run.retention),recovery=run.recovery?structuredClone(run.recovery):undefined;
  const fences=run.fenceRefs?.bind(run),inspect=run.inspect.bind(run),admit=run.admit.bind(run),read=run.read.bind(run);
  const inspected=await database.transaction(context,limits,async tx=>{
   if(lease||fences){const c=tx.context.tenant;await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...(lease?.grants??[]),...(fences?await fences(tx):[])]);}
   handed=true;
   const value=await inspectMigrationTarget(tx,target,limits,async(connection,scoped)=>{
    const fresh=async()=>{const state=await inspect(tx,connection,scoped);matchInstalledMigrationState(state,tx,connection);return state;};
    if(recovery){const value=await readRevalidatedMigrationState(tx,scoped,recovery.artifactRef,recovery.sources,fresh,read);return {state:value.current,observationRef:value.artifactRef};}
    return {state:await fresh(),observationRef:undefined};
   });
   if(lease){const captured=matchInstalledMigrationState(value.state,tx);await requireObservationLease(tx,limits,lease,captured.ownerRef,captured.result.structure.binding.packageDigest);}
   return value;
  });
  if(recovery)return {state:inspected.state,observationRef:inspected.observationRef!,recovered:true};
  const observationRef=await persistMigrationState(database,context,limits,inspected.state,retention,admit,read,lease);
  return {state:inspected.state,observationRef,recovered:false};
 }catch(error){failed=true;failure=error;throw error;}finally{
  if(!handed)await requireMigrationInspectionDisposal(dispose,failed?{error:failure}:undefined);
 }
}
