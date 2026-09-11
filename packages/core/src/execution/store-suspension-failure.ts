import {randomUUID} from 'node:crypto';
import type {EntityRef,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {errorRegistry} from '@abh/contracts/errors';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {storeInlineArtifact,type InlineArtifactStorageChecks} from '../data/store-inline-artifact.ts';
import {readCommittedEvent} from '../durable/inbox.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import type {SuspensionScopeFailure} from './suspension-dispatch-worker.ts';

/** Persist a sanitized diagnostic under independent storage permission. This is
 * an observed processing failure, never evidence of no remote effect, scope
 * completion or notification authority. Repeated identical diagnostics coalesce;
 * this record is not an attempt counter and is not resolved by later success. */
export async function storeSuspensionFailure(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:SuspensionScopeFailure,retention:Pick<StoreInlineArtifactPayload,'dataClass'|'purposeNames'|'region'|'retentionPolicyRef'>,
 grantRefs:readonly EntityRef[],checks:InlineArtifactStorageChecks){
 requireVerifiedContext(context);
 const limits={...options},storage=structuredClone(retention),grants=structuredClone(grantRefs);
 // Select only the diagnostic vocabulary; external messages/stacks cannot enter content.
 const value={eventRef:structuredClone(input.eventRef),capability:structuredClone(input.capability),scopeId:input.scopeId,errorCode:input.errorCode};
 contract('EntityRef',value.eventRef);contract('CapabilityRef',value.capability);contract('RegisteredName',value.scopeId);
 if(value.eventRef.type!=='abh.event'||value.eventRef.version!==1||!Object.hasOwn(errorRegistry,value.errorCode))throw new CoreError('INVALID_ARGUMENT');
 const fences=checks.fenceRefs.bind(checks),admit=checks.admit.bind(checks),references=checks.references.bind(checks);
 const organizationId=context.tenant.resourceOrganizationId,ownerRef={type:'abh.organization',id:organizationId,version:1};
 const document={kind:'PackSuspensionScopeFailure',...value},diagnosticDigest=await inputDigest(document);
 const payload={...storage,ownerRef,mediaType:'application/json',content:canonicalJson(document),sourceRefs:[value.eventRef]};
 const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:`suspension-failure/${diagnosticDigest}`,digest:await inputDigest({organizationId,payload})};
 const accepted=await storeInlineArtifact(database,context,limits,command,organizationId,payload,grants,{
  fenceRefs:(tx,input)=>boundedCallback(opts=>fences(tx,input),{...limits,signal:AbortSignal.any([limits.signal,tx.signal])}),
  admit:async(tx,input)=>{
   const work={...limits,signal:AbortSignal.any([limits.signal,tx.signal])};
   await boundedCallback(()=>admit(tx,input),work);
   const event=await readCommittedEvent(tx,value.eventRef);
   if(event.type!=='abh.installed-pack.suspend'||event.aggregateRef.type!=='abh.installed-pack')throw new CoreError('PRECONDITION_FAILED');
  },
  references:(tx,refs)=>boundedCallback(()=>references(tx,refs),{...limits,signal:AbortSignal.any([limits.signal,tx.signal])}),
 });
 return {...accepted,diagnosticDigest};
}
