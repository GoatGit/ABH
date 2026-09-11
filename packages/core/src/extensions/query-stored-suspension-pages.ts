import type {CapabilityRef,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {lockFences} from '../control/fences.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {readCommittedEvent} from '../durable/inbox.ts';
import {readSuspensionPage,type SuspensionPageReadAdmission} from './read-suspension-page.ts';

export interface StoredSuspensionPageCursor {bindingDigest:string;afterId:string}
export interface StoredSuspensionPageDiscovery extends SuspensionPageReadAdmission {
 discoveryFences(tx:TenantTransaction,eventRef:EntityRef,options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Independent permission to discover artifacts owned by this actual event. */
 discover(tx:TenantTransaction,eventRef:EntityRef,options:TransactionOptions):Promise<void>;
}
/** Reconstruct persisted scan work from PostgreSQL, without an in-memory Artifact
 * list. Pages remain evidence, not notification authority or pending-only tasks.
 * Completed pages may reappear; actual delivery reuses original-event Inbox keys.
 * A sweep is scoped and must restart to catch concurrent lower-UUID inserts. */
export async function queryStoredSuspensionPages(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:{eventRef:EntityRef;capability:CapabilityRef;limit?:number;cursor?:StoredSuspensionPageCursor},admission:StoredSuspensionPageDiscovery){
 requireVerifiedContext(context);
 const value=structuredClone(input),limits={...options},c=context.tenant,limit=value.limit??100;
 contract('EntityRef',value.eventRef);contract('CapabilityRef',value.capability);
 if(value.eventRef.type!=='abh.event'||value.eventRef.version!==1||!Number.isInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
 const bindingDigest=await inputDigest({eventRef:value.eventRef,capability:value.capability,organizationId:c.resourceOrganizationId,
  workspaceId:c.workspaceId??null,actingOrganizationId:c.actingOrganizationId,purpose:c.purposeOfUse,actor:c.actor});
 if(value.cursor){contract('UUID',value.cursor.afterId);if(value.cursor.bindingDigest!==bindingDigest)throw new CoreError('INVALID_ARGUMENT');}
 const fences=admission.fenceRefs.bind(admission),discoveryFences=admission.discoveryFences.bind(admission),discover=admission.discover.bind(admission),artifact=admission.artifact.bind(admission);
 const hints=await database.transaction(context,limits,async tx=>{
  const extra=await boundedCallback(opts=>discoveryFences(tx,structuredClone(value.eventRef),opts),limits);
  await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...structuredClone(extra)]);
  await boundedCallback(opts=>discover(tx,structuredClone(value.eventRef),opts),limits);
  const event=await readCommittedEvent(tx,value.eventRef);
  if(event.type!=='abh.installed-pack.suspend'||event.aggregateRef.type!=='abh.installed-pack')throw new CoreError('PRECONDITION_FAILED');
  return new InlineArtifactOwner().scanOwned(tx,value.eventRef,limit,value.cursor?.afterId);
 });
 const pages:Parameters<typeof readSuspensionPage>[3][]=[];
 for(const artifactRef of hints.refs){
  const candidate=await database.transaction(context,limits,async tx=>{
   const extra=[...await boundedCallback(opts=>discoveryFences(tx,structuredClone(value.eventRef),opts),limits),...await boundedCallback(opts=>fences(tx,structuredClone(artifactRef),opts),limits)];
   await lockFences(tx,[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...structuredClone(extra)]);
   await boundedCallback(opts=>discover(tx,structuredClone(value.eventRef),opts),limits);
   const stored=await new InlineArtifactOwner().read(tx,artifactRef,record=>boundedCallback(opts=>artifact(tx,record,opts),limits));
   if(stored.record.mediaType!=='application/json'||stored.record.sizeBytes>65536)throw new CoreError('PRECONDITION_FAILED');
   let document;try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes));}catch{throw new CoreError('PRECONDITION_FAILED');}
   // An event may own unrelated evidence; do not turn it into suspension work.
   if(!document||document.kind!=='PackSuspensionTargetPage'||canonicalJson(document.capability)!==canonicalJson(value.capability))return undefined;
   return {artifactRef,pageDigest:await inputDigest(document),eventRef:value.eventRef,capability:value.capability};
  });
  if(candidate){await readSuspensionPage(database,context,limits,candidate,{fenceRefs:fences,artifact});pages.push(candidate);}
 }
 return {pages,complete:!hints.next,...(hints.next?{cursor:{bindingDigest,afterId:hints.next}}:{})};
}
