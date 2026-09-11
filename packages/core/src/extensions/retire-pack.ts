import type {EntityRef,InstalledPackRecord,RetirePackCommand} from '@abh/contracts';
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
import {InlineArtifactOwner} from '../data/artifacts.ts';
import type {ArtifactRecord} from '@abh/contracts';
import {migrationWorkOptions} from './migration-work-options.ts';

export interface RetirePackAdmission {
 /** Current cross-Owner reference review and rollback-window governance. Must
  * validate actual Run/Action/Artifact coverage; an Artifact Ref alone is no proof.
  * Replay also reauthorizes access to the original review. */
 review(tx:TenantTransaction,artifact:ArtifactRecord,bytes:Uint8Array,pack:InstalledPackRecord,input:RetirePackCommand['payload'],options:TransactionOptions):Promise<void>;
 fenceRefs(tx:TenantTransaction,input:RetirePackCommand['payload'],options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Current deployment permission and reason/evidence policy. Replay
  * receives the original accepted historical record and never reactivates it. */
 current(tx:TenantTransaction,pack:InstalledPackRecord,input:RetirePackCommand['payload'],replay:boolean,options:TransactionOptions):Promise<void>;
}
/** Logical retirement with reviewed references, immutable history and durable event.
 * Retains package bytes and existing Operation liability; never performs removal. */
export async function retirePack(database:Database,context:VerifiedContext,options:TransactionOptions,command:RetirePackCommand,grantRefs:readonly EntityRef[],admission:RetirePackAdmission){
 requireVerifiedContext(context);
 const input=contract('RetirePackCommand',structuredClone(command)),grants=structuredClone(grantRefs),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 const review=admission.review.bind(admission),fences=admission.fenceRefs.bind(admission),current=admission.current.bind(admission),identity={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits),owner=new InstalledPackOwner(),revisions=new PackDeploymentRevisionOwner(),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  let previous:InstalledPackRecord|undefined;
  const verifyReview=async(pack:InstalledPackRecord)=>{
   const saved=await new InlineArtifactOwner().read(tx,input.payload.referenceReviewRef,async artifact=>{
    if(canonicalJson(artifact.ownerRef)!==canonicalJson(input.payload.packRef))throw new CoreError('PRECONDITION_FAILED');
   });
   await boundedCallback(opts=>review(tx,structuredClone(saved.record),new Uint8Array(saved.bytes),structuredClone(pack),structuredClone(input.payload),opts),work);
  };
  const result=await executeCommand(tx,identity,async()=>{
   const extra=await boundedCallback(opts=>fences(tx,structuredClone(input.payload),opts),work);
   await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...structuredClone(extra)]);
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
   const revision=await revisions.current(tx);
   const [receipt]=await tx.owner('CommandIngress')`SELECT record FROM data.command_receipts WHERE resource_organization_id=${c.resourceOrganizationId} AND actor_principal_id=${c.actor.id} AND command_type=${input.type} AND idempotency_key=${input.idempotencyKey}`;
   if(receipt){
    const accepted=contract('CommandReceipt',receipt.record),historical=await owner.readHistorical(tx,accepted.resultRef,async()=>{});
    if(historical.status!=='Retired'||!historical.retirement)throw new CoreError('PRECONDITION_FAILED');
    if(accepted.inputDigest===identity.digest){const {retiredAt:_,retiredPackRef:__,deploymentVersion:___,...payload}=historical.retirement;if(canonicalJson(payload)!==canonicalJson(input.payload))throw new CoreError('PRECONDITION_FAILED');}
    await verifyReview(historical);
    await boundedCallback(opts=>current(tx,structuredClone(historical),structuredClone(input.payload),true,opts),work);
   }else{
    if(revision!==input.payload.expectedDeploymentVersion)throw new CoreError('VERSION_CONFLICT');
    previous=await owner.read(tx,input.payload.packRef,async()=>{});
    if(previous.status!=='Suspended')throw new CoreError('PRECONDITION_FAILED');
    const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
    if(Date.parse(input.payload.rollbackWindowEndsAt)>clock!.now.getTime())throw new CoreError('PRECONDITION_FAILED');
    await verifyReview(previous);
    await boundedCallback(opts=>current(tx,structuredClone(previous!),structuredClone(input.payload),false,opts),work);
   }
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:input.type},grants);
  },async()=>{
   if(!previous)throw new CoreError('PRECONDITION_FAILED');
   await owner.retainCurrent(tx,previous.packRef);
   const [clock]=await tx.owner('PackLoader')`SELECT clock_timestamp() AS now`;
   const next=contract('InstalledPackRecord',{...previous,packRef:{...previous.packRef,version:previous.packRef.version+1},deploymentVersion:input.payload.expectedDeploymentVersion+1,status:'Retired',retirement:{...input.payload,retiredPackRef:{...previous.packRef,version:previous.packRef.version+1},deploymentVersion:input.payload.expectedDeploymentVersion+1,retiredAt:clock!.now.toISOString()}});
   const rows=await tx.owner('PackLoader')`UPDATE extension.installed_packs SET version=${next.packRef.version},status='Retired',deployment_version=${next.deploymentVersion},record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
    WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${previous.packRef.id} AND version=${previous.packRef.version} AND status='Suspended' AND record=${JSON.stringify(previous)}::text::jsonb RETURNING id`;
   if(rows.length!==1)throw new CoreError('VERSION_CONFLICT');
   await owner.retainCurrent(tx,next.packRef);const revision=await revisions.advance(tx,input.payload.expectedDeploymentVersion,next.packRef);
   await appendChange(tx,{command:identity,target:next.packRef,eventType:'abh.installed-pack.retire',changedFields:['status','deploymentVersion','retirement'],relatedRefs:[previous.packRef,revision.revisionRef,input.payload.referenceReviewRef,...input.payload.evidenceRefs.filter(ref=>canonicalJson(ref)!==canonicalJson(input.payload.referenceReviewRef))]});
   return next.packRef;
  });
  return {packRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
