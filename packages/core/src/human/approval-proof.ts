import type {ActionRecord,DecisionRecord,EntityRef,ImpactUpperBound,PackEnableProposal,OperationPlan,RequestCompletionEvidence,ResponsibilityRequestRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {assertImpactBound,sameRef} from '../execution/shared.ts';
import {currentResponsibility} from './responsibilities.ts';

async function load(tx:TenantTransaction,ref:EntityRef):Promise<{proof:RequestCompletionEvidence;request:ResponsibilityRequestRecord;decisions:DecisionRecord[];workspaceId:string|null;purposeNames:string[]}>{
  contract('EntityRef',ref);if(ref.type!=='abh.request-completion-evidence')throw new CoreError('AUTHORITY_REQUIRED');const c=tx.context.tenant,sql=tx.owner('HumanGateway');
  const rows=await sql`SELECT record,version FROM human.completion_evidence WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ref.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!rows[0]||Number(rows[0].version)!==ref.version)throw new CoreError('AUTHORITY_REQUIRED');const proof=contract('RequestCompletionEvidence',rows[0].record);
  if(!sameRef(proof.completionEvidenceRef,ref)||proof.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('AUTHORITY_REQUIRED');
  const requests=await sql`SELECT record,version,status,workspace_id,purpose_names FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${proof.requestRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!requests[0]||Number(requests[0].version)!==proof.requestRef.version||requests[0].status!=='Closed')throw new CoreError('AUTHORITY_REQUIRED');
  const request=contract('ResponsibilityRequestRecord',requests[0].record);
  if(!sameRef(request.requestRef,proof.requestRef)||request.status!=='Closed'||request.routeRevision!==proof.routeRevision||request.proposalDigest!==proof.proposalDigest||!sameRef(request.subjectRef,proof.subjectRef))throw new CoreError('AUTHORITY_REQUIRED');
  const children=await sql`SELECT record,version,status FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId} AND request_id=${request.requestRef.id} AND route_revision=${proof.routeRevision} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  const decisions=children.map(row=>{const decision=contract('DecisionRecord',row.record);if(decision.decisionRef.version!==Number(row.version)||decision.status!==row.status)throw new CoreError('AUTHORITY_REQUIRED');return decision;});
  return {proof,request,decisions,workspaceId:requests[0].workspace_id,purposeNames:requests[0].purpose_names};
}

/** Collect before Control locks; verify repeats all reads after those locks in the same UoW. */
export async function approvalFenceRefs(tx:TenantTransaction,ref:EntityRef):Promise<EntityRef[]>{
  const {decisions,request}=await load(tx,ref),result:EntityRef[]=[];
  for(const decision of decisions.filter(d=>request.requiredSlots.some(slot=>slot.required&&slot.slotId===d.package.slotId))){
    if(!decision.responsibilityRef||!decision.respondedBy||!decision.decisionGrantRefs)throw new CoreError('AUTHORITY_REQUIRED');
    result.push(decision.responsibilityRef,{type:'abh.principal',id:decision.respondedBy.id,version:1},...decision.decisionGrantRefs);
  }
  return result;
}

/** Approved Action-bound requests with no unimplemented condition predicates; Scope preauthorization is a separate path. */
export async function verifyActionApproval(tx:TenantTransaction,ref:EntityRef,action:ActionRecord,plan:OperationPlan):Promise<EntityRef[]>{
  const loaded=await load(tx,ref),{proof,request}=loaded;
  if(request.kind!=='Authorization'||proof.subjectRef.type!=='abh.action'||proof.subjectRef.id!==action.actionRef.id||proof.proposalDigest!==action.payloadDigest||proof.conditionRefs.length)throw new CoreError('AUTHORITY_REQUIRED');
  return verifyRequiredSeats(tx,loaded,plan.impactUpperBound);
}

/** Exact deployment proposal approval only; callers must independently re-read all Pack evidence and CAS deployment state. */
export async function verifyPackEnableApproval(tx:TenantTransaction,ref:EntityRef,input:PackEnableProposal):Promise<EntityRef[]>{
  const proposal=contract('PackEnableProposal',JSON.parse(canonicalJson(input))),c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
  if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
  if(proposal.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('PackEnableProposal',proposal)!==proposal.proposalDigest)throw new CoreError('AUTHORITY_REQUIRED');
  const loaded=await load(tx,ref),{proof,request,decisions,workspaceId}=loaded;
  const [clock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
  if(!loaded.purposeNames.includes(c.purposeOfUse)||workspaceId!==null||request.resourceOrganizationId!==c.resourceOrganizationId||request.kind!=='Authorization'||!sameRef(proof.subjectRef,proposal.packRef)
    ||proof.proposalDigest!==proposal.proposalDigest||proof.conditionRefs.length||Date.parse(proposal.expiresAt)<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
  const evidence=[proposal.validationRef,proposal.governanceRef,proposal.ctkRef,proposal.impactRef,proposal.migrationVerificationRef,proposal.capabilitySetRef];
  if(evidence.some(ref=>!request.evidenceRefs.some(actual=>sameRef(ref,actual)))
    ||decisions.filter(d=>request.requiredSlots.some(slot=>slot.required&&slot.slotId===d.package.slotId)).some(d=>
      canonicalJson(d.package.impactUpperBound)!==canonicalJson(proposal.impactUpperBound)||evidence.some(ref=>!d.package.evidenceRefs.some(actual=>sameRef(ref,actual)))))throw new CoreError('AUTHORITY_REQUIRED');
  const refs=await verifyRequiredSeats(tx,loaded,proposal.impactUpperBound);
  const [finalClock]=await tx.owner('HumanGateway')`SELECT clock_timestamp() AS now`;
  if(Date.parse(proposal.expiresAt)<=finalClock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
  return refs;
}

async function verifyRequiredSeats(tx:TenantTransaction,{proof,request,decisions,workspaceId}:Awaited<ReturnType<typeof load>>,impact:ImpactUpperBound):Promise<EntityRef[]>{
  const c=tx.context.tenant,sql=tx.owner('HumanGateway');
  const required:DecisionRecord[]=[];
  const [clock]=await sql`SELECT clock_timestamp() AS now`;
  if(Date.parse(request.expiresAt)<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
  for(const slot of request.requiredSlots.filter(slot=>slot.required)){
    if(slot.responsibilityType!=='Authorization'||slot.responsibleOrganizationId!==c.resourceOrganizationId)throw new CoreError('AUTHORITY_REQUIRED');
    for(const seat of slot.seats){
      const matching=decisions.filter(decision=>decision.package.slotId===slot.slotId&&decision.seatId===seat.seatId);
      if(matching.length!==1)throw new CoreError('AUTHORITY_REQUIRED');const decision=matching[0]!;
      if(decision.status!=='Approved'||decision.submission?.response!=='Approved'||decision.submission.conditionRefs.length||!decision.responsibilityRef||decision.respondedBy?.type!=='Human'||!decision.decisionGrantRefs?.length
        ||!seat.responsibilityRefs.some(ref=>sameRef(ref,decision.responsibilityRef!))||!proof.decisionRefs.some(ref=>sameRef(ref,decision.decisionRef)))throw new CoreError('AUTHORITY_REQUIRED');
      const pkg=decision.package;
      if(pkg.requestRef.id!==request.requestRef.id||pkg.routeRevision!==proof.routeRevision||!sameRef(pkg.subjectRef,proof.subjectRef)||pkg.proposalDigest!==proof.proposalDigest
        ||pkg.packageDigest!==decision.submission.packageDigest||await digestContract('DecisionPackage',pkg)!==pkg.packageDigest||Date.parse(pkg.validUntil)<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
      assertImpactBound(impact,pkg.impactUpperBound);
      const responsibility=await currentResponsibility(tx,decision.responsibilityRef,workspaceId);
      if(!responsibility||responsibility.principalRef.id!==decision.respondedBy.id||responsibility.responsibilityType!=='Authorization'
        ||impact.scopeRefs.some(scope=>!responsibility.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('AUTHORITY_REQUIRED');
      for(const grantRef of decision.decisionGrantRefs){
        const grants=await tx.owner('Control')`SELECT record,version,status,valid_from,valid_until FROM control.grants WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${grantRef.id}
          AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()`;
        if(!grants[0]||grants[0].status!=='Active'||Number(grants[0].version)!==grantRef.version)throw new CoreError('AUTHORITY_REQUIRED');const grant=contract('GrantRecord',grants[0].record);
        if(!sameRef(grant.grantRef,grantRef)||!sameRef(grant.principalRef,responsibility.principalRef)||grant.status!=='Active'||grant.resourceOrganizationId!==c.resourceOrganizationId
          ||Date.parse(grant.validFrom)!==grants[0].valid_from.getTime()||Date.parse(grant.validUntil)!==grants[0].valid_until.getTime()
          ||!grant.actionTypes.includes('abh.decisions.submit')||!grant.purposeNames.includes('abh.decision.review')
          ||impact.scopeRefs.some(scope=>!grant.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('AUTHORITY_REQUIRED');
      }
      required.push(decision);
    }
  }
  if(!required.length||required.length!==proof.decisionRefs.length)throw new CoreError('AUTHORITY_REQUIRED');
  return [proof.completionEvidenceRef,proof.requestRef,...required.flatMap(decision=>[decision.decisionRef,decision.responsibilityRef!,...decision.decisionGrantRefs!])];
}
