import type {EntityRef,InstalledPackRecord,SuspendPackCommand} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {appendChange,contract,executeCommand} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {InstalledPackOwner} from './installed-packs.ts';
import {PackDeploymentRevisionOwner} from './deployment-revisions.ts';
import {migrationWorkOptions} from './migration-work-options.ts';

export interface SuspendPackAdmission {
 fenceRefs(tx:TenantTransaction,input:SuspendPackCommand['payload'],options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Current deployment permission and reason/evidence/emergency policy. Replay
  * receives the original accepted historical record and never reactivates it. */
 current(tx:TenantTransaction,pack:InstalledPackRecord,input:SuspendPackCommand['payload'],replay:boolean,options:TransactionOptions):Promise<void>;
}
/** Stop new capability use atomically with immutable history, deployment revision
 * and durable event. Existing Operation liability is untouched. No byte deletion. */
export async function suspendPack(database:Database,context:VerifiedContext,options:TransactionOptions,command:SuspendPackCommand,grantRefs:readonly EntityRef[],admission:SuspendPackAdmission){
 requireVerifiedContext(context);
 const input=contract('SuspendPackCommand',structuredClone(command)),grants=structuredClone(grantRefs),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 const fences=admission.fenceRefs.bind(admission),current=admission.current.bind(admission),identity={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits),owner=new InstalledPackOwner(),revisions=new PackDeploymentRevisionOwner(),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  let previous:InstalledPackRecord|undefined;
  const result=await executeCommand(tx,identity,async()=>{
   const extra=await boundedCallback(opts=>fences(tx,structuredClone(input.payload),opts),work);
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...structuredClone(extra)]);
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
   const revision=await revisions.current(tx);
   const [receipt]=await tx.owner('CommandIngress')`SELECT record FROM data.command_receipts WHERE resource_organization_id=${c.resourceOrganizationId} AND actor_principal_id=${c.actor.id} AND command_type=${input.type} AND idempotency_key=${input.idempotencyKey}`;
   if(receipt){
    const accepted=contract('CommandReceipt',receipt.record),historical=await owner.readHistorical(tx,accepted.resultRef,async()=>{});
    if(historical.status!=='Suspended'||!historical.suspension)throw new CoreError('PRECONDITION_FAILED');
    if(accepted.inputDigest===identity.digest){const {suspendedAt:_,...payload}=historical.suspension;if(canonicalJson(payload)!==canonicalJson(input.payload))throw new CoreError('PRECONDITION_FAILED');}
    await boundedCallback(opts=>current(tx,structuredClone(historical),structuredClone(input.payload),true,opts),work);
   }else{
    if(revision!==input.payload.expectedDeploymentVersion)throw new CoreError('VERSION_CONFLICT');
    previous=await owner.read(tx,input.payload.packRef,async()=>{});
    if(previous.status!=='Enabled')throw new CoreError('PRECONDITION_FAILED');
    await boundedCallback(opts=>current(tx,structuredClone(previous!),structuredClone(input.payload),false,opts),work);
   }
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
  },async()=>{
   if(!previous)throw new CoreError('PRECONDITION_FAILED');
   await owner.retainCurrent(tx,previous.packRef);
   const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
   const next=contract('InstalledPackRecord',{...previous,packRef:{...previous.packRef,version:previous.packRef.version+1},deploymentVersion:input.payload.expectedDeploymentVersion+1,status:'Suspended',suspension:{...input.payload,suspendedAt:clock!.now.toISOString()}});
   const rows=await tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=${next.packRef.version},status='Suspended',deployment_version=${next.deploymentVersion},record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${previous.packRef.id} AND version=${previous.packRef.version} AND status='Enabled' AND record=${JSON.stringify(previous)}::text::jsonb RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
   await owner.retainCurrent(tx,next.packRef);const revision=await revisions.advance(tx,input.payload.expectedDeploymentVersion,next.packRef);
   await appendChange(tx,{command:identity,target:next.packRef,eventType:'abh.installed-pack.suspend',changedFields:['status','deploymentVersion','suspension'],relatedRefs:[previous.packRef,revision.revisionRef,...input.payload.evidenceRefs]});
   return next.packRef;
  });
  return {packRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
