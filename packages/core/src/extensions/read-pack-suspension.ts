import type {EntityRef,InstalledPackRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {lockFences} from '../control/fences.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {readCommittedEvent} from '../durable/inbox.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackCapabilityRegistryOwner} from './capability-registry.ts';
import {migrationWorkOptions} from './migration-work-options.ts';

export interface PackSuspensionReadAdmission {
 fenceRefs(tx:TenantTransaction,eventRef:EntityRef,options:TransactionOptions):Promise<readonly EntityRef[]>;
 current(tx:TenantTransaction,record:InstalledPackRecord,options:TransactionOptions):Promise<void>;
}
/** Management-side notification source. Reads the actual committed event and
 * immutable suspended installation, never an arbitrary caller capability list.
 * Historical evidence does not grant a business subject's read/notify authority. */
export async function readPackSuspension(database:Database,context:VerifiedContext,options:TransactionOptions,eventRef:EntityRef,grants:readonly EntityRef[],admission:PackSuspensionReadAdmission){
 requireVerifiedContext(context);
 const event=contract('EntityRef',structuredClone(eventRef)),authority=structuredClone(grants),limits={...options},c=context.tenant;
 if(event.type!=='abh.event'||event.version!==1)throw new CoreError('INVALID_ARGUMENT');
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const fences=admission.fenceRefs.bind(admission),current=admission.current.bind(admission);
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const extra=await boundedCallback(opts=>fences(tx,structuredClone(event),opts),work);
  await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...authority,...structuredClone(extra)]);
  const authorize=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.suspend'},authority);
  await authorize();
  const committed=await readCommittedEvent(tx,event);
  if(committed.type!=='abh.installed-pack.suspend'||committed.aggregateRef.type!=='abh.installed-pack'||committed.aggregateRef.version!==committed.aggregateVersion)throw new CoreError('PRECONDITION_FAILED');
  const pack=await new InstalledPackOwner().readHistorical(tx,committed.aggregateRef,async()=>{});
  if(pack.status!=='Suspended'||!pack.suspension||!pack.enablement)throw new CoreError('PRECONDITION_FAILED');
  const set=await new PackCapabilityRegistryOwner().readSet(tx,pack.enablement.proposal.capabilitySetRef,async()=>{});
  if(set.setDigest!==pack.enablement.proposal.capabilitySetDigest||canonicalJson(set.packRef)!==canonicalJson(pack.enablement.previousPackRef)||set.registrations.some(entry=>entry.subjectDigest!==pack.manifest.integrity.packageDigest))throw new CoreError('PRECONDITION_FAILED');
  await boundedCallback(opts=>current(tx,structuredClone(pack),opts),work);await authorize();
  return {eventRef:event,packRef:pack.packRef,previousPackRef:pack.suspension.packRef,capabilitySetRef:set.setRef,capabilitySetDigest:set.setDigest,
   emergency:pack.suspension.emergency,reason:pack.suspension.reason,evidenceRefs:pack.suspension.evidenceRefs,
   capabilities:set.registrations.map(entry=>({capability:entry.capability,registrationDigest:entry.registrationDigest,implementationRef:entry.implementationRef}))};
 });
}
