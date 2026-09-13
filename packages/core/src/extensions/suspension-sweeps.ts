import {randomUUID} from 'node:crypto';
import type {CapabilityRef,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {inputDigest} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

export interface SuspensionSweepCursor {bindingDigest:string;afterId:string}
export interface SuspensionSweepState {
 sweepRef:EntityRef&{type:'abh.suspension-sweep'};resourceOrganizationId:string;generation:number;
 eventRef:EntityRef;capability:CapabilityRef;scopeId:string;highWaterAt:string;
 cursor?:SuspensionSweepCursor;complete:boolean;updatedAt:string;digest:string;
}
export interface SuspensionSweepKey {eventRef:EntityRef;capability:CapabilityRef;scopeId:string}

function unsigned(state:Omit<SuspensionSweepState,'digest'>){const {digest:_,...value}=state as SuspensionSweepState;return value;}
interface SuspensionSweepRow {record:unknown;generation:bigint|number;complete:boolean;cursor_id:string|null}
async function state(row:SuspensionSweepRow):Promise<SuspensionSweepState>{
 const value=row.record as SuspensionSweepState,digest=await inputDigest(unsigned(value));
 if(!value||typeof value==='object'&&Array.isArray(value)||value.sweepRef?.type!=='abh.suspension-sweep'||typeof value.resourceOrganizationId!=='string'
  ||!Number.isSafeInteger(value.generation)||value.generation<1||value.generation!==Number(row.generation)||typeof value.scopeId!=='string'
  ||Number.isNaN(Date.parse(value.highWaterAt))||Number.isNaN(Date.parse(value.updatedAt))||value.complete!==row.complete
  ||(value.cursor?.afterId??null)!==row.cursor_id||value.digest!==digest)throw new CoreError('INTERNAL_ERROR');
 return value;
}
function key(eventRef:EntityRef,capability:CapabilityRef,scopeId:string){
 if(eventRef.type!=='abh.event'||eventRef.version!==1||typeof scopeId!=='string'||scopeId.length<1||scopeId.length>200)throw new CoreError('INVALID_ARGUMENT');
 return JSON.stringify([eventRef.id,capability.kind,capability.id,capability.version,capability.digest,scopeId]);
}
/** Durable per-event/capability/scope backfill generations. `highWaterAt` is the
 * cycle snapshot: a page cursor is only progress inside that snapshot, never a
 * claim that concurrent later references have been discovered. */
export class SuspensionSweepOwner {
 async open(tx:TenantTransaction,input:SuspensionSweepKey):Promise<SuspensionSweepState>{
  const value=structuredClone(input),c=tx.context.tenant,sql=tx.owner('DurableExecution');
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const lock=key(value.eventRef,value.capability,value.scopeId);
  await tx.lock(0,lock,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`);
  const rows=await sql`SELECT id,generation,complete,cursor_id,record FROM runtime.suspension_sweeps
   WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${value.eventRef.id}
    AND capability_digest=${value.capability.digest} AND scope_id=${value.scopeId} AND deleted_at IS NULL
   ORDER BY generation DESC LIMIT 1 FOR UPDATE`;
  if(rows[0]){
   const current=await state(rows[0]! as SuspensionSweepRow);
   if(!current.complete)return current;
  }
  const generation=(rows[0]?Number(rows[0]!.generation):0)+1,[clock]=await sql`SELECT clock_timestamp() AS now`;
  if(!clock)throw new CoreError('INTERNAL_ERROR');
  const base:Omit<SuspensionSweepState,'digest'>={sweepRef:{type:'abh.suspension-sweep',id:randomUUID(),version:1},
   resourceOrganizationId:c.resourceOrganizationId,generation,eventRef:value.eventRef,capability:value.capability,
   scopeId:value.scopeId,highWaterAt:clock.now.toISOString(),complete:false,updatedAt:clock.now.toISOString()};
  const record:SuspensionSweepState={...base,digest:await inputDigest(base)};
  await sql`INSERT INTO runtime.suspension_sweeps(resource_organization_id,id,workspace_id,purpose_names,record,event_id,capability_digest,scope_id,generation,complete)
   VALUES (${c.resourceOrganizationId},${record.sweepRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],${JSON.stringify(record)}::text::jsonb,
    ${value.eventRef.id},${value.capability.digest},${value.scopeId},${generation},false)`;
  return record;
 }
 async advance(tx:TenantTransaction,input:SuspensionSweepKey,cursor:SuspensionSweepCursor|undefined,complete:boolean):Promise<SuspensionSweepState>{
  const value=structuredClone(input),c=tx.context.tenant,sql=tx.owner('DurableExecution');
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const lock=key(value.eventRef,value.capability,value.scopeId);
  await tx.lock(0,lock,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`);
  const [row]=await sql`SELECT id,generation,complete,cursor_id,record FROM runtime.suspension_sweeps
   WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${value.eventRef.id}
    AND capability_digest=${value.capability.digest} AND scope_id=${value.scopeId} AND deleted_at IS NULL
   ORDER BY generation DESC LIMIT 1 FOR UPDATE`;
  if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
  const current=await state(row as SuspensionSweepRow);
  if(current.complete)return current;
  if(cursor&&current.cursor&&cursor.afterId<=current.cursor.afterId)return current;
  const [clock]=await sql`SELECT clock_timestamp() AS now`;
  if(!clock)throw new CoreError('INTERNAL_ERROR');
  const base={...unsigned(current),...(cursor?{cursor:structuredClone(cursor)}:current.cursor?{cursor:current.cursor}:{}),complete,updatedAt:clock.now.toISOString()};
  const record:SuspensionSweepState={...base,digest:await inputDigest(base)};
  const changed=await sql`UPDATE runtime.suspension_sweeps SET record=${JSON.stringify(record)}::text::jsonb,complete=${complete},
   cursor_id=${record.cursor?.afterId??null},updated_at=clock_timestamp(),updated_by=${c.actor.id}
   WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${current.sweepRef.id} AND generation=${current.generation} AND complete=false
   RETURNING id`;
  if(changed.length!==1)throw new CoreError('VERSION_CONFLICT');
  return record;
 }
 async get(tx:TenantTransaction,input:SuspensionSweepKey):Promise<SuspensionSweepState|undefined>{
  const value=structuredClone(input),c=tx.context.tenant;
  if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
  const [row]=await tx.owner('DurableExecution')`SELECT generation,complete,cursor_id,record FROM runtime.suspension_sweeps
   WHERE resource_organization_id=${c.resourceOrganizationId} AND event_id=${value.eventRef.id}
    AND capability_digest=${value.capability.digest} AND scope_id=${value.scopeId} AND deleted_at IS NULL
   ORDER BY generation DESC LIMIT 1`;
  return row?await state(row as SuspensionSweepRow):undefined;
 }
}
