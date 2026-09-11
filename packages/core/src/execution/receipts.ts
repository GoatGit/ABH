import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,EntityRef,NormalizedOperationObservation,OperationPlanNode,OperationReceiptRecord,OperationRecord,RecordOperationReceiptPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {ActionOwner} from './actions.ts';
import {lockAction,sameRef} from './shared.ts';
import {readAttempt,readPermit} from './dispatch-facts.ts';
import {decodeReceiptBytes} from './raw-transport.ts';

export interface ReceiptSourceChecks {
  /** Current observation-ingress admission, independent of the expired Worker lease and original execution Grant. */
  admit(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<void>;
  artifact(tx:TenantTransaction,record:ArtifactRecord):Promise<void>;
  /** Installed exact Connector verifies authenticated source and pure normalization against the actual raw bytes.
   * Query observations additionally require their independently verified read-only Query Authority. No remote I/O in this UoW. */
  normalize(tx:TenantTransaction,node:OperationPlanNode,raw:Uint8Array,normalized:NormalizedOperationObservation):Promise<void>;
}

/** Immutable evidence ingress. It never changes Operation outcome and does not require a still-current Worker lease. */
export class OperationReceiptOwner {
  async list(tx:TenantTransaction,operationId:string):Promise<OperationReceiptRecord[]>{
    contract('UUID',operationId);const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT id,version FROM execution.receipts WHERE resource_organization_id=${c.resourceOrganizationId}
      AND operation_id=${operationId} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) ORDER BY id LIMIT 101`;
    if(rows.length>100)throw new CoreError('LIMIT_EXCEEDED');const receipts:OperationReceiptRecord[]=[];
    for(const row of rows)receipts.push(await this.get(tx,{type:'abh.operation-receipt',id:row.id,version:Number(row.version)}));return receipts;
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<OperationReceiptRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.operation-receipt')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT record,version,operation_id,receipt_key FROM execution.receipts WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],receipt=contract('OperationReceiptRecord',row.record);
    if(!sameRef(receipt.receiptRef,ref)||receipt.resourceOrganizationId!==c.resourceOrganizationId||receipt.receiptRef.version!==Number(row.version)
      ||receipt.operationRef.id!==row.operation_id||receipt.receiptKey!==row.receipt_key)throw new CoreError('INTERNAL_ERROR');return receipt;
  }
  async observation(tx:TenantTransaction,receipt:OperationReceiptRecord,authorize:(tx:TenantTransaction,artifact:ArtifactRecord)=>Promise<void>):Promise<NormalizedOperationObservation>{
    const persisted=await this.get(tx,receipt.receiptRef);
    if(canonicalJson(persisted)!==canonicalJson(receipt))throw new CoreError('OPERATION_FACT_CONFLICT');
    const raw=await new InlineArtifactOwner().read(tx,receipt.rawArtifactRef,artifact=>authorize(tx,artifact));
    await decodeReceiptBytes(raw.record,raw.bytes);
    const {bytes,record}=await new InlineArtifactOwner().read(tx,receipt.normalizedObservationRef,artifact=>authorize(tx,artifact));
    if(await inputDigest({operationId:receipt.operationRef.id,receiptKey:receipt.receiptKey,rawDigest:raw.record.contentDigest,normalizedDigest:record.contentDigest})!==receipt.inputDigest)throw new CoreError('OPERATION_FACT_CONFLICT');
    try{return contract('NormalizedOperationObservation',JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}
    catch{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}
  }
  async record(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,input:RecordOperationReceiptPayload,checks:ReceiptSourceChecks):Promise<OperationReceiptRecord>{
    contract('OperationRef',operationRef);contract('RecordOperationReceiptPayload',input);const operations=new OperationOwner(),c=tx.context.tenant;
    const operation=await operations.get(tx,operationRef.id),plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!plan||!node||!sameRef(operation.planRef,plan.planRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    // Evidence may carry an older lifecycle version, but cannot invent a future operation version.
    if(operationRef.version>operation.operationRef.version)throw new CoreError('VERSION_CONFLICT');
    await checks.admit(tx,operation,node);
    const artifacts=new InlineArtifactOwner(),raw=await artifacts.read(tx,input.rawArtifactRef,record=>checks.artifact(tx,record));
    const normalized=await artifacts.read(tx,input.normalizedArtifactRef,record=>checks.artifact(tx,record));
    if(normalized.record.mediaType!=='application/json')throw new CoreError('RAW_RECEIPT_UNSUPPORTED');
    let observation:NormalizedOperationObservation;
    try{observation=contract('NormalizedOperationObservation',JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(normalized.bytes)));}catch{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}
    if(observation.operationId!==operationRef.id||observation.resourceOrganizationId!==c.resourceOrganizationId||!sameRef(observation.connectionRef,node.connectionRef)
      ||!sameRef(observation.accountRef,node.accountRef)||canonicalJson(observation.connectorRef)!==canonicalJson(node.connectorRef)||observation.providerIdempotencyKey!==operation.providerIdempotencyKey)throw new CoreError('OPERATION_FACT_CONFLICT');
    if(observation.source.kind==='Response'){
      const attempt=await readAttempt(tx,observation.source.attemptRef),permit=await readPermit(tx,attempt.permitRef);
      if(attempt.operationRef.id!==operationRef.id||permit.operationRef.id!==operationRef.id||permit.providerIdempotencyKey!==observation.providerIdempotencyKey
        ||canonicalJson(permit.connectorRef)!==canonicalJson(node.connectorRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    }
    await checks.normalize(tx,node,await decodeReceiptBytes(raw.record,raw.bytes),observation);
    if(input.receiptKey!==await inputDigest({sourceKey:observation.sourceKey,sourceVersion:observation.sourceVersion}))throw new CoreError('OPERATION_FACT_CONFLICT');
    const digest=await inputDigest({operationId:operationRef.id,receiptKey:input.receiptKey,rawDigest:raw.record.contentDigest,normalizedDigest:normalized.record.contentDigest});
    await lockAction(tx,operation.actionRef.id);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${operationRef.id}`,sql=tx.owner('OperationController');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const existing=await sql`SELECT record FROM execution.receipts WHERE resource_organization_id=${c.resourceOrganizationId} AND operation_id=${operationRef.id} AND receipt_key=${input.receiptKey} AND deleted_at IS NULL`;
    if(existing[0]){const receipt=contract('OperationReceiptRecord',existing[0].record);if(receipt.inputDigest!==digest)throw new CoreError('OPERATION_FACT_CONFLICT');return this.get(tx,receipt.receiptRef);}
    const intent=await new ActionOwner().getIntent(tx,operation.actionRef.id);
    if(!intent.purposeNames.includes(c.purposeOfUse))throw new CoreError('PURPOSE_DENIED');
    const receipt=contract('OperationReceiptRecord',{receiptRef:{type:'abh.operation-receipt',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
      operationRef,receiptKey:input.receiptKey,rawArtifactRef:input.rawArtifactRef,normalizedObservationRef:input.normalizedArtifactRef,observedAt:observation.observedAt,inputDigest:digest});
    await sql`INSERT INTO execution.receipts(resource_organization_id,id,workspace_id,purpose_names,operation_id,receipt_key,record)
      VALUES (${c.resourceOrganizationId},${receipt.receiptRef.id},${c.workspaceId??null},${intent.purposeNames},${operationRef.id},${input.receiptKey},${JSON.stringify(receipt)}::text::jsonb)`;
    await appendChange(tx,{command,target:receipt.receiptRef,eventType:'abh.operation-receipt.created',changedFields:['operationRef','rawArtifactRef','normalizedObservationRef','inputDigest'],relatedRefs:[operationRef,input.rawArtifactRef,input.normalizedArtifactRef]});return receipt;
  }
}
