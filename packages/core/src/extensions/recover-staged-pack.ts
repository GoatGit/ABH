import {migrationWorkOptions} from './migration-work-options.ts';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackValidationReportOwner} from './validation-reports.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import type {PackRecordAdmission} from './record-pack-validation.ts';
import {recoverLocalPackSnapshot,type RecoveredLocalPackSnapshot} from './local-pack-staging.ts';

export interface RecoveredStagedPack extends RecoveredLocalPackSnapshot {installation():InstalledPackRecord}
/** Recover an installed staging reference with current stage-management authority; no cached validation or execution grant. */
export async function recoverStagedPack(database:Database,context:VerifiedContext,options:TransactionOptions,ref:EntityRef,
  root:string,grantRefs:readonly EntityRef[],checks:PackRecordAdmission):Promise<RecoveredStagedPack>{
  requireVerifiedContext(context);
  const input=contract('EntityRef',JSON.parse(canonicalJson(ref))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[],currentOptions={...options};
  const admission={fenceRefs:checks.fenceRefs.bind(checks),current:checks.current.bind(checks)};
  return database.transaction(context,{...currentOptions,readOnly:false},tx=>recoverStagedPackInTransaction(tx,currentOptions,input,root,grants,admission));
}

/** Compose recovery with evidence and migration preparation in one management UoW.
 * Authority and Pack locks remain held until that outer transaction completes.
 * This returns content only, never execution authority.
 */
export async function recoverStagedPackInTransaction(tx:TenantTransaction,options:TransactionOptions,ref:EntityRef,
  root:string,grantRefs:readonly EntityRef[],checks:PackRecordAdmission):Promise<RecoveredStagedPack>{
  tx.assertActive();options={...options};const context=tx.context;
  requireVerifiedContext(context);
  const input=contract('EntityRef',JSON.parse(canonicalJson(ref))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[];
  if(input.version!==1)throw new CoreError('INVALID_ARGUMENT');
  const fences=checks.fenceRefs.bind(checks),admit=checks.current.bind(checks),c=context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  let snapshot:RecoveredLocalPackSnapshot|undefined;
  const record=await new InstalledPackOwner().read(tx,input,async installed=>{
    if(installed.status!=='Staged')throw new CoreError('PRECONDITION_FAILED');
    await new PackValidationReportOwner().read(tx,installed.validationRef,async evidence=>{
      const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
      await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(evidence))]);
      const current=async()=>{
        await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.stage'},grants);
        await admit(tx,structuredClone(evidence));await new PackTrustPolicyOwner().match(tx,evidence);
        if(Date.parse(evidence.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
      };
      await current();
      if(installed.reportDigest!==evidence.report.reportDigest||canonicalJson(installed.governanceRef)!==canonicalJson(evidence.governanceRef)||installed.governanceDigest!==evidence.governanceDigest)throw new CoreError('PRECONDITION_FAILED');
      snapshot=await recoverLocalPackSnapshot(root,installed.snapshot,migrationWorkOptions(tx,options));
      const metadata=snapshot.metadata();
      if(canonicalJson(metadata)!==canonicalJson({manifest:installed.manifest,...evidence}))throw new CoreError('PRECONDITION_FAILED');
      await current();
    });
  });
  if(!snapshot)throw new CoreError('INTERNAL_ERROR');
  return Object.freeze({...snapshot,installation:()=>structuredClone(record)});
}
