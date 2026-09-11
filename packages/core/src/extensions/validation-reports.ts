import {assertCapabilityRead} from './capability-read-authority.ts';
import {randomUUID} from 'node:crypto';
import type {Digest,EntityRef,PackValidationReport,RecordPackValidationCommand} from '@abh/contracts';
import {canonicalJson,digestContract,digestCommandIntent} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {requireGovernedLocalPack,type GovernedLocalPack} from './validate-current-pack.ts';

export interface StoredPackValidation {
  report:PackValidationReport;
  governanceRef:EntityRef;
  governanceDigest:Digest;
}
/** Internal evidence Owner. Deployment Command must supply current authorized admission and transaction fencing. */
export class PackValidationReportOwner {
  async record(tx:TenantTransaction,command:RecordPackValidationCommand,candidate:GovernedLocalPack,
    admit:(evidence:StoredPackValidation)=>Promise<void>):Promise<EntityRef>{
    requireGovernedLocalPack(candidate);tx.assertActive();
    const input=contract('RecordPackValidationCommand',JSON.parse(canonicalJson(command)));
    const evidence={report:candidate.validation(),governanceRef:candidate.governanceRef(),governanceDigest:candidate.governanceDigest()};
    if(input.target.id!==tx.context.tenant.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    if(canonicalJson(input.payload)!==canonicalJson({reportDigest:evidence.report.reportDigest,governanceRef:evidence.governanceRef,governanceDigest:evidence.governanceDigest}))throw new CoreError('INVALID_ARGUMENT');
    const identity={commandId:input.commandId,type:input.type,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
    const result=await executeCommand(tx,identity,async()=>{await admit(structuredClone(evidence));tx.assertActive();},async()=>{
    if(Date.parse(evidence.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
    const c=tx.context.tenant,ref={type:'abh.pack-validation',id:randomUUID(),version:1};
    await tx.owner('PackLoader')`INSERT INTO extension.validation_reports(resource_organization_id,id,workspace_id,purpose_names,record,governance_ref,governance_digest,report_digest)
      VALUES (${c.resourceOrganizationId},${ref.id},${c.workspaceId??null},${[c.purposeOfUse]},${JSON.stringify(evidence.report)}::text::jsonb,
        ${JSON.stringify(evidence.governanceRef)}::text::jsonb,${evidence.governanceDigest},${evidence.report.reportDigest})`;
    await appendChange(tx,{command:identity,target:ref,eventType:'abh.pack.validation-recorded',changedFields:['reportDigest','governanceDigest'],relatedRefs:[evidence.governanceRef]});
    return ref;
    });
    if(result.receipt.resultRef.type!=='abh.pack-validation'||result.receipt.resultRef.version!==1)throw new CoreError('INTERNAL_ERROR');
    return result.receipt.resultRef;
  }
  async read(tx:TenantTransaction,ref:EntityRef,admit:(record:StoredPackValidation)=>Promise<void>):Promise<StoredPackValidation>{
  return this.#read(tx,ref,admit,tx.context.tenant.purposeOfUse);
 }
 async readForCapabilityRuntime(tx:TenantTransaction,ref:EntityRef,grants:readonly EntityRef[]):Promise<StoredPackValidation>{
  const reference=structuredClone(ref),authority=structuredClone(grants);
  await assertCapabilityRead(tx,authority);return this.#read(tx,reference,async()=>{},'abh.pack.manage');
 }
 async #read(tx:TenantTransaction,ref:EntityRef,admit:(evidence:StoredPackValidation)=>Promise<void>,sourcePurpose:string):Promise<StoredPackValidation>{
    contract('EntityRef',ref);if(ref.type!=='abh.pack-validation'||ref.version!==1)throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const [row]=await tx.owner('PackLoader')`SELECT record,governance_ref,governance_digest,report_digest FROM extension.validation_reports
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${sourcePurpose}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const evidence={report:contract('PackValidationReport',row.record),governanceRef:contract('EntityRef',row.governance_ref),governanceDigest:contract('Digest',row.governance_digest)};
    if(evidence.report.reportDigest!==row.report_digest||await digestContract('PackValidationReport',evidence.report)!==row.report_digest)throw new CoreError('INTERNAL_ERROR');
    await admit(structuredClone(evidence));return evidence;
  }
}
