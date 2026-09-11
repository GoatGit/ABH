import {PurposeOwner} from './purposes.ts';
import {randomUUID} from 'node:crypto';
import type {ActivateMandatoryPolicyPayload,ActionPolicyInput,ArtifactRecord,ConfigurePolicyPayload,EntityRef,PinSet,PolicyBindingRecord,PolicyEvaluationRecord,PolicyVersionRecord,ScopeAuthorityPolicyInput} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,inputDigest,type CommandIdentity} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {lifecyclePurposes} from '../data/purposes.ts';
import {CoreError} from '../internal/errors.ts';
import {sameRef} from '../execution/shared.ts';
import {lockFences} from './fences.ts';
import {InstalledPolicyAssets} from './policy-assets.ts';
import {intersectPolicies} from './policy.ts';

export interface PolicyGovernanceChecks {
  /** Collect governance/source/control fences before configuration or activation. */
  lock(tx:TenantTransaction):Promise<void>;
  /** Current publishing rights, build provenance/signature, independent release evidence and source policy review. */
  publish(tx:TenantTransaction,policy:PolicyVersionRecord,artifact:ArtifactRecord):Promise<void>;
  activate(tx:TenantTransaction,policy:PolicyVersionRecord,evidence:readonly EntityRef[]):Promise<void>;
}

/** Formal versions/current Mandatory selection. Behavior versions come exclusively from the immutable execution pins. */
export class PolicyOwner {
  async #fence(tx:TenantTransaction):Promise<void>{
    const fences=await lockFences(tx,[{type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1}]);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
  }
  async get(tx:TenantTransaction,ref:EntityRef):Promise<PolicyVersionRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.policy-version')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('Control')`SELECT record,digest,version,kind FROM control.policy_versions WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('POLICY_DENIED');const policy=contract('PolicyVersionRecord',rows[0].record);
    if(!sameRef(policy.policyVersionRef,ref)||policy.policyVersionRef.version!==Number(rows[0].version)||policy.resourceOrganizationId!==c.resourceOrganizationId||policy.kind!==rows[0].kind
      ||policy.digest!==rows[0].digest||await digestContract('PolicyVersionRecord',policy)!==policy.digest)throw new CoreError('POLICY_DENIED');return policy;
  }
  async configure(tx:TenantTransaction,command:CommandIdentity,input:ConfigurePolicyPayload,assets:InstalledPolicyAssets,checks:PolicyGovernanceChecks):Promise<PolicyVersionRecord>{
    contract('ConfigurePolicyPayload',input);const {policy}=input,c=tx.context.tenant,purposeNames=lifecyclePurposes(input.purposeNames,c.purposeOfUse);
    if(policy.resourceOrganizationId!==c.resourceOrganizationId||policy.policyVersionRef.version!==1||await digestContract('PolicyVersionRecord',policy)!==policy.digest)throw new CoreError('INVALID_ARGUMENT');
    if(policy.kind==='Behavior'&&policy.inputSchemaName!=='ActionPolicyInput')throw new CoreError('POLICY_DENIED');
    assets.assertInstalled(policy);await checks.lock(tx);await this.#fence(tx);
    const source=await new InlineArtifactOwner().read(tx,policy.artifactRef,artifact=>checks.publish(tx,policy,artifact));
    if(source.record.mediaType!=='application/json'||source.record.contentDigest!==policy.manifestDigest||purposeNames.some(purpose=>!source.record.purposeNames.includes(purpose)))throw new CoreError('POLICY_DENIED');
    const manifest=contract('CompiledPolicyManifest',JSON.parse(new TextDecoder().decode(source.bytes)));
    if(manifest.wasmDigest!==policy.wasmDigest||!manifest.entrypoints.includes(policy.entrypoint))throw new CoreError('POLICY_DENIED');
    const sql=tx.owner('Control');
    const existing=await sql`SELECT record,digest FROM control.policy_versions WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${policy.policyVersionRef.id}`;
    if(existing[0]){if(existing[0].digest!==policy.digest)throw new CoreError('IDEMPOTENCY_CONFLICT');return this.get(tx,policy.policyVersionRef);}
    await sql`INSERT INTO control.policy_versions(resource_organization_id,id,workspace_id,purpose_names,kind,digest,capability_key,record)
      VALUES (${c.resourceOrganizationId},${policy.policyVersionRef.id},${c.workspaceId??null},${purposeNames},${policy.kind},${policy.digest},${policy.behaviorCapabilityRef?canonicalJson(policy.behaviorCapabilityRef):null},${JSON.stringify(policy)}::text::jsonb)`;
    await appendChange(tx,{command,target:policy.policyVersionRef,eventType:'abh.policy-version.created',changedFields:['kind','artifactRef','digest'],relatedRefs:[policy.artifactRef,...policy.releaseEvidenceRefs]});
    return policy;
  }
  async activateMandatory(tx:TenantTransaction,command:CommandIdentity,input:ActivateMandatoryPolicyPayload,checks:PolicyGovernanceChecks):Promise<PolicyBindingRecord>{
    contract('ActivateMandatoryPolicyPayload',input);await checks.lock(tx);await this.#fence(tx);
    const c=tx.context.tenant,purposeNames=lifecyclePurposes(input.purposeNames,c.purposeOfUse),policy=await this.get(tx,input.policyVersionRef),sql=tx.owner('Control');
    if(policy.kind!=='Mandatory')throw new CoreError('POLICY_DENIED');await checks.activate(tx,policy,input.evidenceRefs);
    const configured=await sql`SELECT purpose_names FROM control.policy_versions WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${policy.policyVersionRef.id}`;
    if(purposeNames.some(purpose=>!configured[0]!.purpose_names.includes(purpose)))throw new CoreError('PURPOSE_DENIED');
    const rows=await sql`SELECT record,version FROM control.policy_bindings WHERE resource_organization_id=${c.resourceOrganizationId} AND input_schema_name=${policy.inputSchemaName} AND deleted_at IS NULL`;
    if(rows[0]?Number(rows[0].version)!==input.expectedBindingVersion:input.expectedBindingVersion!==undefined)throw new CoreError('VERSION_CONFLICT');
    const previous=rows[0]?contract('PolicyBindingRecord',rows[0].record):undefined;
    const binding=contract('PolicyBindingRecord',{bindingRef:{type:'abh.policy-binding',id:previous?.bindingRef.id??randomUUID(),version:(previous?.bindingRef.version??0)+1},resourceOrganizationId:c.resourceOrganizationId,inputSchemaName:policy.inputSchemaName,policyVersionRef:policy.policyVersionRef,evidenceRefs:input.evidenceRefs});
    if(previous)await sql`UPDATE control.policy_bindings SET version=version+1,record=${JSON.stringify(binding)}::text::jsonb,purpose_names=${purposeNames},updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${previous.bindingRef.id} AND version=${previous.bindingRef.version}`;
    else await sql`INSERT INTO control.policy_bindings(resource_organization_id,id,purpose_names,input_schema_name,record) VALUES (${c.resourceOrganizationId},${binding.bindingRef.id},${purposeNames},${policy.inputSchemaName},${JSON.stringify(binding)}::text::jsonb)`;
    // The same organization fence serializes publishing against T1/T2; binding version is a Snapshot dependency.
    await appendChange(tx,{command,target:binding.bindingRef,eventType:'abh.policy-binding.activated',changedFields:['policyVersionRef'],relatedRefs:[policy.policyVersionRef,...input.evidenceRefs]});return binding;
  }
  /** Independent current policy slots prevent a delegation allow from authorizing Action execution. */
  async selectMandatory(tx:TenantTransaction,inputSchemaName:PolicyVersionRecord['inputSchemaName']):Promise<{binding:PolicyBindingRecord;policy:PolicyVersionRecord}>{
    const c=tx.context.tenant;
    const rows=await tx.owner('Control')`SELECT record,version,input_schema_name FROM control.policy_bindings WHERE resource_organization_id=${c.resourceOrganizationId}
      AND input_schema_name=${inputSchemaName} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(rows.length!==1)throw new CoreError('POLICY_DENIED');const row=rows[0]!,binding=contract('PolicyBindingRecord',row.record);
    if(binding.bindingRef.version!==Number(row.version)||binding.resourceOrganizationId!==c.resourceOrganizationId||binding.inputSchemaName!==row.input_schema_name)throw new CoreError('INTERNAL_ERROR');
    const policy=await this.get(tx,binding.policyVersionRef);
    if(policy.kind!=='Mandatory'||policy.inputSchemaName!==inputSchemaName)throw new CoreError('POLICY_DENIED');return {binding,policy};
  }
  async select(tx:TenantTransaction,pins:PinSet):Promise<{binding:PolicyBindingRecord;policies:PolicyVersionRecord[]}>{
    contract('PinSet',pins);const c=tx.context.tenant,sql=tx.owner('Control');
    if(pins.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('PinSet',pins)!==pins.digest)throw new CoreError('PIN_INPUT_CONFLICT');
    const {binding,policy:mandatory}=await this.selectMandatory(tx,'ActionPolicyInput');
    const policies=[mandatory],capabilities=[...new Map(pins.pins.flatMap(pin=>pin.capabilityExactRefs).filter(ref=>ref.kind==='BehaviorPolicy').map(ref=>[canonicalJson(ref),ref])).keys()];
    if(!capabilities.length)throw new CoreError('POLICY_DENIED');
    for(const key of capabilities){
      const rows=await sql`SELECT id FROM control.policy_versions WHERE resource_organization_id=${c.resourceOrganizationId} AND capability_key=${key} AND kind='Behavior'
        AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
      if(rows.length!==1)throw new CoreError('POLICY_DENIED');
      const policy=await this.get(tx,{type:'abh.policy-version',id:rows[0]!.id,version:1});
      if(policy.inputSchemaName!=='ActionPolicyInput'||canonicalJson(policy.behaviorCapabilityRef)!==key)throw new CoreError('POLICY_DENIED');policies.push(policy);
    }
    return {binding,policies};
  }
  /** Resolver supplies and revalidates local input facts in this same UoW; never a network pre-evaluation answer. */
  async evaluate(tx:TenantTransaction,command:CommandIdentity,input:ActionPolicyInput,pins:PinSet,assets:InstalledPolicyAssets,
    verifyInput:(tx:TenantTransaction,input:ActionPolicyInput,pins:PinSet)=>Promise<void>){
    contract('ActionPolicyInput',input);
    const c=tx.context.tenant;
    if(input.resourceOrganizationId!==c.resourceOrganizationId||input.purposeOfUse!==c.purposeOfUse)throw new CoreError('POLICY_DENIED');
    await this.#fence(tx);await verifyInput(tx,input,pins);const selection=await this.select(tx,pins),records:PolicyEvaluationRecord[]=[];
    const digest=await inputDigest(input);
    for(const policy of selection.policies){
      const artifact=await new InlineArtifactOwner().read(tx,policy.artifactRef,async record=>{
        if(record.contentDigest!==policy.manifestDigest)throw new CoreError('POLICY_DENIED');
      });
      if(artifact.record.mediaType!=='application/json')throw new CoreError('POLICY_DENIED');
      const decision=await assets.evaluate(policy,input,tx.signal);
      const [clock]=await tx.owner('Control')`SELECT clock_timestamp() AS now`;
      records.push(contract('PolicyEvaluationRecord',{evaluationRef:{type:'abh.policy-evaluation',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,targetRef:input.action.actionRef,
        inputDigest:digest,policyVersionRefs:[policy.policyVersionRef],kind:policy.kind,decision,evaluatedAt:clock!.now.toISOString()}));
    }
    const decision=intersectPolicies(records.map(record=>({kind:record.kind,decision:record.decision})));
    for(const record of records){
      await tx.owner('Control')`INSERT INTO control.policy_evaluations(resource_organization_id,id,workspace_id,purpose_names,target_type,target_id,record)
        VALUES (${c.resourceOrganizationId},${record.evaluationRef.id},${c.workspaceId??null},${[c.purposeOfUse]},${record.targetRef.type},${record.targetRef.id},${JSON.stringify(record)}::text::jsonb)`;
      await appendChange(tx,{command,target:record.evaluationRef,eventType:'abh.policy-evaluation.created',changedFields:['decision','inputDigest','policyVersionRefs'],relatedRefs:[record.targetRef,...record.policyVersionRefs]});
    }
    return {decision,records,bindingRef:selection.binding.bindingRef};
  }
  /** Current Scope delegation policy evaluates closed, source-verified facts; an allow is evidence, not an Authority. */
  async evaluateScope(tx:TenantTransaction,command:CommandIdentity,input:ScopeAuthorityPolicyInput,assets:InstalledPolicyAssets,
    verifyInput:(tx:TenantTransaction,input:ScopeAuthorityPolicyInput)=>Promise<void>):Promise<PolicyEvaluationRecord>{
    contract('ScopeAuthorityPolicyInput',input);const c=tx.context.tenant;
    if(input.resourceOrganizationId!==c.resourceOrganizationId||input.purposeOfUse!==c.purposeOfUse||canonicalJson(input.actor)!==canonicalJson(c.actor))throw new CoreError('POLICY_DENIED');
    await this.#fence(tx);await verifyInput(tx,input);const {binding,policy}=await this.selectMandatory(tx,'ScopeAuthorityPolicyInput');
    const artifact=await new InlineArtifactOwner().read(tx,policy.artifactRef,async record=>{if(record.contentDigest!==policy.manifestDigest)throw new CoreError('POLICY_DENIED');});
    if(artifact.record.mediaType!=='application/json')throw new CoreError('POLICY_DENIED');
    const purposeNames=input.draft.purposeRefs.length===1?[c.purposeOfUse]:(await new PurposeOwner().requireAllCurrent(tx,input.draft.purposeRefs)).map(purpose=>purpose.name);
    const [coverage]=await tx.owner('Control')`SELECT p.purpose_names AS policy_purposes,b.purpose_names AS binding_purposes FROM control.policy_versions p JOIN control.policy_bindings b
      ON b.resource_organization_id=p.resource_organization_id WHERE p.resource_organization_id=${c.resourceOrganizationId} AND p.id=${policy.policyVersionRef.id} AND b.id=${binding.bindingRef.id}`;
    if(!coverage||purposeNames.some(name=>!coverage.policy_purposes.includes(name)||!coverage.binding_purposes.includes(name)||!artifact.record.purposeNames.includes(name)))throw new CoreError('PURPOSE_DENIED');
    const decision=await assets.evaluate(policy,input,tx.signal),[clock]=await tx.owner('Control')`SELECT clock_timestamp() AS now`;
    const record=contract('PolicyEvaluationRecord',{evaluationRef:{type:'abh.policy-evaluation',id:randomUUID(),version:1},resourceOrganizationId:c.resourceOrganizationId,
      targetRef:input.draft.executionPrincipalRef,inputDigest:await inputDigest({input,bindingRef:binding.bindingRef}),policyVersionRefs:[policy.policyVersionRef],kind:'Mandatory',decision,evaluatedAt:clock!.now.toISOString()});
    await tx.owner('Control')`INSERT INTO control.policy_evaluations(resource_organization_id,id,workspace_id,purpose_names,target_type,target_id,record)
      VALUES (${c.resourceOrganizationId},${record.evaluationRef.id},${c.workspaceId??null},${purposeNames},${record.targetRef.type},${record.targetRef.id},${JSON.stringify(record)}::text::jsonb)`;
    await appendChange(tx,{command,target:record.evaluationRef,eventType:'abh.policy-evaluation.created',changedFields:['decision','inputDigest','policyVersionRefs'],relatedRefs:[record.targetRef,binding.bindingRef,...record.policyVersionRefs]});return record;
  }

}
