import type {ActionRecord,EntityRef,ExecutionAuthority,FenceRecord,GrantRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {ActionOwner} from '../execution/actions.ts';
import {sameRef} from '../execution/shared.ts';
import {lockFences} from './fences.ts';

export interface ExecutionSource {
  readonly authority:ExecutionAuthority;
  readonly grants:GrantRecord[];
  readonly fences:FenceRecord[];
  readonly sourceVersions:EntityRef[];
}

/** One input to the Resolver, never a Snapshot/Permit: Purpose directory, policy, resource and domain checks still follow. */
export async function inspectActionExecutionSource(tx:TenantTransaction,action:ActionRecord,assertion?:EntityRef,additionalScopes:EntityRef[]|((authority:ExecutionAuthority)=>EntityRef[]|Promise<EntityRef[]>)=[]):Promise<ExecutionSource>{
  contract('ActionRecord',action);if(assertion)contract('AuthorityRef',assertion);
  const c=tx.context.tenant,sql=tx.owner('Control');
  if(action.missionRef||action.resourceOrganizationId!==c.resourceOrganizationId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  const candidates=await sql`SELECT record FROM control.execution_authorities WHERE resource_organization_id=${c.resourceOrganizationId}
    AND execution_principal_id=${action.executionPrincipalRef.id} AND status='Active' AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp() AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  const matches=candidates.map(row=>contract('ExecutionAuthority',row.record)).filter(authority=>
    (!action.executionAuthorityRef||sameRef(action.executionAuthorityRef,authority.authorityRef))
      &&authority.allowedProposerRefs.some(proposer=>proposer.id===action.proposedBy.id)&&authority.actionTypes.includes(action.actionType)
      &&(authority.binding.kind==='Scope'||authority.binding.actionRef.id===action.actionRef.id&&authority.binding.payloadDigest===action.payloadDigest));
  if(matches.length!==1)throw new CoreError(matches.length?'EXECUTION_AUTHORITY_AMBIGUOUS':'AUTHORITY_REQUIRED');
  const selected=matches[0]!;
  if(assertion&&!sameRef(assertion,selected.authorityRef))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  // Current first-party organization scope. Cross-organization/resource inheritance uses the dedicated verified scope chain.
  if(selected.scopeRefs.some(scope=>scope.type!=='abh.organization'||scope.id!==c.resourceOrganizationId))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  const proposer=selected.allowedProposerRefs.find(ref=>ref.id===action.proposedBy.id)!;
  const scopes=[{type:'abh.organization',id:c.resourceOrganizationId,version:1},selected.authorityRef,...selected.grantRefs,selected.executionPrincipalRef,proposer,...selected.scopeRefs,...(typeof additionalScopes==='function'?await additionalScopes(selected):additionalScopes)];
  const fences=await lockFences(tx,scopes);
  if(fences.some(fence=>fence.stopFlag||fence.scopeRef.type==='abh.organization'&&fence.scopeRef.id===c.resourceOrganizationId&&fence.epoch!==c.scopeEpoch))throw new CoreError('EPOCH_REVOKED');
  const current=await new ActionOwner().get(tx,action.actionRef.id);
  if(canonicalJson(current)!==canonicalJson(action))throw new CoreError('VERSION_CONFLICT');
  if(!['Validated','Authorized','Executing','Reconciling'].includes(current.position.lifecycle))throw new CoreError('PRECONDITION_FAILED');
  if(current.executionAuthorityRef&&!sameRef(current.executionAuthorityRef,selected.authorityRef))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  const rows=await sql`SELECT record,version,status,valid_from,valid_until FROM control.execution_authorities WHERE resource_organization_id=${c.resourceOrganizationId}
    AND id=${selected.authorityRef.id} AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp() AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!rows[0]||rows[0].status!=='Active'||Number(rows[0].version)!==selected.authorityRef.version)throw new CoreError('AUTHORITY_REQUIRED');
  const authority=contract('ExecutionAuthority',rows[0].record);
  if(authority.status!==rows[0].status||authority.authorityRef.version!==Number(rows[0].version)||authority.authorityRef.id!==selected.authorityRef.id
    ||Date.parse(authority.validFrom)!==rows[0].valid_from.getTime()||Date.parse(authority.validUntil)!==rows[0].valid_until.getTime())throw new CoreError('INTERNAL_ERROR');
  if(await digestContract('ExecutionAuthority',authority)!==authority.issuanceDigest||authority.issuanceDigest!==selected.issuanceDigest
    ||!sameRef(authority.executionPrincipalRef,action.executionPrincipalRef))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  const sourceVersions:EntityRef[]=[authority.authorityRef];
  for(const principal of [authority.executionPrincipalRef,proposer]){
    const people=await tx.owner('Identity')`SELECT p.version,p.identity_kind,m.id AS membership_id,m.version AS membership_version,o.version AS organization_version
      FROM identity.principals p JOIN identity.memberships m ON m.resource_organization_id=p.resource_organization_id AND m.principal_id=p.id
      JOIN identity.organizations o ON o.resource_organization_id=p.resource_organization_id AND o.id=p.resource_organization_id
      WHERE p.resource_organization_id=${c.resourceOrganizationId} AND p.id=${principal.id} AND p.version=${principal.version}
        AND p.status='Active' AND m.status='Active' AND o.status='Active' AND p.deleted_at IS NULL AND m.deleted_at IS NULL AND o.deleted_at IS NULL`;
    const row=people[0];
    if(!row||row.identity_kind!==(principal.id===authority.executionPrincipalRef.id?'Service':action.proposedBy.type))throw new CoreError('AUTHORITY_REQUIRED');
    sourceVersions.push(principal,{type:'abh.membership',id:row.membership_id,version:Number(row.membership_version)});
  }
  const receipts=await tx.owner('CommandIngress')`SELECT record FROM data.command_receipts WHERE resource_organization_id=${c.resourceOrganizationId}
    AND id=${action.sourceCommandRef.id} AND actor_principal_id=${action.proposedBy.id} AND command_type='abh.actions.propose' AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!receipts[0])throw new CoreError('AUTHORITY_REQUIRED');const receipt=contract('CommandReceipt',receipts[0].record);
  if(!sameRef(receipt.commandRef,action.sourceCommandRef)||receipt.resultRef.type!=='abh.action'||receipt.resultRef.id!==action.actionRef.id)throw new CoreError('AUTHORITY_REQUIRED');
  sourceVersions.push(receipt.commandRef);
  const grants:GrantRecord[]=[];
  for(const grantRef of authority.grantRefs){
    const rows=await sql`SELECT record,version,status,principal_id,valid_from,valid_until FROM control.grants WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${grantRef.id}
      AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp() AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    const row=rows[0];
    if(!row||row.status!=='Active'||Number(row.version)!==grantRef.version||row.principal_id!==authority.executionPrincipalRef.id)throw new CoreError('AUTHORITY_REQUIRED');
    const grant=contract('GrantRecord',row.record);
    if(!sameRef(grant.grantRef,grantRef)||!sameRef(grant.principalRef,authority.executionPrincipalRef)||grant.status!=='Active'||grant.resourceOrganizationId!==c.resourceOrganizationId
      ||Date.parse(grant.validFrom)!==row.valid_from.getTime()||Date.parse(grant.validUntil)!==row.valid_until.getTime())throw new CoreError('INTERNAL_ERROR');
    if(!grant.actionTypes.includes(action.actionType)||!grant.purposeNames.includes(c.purposeOfUse)||authority.scopeRefs.some(scope=>!grant.scopeRefs.some(granted=>sameRef(granted,scope))))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    if(Date.parse(authority.validFrom)<Date.parse(grant.validFrom)||Date.parse(authority.validUntil)>Date.parse(grant.validUntil))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    grants.push(grant);sourceVersions.push(grant.grantRef);
  }
  return {authority,grants,fences,sourceVersions};
}
