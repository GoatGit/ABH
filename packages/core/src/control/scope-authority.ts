import {randomUUID} from 'node:crypto';
import type {CreateScopeAuthorityPayload,EntityRef,ExecutionAuthority} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {ExecutionAuthorityOwner} from './authority.ts';
import {appendChange,contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {lockFences} from './fences.ts';
import {assertCurrentGrants} from './grants.ts';
import {resolveScopeAuthoritySource} from './scope-source.ts';
import {PurposeOwner} from './purposes.ts';
import {PolicyOwner} from './policy-owner.ts';
import {sameRef} from '../execution/shared.ts';

/** Scope effect uses an existing service Grant; it never mints another Grant or copies its budget. */
export class ScopeAuthorityOwner {
  async admit(tx:TenantTransaction,input:CreateScopeAuthorityPayload):Promise<void>{
    contract('CreateScopeAuthorityPayload',input);const {draft}=input,c=tx.context.tenant;
    // Lock the full set before management admission; later source reads reuse these locks.
    const fences=await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},
      draft.executionPrincipalRef,...draft.allowedProposerRefs,...draft.grantRefs,...draft.scopeRefs,...draft.purposeRefs,draft.resourceEnvelopeRef,...input.managementGrantRefs]);
    if(fences.some(f=>f.stopFlag&&input.managementGrantRefs.some(ref=>sameRef(ref,f.scopeRef))))throw new CoreError('EPOCH_REVOKED');
    // The stable provisional target is the evidence ID; create is a type-scoped organization permission.
    await assertCurrentGrants(tx,{objectRef:{type:'abh.execution-authority',id:input.evaluationRef.id,version:1},scopeRefs:draft.scopeRefs,action:'abh.execution-authority.create'},input.managementGrantRefs);
  }
  async create(tx:TenantTransaction,command:CommandIdentity,input:CreateScopeAuthorityPayload):Promise<ExecutionAuthority>{
    await this.admit(tx,input);const {draft}=input,c=tx.context.tenant,sql=tx.owner('Control');
    const digest=await inputDigest({draft,evaluationRef:input.evaluationRef});
    const existing=await sql`SELECT record,input_digest,workspace_id FROM control.execution_authorities WHERE resource_organization_id=${c.resourceOrganizationId}
      AND evidence_type='abh.policy-evaluation' AND evidence_id=${input.evaluationRef.id} AND effect_key=${draft.effectKey}`;
    if(existing[0]){
      if(existing[0].workspace_id&&existing[0].workspace_id!==c.workspaceId)throw new CoreError('AUTHORITY_REQUIRED');
      if(existing[0].input_digest!==digest)throw new CoreError('IDEMPOTENCY_CONFLICT');
      return contract('ExecutionAuthority',existing[0].record);
    }
    const purposeNames=(await new PurposeOwner().requireAllCurrent(tx,draft.purposeRefs)).map(purpose=>purpose.name);
    const managers=await assertCurrentGrants(tx,{objectRef:{type:'abh.execution-authority',id:input.evaluationRef.id,version:1},scopeRefs:draft.scopeRefs,action:'abh.execution-authority.create'},input.managementGrantRefs);
    if(managers.some(grant=>purposeNames.some(name=>!grant.purposeNames.includes(name))))throw new CoreError('FORBIDDEN');
    const source=await resolveScopeAuthoritySource(tx,draft),{binding,policy}=await new PolicyOwner().selectMandatory(tx,'ScopeAuthorityPolicyInput');
    await new InlineArtifactOwner().read(tx,policy.artifactRef,async artifact=>{if(artifact.contentDigest!==policy.manifestDigest)throw new CoreError('POLICY_DENIED');});
    const [row]=await sql`SELECT record,version,target_type,target_id,purpose_names FROM control.policy_evaluations WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${input.evaluationRef.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!row)throw new CoreError('AUTHORITY_REQUIRED');
    if(purposeNames.some(name=>!row.purpose_names.includes(name)))throw new CoreError('PURPOSE_DENIED');const proof=contract('PolicyEvaluationRecord',row.record);
    if(!sameRef(proof.evaluationRef,input.evaluationRef)||Number(row.version)!==proof.evaluationRef.version||proof.resourceOrganizationId!==c.resourceOrganizationId
      ||row.target_type!==proof.targetRef.type||row.target_id!==proof.targetRef.id||!sameRef(proof.targetRef,draft.executionPrincipalRef)||proof.kind!=='Mandatory'
      ||!proof.decision.allow||proof.decision.obligationRefs.length||canonicalJson(proof.policyVersionRefs)!==canonicalJson([policy.policyVersionRef])
      ||proof.inputDigest!==await inputDigest({input:source,bindingRef:binding.bindingRef}))throw new CoreError('POLICY_DENIED');
    const authorityRef={type:'abh.execution-authority' as const,id:randomUUID(),version:1};
    const unsigned=contract('ExecutionAuthority',{...draft,authorityRef,resourceOrganizationId:c.resourceOrganizationId,binding:{kind:'Scope'},issuanceEvidenceRef:proof.evaluationRef,
      issuedBy:c.actor,sourceVersionRefs:[...source.sourceVersionRefs,binding.bindingRef,policy.policyVersionRef],issuanceDigest:'sha256:'+'0'.repeat(64),status:'Active'});
    const authority=contract('ExecutionAuthority',{...unsigned,issuanceDigest:await digestContract('ExecutionAuthority',unsigned)});
    await sql`INSERT INTO control.execution_authorities(resource_organization_id,id,workspace_id,purpose_names,execution_principal_id,evidence_type,evidence_id,effect_key,input_digest,valid_from,valid_until,status,record)
      VALUES (${c.resourceOrganizationId},${authorityRef.id},${c.workspaceId??null},${purposeNames},${draft.executionPrincipalRef.id},'abh.policy-evaluation',${proof.evaluationRef.id},${draft.effectKey},${digest},${draft.validFrom},${draft.validUntil},'Active',${JSON.stringify(authority)}::text::jsonb)`;
    await sql`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch) VALUES (${c.resourceOrganizationId},${randomUUID()},'abh.execution-authority',${authorityRef.id},1)`;
    await appendChange(tx,{command,target:authorityRef,eventType:'abh.execution-authority.created',changedFields:['binding','grantRefs','status'],relatedRefs:[proof.evaluationRef,...draft.grantRefs]});return authority;
  }
}

/** Internal authenticated ingress; current management admission runs even when CommandReceipt already exists. */
export async function createScopeAuthority(database:Database,context:VerifiedContext,options:TransactionOptions,command:CommandIdentity,input:CreateScopeAuthorityPayload):Promise<ExecutionAuthority>{
  contract('CreateScopeAuthorityPayload',input);
  if(command.type!=='abh.execution-authority.create'||command.digest!==await inputDigest(input))throw new CoreError('INVALID_ARGUMENT');
  const owner=new ScopeAuthorityOwner();
  return database.transaction(context,options,async tx=>{
    const result=await executeCommand(tx,command,()=>owner.admit(tx,input),async()=>(await owner.create(tx,command,input)).authorityRef);
    const authority=await new ExecutionAuthorityOwner().get(tx,result.receipt.resultRef.id);
    if(authority.issuanceEvidenceRef.type!==input.evaluationRef.type||authority.issuanceEvidenceRef.id!==input.evaluationRef.id||authority.effectKey!==input.draft.effectKey)throw new CoreError('INTERNAL_ERROR');
    return authority;
  });
}
