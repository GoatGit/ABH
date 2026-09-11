import type {ArtifactRecord,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {matchStoredMigrationDataResult,type StoredMigrationDataResult} from './verify-stored-migration-data.ts';
const instant=(value:string)=>{const [seconds,fraction='']=value.slice(0,-1).split('.');return `${seconds}.${fraction.padEnd(6,'0')}`;};
/** Revalidate a saved observation against a newly produced actual inspection in
 * this management UoW. Host runs the supplied inspection on a live dedicated target
 * and retains its authority fences. This does not replay SQL or mint execution
 * provenance. Changed current observations reject; an unchanged mismatch remains
 * a mismatch and cannot authorize Enable.
 */
export async function readRevalidatedDataResult(tx:TenantTransaction,options:TransactionOptions,artifactRef:EntityRef,reportRef:EntityRef,bundleRef:EntityRef,
 inspect:()=>Promise<StoredMigrationDataResult>,admit:(artifact:ArtifactRecord)=>Promise<void>){
 const ref=contract('EntityRef',structuredClone(artifactRef)),report=contract('EntityRef',structuredClone(reportRef)),bundle=contract('EntityRef',structuredClone(bundleRef)),limits={...options},authorize=admit,recheck=inspect,c=tx.context.tenant;
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const owner=new InlineArtifactOwner();await owner.lockSources(tx,[ref,report,bundle]);
 const stored=await owner.read(tx,ref,async artifact=>{
  if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536||canonicalJson(artifact.sourceRefs)!==canonicalJson([report,bundle]))throw new CoreError('PRECONDITION_FAILED');
  await authorize(artifact);active();
 });
 const started=new Date().toISOString();
 const fresh=await recheck();active();const captured=matchStoredMigrationDataResult(fresh,tx);
 if(instant(captured.observedAt)<instant(started)||captured.result.binding.organizationId!==c.resourceOrganizationId||canonicalJson(captured.ownerRef)!==canonicalJson(stored.record.ownerRef)||canonicalJson(captured.result.reportRef)!==canonicalJson(report)||canonicalJson(captured.result.bundleRef)!==canonicalJson(bundle))throw new CoreError('PRECONDITION_FAILED');
 let observedAt:string;
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes),envelope=JSON.parse(text);
  if(canonicalJson(envelope)!==text||!Array.isArray(envelope)||envelope.length!==2||envelope[0]!=='abh-pack-migration-data-observation-v1')throw new Error();
  const value=contract('PackMigrationDataObservation',envelope[1]);
  observedAt=contract('Time',value.observedAt);const verifiedAt=contract('Time',value.result.signature.verifiedAt);
  if(instant(observedAt)>instant(captured.observedAt)||instant(verifiedAt)>instant(observedAt))throw new Error();
  // Only verification time differs between inspections; every data invariant field,
  // digest, source Ref and signed report must be identical to current validated data.
  const expected={...captured.result,signature:{...captured.result.signature,verifiedAt}};
  if(canonicalJson(value.result)!==canonicalJson(expected))throw new Error();
 }catch{throw new CoreError('PRECONDITION_FAILED');}
 await authorize(structuredClone(stored.record));active();
 return {artifactRef:stored.record.artifactRef,observedAt,current:fresh};
}
