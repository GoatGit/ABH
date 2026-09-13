import type {EntityRef} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {requestVerifiedContext} from '../identity/context-source.ts';
import {consumeCommittedEvent,readCommittedEvent} from '../durable/inbox.ts';
import {readSuspensionPage,type SuspensionPageReadAdmission} from '../extensions/read-suspension-page.ts';
import {actionPackSuspensionConsumer,runPackSuspensionConsumer,type ActionSuspensionAdmission,type RunSuspensionAdmission} from './pack-suspension-consumer.ts';

type PageInput=Parameters<typeof readSuspensionPage>[3];
type Target=Awaited<ReturnType<typeof readSuspensionPage>>['page']['targets'][number];
export interface SuspensionTargetDelivery {
 notificationKey:string;
 inboxRef:EntityRef;
 resultRef:EntityRef;
}
export interface SuspensionPageDeliveryInstallation {
 /** Refresh the independently authenticated Service for every business target. */
 context(target:Target,options:TransactionOptions):Promise<VerifiedContext>;
 registeredKind:string;
 grantRefs:readonly EntityRef[];
 page:SuspensionPageReadAdmission;
 action:ActionSuspensionAdmission;
 run?:RunSuspensionAdmission;
 /** Optional durable progress acknowledgement. Losing it replays the same Inbox. */
 onHandled?(delivery:SuspensionTargetDelivery,options:TransactionOptions):Promise<void>;
}
/** Recover and deliver every Action in an immutable scan page. Each effect uses
 * the ORIGINAL suspension event and Action consumer key, independent of page
 * boundaries, rescans or frozen subscription routes. No original-event Outbox
 * routing/publication/consumption completion is inferred from this page.
 * Earlier effects survive later failure; restart from the same Artifact safely.
 */
export async function deliverActionSuspensionPage(database:Database,pageContext:VerifiedContext,options:TransactionOptions,
 input:PageInput,installation:SuspensionPageDeliveryInstallation):Promise<{artifactRef:EntityRef;pageDigest:string;deliveries:SuspensionTargetDelivery[]}>{
 requireVerifiedContext(pageContext);
 const value=structuredClone(input),limits={...options},registeredKind=installation.registeredKind,grants=structuredClone(installation.grantRefs);
 contract('RegisteredName',registeredKind);
 const context=installation.context.bind(installation),handled=installation.onHandled?.bind(installation),p=installation.page,a=installation.action;
 const pageAdmission={fenceRefs:p.fenceRefs.bind(p),artifact:p.artifact.bind(p)};
 const actionAdmission={fenceRefs:a.fenceRefs.bind(a),source:a.source.bind(a),artifact:a.artifact.bind(a),storage:structuredClone(a.storage)};
 const read=()=>readSuspensionPage(database,pageContext,limits,value,pageAdmission);
 const recovered=await read();
 // Other subject Owners need their own consumer; never silently acknowledge them.
 const deliveries:SuspensionTargetDelivery[]=[];
 for(const target of recovered.page.targets){
  await read(); // Current page permission is independent of business notification permission.
  const current=await requestVerifiedContext(opts=>context(structuredClone(target),opts),limits),c=current.tenant,source=pageContext.tenant;
  if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.runtime.deliver'||c.resourceOrganizationId!==source.resourceOrganizationId
   ||c.actingOrganizationId!==source.actingOrganizationId||c.workspaceId!==source.workspaceId)throw new CoreError('FORBIDDEN');
  let consumer;
  if(target.subjectRef.type==='abh.action'){
   consumer=actionPackSuspensionConsumer({actionRef:target.subjectRef,pinSetRef:target.pinSetRef,pinSetDigest:target.pinSetDigest,
    capability:value.capability,registeredKind,grantRefs:grants},actionAdmission);
  }else if(target.subjectRef.type==='abh.run'){
   if(!installation.run)throw new CoreError('PRECONDITION_FAILED');
   const runAdmission={fenceRefs:installation.run.fenceRefs.bind(installation.run),source:installation.run.source.bind(installation.run),
    artifact:installation.run.artifact.bind(installation.run),storage:structuredClone(installation.run.storage)};
   consumer=runPackSuspensionConsumer({runRef:target.subjectRef,pinSetRef:target.pinSetRef,pinSetDigest:target.pinSetDigest,
    capability:value.capability,registeredKind,grantRefs:grants},runAdmission);
  }else throw new CoreError('PRECONDITION_FAILED');
  const event=await database.transaction(current,limits,tx=>readCommittedEvent(tx,value.eventRef));
  const payload=contract('ConsumeEventPayload',{eventRef:value.eventRef,eventDigest:await inputDigest(event),consumerId:consumer.id});
  const inbox=await consumeCommittedEvent(database,current,limits,payload,consumer);
  const result={notificationKey:target.notificationKey,inboxRef:inbox.inboxRef,resultRef:inbox.resultRef};
  if(handled)await boundedCallback(opts=>handled(structuredClone(result),opts),limits);
  deliveries.push(result);
 }
 await read();
 return {artifactRef:recovered.artifactRef,pageDigest:recovered.pageDigest,deliveries};
}
