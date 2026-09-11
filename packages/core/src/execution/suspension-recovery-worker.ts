import {setTimeout as delay} from 'node:timers/promises';
import type {CapabilityRef,EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {queryStoredSuspensionPages,type StoredSuspensionPageCursor,type StoredSuspensionPageDiscovery} from '../extensions/query-stored-suspension-pages.ts';
import {deliverActionSuspensionPage,type SuspensionPageDeliveryInstallation} from './deliver-suspension-page.ts';

export interface SuspensionRecoveryWorkerOptions {
 eventRef:EntityRef;
 capability:CapabilityRef;
 /** Independently authenticated identity for page discovery and read. */
 pageContext:ContextSource;
 discovery:StoredSuspensionPageDiscovery;
 delivery:SuspensionPageDeliveryInstallation;
 signal:AbortSignal;
 pageSize?:number;
 intervalMs?:number;
 onPage?(result:{pages:number;deliveries:number;sweepComplete:boolean},options:TransactionOptions):Promise<void>;
}
export function snapshotSuspensionRecoveryWorker(input:Omit<SuspensionRecoveryWorkerOptions,'signal'>):Omit<SuspensionRecoveryWorkerOptions,'signal'>{
 const d=input.discovery,p=input.delivery,a=p.action,r=p.page;
 return {...input,eventRef:structuredClone(input.eventRef),capability:structuredClone(input.capability),pageContext:input.pageContext.bind(input),
  discovery:{discoveryFences:d.discoveryFences.bind(d),discover:d.discover.bind(d),fenceRefs:d.fenceRefs.bind(d),artifact:d.artifact.bind(d)},
  delivery:{context:p.context.bind(p),registeredKind:p.registeredKind,grantRefs:structuredClone(p.grantRefs),
   page:{fenceRefs:r.fenceRefs.bind(r),artifact:r.artifact.bind(r)},action:{fenceRefs:a.fenceRefs.bind(a),source:a.source.bind(a),artifact:a.artifact.bind(a),storage:structuredClone(a.storage)},
   ...(p.onHandled?{onHandled:p.onHandled.bind(p)}:{})},...(input.onPage?{onPage:input.onPage.bind(input)}:{})};
}
/** One installed event/capability/scope. Recover persisted work on every restart
 * and resweep after the last UUID. Failures do not advance progress; successful
 * earlier effects remain deduplicated by their original-event Inbox. This loop
 * never treats a scoped sweep as global notification or retirement coverage. */
export async function runSuspensionRecoveryWorker(database:Database,input:SuspensionRecoveryWorkerOptions):Promise<void>{
 input={...snapshotSuspensionRecoveryWorker(input),signal:input.signal};
 const eventRef=structuredClone(input.eventRef),capability=structuredClone(input.capability),signal=input.signal;
 const size=input.pageSize??20,interval=input.intervalMs??1000;
 contract('EntityRef',eventRef);contract('CapabilityRef',capability);
 if(eventRef.type!=='abh.event'||eventRef.version!==1||!Number.isInteger(size)||size<1||size>100||!Number.isInteger(interval)||interval<1||interval>60000)throw new CoreError('INVALID_ARGUMENT');
 const source=input.pageContext.bind(input),onPage=input.onPage?.bind(input),d=input.discovery,p=input.delivery,a=p.action,r=p.page;
 const discovery={discoveryFences:d.discoveryFences.bind(d),discover:d.discover.bind(d),fenceRefs:d.fenceRefs.bind(d),artifact:d.artifact.bind(d)};
 const delivery={context:p.context.bind(p),registeredKind:p.registeredKind,grantRefs:structuredClone(p.grantRefs),
  page:{fenceRefs:r.fenceRefs.bind(r),artifact:r.artifact.bind(r)},action:{fenceRefs:a.fenceRefs.bind(a),source:a.source.bind(a),artifact:a.artifact.bind(a),storage:structuredClone(a.storage)},
  ...(p.onHandled?{onHandled:p.onHandled.bind(p)}:{})};
 let binding:string|undefined,cursor:StoredSuspensionPageCursor|undefined;
 const options=()=>({deadline:Date.now()+30000,signal});
 const context=async()=>{
  const current=await requestVerifiedContext(source,options()),c=current.tenant;
  const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor,c.purposeOfUse]);
  if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return current;
 };
 while(!signal.aborted){
  try{
   const batch=await queryStoredSuspensionPages(database,await context(),options(),{eventRef,capability,limit:size,...(cursor?{cursor}:{})},discovery);
   let deliveries=0;
   for(const page of batch.pages){
    if(signal.aborted)return;
    const result=await deliverActionSuspensionPage(database,await context(),options(),page,delivery);
    deliveries+=result.deliveries.length;
   }
   if(signal.aborted)return;
   if(onPage)await boundedCallback(opts=>onPage({pages:batch.pages.length,deliveries,sweepComplete:batch.complete},opts),options());
   cursor=batch.cursor;
   await delay(interval,undefined,{signal});
  }catch(error){if(signal.aborted)return;throw error;}
 }
}
