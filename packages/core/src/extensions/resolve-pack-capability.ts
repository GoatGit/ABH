import type {CapabilityRef,EntityRef,InstalledPackRecord,PackCapabilityRegistration,PinSet,ResolveAndPinRequest} from '@abh/contracts';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import type {PackCapabilityQueryAdmission} from './query-pack-capabilities.ts';
import type {PackContentSource} from './verify-pack-content.ts';
import {resolveEnabledPackCapability} from './resolve-enabled-pack-capability.ts';

/** Explicit build-time binding, supplied by trusted deployment code, never a
 * serialized request or dynamic import. Public kind mapping is explicit. */
export interface InstalledCapabilityImplementation<T> {
 exactRef:CapabilityRef;
 registeredKind:string;
 implementationRef:EntityRef;
 implementation:T;
}
export interface ResolvePackCapabilityAdmission {
 query:PackCapabilityQueryAdmission;
 /** Include business authority, implementation and source fences before Pack locks. */
 fenceRefs(tx:TenantTransaction,exact:CapabilityRef,options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Verify current business authority and trust/isolation for this exact binding.
  * Resolution does not replace Action Snapshot/Permit checks at dispatch. */
 current(tx:TenantTransaction,entry:PackCapabilityRegistration,pack:InstalledPackRecord,options:TransactionOptions):Promise<void>;
 source(tx:TenantTransaction,pack:InstalledPackRecord,options:TransactionOptions):Promise<PackContentSource>;
}
/** Resolve only a persisted pinned exact capability. Result remains internal;
 * the caller must not invoke external effects inside this database transaction. */
export async function resolvePackCapability<T>(tx:TenantTransaction,options:TransactionOptions,
 input:{exactRef:CapabilityRef;pinSet:PinSet;request:ResolveAndPinRequest;behaviorSlot:string},
 binding:InstalledCapabilityImplementation<T>,readGrants:readonly EntityRef[],admission:ResolvePackCapabilityAdmission){
 const value=structuredClone(input),release=new StaticReleaseOwner();
 let assignmentRef:EntityRef|undefined;
 const resolved=await resolveEnabledPackCapability(tx,options,value,binding,readGrants,admission,async()=>{
  assignmentRef=await release.requirePinnedCapability(tx,value.pinSet,value.request,value.behaviorSlot,value.exactRef);
 });
 return Object.freeze({...resolved,assignmentRef:Object.freeze({...assignmentRef!})});
}
