import type {EntityRef,QueryExitRecord} from '@abh/contracts';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import {resolvePackCapability,type InstalledCapabilityImplementation,type ResolvePackCapabilityAdmission} from './resolve-pack-capability.ts';

import {resolveCompatiblePackQuery} from './resolve-compatible-pack-query.ts';

type ResolutionInput=Parameters<typeof resolvePackCapability>[2];
/** Preparation is only a declaration, never authorization or a resolved implementation. */
export interface PreparedPackCapabilityResolution<T> {
 readonly kind:'PreparedPackCapabilityResolution';
 readonly fenceRefs:readonly EntityRef[];
 /** Type-only invariant marker; no implementation is exposed by preparation. */
 readonly implementationType?: (value:T)=>T;
}
interface Prepared<T> {
 tx:TenantTransaction;options:TransactionOptions;input:ResolutionInput;compatible:boolean;
 binding:InstalledCapabilityImplementation<T>;grants:readonly EntityRef[];admission:ResolvePackCapabilityAdmission;
}
const prepared=new WeakMap<object,Prepared<unknown>>();
/** Collect all Control scopes before the caller locks its full canonical fence set.
 * No aggregate locks, content reads, invocation or Grant acceptance happens here. */
export async function preparePackCapabilityResolution<T>(tx:TenantTransaction,options:TransactionOptions,input:ResolutionInput,
 binding:InstalledCapabilityImplementation<T>,grants:readonly EntityRef[],admission:ResolvePackCapabilityAdmission):Promise<PreparedPackCapabilityResolution<T>>{
 return prepare(tx,options,input,binding,grants,admission,false);
}
/** Declare replacement Pack fences while retaining the original persisted Pin input. */
export async function prepareCompatiblePackQuery<T>(tx:TenantTransaction,options:TransactionOptions,input:ResolutionInput,
 binding:InstalledCapabilityImplementation<T>,grants:readonly EntityRef[],admission:ResolvePackCapabilityAdmission):Promise<PreparedPackCapabilityResolution<T>>{
 return prepare(tx,options,input,binding,grants,admission,true);
}
async function prepare<T>(tx:TenantTransaction,options:TransactionOptions,input:ResolutionInput,
 binding:InstalledCapabilityImplementation<T>,grants:readonly EntityRef[],admission:ResolvePackCapabilityAdmission,compatible:boolean):Promise<PreparedPackCapabilityResolution<T>>{
 const value=structuredClone(input),readGrants=structuredClone(grants),work=migrationWorkOptions(tx,options);
 const installed={exactRef:contract('CapabilityRef',structuredClone(binding.exactRef)),registeredKind:binding.registeredKind,implementationRef:contract('EntityRef',structuredClone(binding.implementationRef)),implementation:binding.implementation};
 contract('CapabilityRef',value.exactRef);contract('RegisteredName',installed.registeredKind);
 const a=admission,q=a.query,fences=a.fenceRefs.bind(a),qf=q.fenceRefs.bind(q),inspect=q.inspect.bind(q),current=a.current.bind(a),source=a.source.bind(a);
 const query={kind:installed.registeredKind,capabilityId:installed.exactRef.id,version:installed.exactRef.version,limit:1};
 const extra=await boundedCallback(async opts=>{
  const first=structuredClone(await fences(tx,structuredClone(installed.exactRef),opts));
  return [...first,...structuredClone(await qf(tx,structuredClone(query),opts))];
 },work);
 const c=tx.context.tenant,refs=[{type:'abh.organization',id:c.resourceOrganizationId,version:1},{type:'abh.principal',id:c.actor.id,version:1},...readGrants,...extra].map(ref=>contract('EntityRef',ref));
 const token=Object.freeze({kind:'PreparedPackCapabilityResolution' as const,fenceRefs:Object.freeze(refs.map(ref=>Object.freeze({...ref})))});
 assertMigrationWorkActive(tx,work);
 prepared.set(token,{tx,compatible,options:work,input:value,binding:installed,grants:readGrants,admission:{fenceRefs:async()=>structuredClone(extra),query:{fenceRefs:async()=>[],inspect},current,source}});
 return token;
}
/** Caller locks declared fences before resource/ledger/aggregate locks, then locks
 * Deployment before OperationController, and finally resolves before committing.
 * Original deadline and same-UoW identity are mandatory. Every attempt is one-use. */
export async function resolvePreparedPackCapability<T>(tx:TenantTransaction,token:PreparedPackCapabilityResolution<T>){
 const value=prepared.get(token);
 if(!value||value.tx!==tx||value.compatible)throw new CoreError('PRECONDITION_FAILED');
 prepared.delete(token);assertMigrationWorkActive(tx,value.options);
 return resolvePackCapability(tx,value.options,value.input,value.binding as InstalledCapabilityImplementation<T>,value.grants,value.admission);
}

/** Replacement resolution consumes the same-UoW declaration after QueryExit claim. */
export async function resolvePreparedCompatiblePackQuery<T>(tx:TenantTransaction,token:PreparedPackCapabilityResolution<T>,exit:QueryExitRecord){
 const value=prepared.get(token);
 if(!value||value.tx!==tx||!value.compatible)throw new CoreError('PRECONDITION_FAILED');
 prepared.delete(token);assertMigrationWorkActive(tx,value.options);
 return resolveCompatiblePackQuery(tx,value.options,value.input,value.binding as InstalledCapabilityImplementation<T>,value.grants,value.admission,exit);
}
