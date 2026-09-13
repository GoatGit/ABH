import {randomUUID} from 'node:crypto';
import type {ApplyExceptionResolutionEffectCommand,ApplyExceptionResolutionEffectPayload,CorrectionApplicationRecord,
  DecisionRecord,EntityRef,ExceptionRecord,ExceptionResolutionEffectRecord,ExceptionResolutionRecord,OperationRecord,
  OpenTerminalExceptionPayload,ResolveExceptionCommand,ResolveExceptionPayload,ResponsibilityRequestState,
  OperationPlanNode,ResourceFenceRecord,ExceptionSuccessorDispatchRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {OperationOwner} from '../execution/operations.ts';
import {ReconciliationOwner} from '../execution/reconciliations.ts';
import {ResourceFenceOwner} from '../execution/resource-fences.ts';
import {sameRef,refKey,lockAction} from '../execution/shared.ts';
import {DecisionOwner,type DecisionEligibility} from './decisions.ts';
import {CorrectionApplicationOwner} from './apply-correction.ts';
import {requireVerifiedContext} from '../internal/context.ts';

export interface ExceptionInstallation {
  /** Every control fence read by eligibility must be declared before resource/aggregate locks. */
  fenceRefs(tx:TenantTransaction,input:OpenTerminalExceptionPayload):Promise<EntityRef[]>;
  eligibility:DecisionEligibility;
}

export interface ExceptionResolutionView {
  exception:ExceptionRecord;
  resolution:ExceptionResolutionRecord;
  responsibility:{requestRef:EntityRef;status:ResponsibilityRequestState;decisionRefs:EntityRef[]};
  technical:{operationRef:EntityRef;position:OperationRecord['position'];resourceFenceRef:EntityRef;
    dispatchBlocked:boolean;unresolvedOperationRef?:EntityRef};
}

/** Immutable responsibility binding. Technical state remains owned by Operation/ResourceFence. */
export class ExceptionOwner {
  async pending(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');if(afterId)contract('UUID',afterId);
    const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const rows=await tx.owner('HumanGateway')`SELECT r.id,r.version FROM execution.reconciliations r
      WHERE r.resource_organization_id=${c.resourceOrganizationId} AND r.deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(r.purpose_names) AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)
      AND (${afterId??null}::uuid IS NULL OR r.id>${afterId??null}::uuid)
      AND EXISTS(SELECT 1 FROM execution.resource_fences f WHERE f.resource_organization_id=r.resource_organization_id AND f.deleted_at IS NULL
        AND f.record->'blockedByReportRef'->>'id'=r.id::text)
      AND NOT EXISTS(SELECT 1 FROM human.exceptions e WHERE e.resource_organization_id=r.resource_organization_id AND e.report_id=r.id)
      ORDER BY r.id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.reconciliation',id:row.id,version:Number(row.version)}));
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<ExceptionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.exception')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('HumanGateway')`SELECT record,version,report_id,request_id FROM human.exceptions
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const row=rows[0],record=contract('ExceptionRecord',row.record);
    if(!sameRef(record.exceptionRef,ref)||record.exceptionRef.version!==Number(row.version)||record.resourceOrganizationId!==c.resourceOrganizationId
      ||record.reportRef.id!==row.report_id||record.requestRef.id!==row.request_id||await digestContract('ExceptionRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return record;
  }

  async getResolution(tx:TenantTransaction,ref:EntityRef):Promise<ExceptionResolutionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.exception-resolution')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const [row]=await tx.owner('HumanGateway')`SELECT record,version,exception_id FROM human.exception_resolutions
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
      AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('ExceptionResolutionRecord',row.record);
    if(!sameRef(record.resolutionRef,ref)||record.resolutionRef.version!==Number(row.version)
      ||record.exceptionRef.id!==String(row.exception_id)||await digestContract('ExceptionResolutionRecord',record)!==record.digest)
      throw new CoreError('INTERNAL_ERROR');
    return record;
  }
  /** Installed query admission runs first; responsibility closure and technical freeze are independent facts. */
  async inspect(tx:TenantTransaction,ref:EntityRef,admit:(tx:TenantTransaction,record:ExceptionRecord)=>Promise<void>){
    const record=await this.get(tx,ref);await admit(tx,record);
    const operations=new OperationOwner(),initial=await operations.get(tx,record.sourceRef.id);
    const plan=await operations.getPlan(tx,initial.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===initial.nodeKey);
    if(!node||!plan||!sameRef(initial.planRef,plan.planRef))throw new CoreError('OPERATION_FACT_CONFLICT');
    const fence=await new ResourceFenceOwner().lock(tx,node);
    if(!fence||!record.blockedScopeRefs.some(ref=>ref.type===fence.fenceRef.type&&ref.id===fence.fenceRef.id))throw new CoreError('OPERATION_FACT_CONFLICT');
    await lockAction(tx,initial.actionRef.id);
    const c=tx.context.tenant,key=`${c.resourceOrganizationId}/HumanGateway/abh.responsibility-request/${record.requestRef.id}`;
    await tx.lock(4,key,()=>tx.owner('HumanGateway')`SELECT id FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${record.requestRef.id} FOR UPDATE`);
    const request=await new DecisionOwner().getRequest(tx,record.requestRef.id),operation=await operations.get(tx,record.sourceRef.id);
    if(request.kind!=='Exception'||!sameRef(request.subjectRef,record.sourceRef)||request.proposalDigest!==record.proposalDigest
      ||request.requestRef.version<record.requestRef.version||!request.evidenceRefs.some(ref=>sameRef(ref,record.reportRef)))throw new CoreError('OPERATION_FACT_CONFLICT');
    return {exception:record,responsibility:{requestRef:request.requestRef,status:request.status,decisionRefs:request.decisionRefs},
      technical:{operationRef:operation.operationRef,position:operation.position,resourceFenceRef:fence.fenceRef,dispatchBlocked:Boolean(fence.blockedByReportRef),
        ...(fence.blockedByReportRef?{blockedByReportRef:fence.blockedByReportRef}:{}),
        ...(fence.unresolvedOperationRef?{unresolvedOperationRef:fence.unresolvedOperationRef}:{})}};
  }
  /** Caller admits first. Proposal data is derived from the actual report, plan and frozen resource. */
  async proposal(tx:TenantTransaction,reportRef:EntityRef){
    const report=await new ReconciliationOwner().get(tx,reportRef),operations=new OperationOwner(),operation=await operations.get(tx,report.operationRef.id);
    const plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!node||!plan||!sameRef(plan.planRef,report.planRef)||!sameRef(operation.operationRef,report.operationRef)||operation.position.lifecycle!=='Closed')throw new CoreError('PRECONDITION_FAILED');
    const contradiction=report.verdict==='Conflicting'||report.verdict==='Ambiguous'||(report.verdict==='ConfirmedSuccess'&&operation.position.outcome!=='Succeeded')
      ||(report.verdict==='ConfirmedNoEffect'&&operation.position.outcome!=='Failed');
    if(!contradiction)throw new CoreError('PRECONDITION_FAILED');
    const fence=await new ResourceFenceOwner().lock(tx,node);
    if(!fence?.blockedByReportRef||!sameRef(fence.blockedByReportRef,reportRef))throw new CoreError('PRECONDITION_FAILED');
    const facts={sourceRef:operation.operationRef,reportRef,category:'TerminalContradiction' as const,severity:'High' as const,
      impactUpperBound:plan.impactUpperBound,blockedScopeRefs:[fence.fenceRef]};
    return {...facts,proposalDigest:await inputDigest(facts)};
  }
  async admit(tx:TenantTransaction,input:OpenTerminalExceptionPayload,grantRefs:readonly EntityRef[],installation:ExceptionInstallation):Promise<void>{
    contract('OpenTerminalExceptionPayload',input);const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
    await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grantRefs,...await installation.fenceRefs(tx,input)]);
    await assertCurrentGrants(tx,{objectRef:input.reportRef,scopeRefs:[scope],action:'abh.exceptions.open-terminal'},grantRefs);
    await installation.eligibility.lock(tx,input.responsibility.request);
  }
  async open(tx:TenantTransaction,command:CommandIdentity,input:OpenTerminalExceptionPayload,grantRefs:readonly EntityRef[],installation:ExceptionInstallation):Promise<ExceptionRecord>{
    await this.admit(tx,input,grantRefs,installation);
    const proposal=await this.proposal(tx,input.reportRef),request=input.responsibility.request,c=tx.context.tenant;
    if(request.kind!=='Exception'||!sameRef(request.subjectRef,proposal.sourceRef)||request.proposalDigest!==proposal.proposalDigest
      ||!request.evidenceRefs.some(ref=>sameRef(ref,input.reportRef))||!request.requiredSlots.some(slot=>slot.required)
      ||request.requiredSlots.some(slot=>slot.responsibilityType!=='Exception'))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    for(const pkg of input.responsibility.packages)if(canonicalJson(pkg.impactUpperBound)!==canonicalJson(proposal.impactUpperBound)
      ||!pkg.evidenceRefs.some(ref=>sameRef(ref,input.reportRef)))throw new CoreError('DECISION_PACKAGE_INCOMPLETE');
    const operation=await new OperationOwner().get(tx,proposal.sourceRef.id);await lockAction(tx,operation.actionRef.id);
    const sql=tx.owner('HumanGateway'),prior=await sql`SELECT id,version FROM human.exceptions WHERE resource_organization_id=${c.resourceOrganizationId} AND report_id=${input.reportRef.id}`;
    if(prior[0])throw new CoreError('IDEMPOTENCY_CONFLICT');
    const opened=await new DecisionOwner().open(tx,command,input.responsibility,installation.eligibility);
    const requiredResponsibilityRefs=[...new Map(request.requiredSlots.flatMap(slot=>slot.seats.flatMap(seat=>seat.responsibilityRefs)).map(ref=>[refKey(ref),ref])).values()];
    const [clock]=await sql`SELECT clock_timestamp() AS now`;
    const unsigned=contract('ExceptionRecord',{exceptionRef:{type:'abh.exception',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,...proposal,
      requiredResponsibilityRefs,requestRef:opened.requestRef,recordedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const record=contract('ExceptionRecord',{...unsigned,digest:await digestContract('ExceptionRecord',unsigned)});
    await sql`INSERT INTO human.exceptions(resource_organization_id,id,workspace_id,purpose_names,report_id,request_id,record)
      VALUES (${c.resourceOrganizationId},${record.exceptionRef.id},${c.workspaceId??null},
        ${[c.purposeOfUse,'abh.runtime.deliver','abh.decision.review']},${input.reportRef.id},${opened.requestRef.id},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.exceptionRef,eventType:'abh.exception.created',changedFields:['sourceRef','reportRef','requestRef','blockedScopeRefs'],relatedRefs:[record.sourceRef,record.reportRef,record.requestRef,...record.blockedScopeRefs]});
    return record;
  }

  async #verifyResolutionTechnical(tx:TenantTransaction,record:ExceptionRecord,payload:ResolveExceptionPayload,
    grantRefs:readonly EntityRef[]){
    const view=await this.inspect(tx,record.exceptionRef,async(tx,exception)=>{
      await assertCurrentGrants(tx,{objectRef:exception.exceptionRef,
        scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
        action:'abh.exceptions.resolve'},grantRefs);
    });
    if(view.exception.exceptionRef.version!==payload.exceptionRef.version||!view.technical.dispatchBlocked
      ||!view.technical.unresolvedOperationRef||view.technical.position.lifecycle!=='Closed')
      throw new CoreError('OPERATION_FACT_CONFLICT');
    return view;
  }

  async verifyResolution(tx:TenantTransaction,payload:ResolveExceptionPayload,grantRefs:readonly EntityRef[]){
    return await this.#verifyResolutionTechnical(tx,await this.get(tx,payload.exceptionRef),payload,grantRefs);
  }

  async #verifyResolutionDecision(tx:TenantTransaction,record:ExceptionRecord,payload:ResolveExceptionPayload){
    const decisions=new DecisionOwner(),request=await decisions.getRequest(tx,record.requestRef.id);
    const decisionRef=request.decisionRefs.find(ref=>sameRef(ref,payload.decisionRef));
    if(request.status!=='Closed'||!decisionRef)throw new CoreError('DECISION_STALE');
    const decision:DecisionRecord=await decisions.getDecision(tx,payload.decisionRef.id);
    if(!sameRef(decision.decisionRef,payload.decisionRef)||decision.package.requestRef.id!==record.requestRef.id
      ||decision.status!=='Approved'&&!(payload.resolutionKind==='RejectAndStop'&&decision.status==='Rejected'))
      throw new CoreError('DECISION_STALE');
    return {request,decision};
  }

  async resolve(tx:TenantTransaction,command:CommandIdentity,payload:ResolveExceptionPayload,
    grantRefs:readonly EntityRef[]):Promise<ExceptionResolutionRecord>{
    contract('ResolveExceptionPayload',payload);
    const exception=await this.get(tx,payload.exceptionRef);
    if(exception.exceptionRef.version!==payload.exceptionRef.version)throw new CoreError('VERSION_CONFLICT');
    const [existing]=await tx.owner('HumanGateway')`SELECT id FROM human.exception_resolutions
      WHERE resource_organization_id=${tx.context.tenant.resourceOrganizationId} AND exception_id=${exception.exceptionRef.id}`;
    if(existing)throw new CoreError('IDEMPOTENCY_CONFLICT');
    const view=await this.#verifyResolutionTechnical(tx,exception,payload,grantRefs);
    const {request,decision}=await this.#verifyResolutionDecision(tx,exception,payload);
    const c=tx.context.tenant,[clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    const unsigned={resolutionRef:{type:'abh.exception-resolution' as const,id:randomUUID(),version:1},
      resourceOrganizationId:c.resourceOrganizationId,exceptionRef:exception.exceptionRef,
      sourceRef:exception.sourceRef,reportRef:exception.reportRef,requestRef:request.requestRef,
      decisionRef:decision.decisionRef,resolutionKind:payload.resolutionKind,evidenceRefs:payload.evidenceRefs,
      technicalUnknownPreserved:true as const,resourceFreezePreserved:true as const,resolvedBy:c.actor,
      resolvedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)};
    const resolution=contract('ExceptionResolutionRecord',{...unsigned,digest:await digestContract('ExceptionResolutionRecord',unsigned)});
    await tx.owner('HumanGateway')`INSERT INTO human.exception_resolutions
      (resource_organization_id,id,workspace_id,purpose_names,record,exception_id,request_id,report_id,decision_id,resolution_kind)
      VALUES (${c.resourceOrganizationId},${resolution.resolutionRef.id},${c.workspaceId??null},
        ARRAY[${c.purposeOfUse}],${JSON.stringify(resolution)}::text::jsonb,${exception.exceptionRef.id},
        ${request.requestRef.id},${exception.reportRef.id},${decision.decisionRef.id},${payload.resolutionKind})`;
    const relatedRefs=[...new Map([exception.exceptionRef,exception.sourceRef,exception.reportRef,request.requestRef,
      decision.decisionRef,...payload.evidenceRefs,...exception.blockedScopeRefs].map(ref=>[refKey(ref),ref])).values()];
    await appendChange(tx,{command,target:resolution.resolutionRef,eventType:'abh.exception.resolved',
      changedFields:['resolutionKind','technicalUnknownPreserved','resourceFreezePreserved'],relatedRefs});
    return resolution;
  }

  async #verifyEffectDecision(tx:TenantTransaction,exception:ExceptionRecord,resolution:ExceptionResolutionRecord){
    const decision=await this.#verifyResolutionDecision(tx,exception,{exceptionRef:exception.exceptionRef,
      decisionRef:resolution.decisionRef,resolutionKind:resolution.resolutionKind,evidenceRefs:resolution.evidenceRefs} as ResolveExceptionPayload);
    if(decision.decision.status==='Rejected')throw new CoreError('DECISION_STALE');
    return decision;
  }

  async getEffect(tx:TenantTransaction,ref:EntityRef):Promise<ExceptionResolutionEffectRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.exception-resolution-effect')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const [row]=await tx.owner('HumanGateway')`SELECT record,version,resolution_id,exception_id,correction_application_id
      FROM human.exception_resolution_effects WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('ExceptionResolutionEffectRecord',row.record);
    if(!sameRef(record.effectRef,ref)||record.effectRef.version!==Number(row.version)
      ||record.resolutionRef.id!==String(row.resolution_id)||record.exceptionRef.id!==String(row.exception_id)
      ||record.correctionApplicationRef.id!==String(row.correction_application_id)
      ||record.resourceOrganizationId!==c.resourceOrganizationId
      ||await digestContract('ExceptionResolutionEffectRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return record;
  }

  async verifyEffect(tx:TenantTransaction,payload:ApplyExceptionResolutionEffectPayload,
    grantRefs:readonly EntityRef[]):Promise<{exception:ExceptionRecord;resolution:ExceptionResolutionRecord;
      application:CorrectionApplicationRecord;node:OperationPlanNode;decision:DecisionRecord}>{
    contract('ApplyExceptionResolutionEffectPayload',payload);
    const c=tx.context.tenant,scope={type:'abh.organization' as const,id:c.resourceOrganizationId,version:1};
    const resolution=await this.getResolution(tx,payload.resolutionRef),exception=await this.get(tx,resolution.exceptionRef);
    if(resolution.resolutionKind!=='ApplyCorrection')throw new CoreError('PRECONDITION_FAILED');
    if(exception.exceptionRef.id!==resolution.exceptionRef.id||exception.exceptionRef.version!==resolution.exceptionRef.version
      ||exception.reportRef.id!==resolution.reportRef.id)throw new CoreError('INTERNAL_ERROR');
    await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grantRefs]);
    await assertCurrentGrants(tx,{objectRef:exception.exceptionRef,scopeRefs:[scope],
      action:'abh.exceptions.resolve'},grantRefs);
    const {decision}=await this.#verifyResolutionDecision(tx,exception,{exceptionRef:exception.exceptionRef,
      decisionRef:resolution.decisionRef,resolutionKind:resolution.resolutionKind,
      evidenceRefs:resolution.evidenceRefs} as ResolveExceptionPayload);
	    const application=await new CorrectionApplicationOwner().getGovernanceApplication(tx,payload.correctionApplicationRef);
	    if(!application.evidenceRefs.some(ref=>sameRef(ref,exception.reportRef)))throw new CoreError('OPERATION_FACT_CONFLICT');
    const operations=new OperationOwner(),operation=await operations.get(tx,exception.sourceRef.id);
    const plan=await operations.getPlan(tx,operation.actionRef.id),node=plan?.nodes.find(node=>node.nodeKey===operation.nodeKey);
    if(!node||!plan||!sameRef(operation.planRef,plan.planRef))throw new CoreError('OPERATION_FACT_CONFLICT');
	    const fence=await new ResourceFenceOwner().lock(tx,node);
	    if(fence&&!fence.blockedByReportRef&&fence.unresolvedOperationRef){
	      const [replayed]=await tx.owner('HumanGateway')`SELECT id FROM human.exception_resolution_effects
	        WHERE resource_organization_id=${c.resourceOrganizationId} AND resolution_id=${payload.resolutionRef.id}
	        AND correction_application_id=${payload.correctionApplicationRef.id}`;
	      if(replayed)return {exception,resolution,application,node,decision};
	    }
	    if(!fence?.blockedByReportRef||!sameRef(fence.blockedByReportRef,exception.reportRef)
	      ||!fence.unresolvedOperationRef)
	      throw new CoreError('OPERATION_FACT_CONFLICT');
	    return {exception,resolution,application,node,decision};
  }

  async applyEffect(tx:TenantTransaction,command:CommandIdentity,payload:ApplyExceptionResolutionEffectPayload,
    grantRefs:readonly EntityRef[]):Promise<ExceptionResolutionEffectRecord>{
    const c=tx.context.tenant;
    const {exception,resolution,application,node,decision}=await this.verifyEffect(tx,payload,grantRefs);
	    const fence=await new ResourceFenceOwner().releaseReportBlock(tx,command,node,exception.reportRef,
	      async()=>{});
	    await tx.lock(4,`${c.resourceOrganizationId}/HumanGateway/abh.exception-resolution-effect/${payload.resolutionRef.id}`,
	      async()=>{await tx.owner('HumanGateway')`SELECT id FROM human.exception_resolution_effects
	        WHERE resource_organization_id=${c.resourceOrganizationId} AND resolution_id=${payload.resolutionRef.id}`;});
    const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('ExceptionResolutionEffectRecord',{effectRef:{type:'abh.exception-resolution-effect' as const,id:randomUUID(),version:1},
      resourceOrganizationId:c.resourceOrganizationId,resolutionRef:resolution.resolutionRef,exceptionRef:exception.exceptionRef,
      sourceRef:exception.sourceRef,reportRef:exception.reportRef,correctionApplicationRef:application.applicationRef,
      fenceRef:fence.fenceRef,fencingToken:fence.fencingToken,reportBlockReleased:true as const,
      unresolvedOperationPreserved:true as const,fencingTokenPreserved:true as const,appliedBy:c.actor,
      appliedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const effect=contract('ExceptionResolutionEffectRecord',{...unsigned,digest:await digestContract('ExceptionResolutionEffectRecord',unsigned)});
    await tx.owner('HumanGateway')`INSERT INTO human.exception_resolution_effects
      (resource_organization_id,id,workspace_id,purpose_names,record,resolution_id,exception_id,correction_application_id)
      VALUES (${c.resourceOrganizationId},${effect.effectRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
        ${JSON.stringify(effect)}::text::jsonb,${resolution.resolutionRef.id},${exception.exceptionRef.id},
        ${application.applicationRef.id})`;
    const relatedRefs=[...new Map([effect.effectRef,effect.resolutionRef,effect.exceptionRef,effect.sourceRef,
      effect.reportRef,effect.correctionApplicationRef,effect.fenceRef,decision.decisionRef]
      .map(ref=>[refKey(ref),ref])).values()];
    await appendChange(tx,{command,target:effect.effectRef,eventType:'abh.exception-resolution-effect.applied',
      changedFields:['correctionApplicationRef','fenceRef','reportBlockReleased'],relatedRefs});
    return effect;
  }
}

export async function openTerminalException(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,
  input:OpenTerminalExceptionPayload,grantRefs:readonly EntityRef[],installation:ExceptionInstallation):Promise<ExceptionRecord>{
  contract('OpenTerminalExceptionPayload',input);
  if(command.type!=='abh.exceptions.open-terminal'||command.digest!==await inputDigest(input))throw new CoreError('INVALID_ARGUMENT');
  const payload=structuredClone(input),grants=structuredClone([...grantRefs]),owner=new ExceptionOwner();
  return database.transaction(context,options,async tx=>{
    const result=await executeCommand(tx,command,()=>owner.admit(tx,payload,grants,installation),async()=>(await owner.open(tx,command,payload,grants,installation)).exceptionRef);
    return owner.get(tx,result.receipt.resultRef);
  });
}

export async function applyExceptionResolutionEffect(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ApplyExceptionResolutionEffectCommand,grantRefs:readonly EntityRef[]):
  Promise<{effect:ExceptionResolutionEffectRecord;commandId:string}>{
  requireVerifiedContext(context);
  if(context.tenant.actor.type!=='Human'||context.tenant.purposeOfUse!=='abh.decision.review')throw new CoreError('FORBIDDEN');
  const input=contract('ApplyExceptionResolutionEffectCommand',structuredClone(supplied)),
    refs=structuredClone([...grantRefs]),payload=contract('ApplyExceptionResolutionEffectPayload',structuredClone(input.payload));
  if(input.type!=='abh.exceptions.apply-resolution-effect'||input.target.type!=='abh.exception-resolution'
    ||input.target.id!==payload.resolutionRef.id)
    throw new CoreError('INVALID_ARGUMENT');
  const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
    digest:await inputDigest(payload)},owner=new ExceptionOwner();
  const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,
    async()=>{await owner.verifyEffect(tx,payload,refs);},
    async()=>(await owner.applyEffect(tx,command,payload,refs)).effectRef));
  const effect=await database.transaction(context,options,async tx=>await owner.getEffect(tx,result.receipt.resultRef));
  return {effect,commandId:result.receipt.commandRef.id};
}

export async function resolveException(database:Database,context:VerifiedContext,options:TransactionOptions,
  supplied:ResolveExceptionCommand,grantRefs:readonly EntityRef[]):Promise<ExceptionResolutionView & {commandId:string}>{
  requireVerifiedContext(context);
  if(context.tenant.actor.type!=='Human'||context.tenant.purposeOfUse!=='abh.decision.review')throw new CoreError('FORBIDDEN');
  const input=contract('ResolveExceptionCommand',structuredClone(supplied)),refs=structuredClone([...grantRefs]),
    payload=contract('ResolveExceptionPayload',structuredClone(input.payload));
  if(input.type!=='abh.exceptions.resolve'||input.target.type!=='abh.exception'
    ||input.target.id!==payload.exceptionRef.id||input.expectedVersion!==payload.exceptionRef.version)
    throw new CoreError('INVALID_ARGUMENT');
  const command={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,
    digest:await inputDigest(payload)},owner=new ExceptionOwner();
  const result=await database.transaction(context,options,async tx=>await executeCommand(tx,command,
    async()=>{await owner.verifyResolution(tx,payload,refs);},
    async()=>(await owner.resolve(tx,command,payload,refs)).resolutionRef));
  const view=await database.transaction(context,options,async tx=>{
    const exception=await owner.get(tx,payload.exceptionRef),resolution=await owner.getResolution(tx,result.receipt.resultRef);
    const request=await new DecisionOwner().getRequest(tx,exception.requestRef.id),view=await owner.inspect(tx,
      exception.exceptionRef,async(tx,record)=>await assertCurrentGrants(tx,{objectRef:record.exceptionRef,
        scopeRefs:[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}],
      action:'abh.exceptions.resolve'},refs).then(()=>{}));
    return {exception,resolution,responsibility:{requestRef:request.requestRef,status:request.status,
      decisionRefs:request.decisionRefs},technical:view.technical};
  });
  return {...view,commandId:result.receipt.commandRef.id};
}

export class ExceptionSuccessorOwner {
  readonly #owner=new ExceptionOwner();
  async pending(tx:TenantTransaction,limit=100,afterId?:string):Promise<EntityRef[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
    if(afterId)contract('UUID',afterId);
    const c=tx.context.tenant;
    if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.operation.reconcile')throw new CoreError('FORBIDDEN');
    const rows=await tx.owner('HumanGateway')`SELECT r.id,r.version FROM human.exception_resolutions r
      LEFT JOIN human.exception_successor_dispatches d
        ON d.resource_organization_id=r.resource_organization_id AND d.resolution_id=r.id AND d.deleted_at IS NULL
      WHERE r.resource_organization_id=${c.resourceOrganizationId} AND r.deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(r.purpose_names) AND (r.workspace_id IS NULL OR r.workspace_id=${c.workspaceId??null}::uuid)
        AND (${afterId??null}::uuid IS NULL OR r.id>${afterId??null}::uuid) AND d.id IS NULL
      ORDER BY r.id LIMIT ${limit}`;
    return rows.map(row=>({type:'abh.exception-resolution',id:row.id,version:Number(row.version)}));
  }

  async getDispatch(tx:TenantTransaction,ref:EntityRef):Promise<ExceptionSuccessorDispatchRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.exception-successor-dispatch')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const [row]=await tx.owner('HumanGateway')`SELECT record,version,resolution_id FROM human.exception_successor_dispatches
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL
        AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('ExceptionSuccessorDispatchRecord',row.record);
    if(!sameRef(record.dispatchRef,ref)||record.dispatchRef.version!==Number(row.version)
      ||record.resolutionRef.id!==String(row.resolution_id)||record.resourceOrganizationId!==c.resourceOrganizationId
      ||await digestContract('ExceptionSuccessorDispatchRecord',record)!==record.digest)throw new CoreError('INTERNAL_ERROR');
    return record;
  }

  async dispatch(tx:TenantTransaction,resolutionRef:EntityRef,successorRef:EntityRef):Promise<ExceptionSuccessorDispatchRecord>{
    contract('EntityRef',resolutionRef);contract('EntityRef',successorRef);
    if(resolutionRef.type!=='abh.exception-resolution'||successorRef.type!=='abh.command')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const resolution=await this.#owner.getResolution(tx,resolutionRef),exception=await this.#owner.get(tx,resolution.exceptionRef);
    if(exception.exceptionRef.id!==resolution.exceptionRef.id||exception.reportRef.id!==resolution.reportRef.id
      ||exception.sourceRef.id!==resolution.sourceRef.id)throw new CoreError('OPERATION_FACT_CONFLICT');
    const key=`${c.resourceOrganizationId}/HumanGateway/exception-successor/${resolutionRef.id}`;
    await tx.lock(4,key,async()=>{
      const [existing]=await tx.owner('HumanGateway')`SELECT id FROM human.exception_successor_dispatches
        WHERE resource_organization_id=${c.resourceOrganizationId} AND resolution_id=${resolutionRef.id} AND deleted_at IS NULL`;
      if(existing)throw new CoreError('IDEMPOTENCY_CONFLICT');
    });
    const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
    const unsigned=contract('ExceptionSuccessorDispatchRecord',{dispatchRef:{type:'abh.exception-successor-dispatch' as const,id:randomUUID(),version:1},
      resourceOrganizationId:c.resourceOrganizationId,resolutionRef:{...resolutionRef},exceptionRef:{...exception.exceptionRef},
      sourceRef:{...exception.sourceRef},reportRef:{...exception.reportRef},resolutionKind:resolution.resolutionKind,
      successorRef:{...successorRef},dispatchedBy:c.actor,dispatchedAt:clock!.now.toISOString(),digest:'sha256:'+'0'.repeat(64)});
    const record=contract('ExceptionSuccessorDispatchRecord',{...unsigned,digest:await digestContract('ExceptionSuccessorDispatchRecord',unsigned)});
    await tx.owner('HumanGateway')`INSERT INTO human.exception_successor_dispatches
      (resource_organization_id,id,workspace_id,purpose_names,record,resolution_id,exception_id)
      VALUES (${c.resourceOrganizationId},${record.dispatchRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
        ${JSON.stringify(record)}::text::jsonb,${resolutionRef.id},${exception.exceptionRef.id})`;
    const command={type:'abh.exceptions.apply-resolution-effect' as const,commandId:record.dispatchRef.id,
      idempotencyKey:`successor/${resolutionRef.id}`,digest:record.digest};
    await appendChange(tx,{command,target:record.dispatchRef,eventType:'abh.exception-successor-dispatch.created',
      changedFields:['resolutionKind','successorRef'],relatedRefs:[resolutionRef,exception.exceptionRef,
        exception.sourceRef,exception.reportRef,successorRef]});
    return record;
  }
}
