import type {EntityRef,PackCapabilityBinding,RegisterPackCapabilitiesCommand} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';
import {PackCapabilityRegistryOwner} from './capability-registry.ts';
import {prepareInstalledCapabilities} from './prepare-installed-capabilities.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';

type Admission=Parameters<typeof prepareInstalledCapabilities>[6];
/** Reserve verified identities under an independent deployment Grant, including replay.
 * Staged records are management facts only. No Enabled state or runtime selection is issued. */
export async function registerPackCapabilities(database:Database,context:VerifiedContext,options:TransactionOptions,command:RegisterPackCapabilitiesCommand,root:string,
 bindings:readonly PackCapabilityBinding[],grants:{stage:readonly EntityRef[];register:readonly EntityRef[]},admission:Admission){
 requireVerifiedContext(context);
 const input=contract('RegisterPackCapabilitiesCommand',structuredClone(command)),mapped=structuredClone(bindings),authority=structuredClone(grants),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 const p=admission.pack,a=admission.capabilities,pf=p.fenceRefs.bind(p),pc=p.current.bind(p),checks={schema:a.schema.bind(a),implementation:a.implementation.bind(a)};
 if(await inputDigest(mapped)!==input.payload.bindingsDigest)throw new CoreError('INVALID_ARGUMENT');
 const identity={commandId:input.commandId,idempotencyKey:input.idempotencyKey,type:input.type,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1},owner=new PackCapabilityRegistryOwner();
  const authorize=()=>assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},authority.register);
  const pack={fenceRefs:async(...args:Parameters<typeof pf>)=>[...authority.register,...await pf(...args)],current:async(...args:Parameters<typeof pc>)=>{
   await authorize();await new PackDeploymentRevisionOwner().current(tx);await pc(...args);
  }};
  let prepared:Awaited<ReturnType<typeof prepareInstalledCapabilities>>|undefined;
  const assess=async()=>{
   const value=await prepareInstalledCapabilities(tx,work,input.payload.packRef,root,authority.stage,mapped,{pack,capabilities:checks});
   if(prepared&&canonicalJson(prepared)!==canonicalJson(value))throw new CoreError('VERSION_CONFLICT');prepared=value;
   await authorize();assertMigrationWorkActive(tx,work);
  };
  const result=await executeCommand(tx,identity,assess,async()=>{
   if(!prepared)throw new CoreError('INTERNAL_ERROR');
   return owner.register(tx,identity,input.payload.packRef,prepared.registrations,async()=>{await authorize();});
  });
  const saved=await owner.readSet(tx,result.receipt.resultRef,async set=>{
   if(!prepared||canonicalJson(set.packRef)!==canonicalJson(input.payload.packRef)||canonicalJson(set.registrations)!==canonicalJson(prepared.registrations))throw new CoreError('PRECONDITION_FAILED');
  });
  await assess();return {setRef:saved.setRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
