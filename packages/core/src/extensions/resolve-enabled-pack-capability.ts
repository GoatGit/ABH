import type {CapabilityRef,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {lockFences} from '../control/fences.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackCapabilityRegistryOwner} from './capability-registry.ts';
import {queryPackCapabilitiesInTransaction} from './query-pack-capabilities.ts';
import {readCapabilitySchema} from './read-capability-schema.ts';
import {verifyPackContent} from './verify-pack-content.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';

import type {InstalledCapabilityImplementation,ResolvePackCapabilityAdmission} from './resolve-pack-capability.ts';

/** Internal shared content resolution. The caller must supply its concrete
 * persisted authority check; installation alone never authorizes invocation. */
export async function resolveEnabledPackCapability<T>(tx:TenantTransaction,options:TransactionOptions,
 input:{exactRef:CapabilityRef},binding:InstalledCapabilityImplementation<T>,readGrants:readonly EntityRef[],
 admission:ResolvePackCapabilityAdmission,requireAuthority:()=>Promise<void>){
 const value=structuredClone(input),grants=structuredClone(readGrants),installed={exactRef:contract('CapabilityRef',structuredClone(binding.exactRef)),registeredKind:binding.registeredKind,implementationRef:contract('EntityRef',structuredClone(binding.implementationRef)),implementation:binding.implementation};
 contract('CapabilityRef',value.exactRef);contract('RegisteredName',installed.registeredKind);
 if(canonicalJson(value.exactRef)!==canonicalJson(installed.exactRef))throw new CoreError('PIN_INPUT_CONFLICT');
 const a=admission,q=a.query,fences=a.fenceRefs.bind(a),current=a.current.bind(a),source=a.source.bind(a),qf=q.fenceRefs.bind(q),qi=q.inspect.bind(q),work=migrationWorkOptions(tx,options);
 const query={kind:installed.registeredKind,capabilityId:value.exactRef.id,version:value.exactRef.version,limit:1};
 const c=tx.context.tenant,scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
 const extra=await boundedCallback(async opts=>[...await fences(tx,structuredClone(value.exactRef),opts),...await qf(tx,structuredClone(query),opts)],work);
 await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...extra]);
 await requireAuthority();
 const checks={fenceRefs:async()=>extra,inspect:qi};
 const find=async(final=false)=>{
  const result=await queryPackCapabilitiesInTransaction(tx,work,query,grants,final?{...checks,inspect:async()=>({visible:true,compatible:true,healthy:true})}:checks),candidate=result.candidates[0];
  if(!result.complete||result.candidates.length!==1||!candidate||!candidate.compatible||!candidate.healthy||candidate.registrationDigest!==value.exactRef.digest)throw new CoreError('PRECONDITION_FAILED');
  const pack=await new InstalledPackOwner().readForCapabilityRuntime(tx,candidate.packRef,grants);
  if(!pack.enablement)throw new CoreError('PRECONDITION_FAILED');
  const set=await new PackCapabilityRegistryOwner().readForCapabilityRuntime(tx,pack.enablement.proposal.capabilitySetRef,grants);
  const entry=set.registrations.find(item=>item.registrationDigest===candidate.registrationDigest&&item.capability.kind===installed.registeredKind&&item.capability.id===value.exactRef.id&&item.capability.version===value.exactRef.version);
  if(!entry||canonicalJson(entry.implementationRef)!==canonicalJson(installed.implementationRef))throw new CoreError('PRECONDITION_FAILED');
  return {candidate,pack,entry};
 };
 const before=await find();
 await boundedCallback(opts=>current(tx,structuredClone(before.entry),structuredClone(before.pack),opts),work);
 const readSchema=async()=>{
  const bytesSource=await boundedCallback(opts=>source(tx,structuredClone(before.pack),opts),work);
  const stableSource={refs:[...bytesSource.refs],open:bytesSource.open.bind(bytesSource)};
  await verifyPackContent(before.pack.manifest,stableSource,work,{maxFileBytes:67108864,maxTotalBytes:67108864,maxFiles:10000});
  return readCapabilitySchema(before.pack.manifest,before.entry,stableSource,work);
 };
 const schema=await readSchema();
 const after=await find();
 if(canonicalJson(before)!==canonicalJson(after))throw new CoreError('VERSION_CONFLICT');
 // Final source read follows all host candidate callbacks. Registration hash
 // comparison proves it is the same immutable Schema without executing it.
 await boundedCallback(opts=>current(tx,structuredClone(before.entry),structuredClone(before.pack),opts),work);
 await readSchema();
 if(canonicalJson(await find(true))!==canonicalJson(before))throw new CoreError('VERSION_CONFLICT');
 await requireAuthority();
 assertMigrationWorkActive(tx,work);
 return Object.freeze({exactRef:Object.freeze({...value.exactRef}),packRef:Object.freeze({...before.pack.packRef}),schema:()=>Uint8Array.from(schema),implementation:installed.implementation});
}
