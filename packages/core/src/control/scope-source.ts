import type {EntityRef,GrantRecord,ScopeAuthorityDraft,ScopeAuthorityPolicyInput} from '@abh/contracts';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {ResourceEnvelopeOwner} from '../resources/envelopes.ts';
import {currentIdentity} from '../identity/owner.ts';
import {lockFences} from './fences.ts';
import {PurposeOwner} from './purposes.ts';
import {sameRef,refKey} from '../execution/shared.ts';

/** Reads delegation sources, not management admission. Does not create or authorize an Authority. */
export async function resolveScopeAuthoritySource(tx:TenantTransaction,draft:ScopeAuthorityDraft,additionalFenceRefs:readonly EntityRef[]=[]):Promise<ScopeAuthorityPolicyInput>{
  contract('ScopeAuthorityDraft',draft);const c=tx.context.tenant;
  if(draft.scopeRefs.some(scope=>scope.type!=='abh.organization'||scope.id!==c.resourceOrganizationId))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  if(new Set(draft.grantRefs.map(ref=>ref.id)).size!==draft.grantRefs.length)throw new CoreError('INVALID_ARGUMENT');
  // Nonempty predicates require their registered evaluator; absence is never interpreted as satisfied.
  if(draft.stopConditions.length)throw new CoreError('AUTHORITY_REQUIRED');
  const sourceFences=[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},
    draft.executionPrincipalRef,...draft.allowedProposerRefs,...draft.grantRefs,...draft.scopeRefs,...draft.purposeRefs,draft.resourceEnvelopeRef];
  const fences=await lockFences(tx,[...sourceFences,...additionalFenceRefs]);
  if(fences.some(f=>f.stopFlag))throw new CoreError('EPOCH_REVOKED');
  const identity=await currentIdentity(tx);if(identity.scopeEpoch!==c.scopeEpoch)throw new CoreError('EPOCH_REVOKED');
  const sources:EntityRef[]=[identity.organization.organizationRef,identity.principal.principalRef,identity.membership.membershipRef,...fences.filter(f=>sourceFences.some(ref=>sameRef(ref,f.scopeRef))).map(f=>f.fenceRef)];
  for(const person of [draft.executionPrincipalRef,...draft.allowedProposerRefs]){
    const rows=await tx.owner('Identity')`SELECT p.version,p.identity_kind,m.id AS membership_id,m.version AS membership_version FROM identity.principals p
      JOIN identity.memberships m ON m.resource_organization_id=p.resource_organization_id AND m.principal_id=p.id
      WHERE p.resource_organization_id=${c.resourceOrganizationId} AND p.id=${person.id} AND p.status='Active' AND m.status='Active' AND p.deleted_at IS NULL AND m.deleted_at IS NULL`;
    if(rows.length!==1||Number(rows[0]!.version)!==person.version||(person.id===draft.executionPrincipalRef.id&&rows[0]!.identity_kind!=='Service'))throw new CoreError('AUTHORITY_REQUIRED');
    sources.push(person,{type:'abh.membership',id:rows[0]!.membership_id,version:Number(rows[0]!.membership_version)});
  }
  const purposes=await new PurposeOwner().requireAllCurrent(tx,draft.purposeRefs);
  const grants:GrantRecord[]=[];
  for(const ref of [...draft.grantRefs].sort((a,b)=>a.id.localeCompare(b.id))){
    const [row]=await tx.owner('Control')`SELECT record,version,status,principal_id,valid_from,valid_until FROM control.grants WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()`;
    if(!row||row.status!=='Active'||Number(row.version)!==ref.version)throw new CoreError('AUTHORITY_REQUIRED');
    const grant=contract('GrantRecord',row.record);
    if(!sameRef(grant.grantRef,ref)||grant.resourceOrganizationId!==c.resourceOrganizationId||grant.principalRef.id!==row.principal_id||grant.status!==row.status
      ||Date.parse(grant.validFrom)!==row.valid_from.getTime()||Date.parse(grant.validUntil)!==row.valid_until.getTime())throw new CoreError('INTERNAL_ERROR');
    if(!sameRef(grant.principalRef,draft.executionPrincipalRef)||purposes.some(purpose=>!grant.purposeNames.includes(purpose.name))||draft.actionTypes.some(action=>!grant.actionTypes.includes(action))
      ||draft.scopeRefs.some(scope=>!grant.scopeRefs.some(allowed=>sameRef(scope,allowed)))||Date.parse(draft.validFrom)<Date.parse(grant.validFrom)||Date.parse(draft.validUntil)>Date.parse(grant.validUntil))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
    grants.push(grant);sources.push(grant.grantRef);
  }
  const [clock]=await tx.owner('Control')`SELECT clock_timestamp() AS now`;
  if(Date.parse(draft.validFrom)>clock!.now.getTime()||Date.parse(draft.validUntil)<=clock!.now.getTime()||Date.parse(draft.validUntil)<=Date.parse(draft.validFrom))throw new CoreError('AUTHORITY_REQUIRED');
  const resourceEnvelope=await new ResourceEnvelopeOwner().get(tx,draft.resourceEnvelopeRef);
  if(draft.scopeRefs.some(scope=>!resourceEnvelope.scopeRefs.some(allowed=>sameRef(scope,allowed))))throw new CoreError('EXECUTION_AUTHORITY_SCOPE_EXCEEDED');
  if(purposes.some(purpose=>!resourceEnvelope.purposeNames.includes(purpose.name)))throw new CoreError('PURPOSE_DENIED');
  sources.push(...purposes.map(purpose=>purpose.purposeRef),resourceEnvelope.envelopeRef,...draft.scopeRefs);
  const sourceVersionRefs=[...new Map(sources.map(ref=>[refKey(ref),ref])).values()].sort((a,b)=>refKey(a).localeCompare(refKey(b)));
  return contract('ScopeAuthorityPolicyInput',{schemaVersion:'0.1.0',resourceOrganizationId:c.resourceOrganizationId,purposeOfUse:c.purposeOfUse,actor:c.actor,draft,grants,sourceVersionRefs,resourceEnvelope});
}
