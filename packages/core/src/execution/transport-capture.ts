import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,EntityRef,NormalizedOperationObservation,OperationPlanNode,OperationRecord,StoreInlineArtifactPayload,TransportCaptureRecord} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import {Database,type TenantTransaction,type TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {ActionOwner} from './actions.ts';
import {DispatchOwner} from './dispatch.ts';
import {OperationReceiptOwner} from './receipts.ts';
import {readPermit} from './dispatch-facts.ts';
import {lockAction,sameRef} from './shared.ts';
import {requireTransportOrigin,type TransportObservation} from './transport.ts';
import {encodeRawTransport,rawTransportMediaType} from './raw-transport.ts';

export interface TransportCaptureChecks {
  /** Current independent observation-ingress permission, including replay. Never the original execution permission. */
  admit(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<void>;
  artifact(tx:TenantTransaction,record:ArtifactRecord):Promise<void>;
  /** Installed raw retention and data policy for this exact Connector/tenant. */
  storage(tx:TenantTransaction,operation:OperationRecord,node:OperationPlanNode):Promise<Pick<StoreInlineArtifactPayload,'dataClass'|'purposeNames'|'region'|'retentionPolicyRef'>>;
  /** Pure exact Connector parser. Unsupported input throws RAW_RECEIPT_UNSUPPORTED; no remote I/O. */
  normalize(node:OperationPlanNode,permit:TransportObservation['permit'],raw:Uint8Array,observedAt:string):Promise<NormalizedOperationObservation>;
}

/** One immutable capture per actual transport exit; failures and unsupported responses never imply no effect. */
export class TransportCaptureOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<TransportCaptureRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.transport-capture')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('OperationController')`SELECT record,version,attempt_id,exit_id FROM execution.transport_captures WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],record=contract('TransportCaptureRecord',row.record);
    if(!sameRef(record.captureRef,ref)||record.resourceOrganizationId!==c.resourceOrganizationId||record.captureRef.version!==Number(row.version)||record.attemptRef.id!==row.attempt_id
      ||record.exitRef.id!==row.exit_id||await digestContract('TransportCaptureRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async admit(tx:TenantTransaction,observation:TransportObservation,checks:TransportCaptureChecks){
    const origin=await requireTransportOrigin(observation),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
    const permit=await readPermit(tx,observation.permit.permitRef),operations=new OperationOwner(),operation=await operations.get(tx,permit.operationRef.id);
    if(canonicalJson(permit)!==canonicalJson(observation.permit))throw new CoreError('OPERATION_FACT_CONFLICT');
    const plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!plan||!node||!sameRef(plan.planRef,operation.planRef)||canonicalJson(node.connectorRef)!==canonicalJson(permit.connectorRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    await checks.admit(tx,operation,node);
    const exits=await tx.owner('OperationController')`SELECT record FROM execution.dispatch_exits WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${origin.exitRef.id}
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND deleted_at IS NULL`;
    if(exits.length!==1)throw new CoreError('OPERATION_FACT_CONFLICT');const exit=contract('DispatchExitRecord',exits[0]!.record);
    if(!sameRef(exit.exitRef,origin.exitRef)||!sameRef(exit.permitRef,permit.permitRef)||!sameRef(exit.attemptRef,permit.attemptRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    return {origin,permit,operation,node};
  }
  async record(tx:TenantTransaction,command:CommandIdentity,observation:TransportObservation,checks:TransportCaptureChecks):Promise<TransportCaptureRecord>{
    const {origin,permit,operation,node}=await this.admit(tx,observation,checks),c=tx.context.tenant;
    const storage=await checks.storage(tx,operation,node),intent=await new ActionOwner().getIntent(tx,operation.actionRef.id);
    if(!storage.purposeNames.includes(c.purposeOfUse)||storage.purposeNames.some(purpose=>!intent.purposeNames.includes(purpose)))throw new CoreError('PURPOSE_DENIED');
    await lockAction(tx,operation.actionRef.id);
    const key=`${c.resourceOrganizationId}/OperationController/abh.operation/${operation.operationRef.id}`,sql=tx.owner('OperationController');
    await tx.lock(4,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const prior=await sql`SELECT id,version FROM execution.transport_captures WHERE resource_organization_id=${c.resourceOrganizationId} AND attempt_id=${permit.attemptRef.id}`;
    if(prior[0])return this.get(tx,{type:'abh.transport-capture',id:prior[0].id,version:Number(prior[0].version)});
    const artifacts=new InlineArtifactOwner();let rawArtifactRef:EntityRef|undefined,receiptRef:EntityRef|undefined,normalization:TransportCaptureRecord['normalization']='NotApplicable';
    if(observation.status==='Responded'){
      const rawBytes=new Uint8Array(observation.raw);if(await digestBytes(rawBytes)!==origin.rawDigest)throw new CoreError('OPERATION_FACT_CONFLICT');
      const raw=await artifacts.store(tx,command,{...storage,ownerRef:permit.attemptRef,mediaType:rawTransportMediaType,content:await encodeRawTransport(rawBytes),sourceRefs:[permit.permitRef,origin.exitRef]},async()=>{});
      rawArtifactRef=raw.artifactRef;
      let normalized:NormalizedOperationObservation|undefined;
      try{
        const parsed=await checks.normalize(node,permit,new Uint8Array(rawBytes),origin.observedAt);
        try{normalized=contract('NormalizedOperationObservation',parsed);}catch{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}
      }catch(error){if(!(error instanceof CoreError)||error.code!=='RAW_RECEIPT_UNSUPPORTED')throw error;normalization='Unsupported';}
      if(normalized&&(normalized.source.kind!=='Response'||!sameRef(normalized.source.attemptRef,permit.attemptRef)||normalized.observedAt!==origin.observedAt
        ||normalized.resourceOrganizationId!==c.resourceOrganizationId||normalized.operationId!==permit.operationRef.id||!sameRef(normalized.connectionRef,node.connectionRef)
        ||!sameRef(normalized.accountRef,node.accountRef)||canonicalJson(normalized.connectorRef)!==canonicalJson(permit.connectorRef)||normalized.providerIdempotencyKey!==permit.providerIdempotencyKey)){
        normalization='Unsupported';normalized=undefined;
      }
      if(normalized){
        const artifact=await artifacts.store(tx,command,{...storage,ownerRef:permit.attemptRef,mediaType:'application/json',content:canonicalJson(normalized),sourceRefs:[raw.artifactRef,permit.permitRef]},async()=>{});
        const receipt=await new OperationReceiptOwner().record(tx,command,permit.operationRef,{receiptKey:await inputDigest({sourceKey:normalized.sourceKey,sourceVersion:normalized.sourceVersion}),
          rawArtifactRef:raw.artifactRef,normalizedArtifactRef:artifact.artifactRef},{admit:async()=>{},artifact:checks.artifact,normalize:async(_tx,_node,rawBytes,current)=>{
            if(await digestBytes(rawBytes)!==origin.rawDigest||canonicalJson(current)!==canonicalJson(normalized))throw new CoreError('OPERATION_FACT_CONFLICT');
          }});
        receiptRef=receipt.receiptRef;normalization='Normalized';
      }
    }
    const observations=await new DispatchOwner().observations(tx,permit.attemptRef),last=observations.at(-1);if(!last)throw new CoreError('OPERATION_FACT_CONFLICT');
    let observationRef=last.observationRef;
    if(last.status==='Created'||last.status==='Sent'){
      const record=contract('AttemptObservationRecord',{observationRef:{type:'abh.attempt-observation',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,attemptRef:permit.attemptRef,
        sequence:last.sequence+1,status:observation.status,observedAt:origin.observedAt,evidenceRefs:[origin.exitRef,...(rawArtifactRef?[rawArtifactRef]:[]),...(receiptRef?[receiptRef]:[])]});
      await sql`INSERT INTO execution.attempt_observations(resource_organization_id,id,workspace_id,purpose_names,attempt_id,sequence,status,record)
        VALUES (${c.resourceOrganizationId},${record.observationRef.id},${c.workspaceId??null},${intent.purposeNames},${permit.attemptRef.id},${record.sequence},${record.status},${JSON.stringify(record)}::text::jsonb)`;
      await appendChange(tx,{command,target:record.observationRef,eventType:'abh.attempt-observation.created',changedFields:['status','evidenceRefs'],relatedRefs:[permit.attemptRef,...record.evidenceRefs]});observationRef=record.observationRef;
    }
    const unsigned=contract('TransportCaptureRecord',{captureRef:{type:'abh.transport-capture',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,attemptRef:permit.attemptRef,
      exitRef:origin.exitRef,transportStatus:observation.status,normalization,observationRef,observedAt:origin.observedAt,...(rawArtifactRef?{rawArtifactRef}:{}),...(receiptRef?{receiptRef}:{}),digest:'sha256:'+'0'.repeat(64)});
    const capture=contract('TransportCaptureRecord',{...unsigned,digest:await digestContract('TransportCaptureRecord',unsigned)});
    await sql`INSERT INTO execution.transport_captures(resource_organization_id,id,workspace_id,purpose_names,attempt_id,exit_id,record)
      VALUES (${c.resourceOrganizationId},${capture.captureRef.id},${c.workspaceId??null},${intent.purposeNames},${permit.attemptRef.id},${origin.exitRef.id},${JSON.stringify(capture)}::text::jsonb)`;
    await appendChange(tx,{command,target:capture.captureRef,eventType:'abh.transport-capture.created',changedFields:['transportStatus','normalization','observationRef'],relatedRefs:[permit.attemptRef,origin.exitRef,observationRef,...(rawArtifactRef?[rawArtifactRef]:[]),...(receiptRef?[receiptRef]:[])]});return capture;
  }
}

/** Retry only evidence persistence after a failed capture transaction; never calls the Connector again. */
export async function captureTransport(database:Database,context:VerifiedContext,options:TransactionOptions,observation:TransportObservation,checks:TransportCaptureChecks):Promise<TransportCaptureRecord>{
  const origin=await requireTransportOrigin(observation),owner=new TransportCaptureOwner();
  const command={type:'abh.operations.capture-transport',commandId:randomUUID(),idempotencyKey:`capture/${origin.exitRef.id}`,digest:await inputDigest({exitRef:origin.exitRef,permitRef:observation.permit.permitRef,status:observation.status,observedAt:origin.observedAt,...(origin.rawDigest?{rawDigest:origin.rawDigest}:{})})};
  const result=await database.transaction(context,options,tx=>executeCommand(tx,command,async()=>{await owner.admit(tx,observation,checks);},async()=>(await owner.record(tx,command,observation,checks)).captureRef));
  return database.transaction(context,options,tx=>owner.get(tx,result.receipt.resultRef));
}
