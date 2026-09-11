import type {ActionRecord,ActionIntentRecord,AuthorizationSnapshotRecord,DispatchPermitRecord,EntityRef,OperationPlan,OperationPlanNode,OperationRecord,ReservationRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {ActionOwner} from '../execution/actions.ts';
import {OperationOwner} from '../execution/operations.ts';
import {ResourceFenceOwner} from '../execution/resource-fences.ts';
import {lockAction,refKey,sameRef} from '../execution/shared.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {ResourceEnvelopeOwner} from '../resources/envelopes.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {ConnectionOwner} from '../identity/connections.ts';
import {inspectActionExecutionSource} from './execution-source.ts';
import {approvalFenceRefs,verifyActionApproval} from '../human/approval-proof.ts';
import {PurposeOwner} from './purposes.ts';
import {ActionAuthorizationResolver,type SnapshotSourceChecks} from './snapshots.ts';
import {InstalledPolicyAssets} from './policy-assets.ts';
import {PolicyOwner} from './policy-owner.ts';
import {readPermit} from '../execution/dispatch-facts.ts';
import {resolveNodePayload,type InstalledPayloadBindings,type ResolvedNodePayload} from '../execution/payload-bindings.ts';
import {currentIdentity} from '../identity/owner.ts';

export interface DispatchSourceChecks extends SnapshotSourceChecks {
  /** Registered Connector capability/CTK, local target baseline and transport readiness. No external I/O inside T2. */
  target(tx:TenantTransaction,node:OperationPlanNode,plan:OperationPlan,payload:ResolvedNodePayload):Promise<void>;
  bindings?:InstalledPayloadBindings;
}
export interface IssuedDispatchAuthorization {readonly kind:'IssuedDispatchAuthorization'}
interface CurrentDispatch {
  tx:TenantTransaction;action:ActionRecord;intent:ActionIntentRecord;operation:OperationRecord;node:OperationPlanNode;
  snapshot:AuthorizationSnapshotRecord;policyEvaluationRefs:EntityRef[];validUntil:string;complete:()=>void;
  payloadRef:EntityRef;payloadDigest:string;dependencyRefs:EntityRef[];
  exitPermit?:DispatchPermitRecord;
}
const issued=new WeakMap<IssuedDispatchAuthorization,CurrentDispatch>();
export function consumeDispatchAuthorization(tx:TenantTransaction,operationRef:EntityRef,token:IssuedDispatchAuthorization):CurrentDispatch{
  const value=issued.get(token);if(!value||value.exitPermit||value.tx!==tx||!sameRef(value.operation.operationRef,operationRef))throw new CoreError('AUTHORITY_REQUIRED');
  tx.assertActive();issued.delete(token);return value;
}
export function consumeExitAuthorization(tx:TenantTransaction,permitRef:EntityRef,token:IssuedDispatchAuthorization):CurrentDispatch & {exitPermit:DispatchPermitRecord}{
  const value=issued.get(token);if(!value?.exitPermit||value.tx!==tx||!sameRef(value.exitPermit.permitRef,permitRef))throw new CoreError('AUTHORITY_REQUIRED');
  tx.assertActive();issued.delete(token);return {...value,exitPermit:value.exitPermit};
}
const vector=(refs:EntityRef[])=>refs.map(refKey).sort();
const quantity=(s:string)=>{const [w,f='']=s.split('.');return BigInt(w!)*10n**12n+BigInt(f.padEnd(12,'0'));};

/** T2 authorization for the initial finite one-shot path. Existing reservations are verified, never duplicated. */
export class DispatchAuthorizationResolver {
  readonly assets:InstalledPolicyAssets;
  constructor(assets:InstalledPolicyAssets){this.assets=assets;}
  async authorize(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,snapshotRef:EntityRef,checks:DispatchSourceChecks):Promise<IssuedDispatchAuthorization>{
    return this.#check(tx,command,operationRef,snapshotRef,checks);
  }
  async authorizeExit(tx:TenantTransaction,command:CommandIdentity,permitRef:EntityRef,checks:DispatchSourceChecks):Promise<IssuedDispatchAuthorization>{
    const permit=await readPermit(tx,permitRef),operation=await new OperationOwner().get(tx,permit.operationRef.id);
    return this.#check(tx,command,operation.operationRef,permit.snapshotRef,checks,permit);
  }
  async #check(tx:TenantTransaction,command:CommandIdentity,operationRef:EntityRef,snapshotRef:EntityRef,checks:DispatchSourceChecks,exitPermit?:DispatchPermitRecord):Promise<IssuedDispatchAuthorization>{
    contract('OperationRef',operationRef);const complete=tx.requireCompletion(),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.action.execute')throw new CoreError('PURPOSE_DENIED');
    const actions=new ActionOwner(),operations=new OperationOwner(),releases=new StaticReleaseOwner(),resources=new ResourceEnvelopeOwner(),ledger=new LedgerOwner();
    const operation=await operations.get(tx,operationRef.id),action=await actions.get(tx,operation.actionRef.id),intent=await actions.getIntent(tx,action.actionRef.id);
    if(!sameRef(operation.operationRef,operationRef))throw new CoreError('VERSION_CONFLICT');
    if(c.actor.type!=='Service'||c.actor.id!==action.executionPrincipalRef.id)throw new CoreError('FORBIDDEN');
    if(exitPermit){
      if(action.position.lifecycle!=='Executing'||operation.position.lifecycle!=='Dispatching'||operation.position.outcome!=='Pending'
        ||operation.attemptCount!==exitPermit.ordinal||operation.operationRef.version!==exitPermit.operationRef.version+1)throw new CoreError('PRECONDITION_FAILED');
    }else if(!['Authorized','Executing'].includes(action.position.lifecycle)||operation.position.lifecycle!=='Pending'||operation.attemptCount!==0)throw new CoreError('PRECONDITION_FAILED');
    const snapshot=await new ActionAuthorizationResolver(this.assets).get(tx,snapshotRef),plan=await operations.getPlan(tx,action.actionRef.id),pins=await releases.getPinSet(tx,action.actionRef);
    if(!action.authorizationSnapshotRef||!sameRef(action.authorizationSnapshotRef,snapshot.snapshotRef)||!action.executionAuthorityRef||!sameRef(action.executionAuthorityRef,snapshot.authorityRef)
      ||snapshot.actionRef.id!==action.actionRef.id||snapshot.intentDigest!==intent.digest||snapshot.payloadDigest!==action.payloadDigest||snapshot.purposeOfUse!==c.purposeOfUse
      ||!sameRef(snapshot.executionPrincipalRef,action.executionPrincipalRef)||!plan||!pins||!action.planRef||!action.pinSetRef||!sameRef(action.planRef,plan.planRef)||!sameRef(action.pinSetRef,pins.pinSetRef)
      ||!sameRef(snapshot.planRef,plan.planRef)||snapshot.planDigest!==plan.digest||!sameRef(snapshot.pinSetRef,pins.pinSetRef)||snapshot.pinSetDigest!==pins.digest
      ||!sameRef(operation.planRef,plan.planRef)||!sameRef(plan.pinSetRef,pins.pinSetRef)||plan.pinSetDigest!==pins.digest||plan.validatedAgainstPayloadDigest!==action.payloadDigest||snapshot.commitmentRefs.length)throw new CoreError('AUTHORITY_REQUIRED');
    const node=plan.nodes.find(node=>node.nodeKey===operation.nodeKey);if(!node)throw new CoreError('INTERNAL_ERROR');
    const extra=await checks.fenceRefs(tx,action,intent,plan);
    const source=await inspectActionExecutionSource(tx,action,snapshot.authorityRef,async authority=>{
      if(authority.binding.kind!=='Action'||authority.stopConditions.length)throw new CoreError('AUTHORITY_REQUIRED');
      return [...extra,...plan.nodes.map(node=>node.connectionRef),authority.resourceEnvelopeRef,...authority.purposeRefs,...await approvalFenceRefs(tx,authority.issuanceEvidenceRef)];
    });
    const identity=await currentIdentity(tx);
    if(identity.scopeEpoch!==c.scopeEpoch||!sameRef(identity.principal.principalRef,action.executionPrincipalRef))throw new CoreError('EPOCH_REVOKED');
    if(canonicalJson(source.fences)!==canonicalJson(snapshot.epochVector))throw new CoreError('EPOCH_REVOKED');
    const approval=await verifyActionApproval(tx,source.authority.issuanceEvidenceRef,action,plan),purpose=await new PurposeOwner().requireCurrent(tx,source.authority.purposeRefs),connections:EntityRef[]=[];
    for(const node of plan.nodes)connections.push((await new ConnectionOwner().assertNode(tx,node)).connectionRef);
    await releases.revalidate(tx,pins,actions.preparationRequest(tx,intent,[source.authority.authorityRef]));
    const envelope=await resources.get(tx,source.authority.resourceEnvelopeRef),additional=await checks.sources(tx,{action,intent,plan,pins,source,envelope});
    if(envelope.scopeRefs.some(scope=>!source.authority.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    const sources=new Map<string,EntityRef>();
    for(const ref of [...action.inputVersionRefs,...source.sourceVersions,envelope.envelopeRef,purpose.purposeRef,...connections,...approval,...additional]){
      contract('EntityRef',ref);const key=`${ref.type}/${ref.id}`,prior=sources.get(key);if(prior&&prior.version!==ref.version)throw new CoreError('VERSION_CONFLICT');sources.set(key,ref);
    }
    const sourceVersionRefs=[...sources.values()];
    if(canonicalJson(vector(sourceVersionRefs))!==canonicalJson(vector(snapshot.sourceVersionRefs))||canonicalJson(vector(source.grants.map(grant=>grant.grantRef)))!==canonicalJson(vector(snapshot.grantRefs)))throw new CoreError('VERSION_CONFLICT');
    for(const [ref,digest] of [[action.payloadArtifactRef,action.payloadDigest],...plan.nodes.map(node=>[node.payloadRef,node.payloadDigest])] as [EntityRef,string][]){
      const artifact=await new InlineArtifactOwner().read(tx,ref,record=>checks.artifact(tx,record));if(artifact.record.contentDigest!==digest)throw new CoreError('ACTION_DOMAIN_INVALID');
    }
    const slot=await new ResourceFenceOwner().lock(tx,node);
    if(slot?.blockedByReportRef)throw new CoreError('PRECONDITION_FAILED');
    if(exitPermit){
      if(!slot?.unresolvedOperationRef||slot.unresolvedOperationRef.id!==operationRef.id||slot.fencingToken!==exitPermit.resourceFencingToken||slot.fenceRef.id!==exitPermit.resourceFenceRef.id
        ||canonicalJson(exitPermit.connectorRef)!==canonicalJson(node.connectorRef)
        ||exitPermit.providerIdempotencyKey!==operation.providerIdempotencyKey)throw new CoreError('PRECONDITION_FAILED');
    }else if(slot?.unresolvedOperationRef)throw new CoreError('PRECONDITION_FAILED');
    const budget=await resources.resolve(tx,envelope,plan.impactUpperBound);const reservations:ReservationRecord[]=[];
    for(const ref of snapshot.reservationRefs){
      const current=await ledger.getReservation(tx,ref.id);
      if(!sameRef(current.reservationRef,ref)||current.status!=='Held'||current.bindingRef.type!=='abh.action'||current.bindingRef.id!==action.actionRef.id
        ||!sameRef(current.requestRef,snapshot.resourceOriginSnapshotRef))throw new CoreError('RESOURCE_EXHAUSTED');reservations.push(current);
    }
    if(reservations.length!==budget.requirements.length||budget.requirements.some(req=>{
      const held=reservations.filter(r=>r.ledgerRef.id===req.ledgerRef.id);return held.length!==1||quantity(held[0]!.amount)!==quantity(req.amount);
    }))throw new CoreError('RESOURCE_EXHAUSTED');
    await lockAction(tx,action.actionRef.id);
    if(canonicalJson(await actions.get(tx,action.actionRef.id))!==canonicalJson(action)||canonicalJson(await operations.get(tx,operationRef.id))!==canonicalJson(operation))throw new CoreError('VERSION_CONFLICT');
    const children=await operations.list(tx,action.actionRef.id);
    if(children.length!==plan.nodes.length||plan.nodes.some(node=>children.filter(child=>child.nodeKey===node.nodeKey).length!==1)
      ||node.dependsOn.some(key=>!children.some(child=>child.nodeKey===key&&child.position.lifecycle==='Closed'&&child.position.outcome==='Succeeded')))throw new CoreError('PRECONDITION_FAILED');
    const resolved=await resolveNodePayload(tx,node,plan,children,checks.bindings,checks.artifact);
    await checks.target(tx,node,plan,resolved);
    let payloadRef=node.payloadRef;
    if(exitPermit){
      const stored=await new InlineArtifactOwner().read(tx,exitPermit.payloadRef,record=>checks.artifact(tx,record));
      if(exitPermit.payloadDigest!==resolved.digest||stored.record.contentDigest!==resolved.digest
        ||canonicalJson(vector(exitPermit.dependencyRefs))!==canonicalJson(vector(resolved.dependencyRefs))
        ||(!node.inputBindings.length&&!sameRef(exitPermit.payloadRef,node.payloadRef)))throw new CoreError('OPERATION_FACT_CONFLICT');
      payloadRef=exitPermit.payloadRef;
    }else if(node.inputBindings.length){
      const template=resolved.template;
      const artifact=await new InlineArtifactOwner().store(tx,command,{ownerRef:operationRef,mediaType:'application/json',content:new TextDecoder().decode(resolved.bytes),
        dataClass:template.dataClass,purposeNames:resolved.purposeNames,region:template.region,retentionPolicyRef:template.retentionPolicyRef,
        sourceRefs:[node.payloadRef,plan.planRef,...resolved.dependencyRefs]},async()=>{ /* all exact sources read above under the Action lock */ });
      if(artifact.contentDigest!==resolved.digest)throw new CoreError('INTERNAL_ERROR');payloadRef=artifact.artifactRef;
    }
    const [clock]=await tx.owner('Control')`SELECT clock_timestamp() AS now`;
    const validUntil=new Date(Math.min(Date.parse(snapshot.validUntil),Date.parse(c.contextExpiresAt),Date.parse(intent.expiresAt),Date.parse(source.authority.validUntil),
      ...source.grants.map(grant=>Date.parse(grant.validUntil)),...reservations.map(r=>Date.parse(r.expiresAt)),...(exitPermit?[Date.parse(exitPermit.expiresAt)]:[]))).toISOString();
    if(Date.parse(validUntil)<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
    const input=contract('ActionPolicyInput',{schemaVersion:'0.1.0',resourceOrganizationId:c.resourceOrganizationId,checkedAt:clock!.now.toISOString(),action,intentDigest:intent.digest,planDigest:plan.digest,
      executionAuthority:source.authority,grants:source.grants,purposeOfUse:c.purposeOfUse,fences:source.fences,impactUpperBound:plan.impactUpperBound,inputVersionRefs:sourceVersionRefs,ledgers:budget.ledgers,dispatch:{operationRef,payloadDigest:resolved.digest,dependencyRefs:resolved.dependencyRefs}});
    const evaluation=await new PolicyOwner().evaluate(tx,command,input,pins,this.assets,async()=>{
      if(canonicalJson(await actions.get(tx,action.actionRef.id))!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
    });
    if(!evaluation.decision.allow)throw new CoreError('POLICY_DENIED');await checks.obligations(tx,evaluation.decision.obligationRefs);
    const token=Object.freeze({kind:'IssuedDispatchAuthorization' as const});issued.set(token,{tx,action,intent,operation,node,snapshot,payloadRef,payloadDigest:resolved.digest,dependencyRefs:resolved.dependencyRefs,policyEvaluationRefs:evaluation.records.map(record=>record.evaluationRef),validUntil,complete,...(exitPermit?{exitPermit}:{})});return token;
  }
}
