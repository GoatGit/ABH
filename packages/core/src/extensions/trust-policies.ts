import {assertCapabilityRead} from './capability-read-authority.ts';
import type {EntityRef} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import type {Digest} from '@abh/contracts';
import {contract} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {assertPackGovernanceSnapshot,type PackGovernanceSnapshot,type PackGovernanceSource} from './validate-current-pack.ts';
import type {StoredPackValidation} from './validation-reports.ts';
import {verifiedTrustPolicyEvidence,type VerifiedTrustPolicy} from './verify-trust-policy.ts';

/** Append-only deployment snapshots. Every publisher and evidence recorder uses the same per-Pack transaction lock. */
export class PackTrustPolicyOwner {
  async lock(tx:TenantTransaction,packId:string):Promise<void>{
    contract('RegisteredName',packId);
    const key=`${tx.context.tenant.resourceOrganizationId}/PackLoader/${packId}`;
    await tx.lock(4,key,()=>tx.owner('PackLoader')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  }
  async current(tx:TenantTransaction,packId:string):Promise<PackGovernanceSnapshot>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    return this.#current(tx,packId);
  }
  async readForCapabilityRuntime(tx:TenantTransaction,packId:string,grants:readonly EntityRef[]):Promise<PackGovernanceSnapshot>{
    await assertCapabilityRead(tx,grants);return this.#current(tx,packId);
  }
  async #current(tx:TenantTransaction,packId:string):Promise<PackGovernanceSnapshot>{
    contract('RegisteredName',packId);const c=tx.context.tenant;
    const [row]=await tx.owner('PackLoader')`SELECT id,version,record,snapshot_digest,signature_payload,signature_bundle,signer_key_digest,verified_at,expires_at FROM extension.trust_policies
      WHERE resource_organization_id=${c.resourceOrganizationId} AND pack_id=${packId} ORDER BY version DESC LIMIT 1`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    if(!row.signature_payload||!row.signature_bundle||!row.signer_key_digest||!row.verified_at||!row.expires_at||row.expires_at.getTime()<=Date.now())throw new CoreError('PRECONDITION_FAILED');
    const value=JSON.parse(canonicalJson(row.record)) as PackGovernanceSnapshot;
    assertPackGovernanceSnapshot(value,packId);
    try{
      const envelope=JSON.parse(row.signature_payload);
      contract('SignedTrustPolicyDocument',envelope[1]);
      if(envelope[0]!=='abh-pack-trust-v1'||envelope.length!==2||envelope[1].organizationId!==c.resourceOrganizationId||
        canonicalJson(envelope[1].snapshot)!==canonicalJson(value)||Date.parse(envelope[1].expiresAt)!==row.expires_at.getTime())throw new Error();
      contract('Digest',row.signer_key_digest);
    }catch{throw new CoreError('INTERNAL_ERROR');}
    if(value.policyRef.id!==row.id||value.policyRef.version!==Number(row.version)||value.policy.packId!==packId||
      await digestBytes(new TextEncoder().encode(canonicalJson(value)))!==row.snapshot_digest)throw new CoreError('INTERNAL_ERROR');
    return value;
  }
  /** Deployment administration must recheck current publisher/key authority and audit issuance in this transaction. */
  async publish(tx:TenantTransaction,candidate:VerifiedTrustPolicy,expectedVersion:number,
    authorize:(snapshot:PackGovernanceSnapshot,signature:{keyDigest:Digest;verifiedAt:string;expiresAt:string})=>Promise<void>):Promise<void>{
    const proof=verifiedTrustPolicyEvidence(candidate),value=proof.document.snapshot;
    assertPackGovernanceSnapshot(value,value.policy?.packId);
    contract('EntityRef',value.policyRef);contract('RegisteredName',value.policy.packId);
    if(value.policyRef.type!=='abh.pack-trust-policy'||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||value.policyRef.version!==expectedVersion+1)throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    if(proof.document.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    await authorize(structuredClone(value),{keyDigest:proof.keyDigest,verifiedAt:proof.verifiedAt,expiresAt:proof.document.expiresAt});await this.lock(tx,value.policy.packId);
    if(Date.parse(proof.document.expiresAt)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
    const [previous]=await tx.owner('PackLoader')`SELECT id,version,record FROM extension.trust_policies
      WHERE resource_organization_id=${c.resourceOrganizationId} AND pack_id=${value.policy.packId} ORDER BY version DESC LIMIT 1`;
    if(Number(previous?.version??0)!==expectedVersion||previous&&previous.id!==value.policyRef.id)throw new CoreError('VERSION_CONFLICT');
    if(previous){
      const history=(previous.record as PackGovernanceSnapshot).reservedVersions;
      if(history.some(item=>!value.reservedVersions.some(next=>canonicalJson(next)===canonicalJson(item))))throw new CoreError('PRECONDITION_FAILED');
    }
    // Signed reservations cannot contradict identities already committed by Stage.
    // Stage and publication hold this same Pack lock, so neither side can pass using a pre-commit view.
    const reservations=value.reservedVersions.filter(item=>item.packId===value.policy.packId);
    if(reservations.length){
      const versions=reservations.map(item=>item.version);
      const installed=await tx.owner('PackLoader')`SELECT pack_version,package_digest FROM extension.installed_packs
        WHERE resource_organization_id=${c.resourceOrganizationId} AND pack_id=${value.policy.packId} AND pack_version=ANY(${versions})`;
      const identities=new Map(installed.map(row=>[row.pack_version,row.package_digest]));
      if(reservations.some(item=>identities.has(item.version)&&identities.get(item.version)!==item.packageDigest))throw new CoreError('PRECONDITION_FAILED');
    }
    const digest=await digestBytes(new TextEncoder().encode(canonicalJson(value)));
    await tx.owner('PackLoader')`INSERT INTO extension.trust_policies(resource_organization_id,id,version,purpose_names,record,pack_id,snapshot_digest,signature_payload,signature_bundle,signer_key_digest,verified_at,expires_at)
      VALUES (${c.resourceOrganizationId},${value.policyRef.id},${value.policyRef.version},${[c.purposeOfUse]},${JSON.stringify(value)}::text::jsonb,${value.policy.packId},${digest},
        ${proof.payload},${JSON.stringify(JSON.parse(new TextDecoder().decode(proof.bundle)))}::text::jsonb,${proof.keyDigest},${proof.verifiedAt},${proof.document.expiresAt})`;
  }
  async match(tx:TenantTransaction,evidence:StoredPackValidation):Promise<void>{
    await this.lock(tx,evidence.report.packId);
    const current=await this.current(tx,evidence.report.packId);
    if(canonicalJson(current.policyRef)!==canonicalJson(evidence.governanceRef)||
      await digestBytes(new TextEncoder().encode(canonicalJson(current)))!==evidence.governanceDigest)throw new CoreError('VERSION_CONFLICT');
  }
}

/** Current database state on every read; caller installs fresh authenticated Context and current read authorization. */
export function databasePackGovernanceSource(database:Database,context:VerifiedContext,
  authorize:(tx:TenantTransaction,packId:string)=>Promise<void>):PackGovernanceSource{
  return {async current(packId:string,options:TransactionOptions){return database.transaction(context,{...options,readOnly:false},async tx=>{
    await authorize(tx,packId);return new PackTrustPolicyOwner().current(tx,packId);
  });}};
}
