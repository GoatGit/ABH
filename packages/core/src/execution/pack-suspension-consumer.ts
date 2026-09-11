import type {ArtifactRecord,CapabilityRef,EntityRef,EventEnvelope,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import type {InstalledEventConsumer} from '../durable/inbox.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {CoreError} from '../internal/errors.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {ActionOwner} from './actions.ts';
import {OperationOwner} from './operations.ts';
import {lockAction,sameRef} from './shared.ts';
import {PackCapabilityRegistryOwner} from '../extensions/capability-registry.ts';

export function actionPackSuspensionConsumerId(actionRef:EntityRef,capability:CapabilityRef):string{
 contract('ActionRef',actionRef);contract('CapabilityRef',capability);
 return `abh.pack-suspension.action-${actionRef.id}.digest-${capability.digest.slice(7)}`;
}

export interface ActionSuspensionAdmission {
 fenceRefs(tx:TenantTransaction,event:EventEnvelope):Promise<EntityRef[]>;
 /** Current business Action notification permission and installed source policy.
  * Historical Pack/registration membership is also checked by the Owner itself.
  * Rechecked on Inbox duplicates. */
 source(tx:TenantTransaction,event:EventEnvelope,capability:CapabilityRef,actionRef:EntityRef):Promise<void>;
 artifact(tx:TenantTransaction,record:ArtifactRecord):Promise<void>;
 storage:Pick<StoreInlineArtifactPayload,'dataClass'|'purposeNames'|'region'|'retentionPolicyRef'>;
}
/** One installed event consumer per Action/capability. Its effect is a durable
 * observation of current parent/child versions, not a cancellation, outcome or
 * budget release. Runtime dispatch remains fenced by current Pack resolution. */
export function actionPackSuspensionConsumer(input:{actionRef:EntityRef;pinSetRef:EntityRef;pinSetDigest?:string;capability:CapabilityRef;registeredKind:string;grantRefs:readonly EntityRef[]},admission:ActionSuspensionAdmission):InstalledEventConsumer{
 const value=structuredClone(input),storage=structuredClone(admission.storage),fences=admission.fenceRefs.bind(admission),source=admission.source.bind(admission),artifact=admission.artifact.bind(admission);
 contract('ActionRef',value.actionRef);contract('PinSetRef',value.pinSetRef);contract('CapabilityRef',value.capability);
 contract('RegisteredName',value.registeredKind);
 if(value.pinSetDigest!==undefined)contract('Digest',value.pinSetDigest);
 // Exact registration digest disambiguates capabilities pinned by the same Action.
 const id=actionPackSuspensionConsumerId(value.actionRef,value.capability);
 const inspect=async(tx:TenantTransaction,event:EventEnvelope)=>{
  if(event.type!=='abh.installed-pack.suspend'||event.aggregateRef.type!=='abh.installed-pack')throw new CoreError('PRECONDITION_FAILED');
  const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  await assertCurrentGrants(tx,{objectRef:{type:'abh.event',id:event.eventId,version:1},scopeRefs:[scope],action:'abh.runtime.consume-event'},value.grantRefs);
  await new PackCapabilityRegistryOwner().assertSuspensionCapability(tx,{type:'abh.event',id:event.eventId,version:1},value.capability,value.registeredKind,value.grantRefs);
  await lockAction(tx,value.actionRef.id);
  const action=await new ActionOwner().get(tx,value.actionRef.id),pins=await new StaticReleaseOwner().getPinSet(tx,action.actionRef);
  if(!pins||!action.pinSetRef||!sameRef(pins.pinSetRef,value.pinSetRef)||!sameRef(action.pinSetRef,pins.pinSetRef)||await digestContract('PinSet',pins)!==pins.digest||!pins.pins.some(pin=>pin.capabilityExactRefs.some(ref=>canonicalJson(ref)===canonicalJson(value.capability))))throw new CoreError('PIN_INPUT_CONFLICT');
  if(value.pinSetDigest!==undefined&&value.pinSetDigest!==pins.digest)throw new CoreError('PIN_INPUT_CONFLICT');
  await source(tx,structuredClone(event),structuredClone(value.capability),structuredClone(action.actionRef));
  return {action,pins};
 };
 return {id,eventTypes:['abh.installed-pack.suspend'],fenceRefs:async(tx,event)=>[...value.grantRefs,...await fences(tx,event)],admit:async(tx,event)=>{await inspect(tx,event);},handle:async(tx,command,event)=>{
  const {action,pins}=await inspect(tx,event),children=await new OperationOwner().list(tx,action.actionRef.id);
  const evidence={kind:'ActionPackSuspensionObservation',eventRef:{type:'abh.event',id:event.eventId,version:1},packRef:event.aggregateRef,capability:value.capability,pinSetRef:pins.pinSetRef,pinSetDigest:pins.digest,
   actionRef:action.actionRef,position:action.position,operations:children.map(child=>({operationRef:child.operationRef,position:child.position,attemptCount:child.attemptCount}))};
  const saved=await new InlineArtifactOwner().store(tx,command,{...storage,ownerRef:action.actionRef,mediaType:'application/json',content:canonicalJson(evidence),sourceRefs:[evidence.eventRef,event.aggregateRef,pins.pinSetRef,...children.map(child=>child.operationRef)]},async()=>{});
  await artifact(tx,saved);return saved.artifactRef;
 }};
}
