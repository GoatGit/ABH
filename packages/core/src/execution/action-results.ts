import {randomUUID} from 'node:crypto';
import type {ActionRecord,ActionResultRecord,AggregateActionPayload,EntityRef,LedgerRecord,OperationPlan,OperationReconciliationRecord,OperationRecord,ReservationRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {readAuthorizationSnapshot} from '../control/snapshots.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {ActionOwner} from './actions.ts';
import {OperationOwner} from './operations.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {readCurrentPermit} from './dispatch-facts.ts';
import {ReconciliationOwner} from './reconciliations.ts';
import {ResourceFenceOwner} from './resource-fences.ts';
import {lockAction,refKey,sameRef} from './shared.ts';

export interface ActionFinalizationChecks {
  readonly aggregationRuleRef:EntityRef;
  admit(tx:TenantTransaction,action:ActionRecord):Promise<void>;
  /** Installed finite one-shot rule verifies actual cumulative usage (including failed-call fees) and capacity termination.
   * Every reservation must be covered. Unknown billing/liability throws; no inferred zero or estimate-as-actual. */
  settlement(tx:TenantTransaction,input:{action:ActionRecord;plan:OperationPlan;operations:OperationRecord[];reports:OperationReconciliationRecord[];reservations:ReservationRecord[];ledgers:LedgerRecord[]}):Promise<{reservationRef:EntityRef;actualUsage:string;evidenceRef:EntityRef}[]>;
}
export interface IssuedActionResult {readonly kind:'IssuedActionResult'}
const issued=new WeakMap<IssuedActionResult,{tx:TenantTransaction;actionRef:EntityRef;result:ActionResultRecord;complete:()=>void}>();
export function consumeActionResult(tx:TenantTransaction,ref:EntityRef,token:IssuedActionResult){
  const value=issued.get(token);if(!value||value.tx!==tx||!sameRef(value.actionRef,ref))throw new CoreError('AUTHORITY_REQUIRED');tx.assertActive();issued.delete(token);return value;
}
const vector=(refs:EntityRef[])=>canonicalJson(refs.map(refKey).sort());

export class ActionResultOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<ActionResultRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.action-result')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('ActionEngine')`SELECT record,version,action_id FROM execution.action_results WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],result=contract('ActionResultRecord',row.record);
    if(!sameRef(result.resultRef,ref)||result.resultRef.version!==Number(row.version)||result.resourceOrganizationId!==c.resourceOrganizationId||result.actionRef.id!==row.action_id
      ||await digestContract('ActionResultRecord',result)!==result.digest)throw new CoreError('INTERNAL_ERROR');return result;
  }
  async finalizeOneShot(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,input:AggregateActionPayload,checks:ActionFinalizationChecks):Promise<IssuedActionResult>{
    contract('ActionRef',actionRef);contract('AggregateActionPayload',input);const complete=tx.requireCompletion(),c=tx.context.tenant,actions=new ActionOwner(),operations=new OperationOwner(),ledger=new LedgerOwner();
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const action=await actions.get(tx,actionRef.id),plan=await operations.getPlan(tx,actionRef.id),intent=await actions.getIntent(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(!['Executing','Reconciling'].includes(action.position.lifecycle)||!action.authorizationSnapshotRef||action.resultRef||!plan||!action.planRef||!sameRef(action.planRef,plan.planRef))throw new CoreError('PRECONDITION_FAILED');
    if(!sameRef(checks.aggregationRuleRef,action.completionPolicyRef)||!sameRef(plan.completionPolicyRef,action.completionPolicyRef))throw new CoreError('ACTION_DOMAIN_INVALID');
    await checks.admit(tx,action);const snapshot=await readAuthorizationSnapshot(tx,action.authorizationSnapshotRef);
    if(snapshot.actionRef.id!==actionRef.id||snapshot.planDigest!==plan.digest||!sameRef(snapshot.planRef,plan.planRef)||snapshot.commitmentRefs.length)throw new CoreError('AUTHORITY_REQUIRED');
    const key=(node:OperationPlan['nodes'][number])=>`${node.connectionRef.type}/${node.connectionRef.id}/${node.accountRef.type}/${node.accountRef.id}/${node.resourceKey}`;
    const slots=[];
    for(const node of [...new Map(plan.nodes.map(node=>[key(node),node])).values()].sort((a,b)=>key(a)<key(b)?-1:1))slots.push(await new ResourceFenceOwner().lock(tx,node));
    const reservations:ReservationRecord[]=[];
    for(const ref of snapshot.reservationRefs){const held=await ledger.getReservation(tx,ref.id);if(!sameRef(held.reservationRef,ref)||held.status!=='Held'||held.bindingRef.id!==actionRef.id||held.bindingRef.type!=='abh.action'||!sameRef(held.requestRef,snapshot.resourceOriginSnapshotRef))throw new CoreError('OBLIGATION_CONFLICT');reservations.push(held);}
    const ledgers=await ledger.lockCurrent(tx,reservations.map(reservation=>reservation.ledgerRef.id));
    await lockAction(tx,actionRef.id);
    if(canonicalJson(await actions.get(tx,actionRef.id))!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
    const children=await operations.list(tx,actionRef.id);
    if(vector(children.map(child=>child.operationRef))!==vector(input.operationVersionRefs)||children.length!==plan.nodes.length||plan.nodes.some(node=>children.filter(child=>child.nodeKey===node.nodeKey).length!==1))throw new CoreError('ACTION_CHILD_VERSION_CONFLICT');
    if(children.some(child=>!['Closed','Cancelled'].includes(child.position.lifecycle))||slots.some(slot=>slot?.unresolvedOperationRef&&children.some(child=>child.operationRef.id===slot.unresolvedOperationRef!.id)))throw new CoreError('PRECONDITION_FAILED');
    const reports:OperationReconciliationRecord[]=[];
    for(const child of children){
      if(child.position.lifecycle==='Cancelled'){if(child.attemptCount)throw new CoreError('OPERATION_FACT_CONFLICT');continue;}
      if(!child.reconciliationRef)throw new CoreError('OPERATION_FACT_CONFLICT');const report=await new ReconciliationOwner().get(tx,child.reconciliationRef);
      if(report.operationRef.id!==child.operationRef.id||report.operationRef.version!==child.operationRef.version-1||!sameRef(report.planRef,plan.planRef)
        ||report.verdict!==(child.position.outcome==='Succeeded'?'ConfirmedSuccess':'ConfirmedNoEffect'))throw new CoreError('OPERATION_FACT_CONFLICT');
      const permit=await readCurrentPermit(tx,child);
      if(!sameRef(report.permitRef,permit.permitRef)||report.payloadDigest!==permit.payloadDigest)throw new CoreError('OPERATION_FACT_CONFLICT');
      const receipts=await new OperationReceiptOwner().list(tx,child.operationRef.id);
      if(vector(receipts.map(receipt=>receipt.receiptRef))!==vector(report.receiptRefs))throw new CoreError('OPERATION_FACT_CONFLICT');reports.push(report);
    }
    const settlement=await checks.settlement(tx,{action,plan,operations:children,reports,reservations,ledgers});
    if(vector(settlement.map(row=>row.reservationRef))!==vector(reservations.map(row=>row.reservationRef)))throw new CoreError('OBLIGATION_CONFLICT');
    const settled:ActionResultRecord['resourceSettlements']=[];
    for(const row of [...settlement].sort((a,b)=>{
      const left=reservations.find(r=>r.reservationRef.id===a.reservationRef.id)!,right=reservations.find(r=>r.reservationRef.id===b.reservationRef.id)!;return left.ledgerRef.id<right.ledgerRef.id?-1:1;
    })){
      contract('NonnegativeDecimal',row.actualUsage);contract('EntityRef',row.evidenceRef);
      const reservation=reservations.find(r=>sameRef(r.reservationRef,row.reservationRef))!,currentLedger=ledgers.find(l=>l.ledgerRef.id===reservation.ledgerRef.id)!;
      if(currentLedger.meteringMode==='capacity'&&!/^0(?:\.0+)?$/.test(row.actualUsage))throw new CoreError('INVALID_ARGUMENT');
      const result=currentLedger.meteringMode==='capacity'?await ledger.release(tx,command,{reservationRef:row.reservationRef,evidence:{verdict:'Completed',evidenceRef:row.evidenceRef}})
        :await ledger.consume(tx,command,{reservationRef:row.reservationRef,actualUsage:row.actualUsage,receiptRef:row.evidenceRef});
      settled.push({...row,reservationRef:result.reservationRef});
    }
    const outcome=children.every(child=>child.position.outcome==='Succeeded')?'Succeeded':children.some(child=>child.position.outcome==='Succeeded')?'PartiallySucceeded':'Failed';
    const [clock]=await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('ActionResultRecord',{resultRef:{type:'abh.action-result',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,actionRef,planRef:plan.planRef,aggregationRuleRef:action.completionPolicyRef,
      operationVersionRefs:children.map(child=>child.operationRef),reconciliationRefs:reports.map(report=>report.reconciliationRef),resourceSettlements:settled,outcome,recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const result=contract('ActionResultRecord',{...unsigned,digest:await digestContract('ActionResultRecord',unsigned)});
    await tx.owner('ActionEngine')`INSERT INTO execution.action_results(resource_organization_id,id,workspace_id,purpose_names,action_id,record)
      VALUES (${c.resourceOrganizationId},${result.resultRef.id},${c.workspaceId??null},${intent.purposeNames},${actionRef.id},${JSON.stringify(result)}::text::jsonb)`;
    await appendChange(tx,{command,target:result.resultRef,eventType:'abh.action-result.created',changedFields:['outcome','operationVersionRefs','resourceSettlements'],relatedRefs:[actionRef,...result.reconciliationRefs,...settled.map(row=>row.reservationRef)]});
    const token=Object.freeze({kind:'IssuedActionResult' as const});issued.set(token,{tx,actionRef,result,complete});return token;
  }
}
