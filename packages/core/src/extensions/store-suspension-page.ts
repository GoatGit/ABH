import {randomUUID} from 'node:crypto';
import type {CapabilityRef,EntityRef,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {requireVerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {storeInlineArtifact,type InlineArtifactStorageChecks} from '../data/store-inline-artifact.ts';
import type {queryPackSuspensionTargets} from './query-pack-suspension-targets.ts';

/** Inert scan evidence, never a notification receipt or authority token. Source
 * references and retention require current storage admission, including replay.
 * Inline capacity is 64 KiB; scanners must choose a page size fitting that limit. */
export async function storeSuspensionPage(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:{eventRef:EntityRef;capability:CapabilityRef;page:Awaited<ReturnType<typeof queryPackSuspensionTargets>>},
 retention:Pick<StoreInlineArtifactPayload,'dataClass'|'purposeNames'|'region'|'retentionPolicyRef'>,grants:readonly EntityRef[],checks:InlineArtifactStorageChecks){
 requireVerifiedContext(context);
 const value=structuredClone(input),storage=structuredClone(retention),authority=structuredClone(grants),limits={...options};
 const admission={fenceRefs:checks.fenceRefs.bind(checks),admit:checks.admit.bind(checks),references:checks.references.bind(checks)};
 contract('EntityRef',value.eventRef);contract('CapabilityRef',value.capability);
 if(value.eventRef.type!=='abh.event'||value.eventRef.version!==1||!Array.isArray(value.page.targets)||value.page.targets.length>100||typeof value.page.complete!=='boolean'||value.page.complete===Boolean(value.page.cursor))throw new CoreError('INVALID_ARGUMENT');
 if(value.page.cursor){contract('Digest',value.page.cursor.bindingDigest);contract('UUID',value.page.cursor.afterId);}
 const keys=new Set<string>(),sources=new Map<string,EntityRef>();
 for(const target of value.page.targets){
  contract('EntityRef',target.packRef);contract('PinSetRef',target.pinSetRef);contract('SubjectRef',target.subjectRef);contract('Digest',target.pinSetDigest);
  if(target.packRef.type!=='abh.installed-pack'||canonicalJson(target.eventRef)!==canonicalJson(value.eventRef)||canonicalJson(target.capability)!==canonicalJson(value.capability)||keys.has(target.notificationKey))throw new CoreError('INVALID_ARGUMENT');
  if(target.notificationKey!==await inputDigest({eventRef:value.eventRef,pinSetRef:target.pinSetRef,capability:value.capability}))throw new CoreError('INVALID_ARGUMENT');
  keys.add(target.notificationKey);sources.set(canonicalJson(target.packRef),target.packRef);sources.set(canonicalJson(target.pinSetRef),target.pinSetRef);
 }
 const document={kind:'PackSuspensionTargetPage',...value},pageDigest=await inputDigest(document),organizationId=context.tenant.resourceOrganizationId;
 const payload={...storage,ownerRef:value.eventRef,mediaType:'application/json',content:canonicalJson(document),sourceRefs:[...sources.values()]};
 const command={type:'abh.artifacts.store-inline',commandId:randomUUID(),idempotencyKey:`suspension-page/${pageDigest}`,digest:await inputDigest({organizationId,payload})};
 const accepted=await storeInlineArtifact(database,context,limits,command,organizationId,payload,authority,admission);
 return {...accepted,pageDigest};
}
