import { randomUUID } from 'node:crypto';
import type { Digest, EntityRef, ModelCallRecord, ModelRoute, RegisteredName } from '@abh/contracts';
import { contract, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { canonicalJson } from '@abh/contracts/digest';
import { InlineArtifactOwner } from '../data/artifacts.ts';
import type { Database, TenantTransaction, TransactionOptions } from '../data/uow.ts';
import type { VerifiedContext } from '../internal/context.ts';
import { requireVerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { LedgerOwner } from '../resources/ledger.ts';

const routePurposeNames = ['abh.mission.manage'];

export interface PrepareModelCallInput {
  callRef: EntityRef & { readonly type: 'abh.model-call' };
  routeRef: EntityRef & { readonly type: 'abh.model-route' };
  callerRef: EntityRef;
  selectedModel: RegisteredName;
  inputManifestRef: EntityRef & { readonly type: 'abh.context' };
  inputDigest: Digest;
  maxCostMicros?: number;
  budget?: ModelBudgetInput;
}

export interface ModelBudgetInput {
  readonly ledgerRef: EntityRef & { readonly type: 'abh.ledger' };
  readonly amount: string;
  readonly expiresAt: string;
}

export interface ModelCallUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimated: boolean;
}

export interface CompleteModelCallInput {
  callRef: EntityRef & { readonly type: 'abh.model-call' };
  usage: ModelCallUsage;
  rawResponseRef?: EntityRef;
}

export interface ModelResponseStorageInput {
  readonly retentionPolicyRef: EntityRef;
}

export interface FailModelCallInput {
  callRef: EntityRef & { readonly type: 'abh.model-call' };
  noEffectEvidenceRef?: EntityRef;
}

export type ReconcileModelCallInput = {
  callRef: EntityRef & { readonly type: 'abh.model-call' };
  verdict: 'Completed';
  usage: ModelCallUsage;
} | {
  callRef: EntityRef & { readonly type: 'abh.model-call' };
  verdict: 'Failed';
  noEffectEvidenceRef: EntityRef;
};

export interface ModelAdapterRequest {
  readonly callRef: EntityRef & { readonly type: 'abh.model-call' };
  readonly callerRef: EntityRef;
  readonly route: ModelRoute;
  readonly selectedModel: RegisteredName;
  readonly inputManifestRef: EntityRef & { readonly type: 'abh.context' };
  readonly inputDigest: Digest;
  readonly maxCostMicros?: number;
}

export interface ModelAdapterResult {
  readonly usage: ModelCallUsage;
  readonly rawResponse: unknown;
}

export interface ModelAdapterPort {
  call(request: ModelAdapterRequest, options: { readonly signal: AbortSignal }): Promise<ModelAdapterResult>;
}

export interface CallModelInput extends Omit<PrepareModelCallInput, 'callRef'> {
  readonly callRef: string;
  readonly signal: AbortSignal;
  readonly responseStorage: ModelResponseStorageInput;
  readonly outputValidator: (rawResponse: unknown) => Promise<void>;
}

export type ModelCallOutcome = 'Completed' | 'Failed' | 'Unknown';

export class ModelGatewayOwner {
  async prepare(tx: TenantTransaction, input: PrepareModelCallInput): Promise<ModelCallRecord> {
    const value = structuredClone(input), c = tx.context.tenant;
    contract('EntityRef', value.callRef); contract('EntityRef', value.routeRef); contract('EntityRef', value.callerRef);
    contract('EntityRef', value.inputManifestRef); contract('Digest', value.inputDigest); contract('RegisteredName', value.selectedModel);
    if (value.budget) {
      contract('EntityRef',value.budget.ledgerRef); contract('NonnegativeDecimal',value.budget.amount); contract('Time',value.budget.expiresAt);
      if (value.budget.ledgerRef.type !== 'abh.ledger' || value.budget.ledgerRef.version < 1) throw new CoreError('INVALID_ARGUMENT');
    }
    if (value.callRef.type !== 'abh.model-call' || value.routeRef.type !== 'abh.model-route'
      || value.inputManifestRef.type !== 'abh.context' || !['abh.invocation', 'abh.job'].includes(value.callerRef.type)
      || value.callRef.version !== 1 || value.routeRef.version < 1) throw new CoreError('INVALID_ARGUMENT');
    if (value.maxCostMicros !== undefined && (!Number.isSafeInteger(value.maxCostMicros) || value.maxCostMicros < 0)) throw new CoreError('INVALID_ARGUMENT');
    const [routeRow] = await tx.owner('ModelGateway')`SELECT record,version FROM core.model_routes
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.routeRef.id} AND deleted_at IS NULL`;
    if (!routeRow) throw new CoreError('RESOURCE_NOT_FOUND');
    if (Number(routeRow.version) !== value.routeRef.version) throw new CoreError('VERSION_CONFLICT');
    const route = contract('ModelRoute',routeRow.record);
    if (route.routeRef.id !== value.routeRef.id || route.resourceOrganizationId !== c.resourceOrganizationId
      || route.purposeOfUse !== c.purposeOfUse || !route.allowedModels.includes(value.selectedModel)) throw new CoreError('PRECONDITION_FAILED');
    if (value.maxCostMicros !== undefined && route.maxCostMicros !== undefined && value.maxCostMicros > route.maxCostMicros) throw new CoreError('LIMIT_EXCEEDED');
    const [existing] = await tx.owner('ModelGateway')`SELECT record,version FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.callRef.id} AND deleted_at IS NULL FOR UPDATE`;
    if (existing) {
      const prior = contract('ModelCallRecord',existing.record);
      if (prior.callRef.version !== Number(existing.version) || prior.routeRef.id !== route.routeRef.id
        || prior.selectedModel !== value.selectedModel || prior.inputManifestRef.id !== value.inputManifestRef.id
        || prior.inputDigest !== value.inputDigest) throw new CoreError('IDEMPOTENCY_CONFLICT');
      const [link]=await tx.owner('ModelGateway')`SELECT amount,budget_ledger_id FROM core.model_call_reservations
        WHERE resource_organization_id=${c.resourceOrganizationId} AND call_id=${value.callRef.id} AND deleted_at IS NULL`;
      if ((value.budget===undefined)!==(link===undefined)) throw new CoreError('IDEMPOTENCY_CONFLICT');
      if (link && (value.budget!.ledgerRef.id!==link.budget_ledger_id || value.budget!.amount!==link.amount)) throw new CoreError('IDEMPOTENCY_CONFLICT');
      return prior;
    }
    let reservationRef:EntityRef|undefined;
    if (value.budget) {
      const command=await budgetCommand('reserve',value), ledger=new LedgerOwner();
      const [reservation]=await ledger.reserveAll(tx,command,{requestRef:value.callRef,bindingRef:value.callerRef,
        expiresAt:value.budget.expiresAt,requirements:[{ledgerRef:value.budget.ledgerRef,amount:value.budget.amount}]});
      reservationRef=reservation!.reservationRef;
    }
    const call: ModelCallRecord = { callRef:value.callRef, resourceOrganizationId:c.resourceOrganizationId, routeRef:{...value.routeRef},
      selectedModel:value.selectedModel, inputManifestRef:value.inputManifestRef, inputDigest:value.inputDigest, status:'Prepared',
      createdAt:new Date().toISOString() };
    await tx.owner('ModelGateway')`INSERT INTO core.model_calls(resource_organization_id,id,workspace_id,purpose_names,record,route_id,status)
      VALUES (${c.resourceOrganizationId},${call.callRef.id},${c.workspaceId??null},ARRAY[${route.purposeOfUse}]::text[],
      ${JSON.stringify(call)}::text::jsonb,${route.routeRef.id},'Prepared')`;
    if (reservationRef) {
      await tx.owner('ModelGateway')`INSERT INTO core.model_call_reservations(resource_organization_id,id,workspace_id,purpose_names,call_id,reservation_id,budget_ledger_id,amount,status)
        VALUES (${c.resourceOrganizationId},${randomUUID()},${c.workspaceId??null},ARRAY[${route.purposeOfUse}]::text[],
          ${value.callRef.id},${reservationRef.id},${value.budget!.ledgerRef.id},${value.budget!.amount},'Linked')`;
    }
    return structuredClone(call);
  }

  async start(tx: TenantTransaction, callRef: EntityRef & { readonly type: 'abh.model-call' }): Promise<ModelCallRecord> {
    const value = contract('EntityRef',callRef), c = tx.context.tenant;
    if (value.type !== 'abh.model-call') throw new CoreError('INVALID_ARGUMENT');
    const [row] = await tx.owner('ModelGateway')`SELECT record,version,status FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.id} AND deleted_at IS NULL`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    if (Number(row.version) !== value.version || row.status !== 'Prepared') throw new CoreError('PRECONDITION_FAILED');
    const current = contract('ModelCallRecord',row.record), next = structuredClone({...current,status:'InFlight' as const,
      callRef:{...current.callRef,version:current.callRef.version+1}});
    const changed = await tx.owner('ModelGateway')`UPDATE core.model_calls SET status='InFlight',version=version+1,
      record=${JSON.stringify(next)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.id} AND version=${value.version} AND status='Prepared' RETURNING id`;
    if (!changed.length) throw new CoreError('VERSION_CONFLICT');
    return next;
  }

  async complete(tx: TenantTransaction, input: CompleteModelCallInput): Promise<ModelCallRecord> {
    const value = structuredClone(input), callRef = contract('EntityRef',value.callRef), c = tx.context.tenant;
    if (callRef.type !== 'abh.model-call' || !Number.isSafeInteger(value.usage.inputTokens) || value.usage.inputTokens < 0
      || !Number.isSafeInteger(value.usage.outputTokens) || value.usage.outputTokens < 0 || typeof value.usage.estimated !== 'boolean') throw new CoreError('INVALID_ARGUMENT');
    let rawResponseRef: EntityRef|undefined;
    if (value.rawResponseRef!==undefined) {
      rawResponseRef=contract('EntityRef',value.rawResponseRef);
      if (rawResponseRef.type!=='abh.artifact'||rawResponseRef.version!==2) throw new CoreError('INVALID_ARGUMENT');
    }
    const [row] = await tx.owner('ModelGateway')`SELECT record,version,status FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${callRef.id} AND deleted_at IS NULL FOR UPDATE`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    if (Number(row.version) !== callRef.version || row.status !== 'InFlight') throw new CoreError('PRECONDITION_FAILED');
    const current = contract('ModelCallRecord',row.record), next = structuredClone({...current,status:'Completed' as const,usage:value.usage,
      ...(rawResponseRef?{rawResponseRef}:{}) as Partial<ModelCallRecord>,
      callRef:{...current.callRef,version:current.callRef.version+1}});
    const changed = await tx.owner('ModelGateway')`UPDATE core.model_calls SET status='Completed',version=version+1,
      record=${JSON.stringify(next)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${callRef.id} AND version=${value.callRef.version} AND status='InFlight' RETURNING id`;
    if (!changed.length) throw new CoreError('VERSION_CONFLICT');
    return next;
  }

  async fail(tx: TenantTransaction, input: FailModelCallInput | (EntityRef & { readonly type: 'abh.model-call' })): Promise<ModelCallRecord> {
    const value = contract('EntityRef',typeof input==='object' && input!==null && 'callRef' in input ? input.callRef : input), c = tx.context.tenant;
    if (value.type !== 'abh.model-call') throw new CoreError('INVALID_ARGUMENT');
    const typedCallRef={...value,type:'abh.model-call' as const};
    const evidenceRef=input && typeof input==='object' && 'callRef' in input && input.noEffectEvidenceRef!==undefined
      ? contract('EntityRef',input.noEffectEvidenceRef):undefined;
    const [row] = await tx.owner('ModelGateway')`SELECT record,version,status FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.id} AND deleted_at IS NULL FOR UPDATE`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    if (Number(row.version) !== value.version || row.status !== 'InFlight') throw new CoreError('PRECONDITION_FAILED');
    const [link]=await tx.owner('ModelGateway')`SELECT reservation_id,status FROM core.model_call_reservations
      WHERE resource_organization_id=${c.resourceOrganizationId} AND call_id=${value.id} AND deleted_at IS NULL`;
    if (link && !evidenceRef) throw new CoreError('PRECONDITION_FAILED');
    if (link && evidenceRef) await this.settleBudget(tx,typedCallRef,{verdict:'Failed',noEffectEvidenceRef:evidenceRef});
    const current = contract('ModelCallRecord',row.record), next = structuredClone({...current,status:'Failed' as const,
      callRef:{...current.callRef,version:current.callRef.version+1}});
    const changed = await tx.owner('ModelGateway')`UPDATE core.model_calls SET status='Failed',version=version+1,
      record=${JSON.stringify(next)}::text::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.id} AND version=${value.version} AND status='InFlight' RETURNING id`;
    if (!changed.length) throw new CoreError('VERSION_CONFLICT');
    return next;
  }

  async reconcile(tx: TenantTransaction, input: ReconcileModelCallInput): Promise<ModelCallRecord> {
    const value=structuredClone(input), callRef=contract('EntityRef',value.callRef), c=tx.context.tenant;
    if (callRef.type!=='abh.model-call') throw new CoreError('INVALID_ARGUMENT');
    const typedCallRef={...callRef,type:'abh.model-call' as const};
    if (value.verdict==='Completed') {
      if (!Number.isSafeInteger(value.usage.inputTokens) || value.usage.inputTokens<0
        || !Number.isSafeInteger(value.usage.outputTokens) || value.usage.outputTokens<0
        || typeof value.usage.estimated!=='boolean') throw new CoreError('INVALID_ARGUMENT');
    } else {
      const evidenceRef=contract('EntityRef',value.noEffectEvidenceRef);
      if (evidenceRef.type!=='abh.artifact') throw new CoreError('INVALID_ARGUMENT');
    }
    const [row]=await tx.owner('ModelGateway')`SELECT status,version FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${callRef.id} AND deleted_at IS NULL`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    if (Number(row.version)!==callRef.version || row.status!=='InFlight') throw new CoreError('PRECONDITION_FAILED');
    if (value.verdict==='Completed') await this.settleBudget(tx,typedCallRef,{verdict:'Completed',usage:value.usage});
    return value.verdict==='Completed'
      ? this.complete(tx,{callRef:typedCallRef,usage:value.usage})
      : this.fail(tx,{callRef:typedCallRef,noEffectEvidenceRef:value.noEffectEvidenceRef});
  }

  async get(tx: TenantTransaction, id: string): Promise<ModelCallRecord> {
    contract('UUID',id); const c = tx.context.tenant;
    const [row] = await tx.owner('ModelGateway')`SELECT record,version FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names)`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    const record = contract('ModelCallRecord',row.record);
    if (record.callRef.id !== id || record.callRef.version !== Number(row.version)) throw new CoreError('INTERNAL_ERROR');
    return record;
  }

  async storeResponse(tx: TenantTransaction, input: {
    callRef: EntityRef & { readonly type: 'abh.model-call' };
    routeRef: EntityRef & { readonly type: 'abh.model-route' };
    inputManifestRef: EntityRef & { readonly type: 'abh.context' };
    selectedModel: RegisteredName;
    dataClass: RegisteredName;
    region: string;
    rawResponse: unknown;
  }, storage: ModelResponseStorageInput): Promise<EntityRef> {
    const value=structuredClone(input), policy=structuredClone(storage), c=tx.context.tenant;
    for (const ref of [value.callRef,value.routeRef,value.inputManifestRef,policy.retentionPolicyRef]) contract('EntityRef',ref);
    contract('RegisteredName',value.selectedModel);
    if (value.callRef.type!=='abh.model-call'||value.routeRef.type!=='abh.model-route'
      ||value.inputManifestRef.type!=='abh.context'||policy.retentionPolicyRef.type!=='abh.retention-policy') throw new CoreError('INVALID_ARGUMENT');
    const [row]=await tx.owner('ModelGateway')`SELECT record FROM core.model_calls
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${value.callRef.id} AND deleted_at IS NULL`;
    if (!row) throw new CoreError('RESOURCE_NOT_FOUND');
    const call=contract('ModelCallRecord',row.record);
    if (call.status!=='InFlight'||call.callRef.id!==value.callRef.id||call.routeRef.id!==value.routeRef.id
      ||call.inputManifestRef.id!==value.inputManifestRef.id||call.selectedModel!==value.selectedModel) throw new CoreError('PRECONDITION_FAILED');
    const dataClass=contract('RegisteredName',value.dataClass), purposeNames=[contract('RegisteredName',c.purposeOfUse)];
    if (typeof value.region!=='string'||value.region.length<1||value.region.length>128) throw new CoreError('INVALID_ARGUMENT');
    const document={kind:'ModelCallRawResponse',callRef:value.callRef,selectedModel:value.selectedModel,response:value.rawResponse};
    const payload={
      ownerRef:value.callRef,mediaType:'application/vnd.abh.raw-transport+json',
      dataClass,purposeNames,sourceRefs:[value.inputManifestRef,value.routeRef],
      region:value.region,retentionPolicyRef:policy.retentionPolicyRef,
      content:canonicalJson(document),
    };
    const command=await budgetCommand('store-response',{callRef:value.callRef});
    const artifact=await new InlineArtifactOwner().store(tx,command,payload,async refs=>{
      if (refs.length!==4||canonicalJson(refs[0])!==canonicalJson(value.callRef)
        ||canonicalJson(refs[1])!==canonicalJson(policy.retentionPolicyRef)
        ||canonicalJson(refs[2])!==canonicalJson(value.inputManifestRef)
        ||canonicalJson(refs[3])!==canonicalJson(value.routeRef)) throw new CoreError('PRECONDITION_FAILED');
    });
    return artifact.artifactRef;
  }

  async settleBudget(tx: TenantTransaction, callRef: EntityRef & { readonly type: 'abh.model-call' },
    input: {verdict:'Completed';usage:ModelCallUsage}|{verdict:'Failed';noEffectEvidenceRef:EntityRef}): Promise<void> {
    const c=tx.context.tenant;
    const [link]=await tx.owner('ModelGateway')`SELECT reservation_id,status FROM core.model_call_reservations
      WHERE resource_organization_id=${c.resourceOrganizationId} AND call_id=${callRef.id} AND deleted_at IS NULL`;
    if (!link) return;
    if (link.status!=='Linked') throw new CoreError('INTERNAL_ERROR');
    const ledgerOwner=new LedgerOwner(), reservation=await ledgerOwner.getReservation(tx,link.reservation_id);
    if (input.verdict==='Failed') {
      await ledgerOwner.release(tx,await budgetCommand('release',{callRef}),{reservationRef:reservation.reservationRef,
        evidence:{verdict:'ConfirmedNoEffect',evidenceRef:input.noEffectEvidenceRef}});
      await this.#markBudget(tx,callRef,'Released');
      return;
    }
    const ledger=await ledgerOwner.get(tx,reservation.ledgerRef.id);
    if (ledger.meteringMode==='capacity') {
      await ledgerOwner.release(tx,await budgetCommand('release',{callRef}),{reservationRef:reservation.reservationRef,
        evidence:{verdict:'Completed',evidenceRef:callRef}});
      await this.#markBudget(tx,callRef,'Released');
      return;
    }
    const usage=String(BigInt(input.usage.inputTokens+input.usage.outputTokens));
    await ledgerOwner.consume(tx,await budgetCommand('consume',{callRef}),{reservationRef:reservation.reservationRef,
      actualUsage:usage,receiptRef:callRef});
    await this.#markBudget(tx,callRef,'Consumed');
  }

  async #markBudget(tx: TenantTransaction, callRef: EntityRef & { readonly type: 'abh.model-call' },
    status:'Consumed'|'Released'):Promise<void> {
    const c=tx.context.tenant;
    await tx.owner('ModelGateway')`UPDATE core.model_call_reservations SET status=${status},version=version+1,
      updated_at=CURRENT_TIMESTAMP,updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND call_id=${callRef.id} AND status='Linked'`;
  }
}

async function budgetCommand(operation:'reserve'|'consume'|'release'|'store-response', input:{callRef:EntityRef}):Promise<CommandIdentity> {
  const type=`abh.model-gateway.${operation}`, payload={operation,callRef:input.callRef};
  return {commandId:randomUUID(),type,idempotencyKey:randomUUID(),digest:await inputDigest(payload)};
}

export async function callModel(database: Database, context: VerifiedContext, options: TransactionOptions,
  input: CallModelInput, adapter: ModelAdapterPort): Promise<{ record: ModelCallRecord; outcome: ModelCallOutcome }> {
  requireVerifiedContext(context);
  if (input.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
  const callRef = { type:'abh.model-call' as const, id:contract('UUID',input.callRef), version:1 };
  const owner = new ModelGatewayOwner();
  const prepareInput:PrepareModelCallInput = {callRef,routeRef:input.routeRef,callerRef:input.callerRef,
    selectedModel:input.selectedModel,inputManifestRef:input.inputManifestRef,inputDigest:input.inputDigest,
    ...(input.maxCostMicros===undefined?{}:{maxCostMicros:input.maxCostMicros}),
    ...(input.budget===undefined?{}:{budget:input.budget})};
  let record = await database.transaction(context,options,tx=>owner.prepare(tx,prepareInput));
  if (record.status === 'Completed') return {record,outcome:'Completed'};
  if (record.status === 'Failed') return {record,outcome:'Failed'};
  if (record.status !== 'Prepared') return {record,outcome:'Unknown'};
  record = await database.transaction(context,options,tx=>owner.start(tx,callRef));
  const routeRef = record.routeRef as EntityRef & { type:'abh.model-route' };
  let route:ModelRoute;
  try {
    route = await database.transaction(context,options,async tx=>{
      const [row]=await tx.owner('ModelGateway')`SELECT record FROM core.model_routes
        WHERE resource_organization_id=${context.tenant.resourceOrganizationId} AND id=${routeRef.id} AND deleted_at IS NULL`;
      if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
      return contract('ModelRoute',row.record);
    });
  } catch (error) {
    record = await database.transaction(context,options,tx=>owner.fail(tx,{...callRef,version:record.callRef.version}));
    throw error;
  }
  try {
    const result = await adapter.call({ callRef, callerRef:input.callerRef, route, selectedModel:record.selectedModel,
      inputManifestRef:record.inputManifestRef, inputDigest:record.inputDigest, ...(input.maxCostMicros===undefined?{}:{maxCostMicros:input.maxCostMicros}) },
      {signal:input.signal});
    await input.outputValidator(result.rawResponse);
    record = await database.transaction(context,options,async tx=>{
      const callVersion=record.callRef.version;
      const rawResponseRef=await owner.storeResponse(tx,{
        callRef,routeRef:record.routeRef as EntityRef & {type:'abh.model-route'},inputManifestRef:record.inputManifestRef,
        selectedModel:record.selectedModel,rawResponse:result.rawResponse,
        dataClass:route.dataClass,region:route.region,
      },input.responseStorage);
      await owner.settleBudget(tx,callRef,{verdict:'Completed',usage:result.usage});
      return owner.complete(tx,{callRef:{...callRef,version:callVersion},usage:result.usage,rawResponseRef});
    });
    return {record,outcome:'Completed'};
  } catch (error) {
    record = await database.transaction(context,options,tx=>owner.get(tx,callRef.id));
    return {record,outcome:'Unknown'};
  }
}
