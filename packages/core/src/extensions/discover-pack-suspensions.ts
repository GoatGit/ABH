import type {EntityRef} from '@abh/contracts';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,inputDigest} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {lockFences} from '../control/fences.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {readPackSuspension,type PackSuspensionReadAdmission} from './read-pack-suspension.ts';

export interface PackSuspensionDiscoveryAdmission {
 fenceRefs(tx:TenantTransaction,options:TransactionOptions):Promise<readonly EntityRef[]>;
 /** Current deployment governance permission to enumerate suspension evidence. */
 discover(tx:TenantTransaction,options:TransactionOptions):Promise<void>;
 source:PackSuspensionReadAdmission;
}
export interface PackSuspensionDiscoveryCursor {bindingDigest:string;afterId:string}
/** Tenant management discovery from committed events, including already routed
 * events: publication is not proof that every business scope was notified.
 * Re-sweep from the start after the last page to cover concurrent UUID inserts.
 * Returned source evidence conveys no business notification permission. */
export async function discoverPackSuspensions(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:{limit?:number;cursor?:PackSuspensionDiscoveryCursor},grantRefs:readonly EntityRef[],admission:PackSuspensionDiscoveryAdmission){
 requireVerifiedContext(context);
 const value=structuredClone(input),grants=structuredClone(grantRefs),limits={...options},c=context.tenant,limit=value.limit??20;
 if(c.purposeOfUse!=='abh.pack.manage')throw new CoreError('PURPOSE_DENIED');
 if(c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new CoreError('INVALID_ARGUMENT');
 const bindingDigest=await inputDigest({organizationId:c.resourceOrganizationId,actingOrganizationId:c.actingOrganizationId,actor:c.actor,purpose:c.purposeOfUse});
 if(value.cursor){contract('UUID',value.cursor.afterId);if(value.cursor.bindingDigest!==bindingDigest)throw new CoreError('INVALID_ARGUMENT');}
 const fences=admission.fenceRefs.bind(admission),discover=admission.discover.bind(admission),s=admission.source;
 const source={fenceRefs:s.fenceRefs.bind(s),current:s.current.bind(s)},scope={type:'abh.organization',id:c.resourceOrganizationId,version:1};
 const authorize=async(tx:TenantTransaction)=>{
  const extra=await boundedCallback(opts=>fences(tx,opts),limits);
  await lockFences(tx,[scope,{type:'abh.principal',id:c.actor.id,version:1},...grants,...structuredClone(extra)]);
  await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.suspend'},grants);
  await boundedCallback(opts=>discover(tx,opts),limits);
 };
 const rows=await database.transaction(context,limits,async tx=>{
  await authorize(tx);
  return tx.owner('DurableExecution')`SELECT id FROM data.outbox WHERE resource_organization_id=${c.resourceOrganizationId}
   AND deleted_at IS NULL AND record->>'type'='abh.installed-pack.suspend'
   AND record->>'workspaceId' IS NULL AND (${value.cursor?.afterId??null}::uuid IS NULL OR id>${value.cursor?.afterId??null}::uuid)
   ORDER BY id LIMIT ${limit+1}`;
 });
 const selected=rows.slice(0,limit),suspensions:Awaited<ReturnType<typeof readPackSuspension>>[]=[];
 for(const row of selected)suspensions.push(await readPackSuspension(database,context,limits,{type:'abh.event',id:row.id,version:1},grants,source));
 await database.transaction(context,limits,authorize);
 return {suspensions,complete:rows.length<=limit,...(rows.length>limit?{cursor:{bindingDigest,afterId:String(selected.at(-1)!.id)}}:{})};
}
