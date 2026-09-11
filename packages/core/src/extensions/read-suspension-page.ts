import type {ArtifactRecord,CapabilityRef,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {CoreError} from '../internal/errors.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {lockFences} from '../control/fences.ts';
import {readCommittedEvent} from '../durable/inbox.ts';
import type {queryPackSuspensionTargets} from './query-pack-suspension-targets.ts';

export interface SuspensionPageReadAdmission {
 fenceRefs(tx:TenantTransaction,artifactRef:EntityRef,options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Current independent Artifact read permission, retention and source policy. */
 artifact(tx:TenantTransaction,record:ArtifactRecord,options:TransactionOptions):Promise<void>;
}
/** Recover inert scan evidence. Exact expected event/capability/digest prevent
 * swapping another stored page. Consumers must still authorize current targets
 * and perform actual Owner effects; this result is not a notification receipt. */
export async function readSuspensionPage(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:{artifactRef:EntityRef;pageDigest:string;eventRef:EntityRef;capability:CapabilityRef},admission:SuspensionPageReadAdmission){
 requireVerifiedContext(context);
 const value=structuredClone(input),limits={...options},fences=admission.fenceRefs.bind(admission),admit=admission.artifact.bind(admission);
 contract('ArtifactRef',value.artifactRef);contract('Digest',value.pageDigest);contract('EntityRef',value.eventRef);contract('CapabilityRef',value.capability);
 if(value.eventRef.type!=='abh.event'||value.eventRef.version!==1)throw new CoreError('INVALID_ARGUMENT');
 return database.transaction(context,limits,async tx=>{
  const c=tx.context.tenant,extra=await boundedCallback(opts=>fences(tx,structuredClone(value.artifactRef),opts),limits);
  await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...structuredClone(extra)]);
  const stored=await new InlineArtifactOwner().read(tx,value.artifactRef,record=>boundedCallback(opts=>admit(tx,record,opts),limits));
  if(stored.record.mediaType!=='application/json'||canonicalJson(stored.record.ownerRef)!==canonicalJson(value.eventRef)||stored.record.sizeBytes>65536)throw new CoreError('PRECONDITION_FAILED');
  let document;try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes));}catch{throw new CoreError('PRECONDITION_FAILED');}
  if(!document||document.kind!=='PackSuspensionTargetPage'||canonicalJson(document.eventRef)!==canonicalJson(value.eventRef)||canonicalJson(document.capability)!==canonicalJson(value.capability)||await inputDigest(document)!==value.pageDigest)throw new CoreError('PRECONDITION_FAILED');
  const page=document.page as Awaited<ReturnType<typeof queryPackSuspensionTargets>>;
  if(!page||!Array.isArray(page.targets)||page.targets.length>100||typeof page.complete!=='boolean'||page.complete===Boolean(page.cursor))throw new CoreError('PRECONDITION_FAILED');
  if(page.cursor){contract('Digest',page.cursor.bindingDigest);contract('UUID',page.cursor.afterId);}
  const event=await readCommittedEvent(tx,value.eventRef);
  if(event.type!=='abh.installed-pack.suspend'||event.aggregateRef.type!=='abh.installed-pack')throw new CoreError('PRECONDITION_FAILED');
  const keys=new Set<string>();
  for(const target of page.targets){
   contract('PinSetRef',target.pinSetRef);contract('SubjectRef',target.subjectRef);contract('Digest',target.pinSetDigest);
   if(canonicalJson(target.eventRef)!==canonicalJson(value.eventRef)||canonicalJson(target.capability)!==canonicalJson(value.capability)||canonicalJson(target.packRef)!==canonicalJson(event.aggregateRef)||keys.has(target.notificationKey)||!Array.isArray(target.behaviorSlots)||!target.behaviorSlots.length)throw new CoreError('PRECONDITION_FAILED');
   for(const slot of target.behaviorSlots)contract('RegisteredName',slot);
   if(target.notificationKey!==await inputDigest({eventRef:value.eventRef,pinSetRef:target.pinSetRef,capability:value.capability}))throw new CoreError('PRECONDITION_FAILED');
   for(const ref of [target.packRef,target.pinSetRef])if(!stored.record.sourceRefs.some(source=>canonicalJson(source)===canonicalJson(ref)))throw new CoreError('PRECONDITION_FAILED');
   keys.add(target.notificationKey);
  }
  await boundedCallback(opts=>admit(tx,structuredClone(stored.record),opts),limits);
  return structuredClone({artifactRef:stored.record.artifactRef,pageDigest:value.pageDigest,eventRef:value.eventRef,capability:value.capability,page});
 });
}
