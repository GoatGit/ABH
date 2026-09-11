import {randomUUID} from 'node:crypto';
import type {ArtifactRecord,CapabilityRef,ClaimQueryExitPayload,EntityRef,ExecutionAuthority,QueryExitRecord,ResourceRequirement} from '@abh/contracts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {ExecutionAuthorityOwner} from '../control/authority.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {PurposeOwner} from '../control/purposes.ts';
import {ConnectionOwner} from '../identity/connections.ts';
import {ResourceEnvelopeOwner} from '../resources/envelopes.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import {ActionOwner} from './actions.ts';
import {OperationOwner} from './operations.ts';
import {readCurrentPermit} from './dispatch-facts.ts';
import {lockAction,sameRef} from './shared.ts';

/** Installed by trusted composition, never from a caller's query parameters. Cost is charged per committed exit, including crashes before invocation. */
export interface InstalledQueryPolicy {
  readonly policyRef:EntityRef;
  readonly connectorRef:CapabilityRef;
  readonly cost:ResourceRequirement;
  readonly timeoutMs:number;
  readonly minIntervalMs:number;
  /** Trusted replacement-query installation. Its evidence must bind this exact
   * Operation and both capabilities. It does not change dispatch pins or Permit. */
  readonly compatibility?:{
    evidenceRef:EntityRef;
    authorize(tx:TenantTransaction,record:ArtifactRecord,bytes:Uint8Array):Promise<void>;
  };
  /** Declare additional read/implementation scopes before the complete Control fence set locks. */
  fenceRefs?(tx:TenantTransaction,input:ClaimQueryExitPayload):Promise<readonly EntityRef[]>;
  /** Additional aggregate locks after Action and before WorkLease; no external effects. */
  lock?(tx:TenantTransaction):Promise<void>;
  /** Current issuance evidence, registered stop conditions and read-only Connector policy; denial must throw. */
  authorize(tx:TenantTransaction,authority:ExecutionAuthority,operationRef:EntityRef):Promise<void>;
}
const action='abh.operations.claim-query-exit';
export class QueryExitOwner {
  async admit(tx:TenantTransaction,input:ClaimQueryExitPayload,policy:InstalledQueryPolicy){
    contract('ClaimQueryExitPayload',input);contract('EntityRef',policy.policyRef);contract('CapabilityRef',policy.connectorRef);contract('ResourceRequirement',policy.cost);
    if(!Number.isSafeInteger(policy.timeoutMs)||policy.timeoutMs<1||policy.timeoutMs>30_000||!Number.isSafeInteger(policy.minIntervalMs)||policy.minIntervalMs<1||policy.minIntervalMs>86_400_000||/^0(?:\.0+)?$/.test(policy.cost.quantity))throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.operation.reconcile'||c.actor.type!=='Service')throw new CoreError('FORBIDDEN');
    const authorities=new ExecutionAuthorityOwner(),initial=await authorities.get(tx,input.queryAuthorityRef.id),operations=new OperationOwner();
    const first=await operations.get(tx,input.operationRef.id),plan=await operations.getPlan(tx,first.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===first.nodeKey);
    if(!node)throw new CoreError('OPERATION_FACT_CONFLICT');
    const extra=structuredClone(await policy.fenceRefs?.(tx,structuredClone(input))??[]);
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},
      input.queryAuthorityRef,initial.executionPrincipalRef,...initial.allowedProposerRefs,...initial.grantRefs,...initial.scopeRefs,...initial.purposeRefs,initial.resourceEnvelopeRef,node.connectionRef,...extra]);
    if(fences.some(f=>f.stopFlag))throw new CoreError('EPOCH_REVOKED');
    const authority=await authorities.get(tx,input.queryAuthorityRef.id);
    if(!sameRef(authority.authorityRef,input.queryAuthorityRef)||authority.resourceOrganizationId!==c.resourceOrganizationId||authority.status!=='Active'
      ||authority.executionPrincipalRef.id!==c.actor.id||await digestContract('ExecutionAuthority',authority)!==authority.issuanceDigest
      ||!authority.actionTypes.includes(action)||node.scopeRefs.some(scope=>!authority.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('AUTHORITY_REQUIRED');
    const grants=await assertCurrentGrants(tx,{objectRef:input.operationRef,scopeRefs:authority.scopeRefs,action},authority.grantRefs);
    await new PurposeOwner().requireCurrent(tx,authority.purposeRefs);
    await new ConnectionOwner().assertNode(tx,node);
    let compatibility:{evidenceRef:EntityRef;digest:string;expiresAt:string}|undefined;
    if(canonicalJson(policy.connectorRef)!==canonicalJson(node.connectorRef)){
      if(!policy.compatibility)throw new CoreError('PIN_INPUT_CONFLICT');
      const saved=await new InlineArtifactOwner().read(tx,policy.compatibility.evidenceRef,async()=>{});
      if(saved.record.mediaType!=='application/json'||!sameRef(saved.record.ownerRef,first.operationRef))throw new CoreError('PIN_INPUT_CONFLICT');
      let proof;try{proof=contract('CompatibleQueryEvidence',JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes)));}catch{throw new CoreError('PIN_INPUT_CONFLICT');}
      if(!proof||proof.kind!=='CompatibleQueryEvidence'||canonicalJson(proof.originalConnectorRef)!==canonicalJson(node.connectorRef)
        ||canonicalJson(proof.queryConnectorRef)!==canonicalJson(policy.connectorRef)||canonicalJson(proof.operationRef)!==canonicalJson(first.operationRef)
        ||canonicalJson(proof.connectionRef)!==canonicalJson(node.connectionRef)||canonicalJson(proof.accountRef)!==canonicalJson(node.accountRef))throw new CoreError('PIN_INPUT_CONFLICT');
      contract('Time',proof.expiresAt);
      await policy.compatibility.authorize(tx,structuredClone(saved.record),new Uint8Array(saved.bytes));
      compatibility={evidenceRef:saved.record.artifactRef,digest:saved.record.contentDigest,expiresAt:proof.expiresAt};
    }else if(policy.compatibility)throw new CoreError('INVALID_ARGUMENT');
    await policy.authorize(tx,authority,first.operationRef);
    const envelopes=new ResourceEnvelopeOwner(),envelope=await envelopes.get(tx,authority.resourceEnvelopeRef);
    const resources=await envelopes.resolve(tx,envelope,{scopeRefs:node.scopeRefs,resourceRequirements:[policy.cost],maxMoney:[],description:'One committed read-only query exit'});
    if(!resources.requirements.length||resources.ledgers.some(ledger=>ledger.meteringMode!=='cumulative'||ledger.unit!==policy.cost.unit))throw new CoreError('RESOURCE_EXHAUSTED');
    await lockAction(tx,first.actionRef.id);
    const operation=await operations.get(tx,first.operationRef.id),parent=await new ActionOwner().get(tx,first.actionRef.id);
    if(!sameRef(operation.operationRef,input.operationRef))throw new CoreError('VERSION_CONFLICT');
    if(operation.attemptCount<1||!['Dispatching','Observing'].includes(operation.position.lifecycle))throw new CoreError('PRECONDITION_FAILED');
    // Independent query authority must never fall back to the original dispatch authority.
    if(parent.executionAuthorityRef?.id===authority.authorityRef.id||!authority.allowedProposerRefs.some(ref=>ref.id===parent.proposedBy.id)
      ||(authority.binding.kind==='Action'&&(authority.binding.actionRef.id!==parent.actionRef.id||authority.binding.payloadDigest!==parent.payloadDigest)))throw new CoreError('AUTHORITY_REQUIRED');
    const permit=await readCurrentPermit(tx,operation);
    if(canonicalJson(permit.connectorRef)!==canonicalJson(node.connectorRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    await policy.lock?.(tx);
    const lease=await new WorkLeaseOwner().requireCurrent(tx,input.leaseRef,input.workerId,input.leaseFencingToken,operation.operationRef);
    if(compatibility){
      // Stabilize the evidence after aggregate locks. Earlier policy callbacks or
      // a concurrent tombstone must not leave a query relying on stale admission.
      const artifacts=new InlineArtifactOwner();
      await artifacts.lockSources(tx,[compatibility.evidenceRef]);
      const saved=await artifacts.read(tx,compatibility.evidenceRef,async()=>{});
      if(saved.record.contentDigest!==compatibility.digest)throw new CoreError('PIN_INPUT_CONFLICT');
      await policy.compatibility!.authorize(tx,structuredClone(saved.record),new Uint8Array(saved.bytes));
      const final=await artifacts.read(tx,compatibility.evidenceRef,async()=>{});
      if(canonicalJson(final.record)!==canonicalJson(saved.record))throw new CoreError('PIN_INPUT_CONFLICT');
    }
    const [clock]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;
    const now=clock!.now.getTime(),expiresAt=new Date(Math.min(now+policy.timeoutMs,compatibility?Date.parse(compatibility.expiresAt):Infinity,Date.parse(authority.validUntil),Date.parse(lease.leaseUntil),Date.parse(c.contextExpiresAt),...grants.map(grant=>Date.parse(grant.validUntil)))).toISOString();
    if(Date.parse(authority.validFrom)>now||Date.parse(expiresAt)<=now)throw new CoreError('AUTHORITY_REQUIRED');
    return {authority,operation,permit,node,resources,expiresAt,compatibility};
  }
  async claim(tx:TenantTransaction,command:CommandIdentity,input:ClaimQueryExitPayload,policy:InstalledQueryPolicy){
    const admitted=await this.admit(tx,input,policy),{authority,operation,permit,node,resources,expiresAt,compatibility}=admitted,c=tx.context.tenant;
    const [rate]=await tx.owner('OperationController')`SELECT EXISTS(SELECT 1 FROM execution.query_exits WHERE resource_organization_id=${c.resourceOrganizationId}
      AND operation_id=${operation.operationRef.id} AND (record->>'claimedAt')::timestamptz>clock_timestamp()-${policy.minIntervalMs}::double precision*interval '1 millisecond') AS limited`;
    if(rate!.limited)throw new CoreError('RESOURCE_EXHAUSTED');
    const exitRef={type:'abh.query-exit' as const,id:randomUUID(),version:1},ledger=new LedgerOwner();
    const reservations=await ledger.reserveAll(tx,command,{requestRef:exitRef,bindingRef:operation.operationRef,expiresAt,requirements:resources.requirements});
    const consumed=[];
    for(const reservation of reservations)consumed.push(await ledger.consume(tx,command,{reservationRef:reservation.reservationRef,actualUsage:reservation.amount,receiptRef:exitRef}));
    const [clock]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;
    const unsigned:QueryExitRecord={exitRef,resourceOrganizationId:c.resourceOrganizationId,operationRef:operation.operationRef,actionRef:permit.actionRef,
      queryAuthorityRef:authority.authorityRef,authorityDigest:authority.issuanceDigest,queryPolicyRef:policy.policyRef,connectionRef:node.connectionRef,accountRef:node.accountRef,
      connectorRef:permit.connectorRef,...(compatibility?{queryConnectorRef:policy.connectorRef,compatibilityEvidenceRef:contract('ArtifactRef',compatibility.evidenceRef),compatibilityEvidenceDigest:compatibility.digest}:{}),providerIdempotencyKey:permit.providerIdempotencyKey,payloadDigest:permit.payloadDigest,leaseRef:input.leaseRef,workerId:input.workerId,
      leaseFencingToken:input.leaseFencingToken,reservationRefs:consumed.map(r=>r.reservationRef),claimedAt:clock!.now.toISOString(),expiresAt,digest:'sha256:'+'0'.repeat(64)};
    const exit=contract('QueryExitRecord',{...unsigned,digest:await digestContract('QueryExitRecord',unsigned)});
    await tx.owner('OperationController')`INSERT INTO execution.query_exits(resource_organization_id,id,workspace_id,purpose_names,operation_id,record)
      VALUES (${c.resourceOrganizationId},${exitRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${operation.operationRef.id},${JSON.stringify(exit)}::text::jsonb)`;
    await appendChange(tx,{command,target:exitRef,eventType:'abh.query-exit.created',changedFields:['operationRef','queryAuthorityRef','reservationRefs'],relatedRefs:[operation.operationRef,authority.authorityRef,...exit.reservationRefs]});
    const [last]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;const remainingMs=Date.parse(expiresAt)-last!.now.getTime();
    if(remainingMs<=0)throw new CoreError('AUTHORITY_REQUIRED');return {exit,remainingMs};
  }
}

/** Historical evidence read; this does not authorize another query. */
export async function readQueryExit(tx:TenantTransaction,ref:EntityRef):Promise<QueryExitRecord>{
  contract('EntityRef',ref);if(ref.type!=='abh.query-exit')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
  const [row]=await tx.owner('OperationController')`SELECT record,version,operation_id FROM execution.query_exits WHERE resource_organization_id=${c.resourceOrganizationId}
    AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const exit=contract('QueryExitRecord',row.record);
  if(!sameRef(exit.exitRef,ref)||exit.exitRef.version!==Number(row.version)||exit.resourceOrganizationId!==c.resourceOrganizationId||exit.operationRef.id!==row.operation_id
    ||await digestContract('QueryExitRecord',exit)!==exit.digest)throw new CoreError('OPERATION_FACT_CONFLICT');return exit;
}
