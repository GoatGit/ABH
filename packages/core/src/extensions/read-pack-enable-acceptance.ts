import type {EntityRef,InstalledPackRecord,PackCapabilitySetRecord,PackGovernanceSnapshot} from '@abh/contracts';
import {canonicalJson,digestContract,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackCapabilityRegistryOwner} from './capability-registry.ts';
import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import {PackValidationReportOwner} from './validation-reports.ts';
import {recoverLocalPackSnapshot} from './local-pack-staging.ts';
import {admitPackDeployment} from './pack-policy.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';

export interface PackEnableReplayAdmission {
 fenceRefs(tx:TenantTransaction,installation:InstalledPackRecord):Promise<readonly EntityRef[]>;
 /** Current signer/key/read authority, compatibility, implementation and health.
  * This is admission to read a committed receipt, never permission for new execution. */
 current(tx:TenantTransaction,installation:InstalledPackRecord,governance:PackGovernanceSnapshot,capabilities:PackCapabilitySetRecord):Promise<void>;
}
/** Read actual accepted facts, not a new approval. Old proposal/CTK expiration
 * and subsequent reviewer withdrawal do not erase an already committed receipt. */
export async function readPackEnableAcceptance(tx:TenantTransaction,options:TransactionOptions,ref:EntityRef,root:string,
 grantRefs:readonly EntityRef[],admission:PackEnableReplayAdmission):Promise<InstalledPackRecord>{
 const reference=structuredClone(ref),grants=structuredClone(grantRefs),work=migrationWorkOptions(tx,options),c=tx.context.tenant;
 if(!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 const fences=admission.fenceRefs.bind(admission),admit=admission.current.bind(admission),owner=new InstalledPackOwner(),registry=new PackCapabilityRegistryOwner(),trust=new PackTrustPolicyOwner();
 const accepted=await owner.readHistorical(tx,reference,async()=>{}),e=accepted.enablement;
 if(accepted.status!=='Enabled'||!e||e.proposal.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('PackEnableProposal',e.proposal)!==e.proposal.proposalDigest)throw new CoreError('PRECONDITION_FAILED');
 const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
 await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(accepted))]);
 const authorize=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.enable'},grants);
 await authorize();
 const deployment=await new PackDeploymentRevisionOwner().current(tx);
 if(deployment<accepted.deploymentVersion)throw new CoreError('PRECONDITION_FAILED');
 await trust.lock(tx,accepted.manifest.metadata.id);
 const readFacts=async()=>{
  const [revisionRow]=await tx.owner('PackLoader')`SELECT record FROM extension.deployment_revisions WHERE resource_organization_id=${c.resourceOrganizationId} AND deployment_version=${accepted.deploymentVersion}`;
  if(!revisionRow)throw new CoreError('PRECONDITION_FAILED');
  const revision=contract('PackDeploymentRevisionRecord',revisionRow.record);
  if(revision.resourceOrganizationId!==c.resourceOrganizationId||revision.deploymentVersion!==accepted.deploymentVersion||canonicalJson(revision.targetRef)!==canonicalJson(reference))throw new CoreError('PRECONDITION_FAILED');
  const previous=await owner.readHistorical(tx,e.previousPackRef,async()=>{});
  const {enablement:_,...base}=accepted;
  if(canonicalJson({...base,packRef:previous.packRef,status:'Staged',deploymentVersion:previous.deploymentVersion})!==canonicalJson(previous))throw new CoreError('PRECONDITION_FAILED');
  const historical=await owner.readHistorical(tx,reference,async()=>{});
  if(canonicalJson(historical)!==canonicalJson(accepted))throw new CoreError('PRECONDITION_FAILED');
  // Until later lifecycle states are implemented, the accepted Enabled version
  // must still be the exact current head. This never substitutes a newer Ref.
  const current=await owner.read(tx,reference,async()=>{});
  if(canonicalJson(current)!==canonicalJson(accepted))throw new CoreError('PRECONDITION_FAILED');
  const set=await registry.readSet(tx,e.proposal.capabilitySetRef,async()=>{});
  if(set.setDigest!==e.proposal.capabilitySetDigest||canonicalJson(set.packRef)!==canonicalJson(previous.packRef))throw new CoreError('PRECONDITION_FAILED');
  const validation=await new PackValidationReportOwner().read(tx,accepted.validationRef,async()=>{});
  if(validation.report.reportDigest!==accepted.reportDigest||canonicalJson(validation.governanceRef)!==canonicalJson(accepted.governanceRef)||validation.governanceDigest!==accepted.governanceDigest)throw new CoreError('PRECONDITION_FAILED');
  const snapshot=await recoverLocalPackSnapshot(root,accepted.snapshot,work),metadata=snapshot.metadata();
  if(canonicalJson(metadata)!==canonicalJson({manifest:accepted.manifest,...validation}))throw new CoreError('PRECONDITION_FAILED');
  const governance=await trust.current(tx,accepted.manifest.metadata.id);
  admitPackDeployment(accepted.manifest,governance.policy);
  // Reuse the original validation only under the exact same verification inputs.
  // Policy revision/revocation lists may advance independently; changed keys,
  // provenance or CTK requirements require new verification, not a cached pass.
  if(await digestBytes(new TextEncoder().encode(canonicalJson({deployment:governance.policy,trust:governance.trust})))!==validation.report.deploymentPolicyDigest)throw new CoreError('VERSION_CONFLICT');
  const digests=[accepted.manifest.integrity.packageDigest,validation.report.signatureBundleDigest,validation.report.provenanceBundleDigest,validation.report.conformanceBundleDigest,validation.report.conformanceReportDigest];
  if(governance.revokedPackIds.includes(accepted.manifest.metadata.id)||digests.some(digest=>governance.revokedDigests.includes(digest)))throw new CoreError('FORBIDDEN');
  if(governance.reservedVersions.some(item=>item.packId===accepted.manifest.metadata.id&&item.version===accepted.manifest.metadata.version&&item.packageDigest!==accepted.manifest.integrity.packageDigest))throw new CoreError('PRECONDITION_FAILED');
  assertMigrationWorkActive(tx,work);return {set,validation,governance,revision};
 };
 const before=await readFacts();
 await admit(tx,structuredClone(accepted),structuredClone(before.governance),structuredClone(before.set));assertMigrationWorkActive(tx,work);
 const after=await readFacts();
 if(canonicalJson(before)!==canonicalJson(after))throw new CoreError('VERSION_CONFLICT');
 await authorize();assertMigrationWorkActive(tx,work);return structuredClone(accepted);
}
