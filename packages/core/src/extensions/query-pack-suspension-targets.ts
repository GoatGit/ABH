import type {CapabilityRef,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {readPackSuspension,type PackSuspensionReadAdmission} from './read-pack-suspension.ts';
import {queryCapabilityReferences,type CapabilityReferenceAdmission} from '../release/capability-references.ts';

export interface SuspensionTargetCursor {
 bindingDigest:string;
 afterId:string;
}
/** One capability and one authorized business scope per page. Deployment code
 * supplies the explicit registered-kind/public-kind mapping. No inferred mapping,
 * cross-tenant authority transfer, notification effect or global completion claim. */
export async function queryPackSuspensionTargets(database:Database,management:VerifiedContext,business:VerifiedContext,options:TransactionOptions,
 input:{eventRef:EntityRef;capability:CapabilityRef;registeredKind:string;limit?:number;cursor?:SuspensionTargetCursor},
 grants:readonly EntityRef[],admission:{source:PackSuspensionReadAdmission;references:CapabilityReferenceAdmission}){
 requireVerifiedContext(management);requireVerifiedContext(business);
 const value=structuredClone(input),authority=structuredClone(grants),limits={...options};
 contract('CapabilityRef',value.capability);contract('RegisteredName',value.registeredKind);
 if(management.tenant.resourceOrganizationId!==business.tenant.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const sourceChecks={fenceRefs:admission.source.fenceRefs.bind(admission.source),current:admission.source.current.bind(admission.source)},r=admission.references;
 const referenceChecks={fenceRefs:r.fenceRefs.bind(r),admit:r.admit.bind(r),canRead:r.canRead.bind(r)};
 const source=await readPackSuspension(database,management,limits,value.eventRef,authority,sourceChecks);
 const matches=source.capabilities.filter(entry=>entry.capability.kind===value.registeredKind&&entry.capability.id===value.capability.id&&entry.capability.version===value.capability.version&&entry.registrationDigest===value.capability.digest);
 if(matches.length!==1)throw new CoreError('PIN_INPUT_CONFLICT');
 const c=business.tenant,bindingDigest=await inputDigest({eventRef:source.eventRef,capabilitySetDigest:source.capabilitySetDigest,capability:value.capability,registeredKind:value.registeredKind,
  organizationId:c.resourceOrganizationId,workspaceId:c.workspaceId??null,purpose:c.purposeOfUse,actor:c.actor});
 if(value.cursor&&(value.cursor.bindingDigest!==bindingDigest||typeof value.cursor.afterId!=='string'))throw new CoreError('INVALID_ARGUMENT');
 const page=await queryCapabilityReferences(database,business,limits,{capability:value.capability,limit:value.limit??100,...(value.cursor?{afterId:value.cursor.afterId}:{})},referenceChecks);
 // Recheck source management authority after business discovery. No output is
 // released if management permission changed while that independent read ran.
 const final=await readPackSuspension(database,management,limits,value.eventRef,authority,sourceChecks);
 if(canonicalJson(final)!==canonicalJson(source))throw new CoreError('VERSION_CONFLICT');
 const targets=await Promise.all(page.references.map(async reference=>({...reference,eventRef:source.eventRef,packRef:source.packRef,capability:value.capability,
  notificationKey:await inputDigest({eventRef:source.eventRef,pinSetRef:reference.pinSetRef,capability:value.capability})})));
 return {targets,complete:page.complete,...(page.nextAfterId?{cursor:{bindingDigest,afterId:page.nextAfterId}}:{})};
}
