import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import type {ArtifactRecord,EntityRef,PackMigrationEvidence} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyMigrationSignature,matchMigrationSignature,type MigrationEvidenceSigner,type VerifiedMigrationSignature} from './verify-migration-signature.ts';

export interface StoredMigrationSignatureAdmission {
  signer(report:PackMigrationEvidence):Promise<MigrationEvidenceSigner>;
  source(artifact:ArtifactRecord,report:PackMigrationEvidence):Promise<void>;
}
/** Read the persisted Bundle under current source and signer admission. Caller holds
 * authority fences and locks the complete report/Bundle set before composing multiple
 * reads. A valid signature is not proof of supporting outcomes or execution authority.
 */
export async function verifyStoredMigrationSignature(tx:TenantTransaction,options:TransactionOptions,report:PackMigrationEvidence,bundleRef:EntityRef,admission:StoredMigrationSignatureAdmission):Promise<VerifiedMigrationSignature>{
  const value=contract('PackMigrationEvidence',JSON.parse(canonicalJson(report))),ref=contract('EntityRef',JSON.parse(canonicalJson(bundleRef))),current=migrationWorkOptions(tx,options);
  const signer=admission.signer.bind(admission),authorize=admission.source.bind(admission),c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||value.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const active=()=>assertMigrationWorkActive(tx,current);
  const owner=new InlineArtifactOwner();await owner.lockSources(tx,[ref]);active();
  const config=JSON.parse(canonicalJson(await signer(structuredClone(value)))) as MigrationEvidenceSigner;active();
  const source=await owner.read(tx,ref,async artifact=>{
    if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536)throw new CoreError('INVALID_ARGUMENT');
    active();await authorize(structuredClone(artifact),structuredClone(value));active();
  });
  const proof=await verifyMigrationSignature(value,source.bytes,config,current);
  active();await authorize(structuredClone(source.record),structuredClone(value));active();
  if(canonicalJson(await signer(structuredClone(value)))!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');
  active();matchMigrationSignature(proof,value);tx.assertActive();
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return proof;
}
