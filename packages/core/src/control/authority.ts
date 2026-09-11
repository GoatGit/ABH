import {randomUUID} from 'node:crypto';
import type {DecisionRecord,EntityRef,ExecutionAuthority,GrantRecord,IssueExecutionAuthorityPayload,RequestCompletionEvidence} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from './fences.ts';
import {currentResponsibility} from '../human/responsibilities.ts';

export interface AuthorityEffectChecks {
  /** Collect all source Grant/subject/resource fences before any aggregate lock. */
  lock(tx:TenantTransaction,input:IssueExecutionAuthorityPayload):Promise<void>;
  /** Current management/delegation rights, Action binding, purpose directory, envelope and registered stop conditions. */
  scope(tx:TenantTransaction,input:IssueExecutionAuthorityPayload,proof:RequestCompletionEvidence):Promise<void>;
  /** Revalidate current approval Grant, source subject/version and responsibility constraints. */
  decision(tx:TenantTransaction,decision:DecisionRecord):Promise<void>;
}
const same=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id&&a.version===b.version;

/** Effect issuance for approved Action requests only; Scope preauthorization uses a separate policy-evidence path. */
export class ExecutionAuthorityOwner {
  async get(tx:TenantTransaction,id:string):Promise<ExecutionAuthority>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('Control')`SELECT record,status,version,execution_principal_id,evidence_type,evidence_id,effect_key,valid_from,valid_until FROM control.execution_authorities WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('ExecutionAuthority',rows[0].record);
    const row=rows[0];
    if(record.status!==row.status||record.authorityRef.id!==id||record.authorityRef.version!==Number(row.version)||record.resourceOrganizationId!==c.resourceOrganizationId
      ||record.executionPrincipalRef.id!==row.execution_principal_id||record.issuanceEvidenceRef.type!==row.evidence_type||record.issuanceEvidenceRef.id!==row.evidence_id||record.effectKey!==row.effect_key
      ||Date.parse(record.validFrom)!==row.valid_from.getTime()||Date.parse(record.validUntil)!==row.valid_until.getTime()||await digestContract('ExecutionAuthority',record)!==record.issuanceDigest)throw new CoreError('INTERNAL_ERROR');return record;
  }
  async issueEffect(tx:TenantTransaction,command:CommandIdentity,input:IssueExecutionAuthorityPayload,checks:AuthorityEffectChecks):Promise<ExecutionAuthority>{
    contract('IssueExecutionAuthorityPayload',input);const {authority,serviceGrant:grant}=input,c=tx.context.tenant,sql=tx.owner('Control');
    if(authority.issuanceEvidenceRef.type!=='abh.request-completion-evidence'||authority.binding.kind!=='Action'||authority.status!=='Active'||grant.status!=='Active'
      ||authority.authorityRef.version!==1||grant.grantRef.version!==1||authority.resourceOrganizationId!==c.resourceOrganizationId||grant.resourceOrganizationId!==c.resourceOrganizationId
      ||authority.issuedBy.id!==c.actor.id||authority.issuedBy.type!==c.actor.type||authority.grantRefs.length!==1||!same(authority.grantRefs[0]!,grant.grantRef)||!same(authority.executionPrincipalRef,grant.principalRef)
      ||!same(authority.issuanceEvidenceRef,grant.issuanceEvidenceRef)||authority.actionTypes.some(action=>!grant.actionTypes.includes(action))
      ||authority.scopeRefs.some(scope=>!grant.scopeRefs.some(candidate=>same(scope,candidate)))
      ||Date.parse(authority.validFrom)<Date.parse(grant.validFrom)||Date.parse(authority.validUntil)>Date.parse(grant.validUntil))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    const issueDigest=await digestContract('ExecutionAuthority',authority);
    if(issueDigest!==authority.issuanceDigest)throw new CoreError('INVALID_ARGUMENT');
    const digest=await inputDigest({issuanceDigest:issueDigest,grant});
    await checks.lock(tx,input);
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1}]);
    if(fences.some(f=>f.stopFlag))throw new CoreError('EPOCH_REVOKED');
    const existing=await sql`SELECT record,input_digest,workspace_id FROM control.execution_authorities WHERE resource_organization_id=${c.resourceOrganizationId}
      AND evidence_type=${authority.issuanceEvidenceRef.type} AND evidence_id=${authority.issuanceEvidenceRef.id} AND effect_key=${authority.effectKey}`;
    if(existing[0]){
      if(existing[0].workspace_id&&existing[0].workspace_id!==c.workspaceId)throw new CoreError('AUTHORITY_REQUIRED');
      if(existing[0].input_digest!==digest)throw new CoreError('IDEMPOTENCY_CONFLICT');
      // Historical receipt only: replay never reactivates the Grant or Authority.
      return contract('ExecutionAuthority',existing[0].record);
    }
    const [now]=await sql`SELECT clock_timestamp() AS now`;
    if(Date.parse(authority.validFrom)>now!.now.getTime()||Date.parse(authority.validUntil)<=now!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
    const evidence=await tx.owner('HumanGateway')`SELECT record,workspace_id FROM human.completion_evidence WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${authority.issuanceEvidenceRef.id} AND version=${authority.issuanceEvidenceRef.version} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!evidence[0])throw new CoreError('AUTHORITY_REQUIRED');const proof=contract('RequestCompletionEvidence',evidence[0].record);
    if(!same(proof.completionEvidenceRef,authority.issuanceEvidenceRef)||proof.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('AUTHORITY_REQUIRED');
    if(!same(authority.binding.actionRef,proof.subjectRef)||authority.binding.payloadDigest!==proof.proposalDigest)throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    const requestRows=await tx.owner('HumanGateway')`SELECT record,version,status FROM human.requests WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${proof.requestRef.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!requestRows[0])throw new CoreError('AUTHORITY_REQUIRED');const request=contract('ResponsibilityRequestRecord',requestRows[0].record);
    if(request.kind!=='Authorization'||request.resourceOrganizationId!==c.resourceOrganizationId||request.status!==requestRows[0].status||request.requestRef.version!==Number(requestRows[0].version)||Date.parse(request.expiresAt)<=now!.now.getTime()||request.status!=='Closed'||request.routeRevision!==proof.routeRevision||!same(request.requestRef,proof.requestRef)||!same(request.subjectRef,proof.subjectRef)||request.proposalDigest!==proof.proposalDigest)throw new CoreError('AUTHORITY_REQUIRED');
    const all=await tx.owner('HumanGateway')`SELECT record,version,status FROM human.decisions WHERE resource_organization_id=${c.resourceOrganizationId} AND request_id=${proof.requestRef.id}
      AND route_revision=${proof.routeRevision} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    const decisions=all.map(row=>{const decision=contract('DecisionRecord',row.record);
      if(decision.status!==row.status||decision.decisionRef.version!==Number(row.version)||decision.resourceOrganizationId!==c.resourceOrganizationId)throw new CoreError('AUTHORITY_REQUIRED');return decision;});
    const required=decisions.filter(d=>request.requiredSlots.some(slot=>slot.required&&slot.slotId===d.package.slotId));
    for(const slot of request.requiredSlots.filter(s=>s.required))for(const seat of slot.seats){
      if(required.filter(d=>d.package.slotId===slot.slotId&&d.seatId===seat.seatId).length!==1)throw new CoreError('AUTHORITY_REQUIRED');
    }
    if(!required.length||required.length!==proof.decisionRefs.length||required.some(d=>d.status!=='Approved'||!proof.decisionRefs.some(ref=>same(ref,d.decisionRef))))throw new CoreError('AUTHORITY_REQUIRED');
    for(const decision of required){
      const slot=request.requiredSlots.find(slot=>slot.required&&slot.slotId===decision.package.slotId)!,seat=slot.seats.find(seat=>seat.seatId===decision.seatId),pkg=decision.package;
      if(slot.responsibilityType!=='Authorization'||slot.responsibleOrganizationId!==c.resourceOrganizationId||!seat
        ||!request.decisionRefs.some(ref=>same(ref,decision.decisionRef))||decision.submission?.response!=='Approved'||decision.respondedBy?.type!=='Human'
        ||!decision.responsibilityRef||!decision.decisionGrantRefs?.length||!seat.responsibilityRefs.some(ref=>same(ref,decision.responsibilityRef!))
        ||!decision.candidateResponsibilityRefs.some(ref=>same(ref,decision.responsibilityRef!))
        ||pkg.requestRef.id!==request.requestRef.id||pkg.routeRevision!==request.routeRevision||!same(pkg.subjectRef,proof.subjectRef)||pkg.proposalDigest!==proof.proposalDigest
        ||pkg.packageDigest!==decision.submission.packageDigest||Date.parse(pkg.validUntil)<=now!.now.getTime()||await digestContract('DecisionPackage',pkg)!==pkg.packageDigest)throw new CoreError('AUTHORITY_REQUIRED');
      const assignment=await currentResponsibility(tx,decision.responsibilityRef,evidence[0].workspace_id);
      if(!assignment||assignment.principalRef.id!==decision.respondedBy.id||assignment.responsibilityType!==slot.responsibilityType
        ||!assignment.scopeRefs.some(scope=>same(scope,proof.subjectRef)||scope.type==='abh.organization'&&scope.id===c.resourceOrganizationId))throw new CoreError('AUTHORITY_REQUIRED');
      await checks.decision(tx,decision);
    }
    const people=[authority.executionPrincipalRef,...authority.allowedProposerRefs];
    for(const person of people){
      const rows=await tx.owner('Identity')`SELECT p.identity_kind FROM identity.principals p JOIN identity.memberships m
        ON m.resource_organization_id=p.resource_organization_id AND m.principal_id=p.id
        WHERE p.resource_organization_id=${c.resourceOrganizationId} AND p.id=${person.id} AND p.version=${person.version} AND p.status='Active' AND m.status='Active'
          AND p.deleted_at IS NULL AND m.deleted_at IS NULL`;
      if(!rows[0]||(person.id===authority.executionPrincipalRef.id&&rows[0].identity_kind!=='Service'))throw new CoreError('AUTHORITY_REQUIRED');
    }
    await checks.scope(tx,input,proof);
    await sql`INSERT INTO control.grants(resource_organization_id,id,workspace_id,principal_id,record,valid_from,valid_until,status)
      VALUES (${c.resourceOrganizationId},${grant.grantRef.id},${evidence[0].workspace_id},${grant.principalRef.id},${JSON.stringify(grant)}::text::jsonb,${grant.validFrom},${grant.validUntil},'Active')`;
    await sql`INSERT INTO control.execution_authorities(resource_organization_id,id,workspace_id,execution_principal_id,evidence_type,evidence_id,effect_key,input_digest,valid_from,valid_until,status,record)
      VALUES (${c.resourceOrganizationId},${authority.authorityRef.id},${evidence[0].workspace_id},${authority.executionPrincipalRef.id},${authority.issuanceEvidenceRef.type},${authority.issuanceEvidenceRef.id},${authority.effectKey},${digest},${authority.validFrom},${authority.validUntil},'Active',${JSON.stringify(authority)}::text::jsonb)`;
    for(const target of [grant.grantRef,authority.authorityRef])await sql`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${c.resourceOrganizationId},${randomUUID()},${target.type},${target.id},1)`;
    await appendChange(tx,{command,target:grant.grantRef,eventType:'abh.grant.created',changedFields:['status','scopeRefs'],relatedRefs:[proof.completionEvidenceRef]});
    await appendChange(tx,{command,target:authority.authorityRef,eventType:'abh.execution-authority.created',changedFields:['status','grantRefs','binding'],relatedRefs:[proof.completionEvidenceRef,grant.grantRef]});
    return authority;
  }
}
