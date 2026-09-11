import type {Database,TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {queryPackSuspensionTargets} from '../extensions/query-pack-suspension-targets.ts';
import {storeSuspensionPage} from '../extensions/store-suspension-page.ts';
import {deliverActionSuspensionPage,type SuspensionPageDeliveryInstallation} from './deliver-suspension-page.ts';

export interface ActionSuspensionProcessingInstallation {
 contexts(options:TransactionOptions):Promise<{management:VerifiedContext;business:VerifiedContext}>;
 managementGrants:Parameters<typeof queryPackSuspensionTargets>[5];
 discovery:Parameters<typeof queryPackSuspensionTargets>[6];
 storage:{retention:Parameters<typeof storeSuspensionPage>[4];grants:Parameters<typeof storeSuspensionPage>[5];checks:Parameters<typeof storeSuspensionPage>[6]};
 delivery:SuspensionPageDeliveryInstallation;
}
export function snapshotActionSuspensionProcessing(installation:ActionSuspensionProcessingInstallation):ActionSuspensionProcessingInstallation{
 const s=installation.discovery.source,r=installation.discovery.references,c=installation.storage.checks,d=installation.delivery,p=d.page,a=d.action;
 return {contexts:installation.contexts.bind(installation),managementGrants:structuredClone(installation.managementGrants),
  discovery:{source:{fenceRefs:s.fenceRefs.bind(s),current:s.current.bind(s)},references:{fenceRefs:r.fenceRefs.bind(r),admit:r.admit.bind(r),canRead:r.canRead.bind(r)}},
  storage:{retention:structuredClone(installation.storage.retention),grants:structuredClone(installation.storage.grants),checks:{fenceRefs:c.fenceRefs.bind(c),admit:c.admit.bind(c),references:c.references.bind(c)}},
  delivery:{context:d.context.bind(d),registeredKind:d.registeredKind,grantRefs:structuredClone(d.grantRefs),page:{fenceRefs:p.fenceRefs.bind(p),artifact:p.artifact.bind(p)},
   action:{fenceRefs:a.fenceRefs.bind(a),source:a.source.bind(a),artifact:a.artifact.bind(a),storage:structuredClone(a.storage)},...(d.onHandled?{onHandled:d.onHandled.bind(d)}:{})}};
}
/** One bounded event/capability/scope sweep through real discovery, persisted
 * scan evidence and business effects. Progress follows full page consumption.
 * Replay after any crash may restart at the beginning: pages and Inbox dedupe
 * are durable. Completion means only this scoped sweep, never retirement proof. */
export async function processActionSuspension(database:Database,options:TransactionOptions,
 input:Parameters<typeof queryPackSuspensionTargets>[4]&{maxPages?:number},installation:ActionSuspensionProcessingInstallation){
 const value=structuredClone(input),limits={...options},maxPages=value.maxPages??10;
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>100)throw new CoreError('INVALID_ARGUMENT');
 const contexts=installation.contexts.bind(installation),grants=structuredClone(installation.managementGrants),s=installation.discovery.source,r=installation.discovery.references;
 const discovery={source:{fenceRefs:s.fenceRefs.bind(s),current:s.current.bind(s)},references:{fenceRefs:r.fenceRefs.bind(r),admit:r.admit.bind(r),canRead:r.canRead.bind(r)}};
 const retention=structuredClone(installation.storage.retention),storageGrants=structuredClone(installation.storage.grants),c=installation.storage.checks;
 const checks={fenceRefs:c.fenceRefs.bind(c),admit:c.admit.bind(c),references:c.references.bind(c)};
 const d=installation.delivery,p=d.page,a=d.action;
 const delivery={context:d.context.bind(d),registeredKind:d.registeredKind,grantRefs:structuredClone(d.grantRefs),
  page:{fenceRefs:p.fenceRefs.bind(p),artifact:p.artifact.bind(p)},action:{fenceRefs:a.fenceRefs.bind(a),source:a.source.bind(a),artifact:a.artifact.bind(a),storage:structuredClone(a.storage)},
  ...(d.onHandled?{onHandled:d.onHandled.bind(d)}:{})};
 if(delivery.registeredKind!==value.registeredKind)throw new CoreError('INVALID_ARGUMENT');
 let cursor=value.cursor,binding:string|undefined,pages=0,targets=0;
 for(let index=0;index<maxPages;index++){
  const identity=await boundedCallback(contexts,limits);
  requireVerifiedContext(identity.management);requireVerifiedContext(identity.business);
  const key=JSON.stringify([identity.management,identity.business].map(({tenant:c})=>[c.resourceOrganizationId,c.workspaceId??null,c.actingOrganizationId,c.actor,c.purposeOfUse]));
  if(binding!==undefined&&binding!==key)throw new CoreError('FORBIDDEN');binding=key;
  const page=await queryPackSuspensionTargets(database,identity.management,identity.business,limits,
   {eventRef:value.eventRef,capability:value.capability,registeredKind:value.registeredKind,limit:value.limit??20,...(cursor?{cursor}:{})},grants,discovery);
  const stored=await storeSuspensionPage(database,identity.business,limits,{eventRef:value.eventRef,capability:value.capability,page},retention,storageGrants,checks);
  const delivered=await deliverActionSuspensionPage(database,identity.business,limits,{artifactRef:stored.artifactRef,pageDigest:stored.pageDigest,eventRef:value.eventRef,capability:value.capability},delivery);
  pages++;targets+=delivered.deliveries.length;
  if(page.complete)return {pages,targets,complete:true as const};
  if(!page.cursor||page.cursor.afterId===cursor?.afterId)throw new CoreError('PRECONDITION_FAILED');
  cursor=page.cursor;
 }
 return {pages,targets,complete:false as const,cursor:cursor!};
}
