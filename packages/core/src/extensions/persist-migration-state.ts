import {requireObservationLease,snapshotPackInspectionLease,type PackInspectionLeaseBinding} from './inspection-leases.ts';
import type {ArtifactRecord,EntityRef,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {matchInstalledMigrationState,type InstalledMigrationState} from './verify-installed-migration-state.ts';
/** Persist actual combined structure/data observations (including mismatches), never promote to
 * full migration verification or Enable. Retry reuses the producer command ID and
 * captured bytes, without inspecting or executing the target again. Large detailed
 * results exceeding Inline Artifact limits reject; object-store support is separate.
 */
export async function persistMigrationState(database:Database,context:VerifiedContext,options:TransactionOptions,result:InstalledMigrationState,
 retention:Pick<StoreInlineArtifactPayload,'dataClass'|'region'|'retentionPolicyRef'>,admit:(refs:readonly EntityRef[])=>Promise<void>,readAdmission:(artifact:ArtifactRecord)=>Promise<void>,lease?:PackInspectionLeaseBinding){
 const ownership=lease?snapshotPackInspectionLease(lease):undefined;
 const captured=matchInstalledMigrationState(result),fixed=structuredClone(retention),authorize=admit,authorizeRead=readAdmission,c=context.tenant,limits={...options};
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||c.resourceOrganizationId!==captured.result.structure.binding.organizationId)throw new CoreError('FORBIDDEN');
 const payload=contract('StoreInlineArtifactPayload',{...fixed,ownerRef:captured.ownerRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:[captured.result.structure.reportRef,captured.result.structure.bundleRef,captured.result.data.reportRef,captured.result.data.bundleRef],
  content:canonicalJson(['abh-pack-migration-state-observation-v1',contract('PackMigrationStateObservation',{result:captured.result,observedAt:captured.observedAt})])});
 const command={type:'abh.artifacts.store-inline',commandId:captured.commandId,idempotencyKey:captured.commandId,digest:await inputDigest(payload)};
 return database.transaction(context,limits,async tx=>{
  const refs=[payload.ownerRef,payload.retentionPolicyRef,...payload.sourceRefs],owner=new InlineArtifactOwner();
  const fence=async()=>{if(ownership)await requireObservationLease(tx,limits,ownership,captured.ownerRef,captured.result.structure.binding.packageDigest);};
  const saved=await executeCommand(tx,command,async()=>{await authorize(structuredClone(refs));await fence();tx.assertActive();},async()=>
   (await owner.store(tx,command,payload,async()=>{tx.assertActive();})).artifactRef);
  const actual=await owner.read(tx,saved.receipt.resultRef,authorizeRead);
  if(actual.record.mediaType!==payload.mediaType||new TextDecoder().decode(actual.bytes)!==payload.content||canonicalJson(actual.record.ownerRef)!==canonicalJson(payload.ownerRef)||canonicalJson(actual.record.sourceRefs)!==canonicalJson(payload.sourceRefs))throw new CoreError('PRECONDITION_FAILED');
  await authorize(structuredClone(refs));await fence();tx.assertActive();
  if(limits.signal.aborted||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return actual.record.artifactRef;
 });
}
