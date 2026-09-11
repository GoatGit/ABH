import type {EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {contract} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareInstalledPack} from './prepare-installed-pack.ts';
import type {MigrationNonApplicabilityAdmission} from './record-migration-non-applicability.ts';
export type MigrationNonApplicabilitySelection={status:'Missing'|'Ambiguous'|'Incomplete'}|{status:'Selected';artifactRef:EntityRef};
/** Bounded recovery discovery from the exact current signed impact. Selection is
 * a hint only: the consuming Owner must use readMigrationNonApplicability in its
 * own UoW. No newest/first choice, absence claim from a partial scan, or writes. */
export async function selectMigrationNonApplicability(database:Database,context:VerifiedContext,options:TransactionOptions,
 expectedImpactRef:EntityRef,root:string,grantRefs:readonly EntityRef[],admission:MigrationNonApplicabilityAdmission&{
 /** Current deployment-wide discovery policy, required even on empty scans.
  * Declare any additional Control fences through impact.fenceRefs. */
 discover(tx:TenantTransaction):Promise<void>;
 },maxScanned=20):Promise<MigrationNonApplicabilitySelection>{
 const impactRef=contract('EntityRef',structuredClone(expectedImpactRef)),grants=structuredClone(grantRefs),limits={...options};
 if(impactRef.type!=='abh.pack-data-impact'||!Number.isInteger(maxScanned)||maxScanned<1||maxScanned>100)throw new CoreError('INVALID_ARGUMENT');
 const p=admission.impact,checks={signer:p.signer.bind(p),source:p.source.bind(p),fenceRefs:p.fenceRefs.bind(p),current:p.current.bind(p)},read=admission.read.bind(admission),references=admission.references.bind(admission),discover=admission.discover.bind(admission);
 return database.transaction(context,limits,async tx=>{
  const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
  const current=await prepareInstalledPack(tx,limits,impactRef,root,grants,checks);active();
  if(current.status!=='NotApplicable')throw new CoreError('PRECONDITION_FAILED');
  await discover(tx);active();
  const sources=[...new Map([impactRef,current.impact.baselineSourceRef,current.impact.targetSourceRef].map(value=>[canonicalJson(value),value])).values()];
  const owner=new InlineArtifactOwner(),page=await owner.scanOwnedSources(tx,current.installation.packRef,sources,maxScanned);
  await owner.lockSources(tx,page.refs);const candidates:EntityRef[]=[];
  for(const ref of page.refs){
   const saved=await owner.read(tx,ref,async artifact=>{await read(tx,artifact);active();});
   if(saved.record.mediaType!=='application/json'||canonicalJson(saved.record.ownerRef)!==canonicalJson(current.installation.packRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson(sources)||canonicalJson(saved.record.purposeNames)!==canonicalJson(['abh.pack.manage']))throw new CoreError('PRECONDITION_FAILED');
   await references(tx,[saved.record.ownerRef,saved.record.retentionPolicyRef,...sources]);active();
   let envelope:unknown,text:string;
   try{text=new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes);envelope=JSON.parse(text);}catch{throw new CoreError('PRECONDITION_FAILED');}
   // Unrelated JSON with the same source set consumes a scan slot, not a match.
   if(!Array.isArray(envelope)||envelope[0]!=='abh-pack-migration-not-applicable-v1')continue;
   if(text!==canonicalJson(['abh-pack-migration-not-applicable-v1',contract('PackMigrationNonApplicabilityReport',current.impact)]))throw new CoreError('PRECONDITION_FAILED');
   candidates.push(saved.record.artifactRef);
  }
  await discover(tx);active();
  const latest=await prepareInstalledPack(tx,limits,impactRef,root,grants,checks);active();
  if(canonicalJson(latest)!==canonicalJson(current))throw new CoreError('VERSION_CONFLICT');
  if(candidates.length>1)return {status:'Ambiguous'};
  if(page.next)return {status:'Incomplete'};
  return candidates.length?{status:'Selected',artifactRef:structuredClone(candidates[0]!)}:{status:'Missing'};
 });
}
