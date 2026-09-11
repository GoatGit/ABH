import type {ArtifactRecord,EntityRef,PackMigrationAttemptRecord,PackMigrationExecutionRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

function instant(value:string):string{
 const [seconds,fraction='']=value.slice(0,-1).split('.');
 return `${seconds}.${fraction.padEnd(6,'0')}`;
}

/** Read persisted raw execution evidence without in-memory producer provenance.
 * The host supplies the actual maintenance-journal attempt and current Artifact
 * admission. This validates recorded bytes, not their truth or current target state;
 * it never mints dispatch provenance, verified completion or Enable authority.
 */
export async function readStoredMigrationExecutionResult(tx:TenantTransaction,artifactRef:EntityRef,attempt:PackMigrationAttemptRecord,admit:(artifact:ArtifactRecord)=>Promise<void>){
 const expected=contract('PackMigrationAttemptRecord',JSON.parse(canonicalJson(attempt))),ref=contract('EntityRef',JSON.parse(canonicalJson(artifactRef))),c=tx.context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||expected.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const owner=new InlineArtifactOwner();await owner.lockSources(tx,[ref]);
 const stored=await owner.read(tx,ref,async artifact=>{
  if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536||canonicalJson(artifact.ownerRef)!==canonicalJson(expected.attemptRef))throw new CoreError('PRECONDITION_FAILED');
  await admit(artifact);
 });
 let value:PackMigrationExecutionRecord;
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes),envelope=JSON.parse(text);
  if(canonicalJson(envelope)!==text||!Array.isArray(envelope)||envelope.length!==2||envelope[0]!=='abh-pack-migration-execution-v1')throw new Error();
  value=contract('PackMigrationExecutionRecord',envelope[1]);
  if(canonicalJson(value.attempt)!==canonicalJson(expected)||instant(value.observedAt)>instant(new Date().toISOString()))throw new Error();
 }catch{throw new CoreError('PRECONDITION_FAILED');}
 const refs=(items:readonly EntityRef[])=>canonicalJson([...new Set(items.map(item=>canonicalJson(item)))].sort());
 if(refs(stored.record.sourceRefs)!==refs([expected.impactRef,...expected.evidenceRefs]))throw new CoreError('PRECONDITION_FAILED');
 tx.assertActive();return {artifact:stored.record,...value};
}
