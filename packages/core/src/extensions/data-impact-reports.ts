import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';
import {randomUUID} from 'node:crypto';
import type {Digest,ArtifactRecord,EntityRef,InstalledPackRecord,PackDataImpactRecord,RecordPackDataImpactCommand} from '@abh/contracts';
import {canonicalJson,digestBytes,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackValidationReportOwner,type StoredPackValidation} from './validation-reports.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import {recoverLocalPackSnapshot,type RecoveredLocalPackSnapshot} from './local-pack-staging.ts';
import {verifyImpactInventoryArtifacts} from './impact-inventory-artifacts.ts';
import {verifyImpactSignature,matchImpactSignature,type ImpactCompilerSigner,type VerifiedImpactSignature} from './verify-impact-signature.ts';
import {verifyPackDataImpact} from './pack-data-impact.ts';

interface StoredImpactProof {bundle:Uint8Array;keyDigest:Digest;bundleDigest:Digest}
export interface PackDataImpactAdmission {
  /** Resolve currently authorized deployment compiler key under the compiler governance fences. */
  signer(tx:TenantTransaction,report:PackDataImpactRecord):Promise<ImpactCompilerSigner>;
  /** Authorize each actual source Artifact for compiler ownership, region, retention and access under the supplied fences. */
  source(tx:TenantTransaction,artifact:ArtifactRecord,role:'Baseline'|'Target',report:PackDataImpactRecord):Promise<void>;
  fenceRefs(tx:TenantTransaction,report:PackDataImpactRecord,evidence:StoredPackValidation):Promise<EntityRef[]>;
  /** Under locks verify compiler identity, environment, both source Ref contents/completeness, current management signer, references and retention. */
  current(tx:TenantTransaction,report:PackDataImpactRecord,evidence:StoredPackValidation):Promise<void>;
}
export class PackDataImpactOwner {
  async read(tx:TenantTransaction,ref:EntityRef,admit:(report:PackDataImpactRecord,proof:StoredImpactProof)=>Promise<void>):Promise<PackDataImpactRecord>{
    const input=contract('EntityRef',JSON.parse(canonicalJson(ref))),c=tx.context.tenant;
    if(input.type!=='abh.pack-data-impact'||input.version!==1)throw new CoreError('INVALID_ARGUMENT');
    if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    const [row]=await tx.owner('PackLoader')`SELECT record,record_digest,signature_bundle,signer_key_digest,bundle_digest FROM extension.data_impact_reports WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${input.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND workspace_id IS NULL`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const report=contract('PackDataImpactRecord',row.record);
    if(await digestBytes(new TextEncoder().encode(canonicalJson(report)))!==row.record_digest)throw new CoreError('PRECONDITION_FAILED');
    if(!row.signature_bundle||!row.signer_key_digest||!row.bundle_digest)throw new CoreError('PRECONDITION_FAILED');
    const proof={bundle:new Uint8Array(row.signature_bundle),keyDigest:contract('Digest',row.signer_key_digest),bundleDigest:contract('Digest',row.bundle_digest)};
    if(await digestBytes(proof.bundle)!==proof.bundleDigest)throw new CoreError('PRECONDITION_FAILED');
    await admit(structuredClone(report),proof);tx.assertActive();return structuredClone(report);
  }
}

/** Internal evidence recording: incomplete/required reports are facts, never migration completion or Enable authority. */
export async function recordPackDataImpact(database:Database,context:VerifiedContext,options:TransactionOptions,
  command:RecordPackDataImpactCommand,root:string,grantRefs:readonly EntityRef[],checks:PackDataImpactAdmission,candidate:VerifiedImpactSignature):Promise<EntityRef>{
  requireVerifiedContext(context);
  const input=contract('RecordPackDataImpactCommand',JSON.parse(canonicalJson(command))),report=input.payload.report;
  const grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],fences=checks.fenceRefs.bind(checks),admit=checks.current.bind(checks),source=checks.source.bind(checks),signer=checks.signer.bind(checks),c=context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const proof=matchImpactSignature(candidate,c.resourceOrganizationId,candidate.report());
  const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,options,async tx=>{
    const result=await executeCommand(tx,identity,async()=>{
      await checkCurrentImpact(tx,report,root,grants,{fenceRefs:fences,current:admit,source,signer},options,proof);
    },async()=>{
      const ref={type:'abh.pack-data-impact',id:randomUUID(),version:1};
      const digest=await digestBytes(new TextEncoder().encode(canonicalJson(report)));
      await tx.owner('PackLoader')`INSERT INTO extension.data_impact_reports(resource_organization_id,id,purpose_names,record,record_digest,signature_bundle,signer_key_digest,bundle_digest)
        VALUES (${c.resourceOrganizationId},${ref.id},${[c.purposeOfUse]},${JSON.stringify(report)}::text::jsonb,${digest},${proof.bundle},${proof.keyDigest},${proof.bundleDigest})`;
      await appendChange(tx,{command:identity,target:ref,eventType:'abh.pack.data-impact-recorded',changedFields:['impact','deploymentVersion'],
        relatedRefs:[report.packRef,report.baselineSourceRef,report.targetSourceRef]});return ref;
    });
    await new PackDataImpactOwner().read(tx,result.receipt.resultRef,async (stored,savedProof)=>{
      if(savedProof.keyDigest!==proof.keyDigest||savedProof.bundleDigest!==proof.bundleDigest||canonicalJson(stored)!==canonicalJson(report))throw new CoreError('PRECONDITION_FAILED');
    });
    return result.receipt.resultRef;
  });
}

/** Shared current-state validation for new writes, replay and persisted report reads. */
async function checkCurrentImpact(tx:TenantTransaction,report:PackDataImpactRecord,root:string,grants:EntityRef[],
  checks:PackDataImpactAdmission,options:TransactionOptions,proof:StoredImpactProof):Promise<{installation:InstalledPackRecord;snapshot:RecoveredLocalPackSnapshot}>{
  const c=tx.context.tenant,fences=checks.fenceRefs.bind(checks),admit=checks.current.bind(checks);
  const active=()=>{tx.assertActive();if(options.signal.aborted||!Number.isSafeInteger(options.deadline)||options.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
  let recovered:RecoveredLocalPackSnapshot|undefined;
  const installation=await new InstalledPackOwner().read(tx,report.packRef,async installed=>{
    await new PackValidationReportOwner().read(tx,installed.validationRef,async evidence=>{
      const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(report),structuredClone(evidence))]);
      await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);
      const key=`${c.resourceOrganizationId}/Deployment`;
      await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
      const current=async()=>{
        await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);
        active();await admit(tx,structuredClone(report),structuredClone(evidence));active();await new PackTrustPolicyOwner().match(tx,evidence);
        if(Date.parse(report.issuedAt)>Date.now()||Date.parse(report.expiresAt)<=Date.now()||Date.parse(evidence.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
      };
      await current();
      await verifyImpactInventoryArtifacts(tx,report,(artifact,role)=>{active();return checks.source(tx,artifact,role,structuredClone(report)).then(()=>{active();});});
      if(await new PackDeploymentRevisionOwner().current(tx)!==report.deploymentVersion)throw new CoreError('VERSION_CONFLICT');
      if(installed.reportDigest!==evidence.report.reportDigest||canonicalJson(installed.governanceRef)!==canonicalJson(evidence.governanceRef)||installed.governanceDigest!==evidence.governanceDigest)throw new CoreError('PRECONDITION_FAILED');
      const snapshot=await recoverLocalPackSnapshot(root,installed.snapshot,{...options,signal:AbortSignal.any([options.signal,tx.signal])});
      if(canonicalJson(snapshot.metadata())!==canonicalJson({manifest:installed.manifest,...evidence}))throw new CoreError('PRECONDITION_FAILED');
      await verifyPackDataImpact(installed.manifest,report.baseline,report.target,report.impact);
      active();
      const config=JSON.parse(canonicalJson(await checks.signer(tx,structuredClone(report)))) as ImpactCompilerSigner;
      active();
      const verified=await verifyImpactSignature(c.resourceOrganizationId,report,proof.bundle,config,{...options,signal:AbortSignal.any([options.signal,tx.signal])});
      const matched=matchImpactSignature(verified,c.resourceOrganizationId,report);
      if(matched.keyDigest!==proof.keyDigest||matched.bundleDigest!==proof.bundleDigest)throw new CoreError('FORBIDDEN');
      await current();
      await verifyImpactInventoryArtifacts(tx,report,(artifact,role)=>{active();return checks.source(tx,artifact,role,structuredClone(report)).then(()=>{active();});});
      if(canonicalJson(await checks.signer(tx,structuredClone(report)))!==canonicalJson(config))throw new CoreError('PRECONDITION_FAILED');
      // The last source/key callback may outlive the proof or original validation evidence.
      matchImpactSignature(verified,c.resourceOrganizationId,report);
      if(Date.parse(evidence.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
      active();recovered=snapshot;
    });
  });
  if(!recovered)throw new CoreError('INTERNAL_ERROR');
  return {installation,snapshot:recovered};
}

/** Resolve persisted impact evidence only after fresh authority, deployment, source and content verification.
 * This returns a checked historical fact, not a migration completion or Enable grant.
 */
export async function readCurrentPackDataImpact(database:Database,context:VerifiedContext,options:TransactionOptions,
  ref:EntityRef,root:string,grantRefs:readonly EntityRef[],checks:PackDataImpactAdmission):Promise<PackDataImpactRecord>{
  requireVerifiedContext(context);
  const input=contract('EntityRef',JSON.parse(canonicalJson(ref))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[];
  const installedChecks={fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks),source:checks.source.bind(checks),signer:checks.signer.bind(checks)},c=context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const currentOptions={...options};
  return database.transaction(context,{...currentOptions,readOnly:false},tx=>readCurrentPackDataImpactInTransaction(tx,currentOptions,input,root,grants,installedChecks));
}

/** Compose impact admission before migration preparation in one UoW. This acquires
 * deployment and Pack locks plus source row locks; callers must collect any additional
 * authority fences before entry and respect the aggregate/source lock order.
 * No migration completion is implied by a Required or NotApplicable report.
 */
export async function readCurrentPackDataImpactInTransaction(tx:TenantTransaction,options:TransactionOptions,
  ref:EntityRef,root:string,grantRefs:readonly EntityRef[],checks:PackDataImpactAdmission):Promise<PackDataImpactRecord>{
  return (await recoverImpactCheckedPack(tx,options,ref,root,grantRefs,checks)).impact();
}

/** Return the exact content already recovered and verified during current impact admission.
 * Required/Incomplete remain impact facts, never migration completion or execution permits.
 */
export async function recoverImpactCheckedPack(tx:TenantTransaction,options:TransactionOptions,
  ref:EntityRef,root:string,grantRefs:readonly EntityRef[],checks:PackDataImpactAdmission){
  tx.assertActive();
  const input=contract('EntityRef',JSON.parse(canonicalJson(ref))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],currentOptions={...options,signal:AbortSignal.any([options.signal,tx.signal])};
  const installedChecks={fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks),source:checks.source.bind(checks),signer:checks.signer.bind(checks)},c=tx.context.tenant;
  if(currentOptions.signal.aborted||!Number.isSafeInteger(currentOptions.deadline)||currentOptions.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  let recovered:Awaited<ReturnType<typeof checkCurrentImpact>>|undefined;
  const report=await new PackDataImpactOwner().read(tx,input,async(report,proof)=>{recovered=await checkCurrentImpact(tx,report,root,grants,installedChecks,currentOptions,proof);});
  if(!recovered)throw new CoreError('INTERNAL_ERROR');
  const {installation,snapshot}=recovered;
  if(canonicalJson(installation.packRef)!==canonicalJson(report.packRef)||snapshot.metadata().manifest.integrity.packageDigest!==report.impact.subjectDigest)throw new CoreError('PRECONDITION_FAILED');
  return Object.freeze({...snapshot,installation:()=>structuredClone(installation),impact:()=>structuredClone(report)});
}
