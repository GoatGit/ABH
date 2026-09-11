import {assertCapabilityRead} from './capability-read-authority.ts';
import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {readCommittedEvent} from '../durable/inbox.ts';

/** Read exact current installation versions. Current authority, governance and content checks are mandatory caller admission. */
export class InstalledPackOwner {
  async read(tx:TenantTransaction,ref:EntityRef,admit:(record:InstalledPackRecord)=>Promise<void>):Promise<InstalledPackRecord>{
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  return this.#read(tx,ref,admit);
 }
 async readForCapabilityRuntime(tx:TenantTransaction,ref:EntityRef,grants:readonly EntityRef[]):Promise<InstalledPackRecord>{
  const reference=structuredClone(ref),authority=structuredClone(grants);
  await assertCapabilityRead(tx,authority);return this.#read(tx,reference,async()=>{});
 }
 async #read(tx:TenantTransaction,ref:EntityRef,admit:(record:InstalledPackRecord)=>Promise<void>):Promise<InstalledPackRecord>{
    const input=contract('EntityRef',JSON.parse(canonicalJson(ref))),c=tx.context.tenant;
    if(input.type!=='abh.installed-pack')throw new CoreError('INVALID_ARGUMENT');
    
    const [row]=await tx.owner('PackLoader')`SELECT id,version,record,pack_id,pack_version,package_digest,deployment_version,status
      FROM extension.installed_packs WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.id}
      AND deleted_at IS NULL AND 'abh.pack.manage'=ANY(purpose_names)`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    if(Number(row.version)!==input.version)throw new CoreError('VERSION_CONFLICT');
    const record=contract('InstalledPackRecord',row.record),manifest=record.manifest;
    if(canonicalJson(record.packRef)!==canonicalJson(input)||Number(row.version)!==input.version||row.id!==input.id||
      row.pack_id!==manifest.metadata.id||row.pack_version!==manifest.metadata.version||row.package_digest!==manifest.integrity.packageDigest||
      Number(row.deployment_version)!==record.deploymentVersion||row.status!==record.status)throw new CoreError('INTERNAL_ERROR');
    const computed=await digestPackManifest(manifest);
    if(computed.manifestDigest!==manifest.integrity.manifestDigest||computed.artifactSetDigest!==manifest.integrity.artifactSetDigest||computed.packageDigest!==manifest.integrity.packageDigest)throw new CoreError('PRECONDITION_FAILED');
    await admit(structuredClone(record));tx.assertActive();return structuredClone(record);
  }
  /** Historical exactRef lookup only. Admission must authorize historical evidence;
   * this does not assert that this version is the currently enabled installation. */
  async readHistorical(tx:TenantTransaction,ref:EntityRef,admit:(record:InstalledPackRecord)=>Promise<void>):Promise<InstalledPackRecord>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    return this.#readHistorical(tx,ref,admit);
  }
  /** Notification-only historical evidence, bound to an actual suspension event.
   * Does not resolve executable bytes or admit a currently usable capability. */
  async readSuspendedForNotification(tx:TenantTransaction,eventRef:EntityRef,grants:readonly EntityRef[]):Promise<InstalledPackRecord>{
    const c=tx.context.tenant;
    if(c.purposeOfUse!=='abh.runtime.deliver'||c.actor.type!=='Service'||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
    await assertCurrentGrants(tx,{objectRef:eventRef,scopeRefs:[{type:'abh.organization',id:c.resourceOrganizationId,version:1}],action:'abh.runtime.consume-event'},grants);
    const event=await readCommittedEvent(tx,eventRef);
    if(event.type!=='abh.installed-pack.suspend'||event.aggregateRef.type!=='abh.installed-pack'||event.aggregateVersion!==event.aggregateRef.version)throw new CoreError('PRECONDITION_FAILED');
    const pack=await this.#readHistorical(tx,event.aggregateRef,async()=>{});
    if(pack.status!=='Suspended'||!pack.suspension||!pack.enablement)throw new CoreError('PRECONDITION_FAILED');
    return pack;
  }
  async #readHistorical(tx:TenantTransaction,ref:EntityRef,admit:(record:InstalledPackRecord)=>Promise<void>):Promise<InstalledPackRecord>{
    const input=contract('EntityRef',structuredClone(ref)),c=tx.context.tenant;
    if(input.type!=='abh.installed-pack')throw new CoreError('INVALID_ARGUMENT');
    const [row]=await tx.owner('PackLoader')`SELECT id,version,record FROM extension.installed_pack_history
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${input.id} AND version=${input.version}
      AND deleted_at IS NULL AND 'abh.pack.manage'=ANY(purpose_names) AND workspace_id IS NULL`;
    if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('InstalledPackRecord',row.record);
    if(canonicalJson(record.packRef)!==canonicalJson(input)||row.id!==input.id||Number(row.version)!==input.version)throw new CoreError('INTERNAL_ERROR');
    const computed=await digestPackManifest(record.manifest);
    if(computed.manifestDigest!==record.manifest.integrity.manifestDigest||computed.artifactSetDigest!==record.manifest.integrity.artifactSetDigest||computed.packageDigest!==record.manifest.integrity.packageDigest)throw new CoreError('PRECONDITION_FAILED');
    await admit(structuredClone(record));tx.assertActive();return structuredClone(record);
  }
  /** Called after an authorized current-row write, before its Journal commits.
   * Copy only the real current row and reject collisions instead of replacing history. */
  async retainCurrent(tx:TenantTransaction,ref:EntityRef):Promise<InstalledPackRecord>{
    const current=await this.read(tx,ref,async()=>{}),c=tx.context.tenant;
    await tx.owner('PackLoader')`INSERT INTO extension.installed_pack_history(resource_organization_id,id,version,created_at,updated_at,created_by,updated_by,purpose_names,record)
      SELECT resource_organization_id,id,version,created_at,updated_at,created_by,updated_by,ARRAY['abh.pack.manage'],record FROM extension.installed_packs
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.packRef.id} AND version=${current.packRef.version}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      ON CONFLICT(resource_organization_id,id,version) DO NOTHING`;
    const saved=await this.readHistorical(tx,current.packRef,async()=>{});
    if(canonicalJson(saved)!==canonicalJson(current))throw new CoreError('VERSION_CONFLICT');
    return saved;
  }

}
