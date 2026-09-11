import type {EnablePackCommand,EntityRef} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {preparePackEnableCommit,type PackEnableCommitAdmission} from './prepare-pack-enable-commit.ts';
import {applyPackEnable} from './apply-pack-enable.ts';
import {readPackEnableAcceptance,type PackEnableReplayAdmission} from './read-pack-enable-acceptance.ts';
import {migrationWorkOptions} from './migration-work-options.ts';

export interface EnablePackAdmission {commit:PackEnableCommitAdmission;replay:PackEnableReplayAdmission}
/** Internal deployment command. Initial admission and writes share a Command UoW;
 * replay reads the original accepted version with current management admission. */
export async function enablePack(database:Database,context:VerifiedContext,options:TransactionOptions,command:EnablePackCommand,root:string,
 grants:{enable:readonly EntityRef[];impact:readonly EntityRef[];stage:readonly EntityRef[]},admission:EnablePackAdmission){
 requireVerifiedContext(context);
 const input=contract('EnablePackCommand',structuredClone(command)),authority=structuredClone(grants),limits={...options},c=context.tenant;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||input.target.id!==c.resourceOrganizationId||input.payload.proposal.resourceOrganizationId!==c.resourceOrganizationId||!['Human','Service'].includes(c.actor.type))throw new CoreError('FORBIDDEN');
 // Capture all methods before the first asynchronous boundary, including receivers.
 const a=admission.commit,p=a.proposal,m=p.migration,i=m.impact,ct=p.conformance,cp=ct.pack,r=admission.replay;
 const commit:PackEnableCommitAdmission={fenceRefs:a.fenceRefs.bind(a),installation:a.installation.bind(a),proposal:{
  capabilityFenceRefs:p.capabilityFenceRefs.bind(p),capabilities:p.capabilities.bind(p),impact:p.impact.bind(p),
  migration:{references:m.references.bind(m),read:m.read.bind(m),impact:{signer:i.signer.bind(i),source:i.source.bind(i),current:i.current.bind(i),fenceRefs:i.fenceRefs.bind(i)}},
  conformance:{references:ct.references.bind(ct),read:ct.read.bind(ct),pack:{fenceRefs:cp.fenceRefs.bind(cp),current:cp.current.bind(cp)}},
 }};
 const replay={fenceRefs:r.fenceRefs.bind(r),current:r.current.bind(r)};
 const identity={type:input.type,commandId:input.commandId,idempotencyKey:input.idempotencyKey,digest:await digestCommandIntent(input)};
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits);
  const result=await executeCommand(tx,identity,async()=>{
   // executeCommand holds the canonical idempotency lock before this callback.
   const [existing]=await tx.owner('CommandIngress')`SELECT id,input_digest,workspace_id,record FROM data.command_receipts WHERE resource_organization_id=${c.resourceOrganizationId}
    AND actor_principal_id=${c.actor.id} AND command_type=${input.type} AND idempotency_key=${input.idempotencyKey}`;
   if(existing){
    const receipt=contract('CommandReceipt',existing.record);
    if(existing.workspace_id!==null||receipt.commandRef.id!==existing.id||receipt.inputDigest!==existing.input_digest||receipt.resourceOrganizationId!==c.resourceOrganizationId||
     receipt.actorPrincipalId!==c.actor.id||receipt.commandType!==input.type||receipt.idempotencyKey!==input.idempotencyKey)throw new CoreError('PRECONDITION_FAILED');
    const accepted=await readPackEnableAcceptance(tx,work,receipt.resultRef,root,authority.enable,replay);
    // Digest conflict is reported by executeCommand after current authorization.
    if(receipt.inputDigest===identity.digest&&canonicalJson({proposal:accepted.enablement!.proposal,approvalRef:accepted.enablement!.approvalRef})!==canonicalJson(input.payload))throw new CoreError('PRECONDITION_FAILED');
   }else await preparePackEnableCommit(tx,work,input.payload,root,authority,commit);
  },async()=>(await applyPackEnable(tx,work,identity,input.payload,root,authority,commit)).packRef);
  const expected={...input.payload.proposal.packRef,version:input.payload.proposal.packRef.version+1};
  if(canonicalJson(result.receipt.resultRef)!==canonicalJson(expected))throw new CoreError('PRECONDITION_FAILED');
  return {packRef:result.receipt.resultRef,commandId:result.receipt.commandRef.id,replayed:result.replayed};
 });
}
