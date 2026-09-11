import type {Database,TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {queryPackSuspensionTargets,type SuspensionTargetCursor} from './query-pack-suspension-targets.ts';

type Page=Awaited<ReturnType<typeof queryPackSuspensionTargets>>;
export interface SuspensionScanInstallation {
 /** Refresh both independently authorized identities for every page. */
 contexts(options:TransactionOptions):Promise<{management:VerifiedContext;business:VerifiedContext}>;
 grants:Parameters<typeof queryPackSuspensionTargets>[5];
 admission:Parameters<typeof queryPackSuspensionTargets>[6];
 /** Persist a whole page with notificationKey dedupe before acknowledging it.
  * Must reauthorize actual Owner effects; discovery itself grants none. A failed
  * callback leaves this page eligible for replay after restart. */
 accept(page:Page,options:TransactionOptions):Promise<void>;
}
/** Bounded sweep for one event/capability/business scope. Returns progress only
 * after page acceptance. Hosts persist returned cursor or replay from the start;
 * end-of-sweep is not a durable delivery receipt or global reference watermark. */
export async function scanPackSuspension(database:Database,options:TransactionOptions,
 input:Parameters<typeof queryPackSuspensionTargets>[4]&{maxPages?:number},installation:SuspensionScanInstallation){
 const value=structuredClone(input),limits={...options},maxPages=value.maxPages??10;
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100)throw new CoreError('INVALID_ARGUMENT');
 const contexts=installation.contexts.bind(installation),accept=installation.accept.bind(installation),grants=structuredClone(installation.grants);
 const s=installation.admission.source,r=installation.admission.references;
 const admission={source:{fenceRefs:s.fenceRefs.bind(s),current:s.current.bind(s)},references:{fenceRefs:r.fenceRefs.bind(r),admit:r.admit.bind(r),canRead:r.canRead.bind(r)}};
 let cursor:SuspensionTargetCursor|undefined=value.cursor,acceptedPages=0,targets=0;
 for(let pageNumber=0;pageNumber<maxPages;pageNumber++){
  const identity=await boundedCallback(contexts,limits);
  requireVerifiedContext(identity.management);requireVerifiedContext(identity.business);
  const page=await queryPackSuspensionTargets(database,identity.management,identity.business,limits,
   {eventRef:value.eventRef,capability:value.capability,registeredKind:value.registeredKind,limit:value.limit??100,...(cursor?{cursor}:{})},grants,admission);
  await boundedCallback(opts=>accept(structuredClone(page),opts),limits);
  acceptedPages++;targets+=page.targets.length;
  if(page.complete)return {acceptedPages,targets,complete:true as const};
  if(!page.cursor||page.cursor.afterId===cursor?.afterId)throw new CoreError('PRECONDITION_FAILED');
  cursor=page.cursor;
 }
 return {acceptedPages,targets,complete:false as const,cursor:cursor!};
}
