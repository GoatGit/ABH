import {assertCapabilityRead} from './capability-read-authority.ts';
import {randomUUID} from 'node:crypto';
import type {CapabilityRef,EntityRef,PackCapabilityRegistration,PackCapabilitySetRecord} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';

/** Immutable static identity reservations. Management reads do not imply runtime availability. */
export class PackCapabilityRegistryOwner {
 /** Verify only this notification's exact registration against immutable facts.
  * The registered/public kind mapping remains an explicit trusted installation. */
 async assertSuspensionCapability(tx:TenantTransaction,eventRef:EntityRef,capability:CapabilityRef,registeredKind:string,grants:readonly EntityRef[]):Promise<void>{
  contract('CapabilityRef',capability);contract('RegisteredName',registeredKind);
  const pack=await new InstalledPackOwner().readSuspendedForNotification(tx,eventRef,grants);
  const set=await this.#readSet(tx,pack.enablement!.proposal.capabilitySetRef,async()=>{});
  if(set.setDigest!==pack.enablement!.proposal.capabilitySetDigest||canonicalJson(set.packRef)!==canonicalJson(pack.enablement!.previousPackRef)
   ||set.registrations.some(entry=>entry.subjectDigest!==pack.manifest.integrity.packageDigest)
   ||set.registrations.filter(entry=>entry.capability.kind===registeredKind&&entry.capability.id===capability.id&&entry.capability.version===capability.version&&entry.registrationDigest===capability.digest).length!==1)throw new CoreError('PIN_INPUT_CONFLICT');
 }
 async readSet(tx:TenantTransaction,ref:EntityRef,admit:(record:PackCapabilitySetRecord)=>Promise<void>):Promise<PackCapabilitySetRecord>{
  const c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  return this.#readSet(tx,ref,admit);
 }
 async readForCapabilityRuntime(tx:TenantTransaction,ref:EntityRef,grants:readonly EntityRef[]):Promise<PackCapabilitySetRecord>{
  const reference=structuredClone(ref),authority=structuredClone(grants);
  await assertCapabilityRead(tx,authority);return this.#readSet(tx,reference,async()=>{});
 }
 async #readSet(tx:TenantTransaction,ref:EntityRef,admit:(set:PackCapabilitySetRecord)=>Promise<void>):Promise<PackCapabilitySetRecord>{
  const reference=contract('EntityRef',structuredClone(ref)),c=tx.context.tenant;
  
  if(reference.type!=='abh.pack-capability-set'||reference.version!==1)throw new CoreError('INVALID_ARGUMENT');
  const [row]=await tx.owner('PackLoader')`SELECT record,version,pack_id FROM extension.capability_sets WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${reference.id}
   AND deleted_at IS NULL AND workspace_id IS NULL AND 'abh.pack.manage'=ANY(purpose_names)`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');const record=contract('PackCapabilitySetRecord',row.record);
  if(canonicalJson(record.setRef)!==canonicalJson(reference)||Number(row.version)!==reference.version||record.packRef.id!==row.pack_id||await digestContract('PackCapabilitySetRecord',record)!==record.setDigest)throw new CoreError('PRECONDITION_FAILED');
  const children=await tx.owner('PackLoader')`SELECT record,pack_id,kind,capability_id,capability_version,version FROM extension.capabilities WHERE resource_organization_id=${c.resourceOrganizationId} AND set_id=${reference.id}
   AND deleted_at IS NULL AND workspace_id IS NULL AND 'abh.pack.manage'=ANY(purpose_names) LIMIT 1001`;
  if(children.length!==record.registrations.length)throw new CoreError('PRECONDITION_FAILED');
  const identities=new Set<string>();
  for(const row of children){
   const entry=contract('PackCapabilityRegistration',row.record),key=canonicalJson(entry.capability);
   if(Number(row.version)!==1||row.pack_id!==record.packRef.id||row.kind!==entry.capability.kind||row.capability_id!==entry.capability.id||row.capability_version!==entry.capability.version||identities.has(key)||
    await digestContract('PackCapabilityRegistration',entry)!==entry.registrationDigest||!record.registrations.some(expected=>canonicalJson(expected)===canonicalJson(entry)))throw new CoreError('PRECONDITION_FAILED');
   identities.add(key);
  }
  await admit(structuredClone(record));tx.assertActive();return structuredClone(record);
 }
 /** Caller prepares actual signed content and current Grants first, under the same Deployment lock. */
 async register(tx:TenantTransaction,command:CommandIdentity,packRef:EntityRef,registrations:readonly PackCapabilityRegistration[],admit:()=>Promise<void>):Promise<EntityRef>{
  const ref=contract('EntityRef',structuredClone(packRef)),entries=registrations.map(value=>contract('PackCapabilityRegistration',structuredClone(value))),c=tx.context.tenant;
  if(command.type!=='abh.packs.register-capabilities')throw new CoreError('INVALID_ARGUMENT');
  if(entries.length>1000)throw new CoreError('LIMIT_EXCEEDED');
  await new PackDeploymentRevisionOwner().current(tx);await admit();
  const pack=await new InstalledPackOwner().read(tx,ref,async()=>{});
  if(pack.status!=='Staged')throw new CoreError('PRECONDITION_FAILED');
  const expected=pack.manifest.capabilities.provides.map(value=>canonicalJson(value)).sort(),actual=entries.map(value=>canonicalJson(value.capability)).sort();
  if(canonicalJson(expected)!==canonicalJson(actual))throw new CoreError('PRECONDITION_FAILED');
  for(const entry of entries){
   if(canonicalJson(entry.packRef)!==canonicalJson(ref)||entry.subjectDigest!==pack.manifest.integrity.packageDigest||await digestContract('PackCapabilityRegistration',entry)!==entry.registrationDigest||
    !pack.manifest.artifacts.some(artifact=>artifact.ref===entry.schemaPath&&artifact.digest===entry.schemaDigest))throw new CoreError('PRECONDITION_FAILED');
   for(const field of Object.keys(pack.manifest.permissions) as (keyof typeof pack.manifest.permissions)[])if(entry.permissionEnvelope[field].some(value=>!pack.manifest.permissions[field].includes(value)))throw new CoreError('FORBIDDEN');
  }
  const [existing]=await tx.owner('PackLoader')`SELECT id FROM extension.capability_sets WHERE resource_organization_id=${c.resourceOrganizationId} AND pack_id=${ref.id}`;
  if(existing){const saved=await this.readSet(tx,{type:'abh.pack-capability-set',id:existing.id,version:1},async()=>{});if(canonicalJson(saved.registrations)!==canonicalJson(entries))throw new CoreError('VERSION_CONFLICT');return saved.setRef;}
  const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
  const unsigned=contract('PackCapabilitySetRecord',{setRef:{type:'abh.pack-capability-set',id:randomUUID(),version:1},packRef:ref,registrations:entries,recordedAt:clock!.now.toISOString(),setDigest:'sha256:'+'0'.repeat(64)});
  const record={...unsigned,setDigest:await digestContract('PackCapabilitySetRecord',unsigned)};
  for(const entry of entries){
   const [taken]=await tx.owner('PackLoader')`SELECT id FROM extension.capabilities WHERE resource_organization_id=${c.resourceOrganizationId} AND kind=${entry.capability.kind} AND capability_id=${entry.capability.id} AND capability_version=${entry.capability.version}`;
   if(taken)throw new CoreError('VERSION_CONFLICT');
   await tx.owner('PackLoader')`INSERT INTO extension.capabilities(resource_organization_id,id,pack_id,set_id,kind,capability_id,capability_version,record)
    VALUES (${c.resourceOrganizationId},${randomUUID()},${ref.id},${record.setRef.id},${entry.capability.kind},${entry.capability.id},${entry.capability.version},${JSON.stringify(entry)}::text::jsonb)`;
  }
  await tx.owner('PackLoader')`INSERT INTO extension.capability_sets(resource_organization_id,id,pack_id,record) VALUES (${c.resourceOrganizationId},${record.setRef.id},${ref.id},${JSON.stringify(record)}::text::jsonb)`;
  await appendChange(tx,{command,target:record.setRef,eventType:'abh.pack-capability-set.registered',changedFields:['registrations'],relatedRefs:[ref]});
  return record.setRef;
 }
}
