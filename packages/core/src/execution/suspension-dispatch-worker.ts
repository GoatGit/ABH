import {setTimeout as delay} from 'node:timers/promises';
import type {CapabilityRef,EntityRef} from '@abh/contracts';
import type {ErrorCode} from '@abh/contracts/errors';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {requestVerifiedContext,type ContextSource} from '../identity/context-source.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {requireVerifiedContext} from '../internal/context.ts';
import {discoverPackSuspensions,type PackSuspensionDiscoveryAdmission,type PackSuspensionDiscoveryCursor} from '../extensions/discover-pack-suspensions.ts';
import {processActionSuspension,snapshotActionSuspensionProcessing,type ActionSuspensionProcessingInstallation} from './process-action-suspension.ts';

export interface SuspensionScopeFailure {
 eventRef:EntityRef;
 capability:CapabilityRef;
 scopeId:string;
 errorCode:ErrorCode;
}
export interface SuspensionDispatchWorkerOptions {
 signal:AbortSignal;
 managementContext:ContextSource;
 managementGrants:readonly EntityRef[];
 discovery:PackSuspensionDiscoveryAdmission;
 /** Trusted scope subscriptions. Kind mapping is explicit; capability identity
  * and digest come only from the actual suspended registration set. */
 scopes:readonly {id:string;publicKind:CapabilityRef['kind'];processing:ActionSuspensionProcessingInstallation}[];
 eventPageSize?:number;
 targetPageSize?:number;
 intervalMs?:number;
 /** Opt in to scope isolation by durably recording this diagnostic before
  * returning. No raw exception/body is exposed. Failure to record stops the loop.
  * Next full event sweep retries the scope from the start, using Inbox dedupe. */
 onScopeFailure?(failure:SuspensionScopeFailure,options:TransactionOptions):Promise<void>;
 onPage?(result:{events:number;scopeSweeps:number;blockedScopes:number;targetPages:number;targets:number;eventSweepComplete:boolean},options:TransactionOptions):Promise<void>;
}
/** Discover committed suspension events and drive every installed matching scope
 * through real page storage and Action effects. Native immutable facts survive
 * restart; cursors are only transient optimizations. No global completion claim.
 * Unmapped registered kinds fail instead of being silently acknowledged. */
export async function runSuspensionDispatchWorker(database:Database,input:SuspensionDispatchWorkerOptions):Promise<void>{
 const signal=input.signal,contextSource=input.managementContext.bind(input),grants=structuredClone(input.managementGrants),onPage=input.onPage?.bind(input),onFailure=input.onScopeFailure?.bind(input);
 const eventSize=input.eventPageSize??10,targetSize=input.targetPageSize??20,interval=input.intervalMs??1000;
 if(!Number.isInteger(eventSize)||eventSize<1||eventSize>100||!Number.isInteger(targetSize)||targetSize<1||targetSize>100||!Number.isInteger(interval)||interval<1||interval>60000
  ||!input.scopes.length||input.scopes.length>100||new Set(input.scopes.map(scope=>scope.id)).size!==input.scopes.length)throw new CoreError('INVALID_ARGUMENT');
 const d=input.discovery,s=d.source,discovery={fenceRefs:d.fenceRefs.bind(d),discover:d.discover.bind(d),source:{fenceRefs:s.fenceRefs.bind(s),current:s.current.bind(s)}};
 let organization:string|undefined,managementBinding:string|undefined,eventCursor:PackSuspensionDiscoveryCursor|undefined;
 const scopes=input.scopes.map(scope=>{
  contract('RegisteredName',scope.id);
  const processing=snapshotActionSuspensionProcessing(scope.processing),source=processing.contexts;
  let binding:string|undefined;
  processing.contexts=async options=>{
   const identity=await boundedCallback(source,options);
   requireVerifiedContext(identity.management);requireVerifiedContext(identity.business);
   const m=identity.management.tenant,b=identity.business.tenant;
   if(m.resourceOrganizationId!==organization||b.resourceOrganizationId!==organization)throw new CoreError('FORBIDDEN');
   const key=JSON.stringify([m,b].map(c=>[c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor,c.purposeOfUse]));
   if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;return identity;
  };
  return {id:scope.id,publicKind:scope.publicKind,processing};
 });
 const options=()=>({deadline:Date.now()+30000,signal});
 const context=async()=>{
  const current=await requestVerifiedContext(contextSource,options()),c=current.tenant;
  const key=JSON.stringify([c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor,c.purposeOfUse]);
  if(managementBinding!==undefined&&managementBinding!==key)throw new CoreError('FORBIDDEN');managementBinding=key;organization=c.resourceOrganizationId;return current;
 };
 while(!signal.aborted){try{
  const batch=await discoverPackSuspensions(database,await context(),options(),{limit:eventSize,...(eventCursor?{cursor:eventCursor}:{})},grants,discovery);
  const stats={events:batch.suspensions.length,scopeSweeps:0,blockedScopes:0,targetPages:0,targets:0,eventSweepComplete:batch.complete};
  for(const suspension of batch.suspensions){
   if(suspension.capabilities.some(entry=>!scopes.some(scope=>scope.processing.delivery.registeredKind===entry.capability.kind)))throw new CoreError('PRECONDITION_FAILED');
   for(const entry of suspension.capabilities)for(const scope of scopes.filter(scope=>scope.processing.delivery.registeredKind===entry.capability.kind)){
    const capability=contract('CapabilityRef',{kind:scope.publicKind,id:entry.capability.id,version:entry.capability.version,digest:entry.registrationDigest});
    try{
    let cursor:Parameters<typeof processActionSuspension>[2]['cursor'];
    do{
     if(signal.aborted)return;
     const result=await processActionSuspension(database,options(),{eventRef:suspension.eventRef,capability,registeredKind:entry.capability.kind,limit:targetSize,maxPages:1,...(cursor?{cursor}:{})},scope.processing);
     stats.targetPages+=result.pages;stats.targets+=result.targets;
     cursor=result.complete?undefined:result.cursor;
    }while(cursor);
    stats.scopeSweeps++;
    }catch(error){
     if(signal.aborted)return;
     if(!onFailure)throw error;
     await boundedCallback(opts=>onFailure({eventRef:structuredClone(suspension.eventRef),capability:structuredClone(capability),scopeId:scope.id,errorCode:error instanceof CoreError?error.code:'INTERNAL_ERROR'},opts),options());
     stats.blockedScopes++;
    }
   }
  }
  if(signal.aborted)return;
  if(onPage)await boundedCallback(opts=>onPage(stats,opts),options());
  eventCursor=batch.cursor;
  await delay(interval,undefined,{signal});
 }catch(error){if(signal.aborted)return;throw error;}}
}
