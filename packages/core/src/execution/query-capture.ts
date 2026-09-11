import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,EntityRef,NormalizedOperationObservation,OperationPlanNode,OperationRecord,StoreInlineArtifactPayload,QueryCaptureRecord} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import {Database,type TenantTransaction,type TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {ActionOwner} from './actions.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {readQueryExit} from './query-exit.ts';
import {lockAction,sameRef} from './shared.ts';
import {requireQueryOrigin,type QueryObservation} from './query-transport.ts';
import {encodeRawTransport,rawTransportMediaType} from './raw-transport.ts';

export interface QueryCaptureChecks {
  /** Current independent observation-ingress permission, including replay. Expired query/execution grants do not authorize this ingress. */
  admit(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<void>;
  artifact(tx:TenantTransaction,record:ArtifactRecord):Promise<void>;
  /** Installed raw retention and data policy for this exact Connector/tenant. */
  storage(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<Pick<StoreInlineArtifactPayload,'dataClass'|'purposeNames'|'region'|'retentionPolicyRef'>>;
  /** Pure exact Connector parser. Unsupported input throws RAW_RECEIPT_UNSUPPORTED; no remote I/O. */
  normalize(node:OperationPlanNode,exit:QueryObservation['exit'],raw:Uint8Array,observedAt:string):Promise<NormalizedOperationObservation>;
}

/** One immutable capture per actual query exit; failures and unsupported responses never imply no effect. */
export class QueryCaptureOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<QueryCaptureRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.query-capture')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT record,version,operation_id,exit_id FROM execution.query_captures WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],record=contract('QueryCaptureRecord',row.record);
    if(!sameRef(record.captureRef,ref)||record.resourceOrganizationId!==c.resourceOrganizationId||record.captureRef.version!==Number(row.version)||record.operationRef.id!==row.operation_id
      ||record.exitRef.id!==row.exit_id||await digestContract('QueryCaptureRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async admit(tx:TenantTransaction,observation:QueryObservation,checks:QueryCaptureChecks){
    const origin=await requireQueryOrigin(observation),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const exit=await readQueryExit(tx,observation.exit.exitRef),operations=new OperationOwner(),operation=await operations.get(tx,exit.operationRef.id);
    if(canonicalJson(exit)!==canonicalJson(observation.exit))throw new CoreError('OPERATION_FACT_CONFLICT');
    const plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!plan||!node||!sameRef(plan.planRef,operation.planRef)||canonicalJson(node.connectorRef)!==canonicalJson(exit.connectorRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    await checks.admit(tx,operation,node);
    return {origin,exit,operation,node};
  }
  async record(tx:TenantTransaction,command:CommandIdentity,observation:QueryObservation,checks:QueryCaptureChecks):Promise<QueryCaptureRecord>{
    const {origin,exit,operation,node}=await this.admit(tx,observation,checks),c=tx.context.tenant;
    const storage=await checks.storage(tx,operation,node),intent=await new ActionOwner().getIntent(tx,operation.actionRef.id);
    if(!storage.purposeNames.includes(c.purposeOfUse)||storage.purposeNames.some(purpose=>!intent.purposeNames.includes(purpose)))throw new CoreError('PURPOSE_DENIED');
    await lockAction(tx,operation.actionRef.id);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${operation.operationRef.id}`,sql=tx.owner('OperationController');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const prior=await sql`SELECT id,version FROM execution.query_captures WHERE resource_organization_id=${c.resourceOrganizationId} AND exit_id=${exit.exitRef.id}`;
    if(prior[0])return this.get(tx,{type:'abh.query-capture',id:prior[0].id,version:Number(prior[0].version)});
    const artifacts=new InlineArtifactOwner();let rawArtifactRef:EntityRef|undefined,receiptRef:EntityRef|undefined,normalization:QueryCaptureRecord['normalization']='NotApplicable';
    if(observation.status==='Responded'){
      const rawBytes=new Uint8Array(observation.raw);if(await digestBytes(rawBytes)!==origin.rawDigest)throw new CoreError('OPERATION_FACT_CONFLICT');
      const raw=await artifacts.store(tx,command,{...storage,ownerRef:exit.exitRef,mediaType:rawTransportMediaType,content:await encodeRawTransport(rawBytes),sourceRefs:[exit.exitRef]},async()=>{});
      rawArtifactRef=raw.artifactRef;
      let normalized:NormalizedOperationObservation|undefined;
      try{
        const parsed=await checks.normalize(node,exit,new Uint8Array(rawBytes),origin.observedAt);
        try{normalized=contract('NormalizedOperationObservation',parsed);}catch{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}
      }catch(error){if(!(error instanceof CoreError)||error.code!=='RAW_RECEIPT_UNSUPPORTED')throw error;normalization='Unsupported';}
      if(normalized&&(normalized.source.kind!=='Query'||!sameRef(normalized.source.queryAuthorityRef,exit.queryAuthorityRef)||normalized.observedAt!==origin.observedAt
        ||normalized.resourceOrganizationId!==c.resourceOrganizationId||normalized.operationId!==exit.operationRef.id||!sameRef(normalized.connectionRef,node.connectionRef)
        ||!sameRef(normalized.accountRef,node.accountRef)||canonicalJson(normalized.connectorRef)!==canonicalJson(exit.connectorRef)||normalized.providerIdempotencyKey!==exit.providerIdempotencyKey)){
        normalization='Unsupported';normalized=undefined;
      }
      if(normalized){
        const artifact=await artifacts.store(tx,command,{...storage,ownerRef:exit.exitRef,mediaType:'application/json',content:canonicalJson(normalized),sourceRefs:[raw.artifactRef,exit.exitRef]},async()=>{});
        const receipt=await new OperationReceiptOwner().record(tx,command,exit.operationRef,{receiptKey:await inputDigest({sourceKey:normalized.sourceKey,sourceVersion:normalized.sourceVersion}),
          rawArtifactRef:raw.artifactRef,normalizedArtifactRef:artifact.artifactRef},{admit:async()=>{},artifact:checks.artifact,normalize:async(_tx,_node,rawBytes,current)=>{
            if(await digestBytes(rawBytes)!==origin.rawDigest||canonicalJson(current)!==canonicalJson(normalized))throw new CoreError('OPERATION_FACT_CONFLICT');
          }});
        receiptRef=receipt.receiptRef;normalization='Normalized';
      }
    }
    const unsigned=contract('QueryCaptureRecord',{captureRef:{type:'abh.query-capture',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,operationRef:exit.operationRef,
      exitRef:exit.exitRef,transportStatus:observation.status,normalization,observedAt:origin.observedAt,...(rawArtifactRef?{rawArtifactRef}:{}),...(receiptRef?{receiptRef}:{}),digest:'sha256:'+'0'.repeat(64)});
    const capture=contract('QueryCaptureRecord',{...unsigned,digest:await digestContract('QueryCaptureRecord',unsigned)});
    await sql`INSERT INTO execution.query_captures(resource_organization_id,id,workspace_id,purpose_names,operation_id,exit_id,record)
      VALUES (${c.resourceOrganizationId},${capture.captureRef.id},${c.workspaceId??null},${intent.purposeNames},${exit.operationRef.id},${exit.exitRef.id},${JSON.stringify(capture)}::text::jsonb)`;
    await appendChange(tx,{command,target:capture.captureRef,eventType:'abh.query-capture.created',changedFields:['transportStatus','normalization'],relatedRefs:[exit.operationRef,exit.exitRef,...(rawArtifactRef?[rawArtifactRef]:[]),...(receiptRef?[receiptRef]:[])]});return capture;
  }
}

/** Retry only evidence persistence after a failed capture transaction; never calls the Connector again. */
export async function captureQuery(database:Database,context:VerifiedContext,options:TransactionOptions,observation:QueryObservation,checks:QueryCaptureChecks):Promise<QueryCaptureRecord>{
  const origin=await requireQueryOrigin(observation),owner=new QueryCaptureOwner(),exit=observation.exit;
  const command={type:'abh.operations.capture-query',commandId:randomUUID(),idempotencyKey:`query-capture/${exit.exitRef.id}`,digest:await inputDigest({exitRef:exit.exitRef,status:observation.status,observedAt:origin.observedAt,...(origin.rawDigest?{rawDigest:origin.rawDigest}:{})})};
  const result=await database.transaction(context,options,tx=>executeCommand(tx,command,async()=>{await owner.admit(tx,observation,checks);},async()=>(await owner.record(tx,command,observation,checks)).captureRef));
  return database.transaction(context,options,tx=>owner.get(tx,result.receipt.resultRef));
}
