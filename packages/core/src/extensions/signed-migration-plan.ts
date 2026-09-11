import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import type {ArtifactRecord,Digest,EntityRef,PackManifest,PackMigrationEvidence,PackMigrationStep,PackSchemaOwnership} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {validatePackMigrationPlan} from './pack-migration-plan.ts';
import {readMigrationPlanEvidence,type MigrationEvidenceAdmission} from './migration-evidence.ts';
import {verifyStoredMigrationSignature,type StoredMigrationSignatureAdmission} from './migration-signature-artifact.ts';
import {matchMigrationSignature,type VerifiedMigrationSignature} from './verify-migration-signature.ts';
export interface MigrationSignatureBinding {reportRef:EntityRef;bundleRef:EntityRef}
export interface SignedMigrationPlanAdmission {
  maxLifetimeMs:MigrationEvidenceAdmission['maxLifetimeMs'];
  reportSource:MigrationEvidenceAdmission['source'];
  signature:StoredMigrationSignatureAdmission;
  supportingFacts(artifact:ArtifactRecord,evidence:PackMigrationEvidence):Promise<void>;
}
/** Mandatory persistent signatures for every referenced report. The caller installs
 * current deployment fences and trusted ownership/environment. No SQL is executed and
 * the returned reports are not an execution permit. All Artifact locks precede reads.
 */
export async function readSignedMigrationPlan(tx:TenantTransaction,options:TransactionOptions,manifest:PackManifest,ownership:readonly PackSchemaOwnership[],steps:readonly PackMigrationStep[],binding:{environmentDigest:Digest;deploymentVersion:number},signatures:readonly MigrationSignatureBinding[],admission:SignedMigrationPlanAdmission){
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest))),owners=JSON.parse(canonicalJson(ownership)) as PackSchemaOwnership[],expected={...binding},currentOptions=migrationWorkOptions(tx,options);
  const lifetimes={...admission.maxLifetimeMs},c=tx.context.tenant;
  const active=()=>assertMigrationWorkActive(tx,currentOptions),reportSource=admission.reportSource.bind(admission),facts=admission.supportingFacts.bind(admission);
  const signature={source:admission.signature.source.bind(admission.signature),signer:admission.signature.signer.bind(admission.signature)};
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  if(!Array.isArray(signatures)||signatures.length>10000)throw new CoreError('LIMIT_EXCEEDED');
  const links=JSON.parse(canonicalJson(signatures)) as MigrationSignatureBinding[],plan=await validatePackMigrationPlan(pack,owners,steps);
  active();
  const refs=plan.flatMap(step=>[step.reviewRef,step.dryRunRef,step.safetyPointRef,step.recoveryPlanRef,step.compatibilityRef,...(step.retirementRef?[step.retirementRef]:[])]);
  const expectedRefs=new Set(refs.map(ref=>canonicalJson(ref))),byReport=new Map<string,EntityRef>();
  for(const link of links){
    contract('EntityRef',link.reportRef);contract('EntityRef',link.bundleRef);
    const key=canonicalJson(link.reportRef);
    if(link.reportRef.type!=='abh.artifact'||link.bundleRef.type!=='abh.artifact'||!expectedRefs.has(key)||byReport.has(key))throw new CoreError('INVALID_ARGUMENT');
    byReport.set(key,link.bundleRef);
  }
  if(byReport.size!==expectedRefs.size)throw new CoreError('PRECONDITION_FAILED');
  const all=[...refs,...links.map(link=>link.bundleRef)];
  if(all.length>10000)throw new CoreError('LIMIT_EXCEEDED');
  await new InlineArtifactOwner().lockSources(tx,all);active();
  const proofs:Array<{proof:VerifiedMigrationSignature;report:PackMigrationEvidence;artifact:ArtifactRecord;bundle:EntityRef}>=[];
  const result=await readMigrationPlanEvidence(tx,pack,owners,plan,expected,{
    maxLifetimeMs:lifetimes,source:async(artifact,kind)=>{active();await reportSource(artifact,kind);active();},
    evidence:async(artifact,report)=>{
      active();
      const bundle=byReport.get(canonicalJson(artifact.artifactRef));
      if(!bundle)throw new CoreError('PRECONDITION_FAILED');
      const proof=await verifyStoredMigrationSignature(tx,currentOptions,report,bundle,signature);
      active();await facts(structuredClone(artifact),structuredClone(report));active();
      matchMigrationSignature(proof,report);proofs.push({proof,report,artifact:structuredClone(artifact),bundle});
    },
  });
  // Later supporting-fact checks may outlive earlier source/signer admission.
  // Re-read locked sources and verify all signatures using current deployment keys.
  for(const item of proofs){
    active();
    await new InlineArtifactOwner().read(tx,item.artifact.artifactRef,async artifact=>{
      active();await reportSource(structuredClone(artifact),item.report.kind);active();
      if(canonicalJson(artifact)!==canonicalJson(item.artifact))throw new CoreError('VERSION_CONFLICT');
    });
    const refreshed=await verifyStoredMigrationSignature(tx,currentOptions,item.report,item.bundle,signature);
    const before=matchMigrationSignature(item.proof,item.report),after=matchMigrationSignature(refreshed,item.report);
    if(before.keyDigest!==after.keyDigest||before.bundleDigest!==after.bundleDigest)throw new CoreError('VERSION_CONFLICT');
  }
  for(const {proof,report} of proofs)matchMigrationSignature(proof,report);
  if(canonicalJson(admission.maxLifetimeMs)!==canonicalJson(lifetimes))throw new CoreError('VERSION_CONFLICT');
  if(currentOptions.signal.aborted||currentOptions.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  tx.assertActive();return result;
}
