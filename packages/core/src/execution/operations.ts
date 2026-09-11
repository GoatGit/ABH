import {randomUUID} from 'node:crypto';
import type {ActionRecord,EntityRef,OperationPlan,OperationRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {lifecyclePurposes} from '../data/purposes.ts';
import {lockAction,sameRef} from './shared.ts';

/** Plan and child facts only; no external transport is possible through this preparation Owner. */
export class OperationOwner {
  /** Recovery discovery only: callers must freshly authorize and lease each result. Reset the cursor after every sweep. */
  async pendingReconciliation(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    if(afterId!==undefined)contract('UUID',afterId);const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const rows=await tx.owner('OperationController')`SELECT id,version FROM execution.operations
      WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL
      AND lifecycle IN ('Dispatching','Observing') AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)
      AND (${afterId??null}::uuid IS NULL OR id>${afterId??null}::uuid) ORDER BY id LIMIT ${limit}`;
    return rows.map(row=>contract('OperationRef',{type:'abh.operation',id:row.id,version:Number(row.version)}));
  }
  async get(tx:TenantTransaction,id:string):Promise<OperationRecord>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT action_id FROM execution.operations WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    const operation=(await this.list(tx,rows[0].action_id)).find(record=>record.operationRef.id===id);
    if(!operation)throw new CoreError('RESOURCE_NOT_FOUND');return operation;
  }
  async getPlan(tx:TenantTransaction,actionId:string):Promise<OperationPlan|undefined>{
    contract('UUID',actionId);const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT record,id,version FROM execution.plans WHERE resource_organization_id=${c.resourceOrganizationId}
      AND action_id=${actionId} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])return undefined;
    const plan=contract('OperationPlan',rows[0].record);
    if(plan.actionRef.id!==actionId||plan.planRef.id!==rows[0].id||plan.planRef.version!==Number(rows[0].version)||await digestContract('OperationPlan',plan)!==plan.digest)throw new CoreError('INTERNAL_ERROR');
    return plan;
  }
  async list(tx:TenantTransaction,actionId:string):Promise<OperationRecord[]>{
    contract('UUID',actionId);const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT record,id,version,lifecycle,outcome FROM execution.operations WHERE resource_organization_id=${c.resourceOrganizationId}
      AND action_id=${actionId} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY node_key`;
    return rows.map(row=>{
      const record=contract('OperationRecord',row.record);
      if(record.operationRef.id!==row.id||record.operationRef.version!==Number(row.version)||record.actionRef.id!==actionId||record.resourceOrganizationId!==c.resourceOrganizationId
        ||record.position.lifecycle!==row.lifecycle||record.position.outcome!==row.outcome)throw new CoreError('INTERNAL_ERROR');
      return record;
    });
  }
  /** Called after the Action Owner proves immutable intent, pins, domain scope and current preparation rights. */
  async register(tx:TenantTransaction,command:CommandIdentity,action:ActionRecord,plan:OperationPlan):Promise<OperationPlan>{
    contract('ActionRecord',action);contract('OperationPlan',plan);
    if(action.position.lifecycle!=='Validated'||!sameRef(action.actionRef,plan.actionRef)||await digestContract('OperationPlan',plan)!==plan.digest)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    await lockAction(tx,action.actionRef.id);
    const current=await tx.owner('ActionEngine')`SELECT record FROM execution.actions WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId}
      AND id=${action.actionRef.id} AND version=${action.actionRef.version} AND lifecycle='Validated' AND deleted_at IS NULL`;
    if(!current[0]||canonicalJson(current[0].record)!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
    const existing=await this.getPlan(tx,action.actionRef.id);
    if(existing){if(existing.digest!==plan.digest||!sameRef(existing.planRef,plan.planRef))throw new CoreError('IDEMPOTENCY_CONFLICT');return existing;}
    const c=tx.context.tenant,sql=tx.owner('OperationController');
    const intents=await tx.owner('ActionEngine')`SELECT record FROM execution.action_intents WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${action.actionRef.id} AND deleted_at IS NULL`;
    if(!intents[0])throw new CoreError('ACTION_DOMAIN_INVALID');const intent=contract('ActionIntentRecord',intents[0].record);
    if(await digestContract('ActionIntentRecord',intent)!==intent.digest)throw new CoreError('ACTION_DOMAIN_INVALID');
    const purposeNames=lifecyclePurposes(intent.purposeNames,c.purposeOfUse);
    await sql`INSERT INTO execution.plans(resource_organization_id,id,workspace_id,purpose_names,action_id,record)
      VALUES (${c.resourceOrganizationId},${plan.planRef.id},${c.workspaceId??null},${purposeNames},${action.actionRef.id},${JSON.stringify(plan)}::text::jsonb)`;
    await appendChange(tx,{command,target:plan.planRef,eventType:'abh.operation-plan.created',changedFields:['nodes','digest','pinSetRef'],relatedRefs:[action.actionRef,plan.pinSetRef,plan.scopeProofRef]});
    for(const node of plan.nodes){
      const id=randomUUID();
      const operation=contract('OperationRecord',{operationRef:{type:'abh.operation',id,version:1},resourceOrganizationId:c.resourceOrganizationId,
        actionRef:action.actionRef,planRef:plan.planRef,nodeKey:node.nodeKey,providerIdempotencyKey:`abh:${c.resourceOrganizationId}:${id}`,
        position:{lifecycle:'Pending',outcome:'NotStarted'},attemptCount:0});
      await sql`INSERT INTO execution.operations(resource_organization_id,id,workspace_id,purpose_names,action_id,plan_id,node_key,lifecycle,outcome,record)
        VALUES (${c.resourceOrganizationId},${id},${c.workspaceId??null},${purposeNames},${action.actionRef.id},${plan.planRef.id},${node.nodeKey},'Pending','NotStarted',${JSON.stringify(operation)}::text::jsonb)`;
      await appendChange(tx,{command,target:operation.operationRef,eventType:'abh.operation.created',changedFields:['position','planRef','nodeKey'],relatedRefs:[plan.planRef]});
    }
    return plan;
  }
  async cancelPending(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef):Promise<void>{
    await lockAction(tx,actionRef.id);const c=tx.context.tenant,sql=tx.owner('OperationController');
    const operations=await this.list(tx,actionRef.id);
    for(const current of operations.filter(op=>op.position.lifecycle==='Pending')){
      // A Pending retry with previous dispatch requires the separate post-dispatch cleanup protocol.
      if(current.attemptCount!==0)throw new CoreError('PRECONDITION_FAILED');
      const next=contract('OperationRecord',{...current,operationRef:{...current.operationRef,version:current.operationRef.version+1},position:{lifecycle:'Cancelled',outcome:'NotStarted'}});
      const changed=await sql`UPDATE execution.operations SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,lifecycle='Cancelled',outcome='NotStarted',
        updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.operationRef.id} AND version=${current.operationRef.version} RETURNING id`;
      if(!changed[0])throw new CoreError('VERSION_CONFLICT');
      await appendChange(tx,{command,target:next.operationRef,eventType:'abh.operation.cancel',changedFields:['position'],relatedRefs:[actionRef]});
    }
  }
}
