import {randomUUID} from 'node:crypto';
import {DispatchOwner} from './dispatch.ts';
import type {RecoverOperationPayload,ApplyReconciliationPayload,EntityRef,OperationPlanNode,OperationRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {OperationOwner} from './operations.ts';
import {ActionOwner} from './actions.ts';
import {ReconciliationOwner} from './reconciliations.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {ResourceFenceOwner} from './resource-fences.ts';
import {readPermit} from './dispatch-facts.ts';
import {lockAction,refKey,sameRef} from './shared.ts';

export interface OperationControlChecks {
  /** Current independent reconciliation Controller rights and control fences; never the revoked original execution authority. */
  admit(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<void>;
}
const vector=(refs:EntityRef[])=>canonicalJson(refs.map(refKey).sort());

/** Applies current complete reports with CAS and Worker fencing. Unknown preserves resource occupancy and all budget responsibility. */
export class OperationController {
  /** Permit expiry establishes uncertainty, never no effect. Recovery cannot create another Attempt. */
  async recoverExpired(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,input:RecoverOperationPayload,checks:OperationControlChecks):Promise<OperationRecord>{
    contract('OperationRef',operationRef);contract('RecoverOperationPayload',input);const complete=tx.requireCompletion(),c=tx.context.tenant,operations=new OperationOwner();
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const operation=await operations.get(tx,operationRef.id),plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!sameRef(operation.operationRef,operationRef))throw new CoreError('VERSION_CONFLICT');
    if(!plan||!node||!sameRef(operation.planRef,plan.planRef)||operation.position.lifecycle!=='Dispatching')throw new CoreError('PRECONDITION_FAILED');
    await checks.admit(tx,operation,node);
    const rows=await tx.owner('OperationController')`SELECT id,version FROM execution.dispatch_permits WHERE resource_organization_id=${c.resourceOrganizationId} AND operation_id=${operationRef.id} AND ordinal=${operation.attemptCount}`;
    if(rows.length!==1)throw new CoreError('OPERATION_FACT_CONFLICT');
    const permit=await readPermit(tx,{type:'abh.dispatch-permit',id:rows[0]!.id,version:Number(rows[0]!.version)});
    await new ResourceFenceOwner().requireCurrent(tx,node,operationRef,permit.resourceFencingToken);await lockAction(tx,operation.actionRef.id);
    await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,operationRef);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${operationRef.id}`,sql=tx.owner('OperationController');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    if(canonicalJson(await operations.get(tx,operationRef.id))!==canonicalJson(operation))throw new CoreError('VERSION_CONFLICT');
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    if(clock!.now.getTime()<Date.parse(permit.expiresAt))throw new CoreError('PRECONDITION_FAILED');
    const observations=await new DispatchOwner().observations(tx,permit.attemptRef),last=observations.at(-1);
    if(!last)throw new CoreError('OPERATION_FACT_CONFLICT');
    if(last.status==='Created'||last.status==='Sent'){
      const observation=contract('AttemptObservationRecord',{observationRef:{type:'abh.attempt-observation',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,attemptRef:permit.attemptRef,
        sequence:last.sequence+1,status:'Interrupted',observedAt:clock!.now.toISOString(),evidenceRefs:[permit.permitRef,input.leaseRef]});
      const intent=await new ActionOwner().getIntent(tx,operation.actionRef.id);
      await sql`INSERT INTO execution.attempt_observations(resource_organization_id,id,workspace_id,purpose_names,attempt_id,sequence,status,record)
        VALUES (${c.resourceOrganizationId},${observation.observationRef.id},${c.workspaceId??null},${intent.purposeNames},${permit.attemptRef.id},${observation.sequence},'Interrupted',${JSON.stringify(observation)}::text::jsonb)`;
      await appendChange(tx,{command,target:observation.observationRef,eventType:'abh.attempt-observation.created',changedFields:['status','evidenceRefs'],relatedRefs:[permit.attemptRef,permit.permitRef]});
    }
    const next=contract('OperationRecord',{...operation,operationRef:{...operationRef,version:operationRef.version+1},position:{lifecycle:'Observing',outcome:'Unknown'}});
    const changed=await sql`UPDATE execution.operations SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,lifecycle='Observing',outcome='Unknown',updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${operationRef.id} AND version=${operationRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.operationRef,eventType:'abh.operation.observe',changedFields:['position'],relatedRefs:[permit.permitRef,input.leaseRef]});
    await new ActionOwner().observeChildProgress(tx,command,operation.actionRef.id);
    await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,operationRef);complete();return next;
  }

  async apply(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,input:ApplyReconciliationPayload,checks:OperationControlChecks):Promise<OperationRecord>{
    contract('OperationRef',operationRef);contract('ApplyReconciliationPayload',input);const complete=tx.requireCompletion(),c=tx.context.tenant,operations=new OperationOwner();
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const operation=await operations.get(tx,operationRef.id),plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!sameRef(operation.operationRef,operationRef))throw new CoreError('VERSION_CONFLICT');
    if(!plan||!node||!sameRef(operation.planRef,plan.planRef)||!['Dispatching','Observing'].includes(operation.position.lifecycle))throw new CoreError('PRECONDITION_FAILED');
    const report=await new ReconciliationOwner().get(tx,input.reportRef);
    if(!sameRef(report.operationRef,operationRef)||!sameRef(report.planRef,plan.planRef)||!sameRef(report.comparisonRuleRef,node.completionPolicyRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    await checks.admit(tx,operation,node);
    const permits=await tx.owner('OperationController')`SELECT id,version FROM execution.dispatch_permits WHERE resource_organization_id=${c.resourceOrganizationId} AND operation_id=${operationRef.id} AND ordinal=${operation.attemptCount}`;
    if(permits.length!==1)throw new CoreError('OPERATION_FACT_CONFLICT');
    const permit=await readPermit(tx,{type:'abh.dispatch-permit',id:permits[0]!.id,version:Number(permits[0]!.version)}),fences=new ResourceFenceOwner();
    if(!sameRef(report.permitRef,permit.permitRef)||report.payloadDigest!==permit.payloadDigest)throw new CoreError('OPERATION_FACT_CONFLICT');
    await fences.requireCurrent(tx,node,operationRef,permit.resourceFencingToken);
    await lockAction(tx,operation.actionRef.id);
    const lease=await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,operationRef);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${operationRef.id}`,sql=tx.owner('OperationController');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    if(canonicalJson(await operations.get(tx,operationRef.id))!==canonicalJson(operation))throw new CoreError('VERSION_CONFLICT');
    const receipts=await new OperationReceiptOwner().list(tx,operationRef.id);
    if(vector(receipts.map(receipt=>receipt.receiptRef))!==vector(report.receiptRefs))throw new CoreError('OPERATION_FACT_CONFLICT');
    const final=report.verdict==='ConfirmedSuccess'||report.verdict==='ConfirmedNoEffect';
    const next=contract('OperationRecord',{...operation,operationRef:{...operationRef,version:operationRef.version+1},reconciliationRef:report.reconciliationRef,
      position:final?{lifecycle:'Closed',outcome:report.verdict==='ConfirmedSuccess'?'Succeeded':'Failed'}:{lifecycle:'Observing',outcome:'Unknown'}});
    if(final)await fences.clear(tx,command,node,operationRef,permit.resourceFencingToken,report.reconciliationRef,async()=>{
      // The report, complete receipt vector, pinned rule, live Controller and version are verified under these locks.
      if(!sameRef(report.operationRef,operationRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    });
    const changed=await sql`UPDATE execution.operations SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,lifecycle=${next.position.lifecycle},outcome=${next.position.outcome},updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${operationRef.id} AND version=${operationRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.operationRef,eventType:final?'abh.operation.close':'abh.operation.observe',changedFields:['position','reconciliationRef'],relatedRefs:[report.reconciliationRef,lease.leaseRef]});
    await new ActionOwner().observeChildProgress(tx,command,operation.actionRef.id);
    await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,operationRef);
    complete();return next;
  }
}
