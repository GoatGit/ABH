import {PackCapabilityRegistryOwner} from './capability-registry.ts';
import type {EntityRef,ImpactUpperBound,PackCapabilitySetRecord,PackEnableProposal} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import {readMigrationNonApplicability} from './read-migration-non-applicability.ts';
import type {MigrationNonApplicabilityAdmission} from './record-migration-non-applicability.ts';
import {readPackConformanceArtifact,type PackConformanceArtifactAdmission} from './pack-conformance-artifact.ts';

export interface PackEnableProposalInput {
 packRef:EntityRef;
 impactRef:EntityRef;
 migrationVerificationRef:EntityRef;
 ctkRef:EntityRef;
 capabilitySetRef:EntityRef;
 impactUpperBound:ImpactUpperBound;
 expiresAt:string;
}
export interface PackEnableProposalAdmission {
 migration:MigrationNonApplicabilityAdmission;
 conformance:PackConformanceArtifactAdmission;
 /** Declare all registry authorization fences before Deployment/Pack locks. */
 capabilityFenceRefs(tx:TenantTransaction,packRef:EntityRef):Promise<readonly EntityRef[]>;
 /** Check current read authority, implementation bindings and health. */
 capabilities(tx:TenantTransaction,set:PackCapabilitySetRecord):Promise<void>;
 /** Bound/risk policy must approve the proposed impact under the declared evidence fences. */
 impact(tx:TenantTransaction,proposal:PackEnableProposal):Promise<void>;
}
/** Build exact proposal fields from current installation and independently signed evidence.
 * Currently accepts only verified NotApplicable migrations; applicable data changes
 * require the forthcoming complete migration verifier. This is data, not approval. */
export async function preparePackEnableProposal(tx:TenantTransaction,options:TransactionOptions,input:PackEnableProposalInput,root:string,
 grants:{impact:readonly EntityRef[];stage:readonly EntityRef[]},admission:PackEnableProposalAdmission):Promise<PackEnableProposal>{
 const payload=structuredClone(input),authority=structuredClone(grants),work=migrationWorkOptions(tx,options);
 for(const ref of [payload.packRef,payload.impactRef,payload.migrationVerificationRef,payload.ctkRef,payload.capabilitySetRef])contract('EntityRef',ref);
 contract('ImpactUpperBound',payload.impactUpperBound);contract('Time',payload.expiresAt);
 const registry=new PackCapabilityRegistryOwner(),capabilities=admission.capabilities.bind(admission),capabilityFences=admission.capabilityFenceRefs.bind(admission);
 const m=admission.migration,c=admission.conformance,impact=admission.impact.bind(admission);
 const cp={fenceRefs:c.pack.fenceRefs.bind(c.pack),current:c.pack.current.bind(c.pack)},conformance={pack:cp,references:c.references.bind(c),read:c.read.bind(c)};
 const mp=m.impact,mf=mp.fenceRefs.bind(mp);
 const migration={impact:{signer:mp.signer.bind(mp),source:mp.source.bind(mp),current:mp.current.bind(mp),
  // All later staging authority and CTK source fences precede Deployment/Pack locks.
  fenceRefs:async(...args:Parameters<typeof mf>)=>[...authority.stage,...await capabilityFences(args[0],structuredClone(payload.packRef)),...await mf(...args),...await cp.fenceRefs(args[0],args[2])]},references:m.references.bind(m),read:m.read.bind(m)};
 const current=await readMigrationNonApplicability(tx,work,payload.migrationVerificationRef,payload.impactRef,root,authority.impact,migration);
 if(canonicalJson(current.installation.packRef)!==canonicalJson(payload.packRef))throw new CoreError('PRECONDITION_FAILED');
 const ctk=await readPackConformanceArtifact(tx,work,payload.ctkRef,payload.packRef,root,authority.stage,conformance);
 if(canonicalJson(ctk.installation)!==canonicalJson(current.installation))throw new CoreError('VERSION_CONFLICT');
 const readCapabilities=()=>registry.readSet(tx,payload.capabilitySetRef,async set=>{
  if(canonicalJson(set.packRef)!==canonicalJson(payload.packRef))throw new CoreError('PRECONDITION_FAILED');
  const manifest=current.installation.manifest;
  const identity=(value:typeof manifest.capabilities.provides[number])=>canonicalJson([value.kind,value.id,value.version]);
  if(canonicalJson(set.registrations.map(entry=>identity(entry.capability)).sort())!==canonicalJson(manifest.capabilities.provides.map(identity).sort()))throw new CoreError('PRECONDITION_FAILED');
  for(const entry of set.registrations){
   if(entry.subjectDigest!==manifest.integrity.packageDigest||!manifest.artifacts.some(artifact=>artifact.ref===entry.schemaPath&&artifact.digest===entry.schemaDigest))throw new CoreError('PRECONDITION_FAILED');
   for(const field of Object.keys(manifest.permissions) as (keyof typeof manifest.permissions)[])if(entry.permissionEnvelope[field].some(value=>!manifest.permissions[field].includes(value)))throw new CoreError('FORBIDDEN');
  }
  await capabilities(tx,structuredClone(set));assertMigrationWorkActive(tx,work);
 });
 const set=await readCapabilities();
 const unsigned=contract('PackEnableProposal',{action:'EnablePack',resourceOrganizationId:tx.context.tenant.resourceOrganizationId,
  packRef:current.installation.packRef,subjectDigest:current.installation.manifest.integrity.packageDigest,
  expectedDeploymentVersion:current.impact.deploymentVersion,environmentDigest:current.impact.environmentDigest,
  validationRef:current.installation.validationRef,governanceRef:current.installation.governanceRef,governanceDigest:current.installation.governanceDigest,
  capabilitySetRef:set.setRef,capabilitySetDigest:set.setDigest,ctkRef:ctk.artifactRef,impactRef:payload.impactRef,migrationVerificationRef:current.artifactRef,impactUpperBound:payload.impactUpperBound,expiresAt:payload.expiresAt,proposalDigest:'sha256:'+'0'.repeat(64)});
 const proposal={...unsigned,proposalDigest:await digestContract('PackEnableProposal',unsigned)};
 await impact(tx,structuredClone(proposal));assertMigrationWorkActive(tx,work);
 const latestSet=await readCapabilities();
 if(canonicalJson(latestSet)!==canonicalJson(set))throw new CoreError('VERSION_CONFLICT');
 // Re-read after host policy and evidence callbacks; no cached currentness assertion.
 const latest=await readMigrationNonApplicability(tx,work,payload.migrationVerificationRef,payload.impactRef,root,authority.impact,migration);
 if(canonicalJson(latest)!==canonicalJson(current))throw new CoreError('VERSION_CONFLICT');
 const latestCtk=await readPackConformanceArtifact(tx,work,payload.ctkRef,payload.packRef,root,authority.stage,conformance);
 if(canonicalJson(latestCtk)!==canonicalJson(ctk))throw new CoreError('VERSION_CONFLICT');
 const finalSet=await registry.readSet(tx,payload.capabilitySetRef,async()=>{});
 if(canonicalJson(finalSet)!==canonicalJson(set))throw new CoreError('VERSION_CONFLICT');
 const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
 if(Date.parse(proposal.expiresAt)<=clock!.now.getTime()||Date.parse(proposal.expiresAt)>Math.min(Date.parse(current.impact.expiresAt),Date.parse(ctk.validation.validUntil)))throw new CoreError('PRECONDITION_FAILED');
 assertMigrationWorkActive(tx,work);return proposal;
}
