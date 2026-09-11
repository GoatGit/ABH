import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';
import {migrationWorkOptions} from './migration-work-options.ts';
import {randomUUID} from 'node:crypto';
import type {EntityRef,StagePackCommand,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackValidationReportOwner} from './validation-reports.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import type {PackRecordAdmission} from './record-pack-validation.ts';
import {recoverLocalPackSnapshot,type LocalPackStagingMetadata} from './local-pack-staging.ts';

/** Installation persistence only. Staged content has no capability registration or execution authority.
 * The deployment supplies a protected durable root and current management signer/reference/retention admission.
 */
export async function stagePack(database:Database,context:VerifiedContext,options:TransactionOptions,command:StagePackCommand,
  root:string,grantRefs:readonly EntityRef[],checks:PackRecordAdmission):Promise<EntityRef>{
  requireVerifiedContext(context);
  const input=contract('StagePackCommand',JSON.parse(canonicalJson(command))),grants=JSON.parse(canonicalJson(grantRefs)) as EntityRef[];
  const fences=checks.fenceRefs.bind(checks),admit=checks.current.bind(checks),c=context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(!['Human','Service'].includes(c.actor.type)||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
  return database.transaction(context,options,async tx=>{
    let metadata:LocalPackStagingMetadata|undefined;
    const result=await executeCommand(tx,identity,async()=>{
      await new PackValidationReportOwner().read(tx,input.payload.validationRef,async evidence=>{
        const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
        await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...await fences(tx,structuredClone(evidence))]);
        await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
        // Organization deployment counter precedes the common Pack policy lock in canonical stage-4 order.
        const key=`${c.resourceOrganizationId}/Deployment`;
        await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
        await admit(tx,structuredClone(evidence));
        await new PackTrustPolicyOwner().match(tx,evidence);
        if(Date.parse(evidence.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
        const recovered=await recoverLocalPackSnapshot(root,input.payload.snapshot,migrationWorkOptions(tx,options));metadata=recovered.metadata();
        if(canonicalJson({report:metadata.report,governanceRef:metadata.governanceRef,governanceDigest:metadata.governanceDigest})!==canonicalJson(evidence))throw new CoreError('PRECONDITION_FAILED');
        // Locked authority cannot be concurrently changed, but time-based validity may expire during disk I/O.
        await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
        await admit(tx,structuredClone(evidence));await new PackTrustPolicyOwner().match(tx,evidence);
        if(Date.parse(evidence.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
        tx.assertActive();
      });
    },async()=>{
      if(!metadata||Date.parse(metadata.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
      const sql=tx.owner('PackLoader'),manifest=metadata.manifest;
      const revisions=new PackDeploymentRevisionOwner();
      if(await revisions.current(tx)!==input.payload.expectedDeploymentVersion)throw new CoreError('VERSION_CONFLICT');
      const [existing]=await sql`SELECT package_digest FROM extension.installed_packs WHERE resource_organization_id=${c.resourceOrganizationId} AND pack_id=${manifest.metadata.id} AND pack_version=${manifest.metadata.version}`;
      if(existing)throw new CoreError(existing.package_digest===manifest.integrity.packageDigest?'VERSION_CONFLICT':'PRECONDITION_FAILED');
      const ref={type:'abh.installed-pack',id:randomUUID(),version:1};
      const record:InstalledPackRecord=contract('InstalledPackRecord',{packRef:ref,manifest,snapshot:input.payload.snapshot,validationRef:input.payload.validationRef,
        reportDigest:metadata.report.reportDigest,governanceRef:metadata.governanceRef,governanceDigest:metadata.governanceDigest,
        deploymentVersion:input.payload.expectedDeploymentVersion+1,status:'Staged',stagedAt:new Date().toISOString()});
      await sql`INSERT INTO extension.installed_packs(resource_organization_id,id,purpose_names,record,pack_id,pack_version,package_digest,deployment_version)
        VALUES (${c.resourceOrganizationId},${ref.id},${[c.purposeOfUse]},${JSON.stringify(record)}::text::jsonb,${manifest.metadata.id},${manifest.metadata.version},${manifest.integrity.packageDigest},${record.deploymentVersion})`;
      await new InstalledPackOwner().retainCurrent(tx,ref);
      const revision=await revisions.advance(tx,input.payload.expectedDeploymentVersion,ref);
      await appendChange(tx,{command:identity,target:ref,eventType:'abh.pack.staged',changedFields:['status','packageDigest','deploymentVersion'],relatedRefs:[record.validationRef,record.governanceRef,revision.revisionRef]});
      return ref;
    });
    if(result.receipt.resultRef.type!=='abh.installed-pack'||result.receipt.resultRef.version!==1)throw new CoreError('INTERNAL_ERROR');
    const owner=new InstalledPackOwner();
    const historical=await owner.readHistorical(tx,result.receipt.resultRef,async record=>{
      if(!metadata||canonicalJson(record.manifest)!==canonicalJson(metadata.manifest)||
        canonicalJson(record.snapshot)!==canonicalJson(input.payload.snapshot)||canonicalJson(record.validationRef)!==canonicalJson(input.payload.validationRef)||
        record.reportDigest!==metadata.report.reportDigest||record.governanceDigest!==metadata.governanceDigest||
        canonicalJson(record.governanceRef)!==canonicalJson(metadata.governanceRef)||record.deploymentVersion!==input.payload.expectedDeploymentVersion+1)throw new CoreError('PRECONDITION_FAILED');
    });

    const [head]=await tx.owner('PackLoader')`SELECT version FROM extension.installed_packs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${historical.packRef.id}`;
    if(!head)throw new CoreError('PRECONDITION_FAILED');
    const current=await owner.read(tx,{...historical.packRef,version:Number(head.version)},async()=>{});
    const {enablement:_,...baseline}=current;
    if(canonicalJson({...baseline,packRef:historical.packRef,status:'Staged',deploymentVersion:historical.deploymentVersion})!==canonicalJson(historical))throw new CoreError('PRECONDITION_FAILED');
    return result.receipt.resultRef;
  });
}
