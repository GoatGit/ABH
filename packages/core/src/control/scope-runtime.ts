import type {ExecutionAuthority,ScopeAuthorityDraft} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {ExecutionAuthorityOwner} from './authority.ts';
import {PolicyOwner} from './policy-owner.ts';
import type {InstalledPolicyAssets} from './policy-assets.ts';
import {resolveScopeAuthoritySource} from './scope-source.ts';
import {lockFences} from './fences.ts';
import {sameRef} from '../execution/shared.ts';

/** Current Scope policy intersection. Does not reissue delegation, refresh its expiry or use the issuer's session. */
export async function assertScopeRuntimePolicy(tx:TenantTransaction,value:ExecutionAuthority,assets:InstalledPolicyAssets):Promise<void>{
  contract('ExecutionAuthority',value);const c=tx.context.tenant;
  const fences=await lockFences(tx,[value.authorityRef,{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},
    value.executionPrincipalRef,...value.allowedProposerRefs,...value.grantRefs,...value.scopeRefs,...value.purposeRefs,value.resourceEnvelopeRef]);
  if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
  const authority=await new ExecutionAuthorityOwner().get(tx,value.authorityRef.id);
  if(canonicalJson(authority)!==canonicalJson(value)||authority.binding.kind!=='Scope'||authority.status!=='Active'
    ||authority.executionPrincipalRef.id!==c.actor.id||authority.issuanceEvidenceRef.type!=='abh.policy-evaluation'
    ||await digestContract('ExecutionAuthority',authority)!==authority.issuanceDigest)throw new CoreError('AUTHORITY_REQUIRED');
  const draft:ScopeAuthorityDraft={executionPrincipalRef:authority.executionPrincipalRef,allowedProposerRefs:authority.allowedProposerRefs,grantRefs:authority.grantRefs,
    scopeRefs:authority.scopeRefs,purposeRefs:authority.purposeRefs,actionTypes:authority.actionTypes,resourceEnvelopeRef:authority.resourceEnvelopeRef,
    validFrom:authority.validFrom,validUntil:authority.validUntil,stopConditions:authority.stopConditions,effectKey:authority.effectKey};
  const input=await resolveScopeAuthoritySource(tx,draft);
  const [row]=await tx.owner('Control')`SELECT record,version,target_id,target_type FROM control.policy_evaluations WHERE resource_organization_id=${c.resourceOrganizationId}
    AND id=${authority.issuanceEvidenceRef.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
  if(!row)throw new CoreError('AUTHORITY_REQUIRED');const proof=contract('PolicyEvaluationRecord',row.record);
  if(!sameRef(proof.evaluationRef,authority.issuanceEvidenceRef)||Number(row.version)!==proof.evaluationRef.version||proof.resourceOrganizationId!==c.resourceOrganizationId
    ||proof.targetRef.id!==row.target_id||proof.targetRef.type!==row.target_type||!sameRef(proof.targetRef,authority.executionPrincipalRef)
    ||proof.kind!=='Mandatory'||!proof.decision.allow||proof.decision.obligationRefs.length
    ||proof.policyVersionRefs.some(ref=>!authority.sourceVersionRefs.some(source=>sameRef(source,ref))))throw new CoreError('POLICY_DENIED');
  const {policy}=await new PolicyOwner().selectMandatory(tx,'ScopeAuthorityPolicyInput');
  const artifact=await new InlineArtifactOwner().read(tx,policy.artifactRef,async record=>{if(record.contentDigest!==policy.manifestDigest)throw new CoreError('POLICY_DENIED');});
  if(artifact.record.mediaType!=='application/json')throw new CoreError('POLICY_DENIED');
  const decision=await assets.evaluate(policy,input,tx.signal);
  if(!decision.allow||decision.obligationRefs.length)throw new CoreError('POLICY_DENIED');
}
