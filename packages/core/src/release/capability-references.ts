import type {CapabilityRef,EntityRef,PinSet} from '@abh/contracts';
import {canonicalJson,digestContract} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {lockFences} from '../control/fences.ts';
import {migrationWorkOptions} from '../extensions/migration-work-options.ts';

export interface CapabilityReferenceAdmission {
 fenceRefs(tx:TenantTransaction,capability:CapabilityRef,options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Current independent reference-discovery permission, not package installation permission. */
 admit(tx:TenantTransaction,capability:CapabilityRef,options:TransactionOptions):Promise<void>;
 /** Subject/evidence read visibility. False hides the entire reference. */
 canRead(tx:TenantTransaction,pins:PinSet,options:TransactionOptions):Promise<boolean>;
}
/** Internal worker discovery under the current tenant, workspace and purpose.
 * A page is not a global deletion proof: other scopes, concurrent inserts and
 * references outside PinSet require their own Owner checks. Start a new sweep
 * after reaching the end; UUID ordering is pagination, not a time watermark. */
export async function queryCapabilityReferences(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:{capability:CapabilityRef;limit?:number;afterId?:string;beforeAt?:string},admission:CapabilityReferenceAdmission){
 requireVerifiedContext(context);
 const capability=contract('CapabilityRef',structuredClone(input.capability)),limit=input.limit??100,afterId=input.afterId,limits={...options};
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
 if(afterId!==undefined)contract('UUID',afterId);
 if(input.beforeAt!==undefined&&Number.isNaN(Date.parse(input.beforeAt)))throw new CoreError('INVALID_ARGUMENT');
 const fences=admission.fenceRefs.bind(admission),admit=admission.admit.bind(admission),canRead=admission.canRead.bind(admission);
 return database.transaction(context,limits,async tx=>{
  const c=tx.context.tenant,work=migrationWorkOptions(tx,limits),scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
  const extra=await boundedCallback(opts=>fences(tx,structuredClone(capability),opts),work);
  await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...structuredClone(extra)]);
  await boundedCallback(opts=>admit(tx,structuredClone(capability),opts),work);
  const pattern=JSON.stringify({pins:[{capabilityExactRefs:[capability]}]});
  const rows=await tx.owner('CapabilityRelease')`SELECT id,version,record,subject_type,subject_id,subject_input_digest,required_slots_digest FROM release.pin_sets
   WHERE resource_organization_id=${c.resourceOrganizationId} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
   AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) AND (${afterId??null}::uuid IS NULL OR id>${afterId??null}::uuid)
   AND (${input.beforeAt??null}::timestamptz IS NULL OR created_at<${input.beforeAt ?? null}::timestamptz)
    AND record @> ${pattern}::text::jsonb ORDER BY id LIMIT ${limit+1}`;
  const scanned=rows.slice(0,limit),references:{pinSetRef:EntityRef;subjectRef:PinSet['subjectRef'];pinSetDigest:string;behaviorSlots:string[]}[]=[];
  for(const row of scanned){
   const pins=contract('PinSet',row.record);
   if(pins.resourceOrganizationId!==c.resourceOrganizationId||pins.pinSetRef.id!==row.id||pins.pinSetRef.version!==Number(row.version)||pins.subjectRef.type!==row.subject_type||pins.subjectRef.id!==row.subject_id||pins.subjectInputDigest!==row.subject_input_digest||pins.requiredSlotsDigest!==row.required_slots_digest||await digestContract('PinSet',pins)!==pins.digest)throw new CoreError('INTERNAL_ERROR');
   const slots=pins.pins.filter(pin=>pin.capabilityExactRefs.some(ref=>canonicalJson(ref)===canonicalJson(capability))).map(pin=>pin.behaviorSlot);
   if(!slots.length)throw new CoreError('INTERNAL_ERROR');
   if(await boundedCallback(opts=>canRead(tx,structuredClone(pins),opts),work))references.push({pinSetRef:pins.pinSetRef,subjectRef:pins.subjectRef,pinSetDigest:pins.digest,behaviorSlots:slots});
  }
  await boundedCallback(opts=>admit(tx,structuredClone(capability),opts),work);
  return {references,complete:rows.length<=limit,...(rows.length>limit?{nextAfterId:String(scanned.at(-1)!.id)}:{})};
 });
}
