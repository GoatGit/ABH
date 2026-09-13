import type {EntityRef,InstalledPackRecord,PackCapabilityRegistration,PackCapabilityAvailability,PackCapabilityCandidate,PackCapabilityQueryResult,PackGovernanceSnapshot,QueryPackCapabilitiesQuery} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import {validRange,satisfies,rcompare} from 'semver';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {lockFences} from '../control/fences.ts';
import {assertCapabilityRead} from './capability-read-authority.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackCapabilityRegistryOwner} from './capability-registry.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import {PackValidationReportOwner} from './validation-reports.ts';
import {admitPackDeployment} from './pack-policy.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';

export interface PackCapabilityQueryAdmission {
 /** All candidate visibility, compatibility and health fences precede deployment locks. */
 fenceRefs(tx:TenantTransaction,query:QueryPackCapabilitiesQuery,options:TransactionOptions):Promise<readonly EntityRef[]>;
 inspect(tx:TenantTransaction,registration:PackCapabilityRegistration,installation:InstalledPackRecord,governance:PackGovernanceSnapshot,options:TransactionOptions):Promise<PackCapabilityAvailability>;
}
/** Acquire after Action locks and before OperationController locks when composing an exit. */
export async function lockPackCapabilityDeployment(tx:TenantTransaction):Promise<void>{
 const key=`${tx.context.tenant.resourceOrganizationId}/Deployment`;
 await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
}
/** Bounded discovery only. No selection, Schema loading, implementation handle or execution Grant. */
export async function queryPackCapabilities(database:Database,context:VerifiedContext,options:TransactionOptions,input:QueryPackCapabilitiesQuery,
 grantRefs:readonly EntityRef[],admission:PackCapabilityQueryAdmission):Promise<PackCapabilityQueryResult>{
 requireVerifiedContext(context);
 const query=structuredClone(input),grants=structuredClone(grantRefs),limits={...options};
 const checks={fenceRefs:admission.fenceRefs.bind(admission),inspect:admission.inspect.bind(admission)};
 return database.transaction(context,limits,tx=>queryPackCapabilitiesInTransaction(tx,limits,query,grants,checks));
}
/** Same query under caller-owned fences, for exact resolution in one UoW. */
export async function queryPackCapabilitiesInTransaction(tx:TenantTransaction,options:TransactionOptions,input:QueryPackCapabilitiesQuery,
 grantRefs:readonly EntityRef[],admission:PackCapabilityQueryAdmission):Promise<PackCapabilityQueryResult>{
 const query=contract('QueryPackCapabilitiesQuery',structuredClone(input)),grants=structuredClone(grantRefs),limits={...options},c=tx.context.tenant;
 if(query.version&&(!query.capabilityId||query.versionRange)||query.versionRange&&(!query.versionRange.trim()||query.versionRange.trim()!==query.versionRange||query.versionRange.split('||').length>8||!validRange(query.versionRange)))throw new CoreError('INVALID_ARGUMENT');
 const fences=admission.fenceRefs.bind(admission),inspect=admission.inspect.bind(admission);
  const work=migrationWorkOptions(tx,limits),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const extra=await boundedCallback(opts=>fences(tx,structuredClone(query),opts),work);
  await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...structuredClone(extra)]);
  await assertCapabilityRead(tx,grants);
  await lockPackCapabilityDeployment(tx);
  const discover=()=>tx.owner('PackLoader')`SELECT p.id AS pack_id,p.version AS pack_version,p.pack_id AS pack_name,c.record AS capability FROM extension.capabilities c
   JOIN extension.installed_packs p ON p.resource_organization_id=c.resource_organization_id AND p.id=c.pack_id
   WHERE c.resource_organization_id=${c.resourceOrganizationId} AND c.kind=${query.kind} AND p.status='Enabled'
    AND (${query.capabilityId??null}::text IS NULL OR c.capability_id=${query.capabilityId??null})
    AND (${query.version??null}::text IS NULL OR c.capability_version=${query.version??null})
    AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND c.workspace_id IS NULL AND p.workspace_id IS NULL
    AND 'abh.pack.manage'=ANY(c.purpose_names) AND 'abh.pack.manage'=ANY(p.purpose_names)
   ORDER BY c.capability_id,c.capability_version LIMIT 1001`;
  const rows=await discover();
  const installed=new InstalledPackOwner(),registry=new PackCapabilityRegistryOwner(),trust=new PackTrustPolicyOwner(),validations=new PackValidationReportOwner();
  const readFacts=async(ref:EntityRef)=>{
   const pack=await installed.readForCapabilityRuntime(tx,ref,grants),e=pack.enablement;
   if(pack.status!=='Enabled'||!e||e.proposal.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('PackEnableProposal',e.proposal)!==e.proposal.proposalDigest)throw new CoreError('PRECONDITION_FAILED');
   const set=await registry.readForCapabilityRuntime(tx,e.proposal.capabilitySetRef,grants);
   if(set.setDigest!==e.proposal.capabilitySetDigest||canonicalJson(set.packRef)!==canonicalJson(e.previousPackRef))throw new CoreError('PRECONDITION_FAILED');
   const identity=(value:PackCapabilityRegistration['capability'])=>canonicalJson(value);
   if(canonicalJson(set.registrations.map(value=>identity(value.capability)).sort())!==canonicalJson(pack.manifest.capabilities.provides.map(identity).sort()))throw new CoreError('PRECONDITION_FAILED');
   for(const entry of set.registrations){
    if(entry.subjectDigest!==pack.manifest.integrity.packageDigest||!pack.manifest.artifacts.some(artifact=>artifact.ref===entry.schemaPath&&artifact.digest===entry.schemaDigest))throw new CoreError('PRECONDITION_FAILED');
    for(const field of Object.keys(pack.manifest.permissions) as (keyof typeof pack.manifest.permissions)[])if(entry.permissionEnvelope[field].some(value=>!pack.manifest.permissions[field].includes(value)))throw new CoreError('FORBIDDEN');
   }
   const validation=await validations.readForCapabilityRuntime(tx,pack.validationRef,grants);
   if(validation.report.reportDigest!==pack.reportDigest||validation.report.subjectDigest!==pack.manifest.integrity.packageDigest||validation.governanceDigest!==pack.governanceDigest||canonicalJson(validation.governanceRef)!==canonicalJson(pack.governanceRef))throw new CoreError('PRECONDITION_FAILED');
   const governance=await trust.readForCapabilityRuntime(tx,pack.manifest.metadata.id,grants);
   return {pack,set,validation,governance};
  };
  const facts=new Map<string,Awaited<ReturnType<typeof readFacts>>>(),candidates:PackCapabilityCandidate[]=[];
  for(const row of rows.slice(0,1000).sort((a,b)=>a.pack_name<b.pack_name?-1:a.pack_name>b.pack_name?1:0)){
   const registration=contract('PackCapabilityRegistration',row.capability);
   if(query.versionRange&&!satisfies(registration.capability.version,query.versionRange))continue;
   if(query.safetyStop!==undefined&&registration.safetyStop===true!==query.safetyStop)continue;
   let current=facts.get(row.pack_id);
   if(!current){
    await trust.lock(tx,row.pack_name);
    current=await readFacts({type:'abh.installed-pack',id:row.pack_id,version:Number(row.pack_version)});facts.set(row.pack_id,current);
   }
   const {pack,set,validation,governance}=current;
   if(registration.capability.kind!==query.kind||query.capabilityId&&registration.capability.id!==query.capabilityId||query.version&&registration.capability.version!==query.version||!set.registrations.some(value=>canonicalJson(value)===canonicalJson(registration)))throw new CoreError('PRECONDITION_FAILED');
   const revoked=[pack.manifest.integrity.packageDigest,validation.report.signatureBundleDigest,validation.report.provenanceBundleDigest,validation.report.conformanceBundleDigest,validation.report.conformanceReportDigest];
   if(governance.revokedPackIds.includes(pack.manifest.metadata.id)||revoked.some(digest=>governance.revokedDigests.includes(digest)))continue;
   if(governance.reservedVersions.some(item=>item.packId===pack.manifest.metadata.id&&item.version===pack.manifest.metadata.version&&item.packageDigest!==pack.manifest.integrity.packageDigest))throw new CoreError('PRECONDITION_FAILED');
   admitPackDeployment(pack.manifest,governance.policy);
   if(await digestBytes(new TextEncoder().encode(canonicalJson({deployment:governance.policy,trust:governance.trust})))!==validation.report.deploymentPolicyDigest)throw new CoreError('VERSION_CONFLICT');
   const availability=contract('PackCapabilityAvailability',await boundedCallback(opts=>inspect(tx,structuredClone(registration),structuredClone(pack),structuredClone(governance),opts),work));
   if(availability.visible)candidates.push({capability:registration.capability,packRef:pack.packRef,registrationDigest:registration.registrationDigest,schemaDigest:registration.schemaDigest,safetyStop:registration.safetyStop===true,compatible:availability.compatible,healthy:availability.healthy});
  }
  // Later candidate callbacks cannot invalidate an earlier candidate unnoticed.
  for(const value of facts.values())if(canonicalJson(await readFacts(value.pack.packRef))!==canonicalJson(value))throw new CoreError('VERSION_CONFLICT');
  if(canonicalJson([...await discover()])!==canonicalJson([...rows]))throw new CoreError('VERSION_CONFLICT');
  await assertCapabilityRead(tx,grants);assertMigrationWorkActive(tx,work);
  candidates.sort((a,b)=>(a.capability.id<b.capability.id?-1:a.capability.id>b.capability.id?1:0)||rcompare(a.capability.version,b.capability.version));
  return contract('PackCapabilityQueryResult',{candidates:candidates.slice(0,query.limit),complete:rows.length<=1000&&candidates.length<=query.limit});
}
