import {currentIdentity} from '../identity/owner.ts';
import {randomUUID} from 'node:crypto';
import type {ActionIntentRecord,ActionRecord,ArtifactRecord,AuthorizationSnapshotRecord,EntityRef,OperationPlan,PinSet,ResourceEnvelopeRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {ActionOwner} from '../execution/actions.ts';
import {OperationOwner} from '../execution/operations.ts';
import {lockAction,sameRef} from '../execution/shared.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {ResourceEnvelopeOwner} from '../resources/envelopes.ts';
import {LedgerOwner} from '../resources/ledger.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {inspectActionExecutionSource,type ExecutionSource} from './execution-source.ts';
import {PolicyOwner} from './policy-owner.ts';
import {InstalledPolicyAssets} from './policy-assets.ts';
import {PurposeOwner} from './purposes.ts';
import {ConnectionOwner} from '../identity/connections.ts';
import {approvalFenceRefs,verifyActionApproval} from '../human/approval-proof.ts';

export interface SnapshotSourceChecks {
  /** Collect every inherited/control source fence before the Resolver locks, without acquiring aggregate locks. */
  fenceRefs(tx:TenantTransaction,action:ActionRecord,intent:ActionIntentRecord,plan:OperationPlan):Promise<EntityRef[]>;
  /** In the same transaction verify Domain source semantic versions, scope proof and finite one-shot ResourcePolicy.
   * Core directly revalidates whole approval, Purpose and Connection records. Continuous liabilities use a separate Commitment T1 path. */
  sources(tx:TenantTransaction,value:{action:ActionRecord;intent:ActionIntentRecord;plan:OperationPlan;pins:PinSet;source:ExecutionSource;envelope:ResourceEnvelopeRecord}):Promise<EntityRef[]>;
  artifact(tx:TenantTransaction,record:ArtifactRecord):Promise<void>;
  /** Current handlers must recognize and satisfy every returned obligation, including conflicts across policies. */
  obligations(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>;
}
export interface IssuedActionAuthorization {readonly kind:'IssuedActionAuthorization'}
const issued=new WeakMap<IssuedActionAuthorization,{tx:TenantTransaction;actionRef:EntityRef;snapshot:AuthorizationSnapshotRecord;complete:()=>void}>();

/** JSON-shaped snapshots or a result issued in another transaction cannot authorize an Action. */
export function consumeActionAuthorization(tx:TenantTransaction,actionRef:EntityRef,token:IssuedActionAuthorization):{snapshot:AuthorizationSnapshotRecord;complete:()=>void}{
  const value=issued.get(token);
  if(!value||value.tx!==tx||!sameRef(value.actionRef,actionRef))throw new CoreError('AUTHORITY_REQUIRED');
  tx.assertActive();issued.delete(token);return {snapshot:value.snapshot,complete:value.complete};
}

/** Internal first authorization for same-organization, one-shot Actions; the Action Owner commits the corresponding CAS in this UoW. */
export class ActionAuthorizationResolver {
  readonly #assets:InstalledPolicyAssets;
  readonly #ttl:number;
  constructor(assets:InstalledPolicyAssets,options:{snapshotTtlSeconds?:number}={}){
    this.#assets=assets;this.#ttl=options.snapshotTtlSeconds??60;
    if(!Number.isInteger(this.#ttl)||this.#ttl<5||this.#ttl>300)throw new CoreError('INVALID_ARGUMENT');
  }
  async authorizeOneShot(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,checks:SnapshotSourceChecks,assertion?:EntityRef):Promise<IssuedActionAuthorization>{
    contract('ActionRef',actionRef);const actions=new ActionOwner(),operations=new OperationOwner(),releases=new StaticReleaseOwner(),resources=new ResourceEnvelopeOwner(),c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.action.execute'||c.actor.type!=='Service')throw new CoreError('PURPOSE_DENIED');
    const complete=tx.requireCompletion();
    const action=await actions.get(tx,actionRef.id),intent=await actions.getIntent(tx,actionRef.id),plan=await operations.getPlan(tx,actionRef.id),pins=await releases.getPinSet(tx,action.actionRef);
    if(c.actor.id!==action.executionPrincipalRef.id)throw new CoreError('FORBIDDEN');
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(action.position.lifecycle!=='Validated'||action.executionAuthorityRef||!plan||!pins||!action.planRef||!action.pinSetRef||!sameRef(action.planRef,plan.planRef)||!sameRef(action.pinSetRef,pins.pinSetRef)
      ||!sameRef(plan.pinSetRef,pins.pinSetRef)||plan.pinSetDigest!==pins.digest||plan.validatedAgainstPayloadDigest!==action.payloadDigest)throw new CoreError('PRECONDITION_FAILED');
    const extra=await checks.fenceRefs(tx,action,intent,plan);
    const source=await inspectActionExecutionSource(tx,action,assertion,async authority=>{
      if(authority.binding.kind!=='Action'||authority.stopConditions.length)throw new CoreError('AUTHORITY_REQUIRED');
      return [...extra,...plan.nodes.map(node=>node.connectionRef),authority.resourceEnvelopeRef,...authority.purposeRefs,...await approvalFenceRefs(tx,authority.issuanceEvidenceRef)];
    });
    const identity=await currentIdentity(tx);
    if(identity.scopeEpoch!==c.scopeEpoch||!sameRef(identity.principal.principalRef,action.executionPrincipalRef))throw new CoreError('EPOCH_REVOKED');
    const approvalRefs=await verifyActionApproval(tx,source.authority.issuanceEvidenceRef,action,plan);
    const purpose=await new PurposeOwner().requireCurrent(tx,source.authority.purposeRefs);
    const connectionRefs:EntityRef[]=[];
    for(const node of plan.nodes)connectionRefs.push((await new ConnectionOwner().assertNode(tx,node)).connectionRef);
    await releases.revalidate(tx,pins,actions.preparationRequest(tx,intent,[source.authority.authorityRef]));
    const envelope=await resources.get(tx,source.authority.resourceEnvelopeRef);
    const additionalSources=await checks.sources(tx,{action,intent,plan,pins,source,envelope});
    for(const ref of additionalSources)contract('EntityRef',ref);
    if(envelope.scopeRefs.some(scope=>!source.authority.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    for(const [ref,digest] of [[action.payloadArtifactRef,action.payloadDigest],...plan.nodes.map(node=>[node.payloadRef,node.payloadDigest])] as [EntityRef,string][]){
      const artifact=await new InlineArtifactOwner().read(tx,ref,record=>checks.artifact(tx,record));
      if(artifact.record.contentDigest!==digest)throw new CoreError('ACTION_DOMAIN_INVALID');
    }
    const budget=await resources.resolve(tx,envelope,plan.impactUpperBound);
    const [clock]=await tx.owner('Control')`SELECT clock_timestamp() AS now`;
    const now=clock!.now.getTime(),validUntil=Math.min(now+this.#ttl*1000,Date.parse(c.contextExpiresAt),Date.parse(source.authority.validUntil),...source.grants.map(grant=>Date.parse(grant.validUntil)),Date.parse(intent.expiresAt));
    if(validUntil<=now)throw new CoreError('AUTHORITY_REQUIRED');
    const sources=new Map<string,EntityRef>();
    for(const ref of [...action.inputVersionRefs,...source.sourceVersions,envelope.envelopeRef,purpose.purposeRef,...connectionRefs,...approvalRefs,...additionalSources]){
      const key=`${ref.type}/${ref.id}`,prior=sources.get(key);
      if(prior&&prior.version!==ref.version)throw new CoreError('VERSION_CONFLICT');sources.set(key,ref);
    }
    const sourceVersionRefs=[...sources.values()];
    const policyInput=contract('ActionPolicyInput',{schemaVersion:'0.1.0',resourceOrganizationId:c.resourceOrganizationId,checkedAt:clock!.now.toISOString(),action,intentDigest:intent.digest,planDigest:plan.digest,
      executionAuthority:source.authority,grants:source.grants,purposeOfUse:c.purposeOfUse,fences:source.fences,impactUpperBound:plan.impactUpperBound,inputVersionRefs:sourceVersionRefs,ledgers:budget.ledgers});
    const evaluation=await new PolicyOwner().evaluate(tx,command,policyInput,pins,this.#assets,async()=>{
      // Source/control locks are held; compare the actual immutable inputs again after resource locks.
      const latest=await actions.get(tx,action.actionRef.id);
      if(canonicalJson(latest)!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
    });
    if(!evaluation.decision.allow)throw new CoreError('POLICY_DENIED');
    await checks.obligations(tx,evaluation.decision.obligationRefs);
    const snapshotRef={type:'abh.authorization-snapshot' as const,id:randomUUID(),version:1};
    const reservations=budget.requirements.length?await new LedgerOwner().reserveAll(tx,command,{requestRef:snapshotRef,bindingRef:action.actionRef,expiresAt:new Date(validUntil).toISOString(),requirements:budget.requirements,purposeNames:intent.purposeNames}):[];
    // Any concurrent cancellation/authorization loses CAS and rolls back the complete policy/resource work above.
    await lockAction(tx,action.actionRef.id);
    const latest=await actions.get(tx,action.actionRef.id);
    if(!sameRef(latest.actionRef,action.actionRef)||latest.position.lifecycle!=='Validated')throw new CoreError('VERSION_CONFLICT');
    const [deadline]=await tx.owner('Control')`SELECT clock_timestamp()<${new Date(validUntil).toISOString()}::timestamptz AS valid`;
    if(!deadline!.valid)throw new CoreError('AUTHORITY_REQUIRED');
    const unsigned=contract('AuthorizationSnapshotRecord',{snapshotRef,resourceOriginSnapshotRef:snapshotRef,resourceOrganizationId:c.resourceOrganizationId,actorRef:c.actor,actionRef:action.actionRef,executionPrincipalRef:action.executionPrincipalRef,
      authorityRef:source.authority.authorityRef,purposeOfUse:c.purposeOfUse,intentDigest:intent.digest,payloadDigest:action.payloadDigest,pinSetRef:pins.pinSetRef,pinSetDigest:pins.digest,planRef:plan.planRef,planDigest:plan.digest,
      sourceVersionRefs,grantRefs:source.grants.map(grant=>grant.grantRef),epochVector:source.fences,policyEvaluationRefs:evaluation.records.map(record=>record.evaluationRef),policyBindingRef:evaluation.bindingRef,
      reservationRefs:reservations.map(reservation=>reservation.reservationRef),commitmentRefs:[],issuedAt:clock!.now.toISOString(),validUntil:new Date(validUntil).toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const snapshot=contract('AuthorizationSnapshotRecord',{...unsigned,digest:await digestContract('AuthorizationSnapshotRecord',unsigned)});
    await tx.owner('Control')`INSERT INTO control.authorization_snapshots(resource_organization_id,id,workspace_id,purpose_names,action_id,valid_until,record)
      VALUES (${c.resourceOrganizationId},${snapshotRef.id},${c.workspaceId??null},${intent.purposeNames},${action.actionRef.id},${snapshot.validUntil},${JSON.stringify(snapshot)}::text::jsonb)`;
    await appendChange(tx,{command,target:snapshotRef,eventType:'abh.authorization-snapshot.created',changedFields:['authorityRef','planDigest','reservationRefs','validUntil'],relatedRefs:[action.actionRef,...snapshot.policyEvaluationRefs,...snapshot.reservationRefs]});
    const token=Object.freeze({kind:'IssuedActionAuthorization' as const});issued.set(token,{tx,actionRef:action.actionRef,snapshot,complete});return token;
  }
  get=readAuthorizationSnapshot;
}
export async function readAuthorizationSnapshot(tx:TenantTransaction,ref:EntityRef):Promise<AuthorizationSnapshotRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.authorization-snapshot')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('Control')`SELECT record,version FROM control.authorization_snapshots WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const snapshot=contract('AuthorizationSnapshotRecord',rows[0].record);
    if(!sameRef(snapshot.snapshotRef,ref)||snapshot.snapshotRef.version!==Number(rows[0].version)||snapshot.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('AuthorizationSnapshotRecord',snapshot)!==snapshot.digest)throw new CoreError('INTERNAL_ERROR');return snapshot;
  }
