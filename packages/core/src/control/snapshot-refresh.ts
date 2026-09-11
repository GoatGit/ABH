import {randomUUID} from 'node:crypto';
import type {AuthorizationSnapshotRecord,EntityRef,ReservationRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {currentIdentity} from '../identity/owner.ts';
import {ActionOwner} from '../execution/actions.ts';
import {OperationOwner} from '../execution/operations.ts';
import {lockAction,refKey,sameRef} from '../execution/shared.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {ResourceEnvelopeOwner} from '../resources/envelopes.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {ConnectionOwner} from '../identity/connections.ts';
import {PurposeOwner} from './purposes.ts';
import {readAuthorizationSnapshot,type SnapshotSourceChecks} from './snapshots.ts';
import {inspectActionExecutionSource} from './execution-source.ts';
import {approvalFenceRefs,verifyActionApproval} from '../human/approval-proof.ts';
import {PolicyOwner} from './policy-owner.ts';
import {InstalledPolicyAssets} from './policy-assets.ts';
import {ResourceFenceOwner} from '../execution/resource-fences.ts';

export interface IssuedActionRefresh {readonly kind:'IssuedActionRefresh'}
const issued=new WeakMap<IssuedActionRefresh,{tx:TenantTransaction;actionRef:EntityRef;snapshot:AuthorizationSnapshotRecord;complete:()=>void}>();
export function consumeActionRefresh(tx:TenantTransaction,ref:EntityRef,token:IssuedActionRefresh){
  const value=issued.get(token);if(!value||value.tx!==tx||!sameRef(value.actionRef,ref))throw new CoreError('AUTHORITY_REQUIRED');tx.assertActive();issued.delete(token);return value;
}
const vector=(refs:EntityRef[])=>canonicalJson(refs.map(refKey).sort());
const quantity=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole!)*10n**12n+BigInt(fraction.padEnd(12,'0'));};

/** Refresh the same principal/authority/intent/plan, preserving all existing resource responsibility and every Attempt. */
export class ActionSnapshotRefresh {
  readonly assets:InstalledPolicyAssets;
  readonly ttl:number;
  constructor(assets:InstalledPolicyAssets,ttlSeconds=60){this.assets=assets;this.ttl=ttlSeconds;if(!Number.isInteger(ttlSeconds)||ttlSeconds<5||ttlSeconds>300)throw new CoreError('INVALID_ARGUMENT');}
  async refreshOneShot(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,checks:SnapshotSourceChecks):Promise<IssuedActionRefresh>{
    contract('ActionRef',actionRef);const complete=tx.requireCompletion(),c=tx.context.tenant,actions=new ActionOwner(),operations=new OperationOwner(),releases=new StaticReleaseOwner(),resources=new ResourceEnvelopeOwner(),ledger=new LedgerOwner();
    if(c.purposeOfUse!=='abh.action.execute'||c.actor.type!=='Service')throw new CoreError('PURPOSE_DENIED');
    const action=await actions.get(tx,actionRef.id),intent=await actions.getIntent(tx,actionRef.id),plan=await operations.getPlan(tx,actionRef.id),pins=await releases.getPinSet(tx,action.actionRef);
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(!['Authorized','Executing'].includes(action.position.lifecycle)||!action.authorizationSnapshotRef||!action.executionAuthorityRef||!plan||!pins||!action.planRef||!action.pinSetRef)throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    if(c.actor.id!==action.executionPrincipalRef.id)throw new CoreError('FORBIDDEN');
    const previous=await readAuthorizationSnapshot(tx,action.authorizationSnapshotRef);
    if(previous.actionRef.id!==actionRef.id||!sameRef(previous.authorityRef,action.executionAuthorityRef)||!sameRef(previous.executionPrincipalRef,action.executionPrincipalRef)||previous.intentDigest!==intent.digest||previous.payloadDigest!==action.payloadDigest
      ||!sameRef(previous.planRef,plan.planRef)||previous.planDigest!==plan.digest||!sameRef(previous.pinSetRef,pins.pinSetRef)||previous.pinSetDigest!==pins.digest||!sameRef(action.planRef,plan.planRef)||!sameRef(action.pinSetRef,pins.pinSetRef)
      ||!sameRef(plan.pinSetRef,pins.pinSetRef)||plan.pinSetDigest!==pins.digest||plan.validatedAgainstPayloadDigest!==action.payloadDigest||previous.commitmentRefs.length)throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    const extra=await checks.fenceRefs(tx,action,intent,plan);
    const source=await inspectActionExecutionSource(tx,action,previous.authorityRef,async authority=>{
      if(authority.binding.kind!=='Action'||authority.stopConditions.length)throw new CoreError('AUTHORITY_REQUIRED');
      return [...extra,...plan.nodes.map(node=>node.connectionRef),authority.resourceEnvelopeRef,...authority.purposeRefs,...await approvalFenceRefs(tx,authority.issuanceEvidenceRef)];
    });
    const identity=await currentIdentity(tx);if(identity.scopeEpoch!==c.scopeEpoch||!sameRef(identity.principal.principalRef,action.executionPrincipalRef))throw new CoreError('EPOCH_REVOKED');
    if(canonicalJson(source.fences)!==canonicalJson(previous.epochVector))throw new CoreError('EPOCH_REVOKED');
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
    if(vector(sourceVersionRefs)!==vector(previous.sourceVersionRefs)||vector(source.grants.map(grant=>grant.grantRef))!==vector(previous.grantRefs))throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    for(const [ref,digest] of [[action.payloadArtifactRef,action.payloadDigest],...plan.nodes.map(node=>[node.payloadRef,node.payloadDigest])] as [EntityRef,string][]){
      const artifact=await new InlineArtifactOwner().read(tx,ref,record=>checks.artifact(tx,record));if(artifact.record.contentDigest!==digest)throw new CoreError('ACTION_DOMAIN_INVALID');
    }
    const resourceKey=(node:typeof plan.nodes[number])=>`${node.connectionRef.type}/${node.connectionRef.id}/${node.accountRef.type}/${node.accountRef.id}/${node.resourceKey}`;
    for(const node of [...new Map(plan.nodes.map(node=>[resourceKey(node),node])).values()].sort((a,b)=>resourceKey(a)<resourceKey(b)?-1:1))await new ResourceFenceOwner().lock(tx,node);
    const budget=await resources.resolve(tx,envelope,plan.impactUpperBound),reservations:ReservationRecord[]=[];
    for(const ref of previous.reservationRefs){const held=await ledger.getReservation(tx,ref.id);
      if(!sameRef(held.reservationRef,ref)||held.status!=='Held'||held.bindingRef.id!==actionRef.id||held.bindingRef.type!=='abh.action'||!sameRef(held.requestRef,previous.resourceOriginSnapshotRef))throw new CoreError('AUTHORIZATION_REFRESH_DENIED');reservations.push(held);}
    if(reservations.length!==budget.requirements.length||budget.requirements.some(req=>{const held=reservations.filter(reservation=>reservation.ledgerRef.id===req.ledgerRef.id);return held.length!==1||quantity(held[0]!.amount)!==quantity(req.amount);}))throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    const [clock]=await tx.owner('Control')`SELECT clock_timestamp() AS now`;
    const validUntil=new Date(Math.min(clock!.now.getTime()+this.ttl*1000,Date.parse(c.contextExpiresAt),Date.parse(intent.expiresAt),Date.parse(source.authority.validUntil),...source.grants.map(grant=>Date.parse(grant.validUntil)))).toISOString();
    if(Date.parse(validUntil)<=clock!.now.getTime())throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    const input=contract('ActionPolicyInput',{schemaVersion:'0.1.0',resourceOrganizationId:c.resourceOrganizationId,checkedAt:clock!.now.toISOString(),action,intentDigest:intent.digest,planDigest:plan.digest,
      executionAuthority:source.authority,grants:source.grants,purposeOfUse:c.purposeOfUse,fences:source.fences,impactUpperBound:plan.impactUpperBound,inputVersionRefs:sourceVersionRefs,ledgers:budget.ledgers});
    const evaluation=await new PolicyOwner().evaluate(tx,command,input,pins,this.assets,async()=>{if(canonicalJson(await actions.get(tx,actionRef.id))!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');});
    if(!evaluation.decision.allow)throw new CoreError('POLICY_DENIED');await checks.obligations(tx,evaluation.decision.obligationRefs);
    await lockAction(tx,actionRef.id);if(canonicalJson(await actions.get(tx,actionRef.id))!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
    const children=await operations.list(tx,actionRef.id);if(children.length!==plan.nodes.length||!children.some(child=>child.position.lifecycle==='Pending'))throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    const snapshotRef={type:'abh.authorization-snapshot',id:randomUUID(),version:1},reservationRefs:EntityRef[]=[];
    for(const held of reservations)reservationRefs.push((await ledger.extendHeld(tx,command,held.reservationRef,validUntil,snapshotRef)).reservationRef);
    const unsigned=contract('AuthorizationSnapshotRecord',{...previous,snapshotRef,actionRef,actorRef:c.actor,previousSnapshotRef:previous.snapshotRef,sourceVersionRefs,epochVector:source.fences,
      policyEvaluationRefs:evaluation.records.map(record=>record.evaluationRef),policyBindingRef:evaluation.bindingRef,reservationRefs,issuedAt:clock!.now.toISOString(),validUntil,digest:'sha256:'+'0'.repeat(64)});
    const snapshot=contract('AuthorizationSnapshotRecord',{...unsigned,digest:await digestContract('AuthorizationSnapshotRecord',unsigned)});
    await tx.owner('Control')`INSERT INTO control.authorization_snapshots(resource_organization_id,id,workspace_id,purpose_names,action_id,valid_until,record)
      VALUES (${c.resourceOrganizationId},${snapshotRef.id},${c.workspaceId??null},${intent.purposeNames},${actionRef.id},${validUntil},${JSON.stringify(snapshot)}::text::jsonb)`;
    await appendChange(tx,{command,target:snapshotRef,eventType:'abh.authorization-snapshot.created',changedFields:['previousSnapshotRef','validUntil','reservationRefs'],relatedRefs:[actionRef,previous.snapshotRef,...reservationRefs]});
    const [deadline]=await tx.owner('Control')`SELECT clock_timestamp()<${validUntil}::timestamptz AS valid`;if(!deadline!.valid)throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    const token=Object.freeze({kind:'IssuedActionRefresh' as const});issued.set(token,{tx,actionRef,snapshot,complete});return token;
  }
}
