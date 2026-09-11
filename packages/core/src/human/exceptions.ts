import {randomUUID} from 'node:crypto';
import type {EntityRef,ExceptionRecord,OpenTerminalExceptionPayload} from '@abh/contracts';
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

export interface ExceptionInstallation {
  /** Every control fence read by eligibility must be declared before resource/aggregate locks. */
  fenceRefs(tx:TenantTransaction,input:OpenTerminalExceptionPayload):Promise<EntityRef[]>;
  eligibility:DecisionEligibility;
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
      VALUES (${c.resourceOrganizationId},${record.exceptionRef.id},${c.workspaceId??null},${[c.purposeOfUse,'abh.runtime.deliver']},${input.reportRef.id},${opened.requestRef.id},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.exceptionRef,eventType:'abh.exception.created',changedFields:['sourceRef','reportRef','requestRef','blockedScopeRefs'],relatedRefs:[record.sourceRef,record.reportRef,record.requestRef,...record.blockedScopeRefs]});
    return record;
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
