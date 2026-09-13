import {consumeActionRefresh,type IssuedActionRefresh} from '../control/snapshot-refresh.ts';
import {readAttempt,readPermit} from './dispatch-facts.ts';
import {consumeActionResult,type IssuedActionResult} from './action-results.ts';
import {consumeActionCleanup,type IssuedActionCleanup} from './action-cleanup.ts';
import {randomUUID} from 'node:crypto';
import type {ActionIntentRecord,ActionRecord,ArtifactRecord,EntityRef,ImpactUpperBound,OperationPlan,ProposeActionPayload,ResolveAndPinRequest} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {lifecyclePurposes} from '../data/purposes.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {lockFences} from '../control/fences.ts';
import {consumeActionAuthorization,type IssuedActionAuthorization} from '../control/snapshots.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from './operations.ts';
import {assertImpactBound,assertResourceBound,lockAction,sameRef} from './shared.ts';

/** Resolved from a trusted registered action handler, never a public request body. */
export interface ActionDefinition {
  actionType:string;
  executionPrincipalRef:ActionRecord['executionPrincipalRef'];
  completionPolicyRef:EntityRef;
  riskClass:string;
  requiredBehaviorSlots:string[];
  maxOperations:number;
  intentExpirySeconds:number;
  purposeNames:string[];
  /** Trusted handler may set this only for a separately governed safety-stop purpose. */
  safetyStop?:boolean;
}
export interface ActionPreparationChecks {
  /** Acquire current preparation/source fences in global order before any aggregate locks. */
  lock(tx:TenantTransaction):Promise<void>;
  artifact(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
  proposal(tx:TenantTransaction,payload:ProposeActionPayload,definition:ActionDefinition):Promise<ImpactUpperBound>;
  domain(tx:TenantTransaction,action:ActionRecord,intent:ActionIntentRecord,evidence:EntityRef):Promise<void>;
  plan(tx:TenantTransaction,plan:OperationPlan,intent:ActionIntentRecord):Promise<void>;
}

/** Internal preparation path. Current caller grants and registered handlers are required at composition. */
export class ActionOwner {
  readonly #artifacts=new InlineArtifactOwner();
  readonly #releases=new StaticReleaseOwner();
  readonly #operations=new OperationOwner();
  async get(tx:TenantTransaction,id:string):Promise<ActionRecord>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('ActionEngine')`SELECT record,version,lifecycle,outcome FROM execution.actions WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('ActionRecord',rows[0].record);
    if(record.actionRef.id!==id||record.actionRef.version!==Number(rows[0].version)||record.resourceOrganizationId!==c.resourceOrganizationId
      ||record.position.lifecycle!==rows[0].lifecycle||record.position.outcome!==rows[0].outcome)throw new CoreError('INTERNAL_ERROR');
    return record;
  }
  async getIntent(tx:TenantTransaction,id:string):Promise<ActionIntentRecord>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('ActionEngine')`SELECT record FROM execution.action_intents WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('ActionIntentRecord',rows[0].record);
    if(record.actionRef.id!==id||record.actionRef.version!==1||record.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('ActionIntentRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return record;
  }
  async #unexpired(tx:TenantTransaction,intent:ActionIntentRecord):Promise<void>{
    const [row]=await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    if(Date.parse(intent.expiresAt)<=row!.now.getTime())throw new CoreError('PRECONDITION_FAILED');
  }
  async #payload(tx:TenantTransaction,action:ActionRecord,checks:Pick<ActionPreparationChecks,'artifact'>):Promise<void>{
    const payload=await this.#artifacts.read(tx,action.payloadArtifactRef,record=>checks.artifact(tx,record));
    if(payload.record.contentDigest!==action.payloadDigest)throw new CoreError('ACTION_DOMAIN_INVALID');
  }
  async propose(tx:TenantTransaction,command:CommandIdentity,payload:ProposeActionPayload,definition:ActionDefinition,checks:Pick<ActionPreparationChecks,'lock'|'artifact'|'proposal'>):Promise<ActionRecord>{
    contract('ProposeActionPayload',payload);
    if(definition.actionType!==payload.actionType||!Number.isInteger(definition.intentExpirySeconds)||definition.intentExpirySeconds<1||definition.intentExpirySeconds>86400)throw new CoreError('INVALID_ARGUMENT');
    if(definition.safetyStop===true&&!definition.purposeNames.includes('abh.action.safety-stop'))throw new CoreError('PURPOSE_DENIED');
    await checks.lock(tx);const c=tx.context.tenant,sql=tx.owner('ActionEngine');
    const purposeNames=lifecyclePurposes(definition.purposeNames,c.purposeOfUse);
    const impact=contract('ImpactUpperBound',await checks.proposal(tx,payload,definition));
    const service=await tx.owner('Identity')`SELECT p.id FROM identity.principals p JOIN identity.memberships m
      ON m.resource_organization_id=p.resource_organization_id AND m.principal_id=p.id WHERE p.resource_organization_id=${c.resourceOrganizationId}
      AND p.id=${definition.executionPrincipalRef.id} AND p.version=${definition.executionPrincipalRef.version} AND p.identity_kind='Service'
      AND p.status='Active' AND m.status='Active' AND p.deleted_at IS NULL AND m.deleted_at IS NULL`;
    if(!service[0])throw new CoreError('AUTHORITY_REQUIRED');
    const artifact=await this.#artifacts.read(tx,payload.payloadRef,record=>checks.artifact(tx,record));
    const action=contract('ActionRecord',{actionRef:{type:'abh.action',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
      sourceCommandRef:{type:'abh.command',id:command.commandId,version:1},proposedBy:c.actor,executionPrincipalRef:definition.executionPrincipalRef,
      actionType:payload.actionType,payloadArtifactRef:payload.payloadRef,payloadDigest:artifact.record.contentDigest,targetRefs:payload.targetRefs,inputVersionRefs:payload.sourceVersionRefs,
      completionPolicyRef:definition.completionPolicyRef,riskClass:definition.riskClass,position:{lifecycle:'Proposed',outcome:'NotStarted'}});
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    const unsigned=contract('ActionIntentRecord',{actionRef:action.actionRef,resourceOrganizationId:c.resourceOrganizationId,proposal:{...payload,completionPolicyRef:definition.completionPolicyRef,resourceRequirements:impact.resourceRequirements},
      executionPrincipalRef:definition.executionPrincipalRef,payloadDigest:action.payloadDigest,riskClass:definition.riskClass,impactUpperBound:impact,
      requiredBehaviorSlots:definition.requiredBehaviorSlots,maxOperations:definition.maxOperations,purposeNames,
      safetyStop:definition.safetyStop===true,expiresAt:new Date(clock!.now.getTime()+definition.intentExpirySeconds*1000).toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const intent=contract('ActionIntentRecord',{...unsigned,digest:await digestContract('ActionIntentRecord',unsigned)});
    await sql`INSERT INTO execution.actions(resource_organization_id,id,workspace_id,purpose_names,lifecycle,outcome,record)
      VALUES (${c.resourceOrganizationId},${action.actionRef.id},${c.workspaceId??null},${purposeNames},'Proposed','NotStarted',${JSON.stringify(action)}::text::jsonb)`;
    await sql`INSERT INTO execution.action_intents(resource_organization_id,id,workspace_id,purpose_names,record)
      VALUES (${c.resourceOrganizationId},${action.actionRef.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(intent)}::text::jsonb)`;
    await appendChange(tx,{command,target:action.actionRef,eventType:'abh.action.created',changedFields:['position','payloadDigest','executionPrincipalRef'],relatedRefs:sameRef(payload.sourceProposalRef,payload.payloadRef)?[payload.payloadRef]:[payload.sourceProposalRef,payload.payloadRef]});
    return action;
  }
  async validate(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,evidence:EntityRef,checks:Pick<ActionPreparationChecks,'lock'|'artifact'|'domain'>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);contract('EntityRef',evidence);await checks.lock(tx);await lockAction(tx,actionRef.id);
    const action=await this.get(tx,actionRef.id),intent=await this.getIntent(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(action.position.lifecycle!=='Proposed')throw new CoreError('PRECONDITION_FAILED');
    await this.#unexpired(tx,intent);await this.#payload(tx,action,checks);await checks.domain(tx,action,intent,evidence);
    return this.#save(tx,command,action,{...action,position:{lifecycle:'Validated',outcome:'NotStarted'}},'abh.action.validate',[evidence]);
  }
  preparationRequest(tx:TenantTransaction,intent:ActionIntentRecord,authorityRefs:EntityRef[]):ResolveAndPinRequest{
    return contract('ResolveAndPinRequest',{subjectRef:intent.actionRef,subjectInputDigest:intent.digest,requiredBehaviorSlots:intent.requiredBehaviorSlots,
      verifiedScope:intent.impactUpperBound.scopeRefs,requestContextRef:{type:'abh.request-context',id:tx.context.tenant.requestId,version:1},preparationAuthorityRefs:authorityRefs});
  }
  async pin(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,authorityRefs:EntityRef[],checks:Pick<ActionPreparationChecks,'lock'|'artifact'>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);contract('PinActionPayload',{preparationAuthorityRefs:authorityRefs});await checks.lock(tx);
    // Release's selection fence precedes both aggregate locks; ActionEngine sorts before CapabilityRelease.
    const fences=await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    await lockAction(tx,actionRef.id);const action=await this.get(tx,actionRef.id),intent=await this.getIntent(tx,actionRef.id);
    if(action.pinSetRef){
      const pins=await this.#releases.getPinSet(tx,action.actionRef);
      if(!pins||!sameRef(action.pinSetRef,pins.pinSetRef))throw new CoreError('PIN_INPUT_CONFLICT');
      await this.#releases.revalidate(tx,pins,this.preparationRequest(tx,intent,authorityRefs));return action;
    }
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(action.position.lifecycle!=='Validated')throw new CoreError('PRECONDITION_FAILED');
    await this.#unexpired(tx,intent);await this.#payload(tx,action,checks);
    const pins=await this.#releases.resolveAndPin(tx,command,this.preparationRequest(tx,intent,authorityRefs));
    return this.#save(tx,command,action,{...action,pinSetRef:pins.pinSetRef},'abh.action.pinned',[pins.pinSetRef]);
  }
  async registerPlan(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,plan:OperationPlan,authorityRefs:EntityRef[],checks:Pick<ActionPreparationChecks,'lock'|'artifact'|'plan'>):Promise<ActionRecord>{
    const target=contract('ActionRef',actionRef);contract('OperationPlan',plan);
    if(await digestContract('OperationPlan',plan)!==plan.digest)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    await checks.lock(tx);
    const intent=await this.getIntent(tx,actionRef.id),pins=await this.#releases.getPinSet(tx,target);
    if(!pins)throw new CoreError('PIN_INPUT_CONFLICT');
    await this.#releases.revalidate(tx,pins,this.preparationRequest(tx,intent,authorityRefs));
    await lockAction(tx,actionRef.id);const action=await this.get(tx,actionRef.id);
    // Semantic replay can use a newer Action lifecycle version, but never a different plan identity or digest.
    const existing=await this.#operations.getPlan(tx,actionRef.id);
    if(existing){
      if(existing.digest!==plan.digest||!sameRef(existing.planRef,plan.planRef)||!action.planRef||!sameRef(action.planRef,existing.planRef))throw new CoreError('IDEMPOTENCY_CONFLICT');
      return action;
    }
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(action.position.lifecycle!=='Validated'||action.planRef||plan.planRef.version!==1||plan.planVersion!==1||!sameRef(plan.actionRef,action.actionRef)
      ||!action.pinSetRef||!sameRef(action.pinSetRef,pins.pinSetRef)
      ||!sameRef(plan.pinSetRef,pins.pinSetRef)||plan.pinSetDigest!==pins.digest||plan.validatedAgainstPayloadDigest!==action.payloadDigest
      ||plan.nodes.length>intent.maxOperations||!sameRef(plan.completionPolicyRef,action.completionPolicyRef)||await digestContract('OperationPlan',plan)!==plan.digest)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    const capabilities=pins.pins.flatMap(pin=>pin.capabilityExactRefs).map(capability=>canonicalJson(capability));
    if([plan.compilerRef,...plan.connectorRefs].some(capability=>!capabilities.includes(canonicalJson(capability))))throw new CoreError('PIN_INPUT_CONFLICT');
    assertImpactBound(plan.impactUpperBound,intent.impactUpperBound);
    assertResourceBound(plan.nodes.flatMap(node=>node.resourceRequirements),plan.impactUpperBound.resourceRequirements);
    await this.#unexpired(tx,intent);await this.#payload(tx,action,checks);await checks.plan(tx,plan,intent);
    for(const node of plan.nodes){
      const payload=await this.#artifacts.read(tx,node.payloadRef,record=>checks.artifact(tx,record));
      if(payload.record.contentDigest!==node.payloadDigest)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    }
    await this.#operations.register(tx,command,action,plan);
    return this.#save(tx,command,action,{...action,pinSetRef:pins.pinSetRef,planRef:plan.planRef},'abh.action.plan-registered',[plan.planRef,pins.pinSetRef,plan.scopeProofRef]);
  }
  /** Zero-dispatch preparation cancellation. Authorized cleanup is provided by the resource-aware execution path. */
  async cancelPreparation(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,reason:string):Promise<ActionRecord>{
    contract('ActionRef',actionRef);contract('Reason',reason);await lockAction(tx,actionRef.id);const action=await this.get(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(!['Proposed','Validated'].includes(action.position.lifecycle))throw new CoreError('PRECONDITION_FAILED');
    const children=await this.#operations.list(tx,actionRef.id);
    if(children.some(child=>child.attemptCount!==0||!['Pending','Cancelled'].includes(child.position.lifecycle)))throw new CoreError('PRECONDITION_FAILED');
    await this.#operations.cancelPending(tx,command,actionRef);
    return this.#save(tx,command,action,{...action,position:{lifecycle:'Cancelled',outcome:'NotStarted'}},'abh.action.cancel',[]);
  }
  /** Post-dispatch cancellation stops remaining steps; possible external effects stay owned until reconciliation. */
  async requestCancellation(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,reason:string,
    admit:(tx:TenantTransaction,action:ActionRecord)=>Promise<void>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);contract('Reason',reason);
    const initial=await this.get(tx,actionRef.id);await admit(tx,initial);await lockAction(tx,actionRef.id);
    const action=await this.get(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(action.position.lifecycle==='Reconciling'&&action.cancellationRequestedAt)return action;
    if(action.position.lifecycle!=='Executing')throw new CoreError('PRECONDITION_FAILED');
    const children=await this.#operations.list(tx,actionRef.id);
    if(!children.some(child=>child.attemptCount>0))throw new CoreError('OPERATION_FACT_CONFLICT');
    // cancelPending refuses any Pending retry that already owns a dispatch obligation.
    await this.#operations.cancelPending(tx,command,actionRef);
    const [clock]=await tx.owner('ActionEngine')`SELECT clock_timestamp() AS now`;
    return this.#save(tx,command,action,{...action,cancellationRequestedAt:clock!.now.toISOString(),position:{...action.position,lifecycle:'Reconciling'}},
      'abh.action.reconcile',children.map(child=>child.operationRef));
  }
  async authorize(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,resolve:(tx:TenantTransaction)=>Promise<IssuedActionAuthorization>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);
    const token=await resolve(tx),{snapshot,complete}=consumeActionAuthorization(tx,actionRef,token),action=await this.get(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef)||action.position.lifecycle!=='Validated')throw new CoreError('VERSION_CONFLICT');
    if(snapshot.payloadDigest!==action.payloadDigest||!action.planRef||!action.pinSetRef||!sameRef(snapshot.planRef,action.planRef)||!sameRef(snapshot.pinSetRef,action.pinSetRef))throw new CoreError('AUTHORITY_REQUIRED');
    const authorized=await this.#save(tx,command,action,{...action,executionAuthorityRef:snapshot.authorityRef,authorizationSnapshotRef:snapshot.snapshotRef,position:{lifecycle:'Authorized',outcome:'NotStarted'}},'abh.action.authorize',[snapshot.snapshotRef,snapshot.authorityRef]);
    complete();return authorized;
  }
  /** Called by the Controller only after the complete Permit/Attempt and Operation CAS exist in this same UoW. */
  async startExecution(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,permitRef:EntityRef):Promise<ActionRecord>{
    await lockAction(tx,actionRef.id);const action=await this.get(tx,actionRef.id),permit=await readPermit(tx,permitRef),attempt=await readAttempt(tx,permit.attemptRef);
    const operation=await this.#operations.get(tx,permit.operationRef.id);
    if(!sameRef(action.actionRef,actionRef)||!sameRef(permit.actionRef,actionRef))throw new CoreError('VERSION_CONFLICT');
    if(!['Authorized','Executing'].includes(action.position.lifecycle)||!action.authorizationSnapshotRef||!sameRef(action.authorizationSnapshotRef,permit.snapshotRef)
      ||operation.actionRef.id!==actionRef.id||operation.position.lifecycle!=='Dispatching'||operation.attemptCount!==permit.ordinal||operation.operationRef.version!==permit.operationRef.version+1
      ||!sameRef(attempt.permitRef,permit.permitRef)||!sameRef(attempt.operationRef,permit.operationRef))throw new CoreError('PRECONDITION_FAILED');
    return this.#save(tx,command,action,{...action,position:action.position.lifecycle==='Authorized'?{lifecycle:'Executing',outcome:'Pending'}:action.position},
      action.position.lifecycle==='Authorized'?'abh.action.dispatch':'abh.action.advance',[permitRef,operation.operationRef]);
  }
  /** Reflect unresolved children while final resource settlement and complete-result aggregation remain separate work. */
  async observeChildProgress(tx:TenantTransaction,command:CommandIdentity,actionId:string):Promise<ActionRecord>{
    await lockAction(tx,actionId);const action=await this.get(tx,actionId),plan=await this.#operations.getPlan(tx,actionId),children=await this.#operations.list(tx,actionId);
    if((action.position.lifecycle!=='Executing'&&action.position.lifecycle!=='Reconciling')||!plan||!action.planRef||!sameRef(action.planRef,plan.planRef)||children.length!==plan.nodes.length
      ||plan.nodes.some(node=>children.filter(child=>child.nodeKey===node.nodeKey).length!==1))throw new CoreError('ACTION_CHILD_VERSION_CONFLICT');
    const outcome=children.some(child=>child.position.outcome==='Unknown')?'Unknown':'Pending';
    return this.#save(tx,command,action,{...action,position:{lifecycle:action.position.lifecycle,outcome}},'abh.action.advance',children.map(child=>child.operationRef));
  }
  async aggregate(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,resolve:(tx:TenantTransaction)=>Promise<IssuedActionResult>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);const {result,complete}=consumeActionResult(tx,actionRef,await resolve(tx)),action=await this.get(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef)||!['Executing','Reconciling'].includes(action.position.lifecycle))throw new CoreError('VERSION_CONFLICT');
    const closed=await this.#save(tx,command,action,{...action,resultRef:result.resultRef,position:{lifecycle:'Closed',outcome:result.outcome}},'abh.action.close',[result.resultRef,...result.operationVersionRefs]);
    complete();return closed;
  }
  async cleanupAuthorized(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,resolve:(tx:TenantTransaction)=>Promise<IssuedActionCleanup>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);const {cleanup,complete}=consumeActionCleanup(tx,actionRef,await resolve(tx)),action=await this.get(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef)||action.position.lifecycle!=='Authorized')throw new CoreError('VERSION_CONFLICT');
    const {executionAuthorityRef:_,authorizationSnapshotRef:__,...unbound}=action;
    const next:ActionRecord=cleanup.mode==='Reauthorize'?{...unbound,position:{lifecycle:'Validated',outcome:'NotStarted'}}
      :{...action,position:{lifecycle:cleanup.mode==='Cancel'?'Cancelled':'Expired',outcome:'NotStarted'}};
    const result=await this.#save(tx,command,action,next,cleanup.mode==='Reauthorize'?'abh.action.reauthorize':cleanup.mode==='Cancel'?'abh.action.cancel':'abh.action.expire',[cleanup.cleanupRef,...cleanup.releasedReservationRefs]);
    complete();return result;
  }
  async refreshAuthorization(tx:TenantTransaction,command:CommandIdentity,actionRef:EntityRef,resolve:(tx:TenantTransaction)=>Promise<IssuedActionRefresh>):Promise<ActionRecord>{
    contract('ActionRef',actionRef);const {snapshot,complete}=consumeActionRefresh(tx,actionRef,await resolve(tx)),action=await this.get(tx,actionRef.id);
    if(!sameRef(action.actionRef,actionRef)||!['Authorized','Executing'].includes(action.position.lifecycle)||!action.executionAuthorityRef||!sameRef(action.executionAuthorityRef,snapshot.authorityRef))throw new CoreError('AUTHORIZATION_REFRESH_DENIED');
    const next=await this.#save(tx,command,action,{...action,authorizationSnapshotRef:snapshot.snapshotRef},'abh.action.authorization-refreshed',[snapshot.snapshotRef,...snapshot.reservationRefs]);complete();return next;
  }
  async #save(tx:TenantTransaction,command:CommandIdentity,current:ActionRecord,value:ActionRecord,eventType:'abh.action.reconcile'|'abh.action.validate'|'abh.action.plan-registered'|'abh.action.pinned'|'abh.action.authorize'|'abh.action.cancel'|'abh.action.dispatch'|'abh.action.advance'|'abh.action.close'|'abh.action.reauthorize'|'abh.action.expire'|'abh.action.authorization-refreshed',relatedRefs:EntityRef[]):Promise<ActionRecord>{
    const next=contract('ActionRecord',{...value,actionRef:{...current.actionRef,version:current.actionRef.version+1}}),c=tx.context.tenant;
    const rows=await tx.owner('ActionEngine')`UPDATE execution.actions SET record=${JSON.stringify(next)}::text::jsonb,version=version+1,lifecycle=${next.position.lifecycle},outcome=${next.position.outcome},
      updated_at=clock_timestamp(),updated_by=${c.actor.id} WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.actionRef.id} AND version=${current.actionRef.version} RETURNING id`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');
    await appendChange(tx,{command,target:next.actionRef,eventType,changedFields:eventType==='abh.action.reconcile'?['position','cancellationRequestedAt']:eventType==='abh.action.plan-registered'?['planRef']:eventType==='abh.action.pinned'?['pinSetRef']:['position'],relatedRefs});return next;
  }
}
