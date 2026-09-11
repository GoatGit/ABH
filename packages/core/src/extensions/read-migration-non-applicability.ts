import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareInstalledPack} from './prepare-installed-pack.ts';
import type {MigrationNonApplicabilityAdmission} from './record-migration-non-applicability.ts';
/** Consume saved non-applicability only after fresh signed impact/content checks.
 * Caller supplies the expected impact Ref, not one trusted from the report body.
 * Retains source locks in this UoW; does not issue an Enable permit or write state. */
export async function readMigrationNonApplicability(tx:TenantTransaction,options:TransactionOptions,artifactRef:EntityRef,
 expectedImpactRef:EntityRef,root:string,grantRefs:readonly EntityRef[],admission:MigrationNonApplicabilityAdmission){
 const ref=contract('EntityRef',structuredClone(artifactRef)),impactRef=contract('EntityRef',structuredClone(expectedImpactRef)),grants=structuredClone(grantRefs),limits={...options};
 if(ref.type!=='abh.artifact'||impactRef.type!=='abh.pack-data-impact')throw new CoreError('INVALID_ARGUMENT');
 const p=admission.impact,checks={signer:p.signer.bind(p),source:p.source.bind(p),fenceRefs:p.fenceRefs.bind(p),current:p.current.bind(p)},read=admission.read.bind(admission),references=admission.references.bind(admission);
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 const current=await prepareInstalledPack(tx,limits,impactRef,root,grants,checks);active();
 if(current.status!=='NotApplicable')throw new CoreError('PRECONDITION_FAILED');
 const sources=[...new Map([impactRef,current.impact.baselineSourceRef,current.impact.targetSourceRef].map(value=>[canonicalJson(value),value])).values()];
 const owner=new InlineArtifactOwner();await owner.lockSources(tx,[ref]);
 const saved=await owner.read(tx,ref,async artifact=>{
  if(artifact.mediaType!=='application/json'||canonicalJson(artifact.ownerRef)!==canonicalJson(current.installation.packRef)||canonicalJson(artifact.sourceRefs)!==canonicalJson(sources)||canonicalJson(artifact.purposeNames)!==canonicalJson(['abh.pack.manage']))throw new CoreError('PRECONDITION_FAILED');
  await read(tx,artifact);active();
 });
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes);}catch{throw new CoreError('PRECONDITION_FAILED');}
 if(text!==canonicalJson(['abh-pack-migration-not-applicable-v1',contract('PackMigrationNonApplicabilityReport',current.impact)]))throw new CoreError('PRECONDITION_FAILED');
 await references(tx,[current.installation.packRef,saved.record.retentionPolicyRef,...sources]);
 await read(tx,structuredClone(saved.record));active();
 const latest=await prepareInstalledPack(tx,limits,impactRef,root,grants,checks);active();
 if(latest.status!=='NotApplicable'||canonicalJson(latest)!==canonicalJson(current))throw new CoreError('VERSION_CONFLICT');
 return {artifactRef:saved.record.artifactRef,impactRef,installation:latest.installation,impact:latest.impact};
}
