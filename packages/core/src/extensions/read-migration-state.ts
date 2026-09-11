import type {ArtifactRecord,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {matchInstalledMigrationState,type InstalledMigrationState} from './verify-installed-migration-state.ts';
const instant=(value:string)=>{const [seconds,fraction='']=value.slice(0,-1).split('.');return `${seconds}.${fraction.padEnd(6,'0')}`;};
/** Recover the combined observation with a new actual same-snapshot inspection.
 * Unchanged mismatches remain mismatches; no SQL replay or Enable authorization.
 */
export async function readRevalidatedMigrationState(tx:TenantTransaction,options:TransactionOptions,artifactRef:EntityRef,
 sources:readonly [EntityRef,EntityRef,EntityRef,EntityRef],inspect:()=>Promise<InstalledMigrationState>,admit:(artifact:ArtifactRecord)=>Promise<void>){
 const ref=contract('EntityRef',structuredClone(artifactRef)),refs=sources.map(value=>contract('EntityRef',structuredClone(value))),limits={...options},authorize=admit,recheck=inspect,c=tx.context.tenant;
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(refs.length!==4||new Set(refs.map(value=>canonicalJson(value))).size!==4)throw new CoreError('INVALID_ARGUMENT');
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const owner=new InlineArtifactOwner();await owner.lockSources(tx,[ref,...refs]);
 const stored=await owner.read(tx,ref,async artifact=>{
  if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536||canonicalJson(artifact.sourceRefs)!==canonicalJson(refs))throw new CoreError('PRECONDITION_FAILED');
  await authorize(artifact);active();
 });
 const started=new Date().toISOString(),fresh=await recheck();active();const captured=matchInstalledMigrationState(fresh,tx),result=captured.result;
 const actualRefs=[result.structure.reportRef,result.structure.bundleRef,result.data.reportRef,result.data.bundleRef];
 if(instant(captured.observedAt)<instant(started)||result.structure.binding.organizationId!==c.resourceOrganizationId||canonicalJson(captured.ownerRef)!==canonicalJson(stored.record.ownerRef)||canonicalJson(actualRefs)!==canonicalJson(refs))throw new CoreError('PRECONDITION_FAILED');
 let observedAt:string;
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes),envelope=JSON.parse(text);
  if(canonicalJson(envelope)!==text||!Array.isArray(envelope)||envelope.length!==2||envelope[0]!=='abh-pack-migration-state-observation-v1')throw new Error();
  const value=contract('PackMigrationStateObservation',envelope[1]);
  observedAt=contract('Time',value.observedAt);
  const structureTime=contract('Time',value.result.structure.signature.verifiedAt),dataTime=contract('Time',value.result.data.signature.verifiedAt);
  if(instant(observedAt)>instant(captured.observedAt)||[structureTime,dataTime].some(time=>instant(time)>instant(observedAt)))throw new Error();
  contract('PackMigrationDataObservation',{result:value.result.data,observedAt});
  if(instant(structureTime)<instant(result.structure.signature.report.issuedAt)||instant(structureTime)>=instant(result.structure.signature.report.expiresAt))throw new Error();
  const expected={...result,structure:{...result.structure,signature:{...result.structure.signature,verifiedAt:structureTime}},data:{...result.data,signature:{...result.data.signature,verifiedAt:dataTime}}};
  if(canonicalJson(value.result)!==canonicalJson(expected))throw new Error();
 }catch{throw new CoreError('PRECONDITION_FAILED');}
 await authorize(structuredClone(stored.record));active();
 return {artifactRef:stored.record.artifactRef,observedAt,current:fresh};
}
