import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,CapabilityRef,CompareOperationPayload,EntityRef,NormalizedOperationObservation,OperationPlanNode,OperationReconciliationRecord,OperationRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {readCurrentPermit} from './dispatch-facts.ts';
import {ActionOwner} from './actions.ts';
import {lockAction,refKey,sameRef} from './shared.ts';
import {compareOneShotObservations,type OneShotComparisonRule} from './reconciliation-comparison.ts';
import {ResourceFenceOwner} from './resource-fences.ts';

export interface InstalledComparisonRule extends OneShotComparisonRule {readonly connectorRef:CapabilityRef}
export interface ReconciliationChecks {
  /** Current independent comparison permission and every relevant control fence. */
  admit(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<void>;
  artifact(tx:TenantTransaction,record:ArtifactRecord):Promise<void>;
}
const vector=(refs:readonly EntityRef[])=>canonicalJson(refs.map(refKey).sort());

/** Comparison reports are immutable and owned here; only the current Operation Controller may apply them. */
export class ReconciliationOwner {
  /** Current-version reports must cover every immutable receipt; UUID pages are discovery, not retention watermarks. */
  async pendingClosed(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    if(afterId)contract('UUID',afterId);
    const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const rows=await tx.owner('ReconciliationService')`SELECT o.id,o.version FROM execution.operations o
      WHERE o.resource_organization_id=${c.resourceOrganizationId} AND o.lifecycle='Closed' AND o.deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(o.purpose_names) AND (o.workspace_id IS NULL OR o.workspace_id=${c.workspaceId??null}::uuid)
      AND (${afterId??null}::uuid IS NULL OR o.id>${afterId??null}::uuid)
      AND EXISTS(SELECT 1 FROM execution.receipts p WHERE p.resource_organization_id=o.resource_organization_id AND p.operation_id=o.id AND p.deleted_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM execution.reconciliations r WHERE r.resource_organization_id=o.resource_organization_id AND r.operation_id=o.id
        AND r.record->'operationRef'->>'version'=o.version::text AND r.deleted_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM execution.receipts p WHERE p.resource_organization_id=o.resource_organization_id AND p.operation_id=o.id AND p.deleted_at IS NULL
          AND NOT (r.record->'receiptRefs' @> jsonb_build_array(p.record->'receiptRef'))))
      ORDER BY o.id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.operation',id:row.id,version:Number(row.version)}));
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<OperationReconciliationRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.reconciliation')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('ReconciliationService')`SELECT record,version,operation_id FROM execution.reconciliations WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],report=contract('OperationReconciliationRecord',row.record);
    if(!sameRef(report.reconciliationRef,ref)||report.resourceOrganizationId!==c.resourceOrganizationId||report.reconciliationRef.version!==Number(row.version)
      ||report.operationRef.id!==row.operation_id||await digestContract('OperationReconciliationRecord',report)!==report.digest)throw new CoreError('INTERNAL_ERROR');return report;
  }
  async compare(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,input:CompareOperationPayload,rule:InstalledComparisonRule,checks:ReconciliationChecks):Promise<OperationReconciliationRecord>{
    contract('OperationRef',operationRef);contract('CompareOperationPayload',input);const operations=new OperationOwner(),receipts=new OperationReceiptOwner(),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const operation=await operations.get(tx,operationRef.id),plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!sameRef(operation.operationRef,operationRef))throw new CoreError('VERSION_CONFLICT');
    if(!plan||!node||!sameRef(operation.planRef,plan.planRef)||!sameRef(rule.ruleRef,node.completionPolicyRef)||canonicalJson(rule.connectorRef)!==canonicalJson(node.connectorRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    await checks.admit(tx,operation,node);
    const fences=new ResourceFenceOwner();
    // Serialize late finality comparison with T2/exit even if another Operation now occupies the resource.
    if(operation.position.lifecycle==='Closed')await fences.lock(tx,node);
    await lockAction(tx,operation.actionRef.id);
    if(canonicalJson(await operations.get(tx,operationRef.id))!==canonicalJson(operation))throw new CoreError('VERSION_CONFLICT');
    const all=await receipts.list(tx,operationRef.id);
    // Do not cherry-pick one successful receipt while suppressing existing conflicting observations.
    if(vector(all.map(receipt=>receipt.receiptRef))!==vector(input.receiptRefs))throw new CoreError('OPERATION_FACT_CONFLICT');
    const observations:NormalizedOperationObservation[]=[];
    for(const receipt of all){
      const observation=await receipts.observation(tx,receipt,checks.artifact);
      if(observation.operationId!==operationRef.id||observation.resourceOrganizationId!==c.resourceOrganizationId||!sameRef(observation.connectionRef,node.connectionRef)
        ||!sameRef(observation.accountRef,node.accountRef)||canonicalJson(observation.connectorRef)!==canonicalJson(node.connectorRef)||observation.providerIdempotencyKey!==operation.providerIdempotencyKey)throw new CoreError('OPERATION_FACT_CONFLICT');
      observations.push(observation);
    }
    if(!operation.attemptCount)throw new CoreError('PRECONDITION_FAILED');
    const permit=await readCurrentPermit(tx,operation);
    const result=await compareOneShotObservations(observations,permit.payloadDigest,rule),intent=await new ActionOwner().getIntent(tx,operation.actionRef.id);
    const [clock]=await tx.owner('ReconciliationService')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('OperationReconciliationRecord',{reconciliationRef:{type:'abh.reconciliation',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,operationRef,
      observationRefs:[...new Map(all.map(receipt=>[refKey(receipt.normalizedObservationRef),receipt.normalizedObservationRef])).values()],receiptRefs:all.map(receipt=>receipt.receiptRef),
      comparisonRuleRef:rule.ruleRef,planRef:plan.planRef,permitRef:permit.permitRef,payloadDigest:permit.payloadDigest,...result,recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const report=contract('OperationReconciliationRecord',{...unsigned,digest:await digestContract('OperationReconciliationRecord',unsigned)});
    await tx.owner('ReconciliationService')`INSERT INTO execution.reconciliations(resource_organization_id,id,workspace_id,purpose_names,operation_id,record)
      VALUES (${c.resourceOrganizationId},${report.reconciliationRef.id},${c.workspaceId??null},${intent.purposeNames},${operationRef.id},${JSON.stringify(report)}::text::jsonb)`;
    await appendChange(tx,{command,target:report.reconciliationRef,eventType:'abh.reconciliation.created',changedFields:['operationRef','verdict','receiptRefs','digest'],relatedRefs:[operationRef,...report.receiptRefs]});
    if(operation.position.lifecycle==='Closed'&&(report.verdict==='Conflicting'||report.verdict==='Ambiguous'
      ||(report.verdict==='ConfirmedSuccess'&&operation.position.outcome!=='Succeeded')
      ||(report.verdict==='ConfirmedNoEffect'&&operation.position.outcome!=='Failed'))){
      await fences.block(tx,command,node,report.reconciliationRef,async()=>{
        // This exact report was produced from the complete current receipt vector under the resource/Action locks.
        if(!sameRef(report.operationRef,operation.operationRef))throw new CoreError('OPERATION_FACT_CONFLICT');
      });
    }
    return report;
  }
}
