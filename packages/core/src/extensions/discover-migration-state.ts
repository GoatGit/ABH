import type {ArtifactRecord,Digest,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
export interface MigrationStateDiscoveryBinding {
 packRef:EntityRef;packageDigest:Digest;environmentDigest:Digest;deploymentVersion:number;
 sources:readonly [EntityRef,EntityRef,EntityRef,EntityRef];
}
export interface MigrationStateDiscoveryAdmission {
 /** All discovery/source authority fences, acquired before Artifact shared locks. */
 fenceRefs(tx:TenantTransaction):Promise<EntityRef[]>;
 admit(tx:TenantTransaction):Promise<void>;
 read(artifact:ArtifactRecord):Promise<void>;
}
/** Bounded persistent observation discovery for restart recovery. Actual Artifact
 * bytes/digest, formal shape and requested binding are checked. A returned Ref is
 * only a hint: readRevalidatedMigrationState must still recheck actual current
 * signatures, authorities and target state. No latest/first candidate is chosen.
 * The UUID cursor is internal, not an authenticated public query cursor.
 */
export async function discoverMigrationState(database:Database,context:VerifiedContext,options:TransactionOptions,binding:MigrationStateDiscoveryBinding,
 grantRefs:readonly EntityRef[],checks:MigrationStateDiscoveryAdmission,limit=20,after?:string){
 const pack=contract('EntityRef',structuredClone(binding.packRef)),digest=contract('Digest',binding.packageDigest),environment=contract('Digest',binding.environmentDigest),deployment=binding.deploymentVersion;
 const sources=binding.sources.map(value=>contract('EntityRef',structuredClone(value))),grants=structuredClone(grantRefs),limits={...options},cursor=after===undefined?undefined:contract('UUID',after);
 const fences=checks.fenceRefs.bind(checks),admit=checks.admit.bind(checks),read=checks.read.bind(checks),c=context.tenant;
 if(pack.type!=='abh.installed-pack'||pack.version!==1||!Number.isSafeInteger(deployment)||deployment<1||sources.length!==4||sources.some(ref=>ref.type!=='abh.artifact')||new Set(sources.map(ref=>ref.id)).size!==4||!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 return database.transaction(context,limits,async tx=>{
  const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
  const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...structuredClone(await fences(tx))]);
  const authorize=async()=>{await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);await admit(tx);active();await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);active();};
  await authorize();
  const owner=new InlineArtifactOwner(),page=await owner.scanOwnedSources(tx,pack,sources,limit,cursor);active();
  await owner.lockSources(tx,[...sources,...page.refs]);active();
  const candidates:Array<{artifactRef:EntityRef;observedAt:string;matched:boolean}>=[];
  for(const ref of page.refs){
   const stored=await owner.read(tx,ref,async artifact=>{
    if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536||canonicalJson(artifact.ownerRef)!==canonicalJson(pack)||canonicalJson(artifact.sourceRefs)!==canonicalJson(sources))throw new CoreError('PRECONDITION_FAILED');
    await read(artifact);active();
   });active();
   let value;
   try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes),envelope=JSON.parse(text);
    // Other JSON documents with this source set are not observations.
    if(!Array.isArray(envelope)||envelope[0]!=='abh-pack-migration-state-observation-v1')continue;
    if(envelope.length!==2||canonicalJson(envelope)!==text)throw new Error();
    value=contract('PackMigrationStateObservation',envelope[1]);
   }catch{throw new CoreError('PRECONDITION_FAILED');}
   const result=value.result,actualSources=[result.structure.reportRef,result.structure.bundleRef,result.data.reportRef,result.data.bundleRef];
   if(canonicalJson(actualSources)!==canonicalJson(sources)||result.structure.binding.organizationId!==c.resourceOrganizationId)throw new CoreError('PRECONDITION_FAILED');
   if(result.structure.binding.packageDigest!==digest||result.structure.signature.report.environmentDigest!==environment||result.structure.signature.report.deploymentVersion!==deployment)continue;
   candidates.push({artifactRef:structuredClone(stored.record.artifactRef),observedAt:value.observedAt,matched:result.matched});
  }
  await authorize();active();return {candidates,scanned:page.refs.length,...(page.next?{next:page.next}:{})};
 });
}
