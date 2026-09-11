import type {ArtifactRecord,CompatibleQueryEvidence,EntityRef,RecordCompatibleQueryEvidenceCommand,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {ConnectionOwner} from '../identity/connections.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {OperationOwner} from './operations.ts';
import {readCurrentPermit} from './dispatch-facts.ts';
import {lockAction,sameRef} from './shared.ts';

export interface CompatibleQueryEvidenceAdmission {
 /** Declare review, CTK, trust and business scopes before any aggregate locks. */
 fenceRefs(tx:TenantTransaction,input:RecordCompatibleQueryEvidenceCommand['payload'],options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Required trusted governance: prove this exact replacement's applicable CTK,
  * isolation and read-only semantics from the actual reviewed evidence. The
  * review is inert data, never executable authority or a caller-approved flag. */
 review(tx:TenantTransaction,evidence:CompatibleQueryEvidence,record:ArtifactRecord,bytes:Uint8Array,options:TransactionOptions):Promise<void>;
 /** Current visibility/ownership, retention and region policy; also on replay. */
 storage(tx:TenantTransaction,input:StoreInlineArtifactPayload,options:TransactionOptions):Promise<void>;
}

/** Governed evidence publication only. Each later query still needs current
 * independent Authority, budget, Lease and an Enabled compatible implementation. */
export async function recordCompatibleQueryEvidence(database:Database,context:VerifiedContext,options:TransactionOptions,
 supplied:RecordCompatibleQueryEvidenceCommand,grantRefs:readonly EntityRef[],admission:CompatibleQueryEvidenceAdmission){
 requireVerifiedContext(context);
 const command=contract('RecordCompatibleQueryEvidenceCommand',structuredClone(supplied)),input=command.payload,limits={...options},grants=structuredClone(grantRefs);
 const c=context.tenant;
 if(command.target.id!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(!['Human','Service'].includes(c.actor.type)||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('PURPOSE_DENIED');
 const fences=admission.fenceRefs.bind(admission),review=admission.review.bind(admission),storage=admission.storage.bind(admission);
 const identity={type:command.type,commandId:command.commandId,idempotencyKey:command.idempotencyKey,digest:await digestCommandIntent(command)};
 const payload=contract('StoreInlineArtifactPayload',{...input.retention,ownerRef:input.evidence.operationRef,mediaType:'application/json',content:canonicalJson(input.evidence),purposeNames:['abh.operation.reconcile'],sourceRefs:[input.reviewRef]});
 return database.transaction(context,limits,async tx=>{
  const work={...limits,signal:AbortSignal.any([limits.signal,tx.signal])},artifacts=new InlineArtifactOwner(),operations=new OperationOwner(),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const extra=structuredClone(await boundedCallback(opts=>fences(tx,structuredClone(input),opts),work));
  const assess=async()=>{
   const locked=await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,input.evidence.connectionRef,...extra]);
   if(locked.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:identity.type},grants);
   const operation=await operations.get(tx,input.evidence.operationRef.id);
   await lockAction(tx,operation.actionRef.id);
   const current=await operations.get(tx,input.evidence.operationRef.id);
   if(!sameRef(current.operationRef,input.evidence.operationRef))throw new CoreError('VERSION_CONFLICT');
   if(current.attemptCount<1||!['Dispatching','Observing'].includes(current.position.lifecycle))throw new CoreError('PRECONDITION_FAILED');
   const plan=await operations.getPlan(tx,current.actionRef.id),node=plan?.nodes.find(value=>value.nodeKey===current.nodeKey);
   if(!node||canonicalJson(node.connectorRef)!==canonicalJson(input.evidence.originalConnectorRef)
    ||!sameRef(node.connectionRef,input.evidence.connectionRef)||!sameRef(node.accountRef,input.evidence.accountRef))throw new CoreError('PIN_INPUT_CONFLICT');
   const permit=await readCurrentPermit(tx,current);
   if(canonicalJson(permit.connectorRef)!==canonicalJson(node.connectorRef))throw new CoreError('OPERATION_FACT_CONFLICT');
   await new ConnectionOwner().assertNode(tx,node);
   await artifacts.lockSources(tx,[input.reviewRef]);
   const saved=await artifacts.read(tx,input.reviewRef,async()=>{});
   if(saved.record.mediaType!=='application/json'||!sameRef(saved.record.ownerRef,current.operationRef))throw new CoreError('PIN_INPUT_CONFLICT');
   await boundedCallback(opts=>review(tx,structuredClone(input.evidence),structuredClone(saved.record),new Uint8Array(saved.bytes),opts),work);
   await boundedCallback(opts=>storage(tx,structuredClone(payload),opts),work);
   const final=await artifacts.read(tx,input.reviewRef,async()=>{});
   if(canonicalJson(final.record)!==canonicalJson(saved.record))throw new CoreError('VERSION_CONFLICT');
   if(canonicalJson(await operations.get(tx,current.operationRef.id))!==canonicalJson(current))throw new CoreError('VERSION_CONFLICT');
   await new ConnectionOwner().assertNode(tx,node);
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:identity.type},grants);
   const [clock]=await tx.owner('ReconciliationService')`SELECT clock_timestamp() AS now`;
   if(Date.parse(input.evidence.expiresAt)<=clock!.now.getTime())throw new CoreError('PRECONDITION_FAILED');
   tx.assertActive();
  };
  const result=await executeCommand(tx,identity,assess,async()=>{
   const saved=await artifacts.store(tx,identity,payload,async()=>{});await assess();return saved.artifactRef;
  });
  const saved=await artifacts.read(tx,result.receipt.resultRef,async()=>{});
  if(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes)!==payload.content||!sameRef(saved.record.ownerRef,payload.ownerRef)
   ||canonicalJson(saved.record.sourceRefs)!==canonicalJson(payload.sourceRefs)||saved.record.mediaType!==payload.mediaType
   ||saved.record.dataClass!==payload.dataClass||saved.record.region!==payload.region||!sameRef(saved.record.retentionPolicyRef,payload.retentionPolicyRef)
   ||canonicalJson(saved.record.purposeNames)!==canonicalJson(payload.purposeNames))throw new CoreError('PIN_INPUT_CONFLICT');
  return {artifactRef:saved.record.artifactRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
