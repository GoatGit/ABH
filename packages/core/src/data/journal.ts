import { randomUUID } from 'node:crypto';
import type { AuditRecord, CommandReceipt, Digest, EntityRef, EventEnvelope } from '@abh/contracts';
import { protocolRegistry } from '@abh/contracts/http';
import { canonicalJson, digestBytes } from '@abh/contracts/digest';
import { validateContract, type SchemaName, type SchemaTypes } from '@abh/contracts/schema';
import type { TenantTransaction } from './uow.ts';
import { CoreError } from '../internal/errors.ts';

export function contract<N extends SchemaName>(name: N, value: unknown): SchemaTypes[N] {
  const checked = validateContract(name,value);
  if (!checked.success) {
    // Deployment-facing diagnosability: contract rejections carry no detail over HTTP,
    // so operators opt in here to see the failing name, issues and sanitized value.
    if (process.env.ABH_RUN_DEBUG === '1') {
      process.stderr.write(`abh: contract ${name} rejected: ${JSON.stringify(checked).slice(0, 400)} value=${JSON.stringify(value, (_k, v) => (typeof v === 'object' && v !== null ? v : typeof v === 'string' ? v : typeof v))}\n`);
    }
    throw new CoreError('INVALID_ARGUMENT');
  }
  return checked.data;
}
export async function inputDigest(value: unknown): Promise<Digest> {
  return digestBytes(new TextEncoder().encode(canonicalJson(value)));
}
export interface CommandIdentity {
  readonly commandId: string;
  readonly type: string;
  readonly idempotencyKey: string;
  readonly digest: Digest;
}

/** Caller performs current admission before entering this method, including replay reads. */
export async function executeCommand(tx: TenantTransaction, command: CommandIdentity,
  authorize: () => Promise<void>, execute: () => Promise<EntityRef>): Promise<{ receipt: CommandReceipt; replayed: boolean }> {
  if (!protocolRegistry.commands.some(entry=>entry.type===command.type)) throw new CoreError('SCHEMA_UNSUPPORTED');
  contract('UUID',command.commandId); contract('RegisteredName',command.type);
  contract('IdempotencyKey',command.idempotencyKey); contract('Digest',command.digest);
  const { tenant }=tx.context, sql=tx.owner('CommandIngress');
  const key=canonicalJson([tenant.resourceOrganizationId,tenant.actor.id,command.type,command.idempotencyKey]);
  await tx.lock(0,key,()=>sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  await authorize();
  const existing=await sql`SELECT input_digest,record,workspace_id FROM data.command_receipts
    WHERE resource_organization_id=${tenant.resourceOrganizationId} AND actor_principal_id=${tenant.actor.id}
      AND command_type=${command.type} AND idempotency_key=${command.idempotencyKey}`;
  if (existing[0]) {
    if(existing[0].workspace_id&&existing[0].workspace_id!==tenant.workspaceId)throw new CoreError('FORBIDDEN');
    if (existing[0].input_digest !== command.digest) throw new CoreError('IDEMPOTENCY_CONFLICT');
    return { receipt: contract('CommandReceipt',existing[0].record), replayed:true };
  }
  const resultRef=contract('EntityRef',await execute());
  const receipt=contract('CommandReceipt',{
    commandRef:{type:'abh.command',id:command.commandId,version:1},resourceOrganizationId:tenant.resourceOrganizationId,
    actorPrincipalId:tenant.actor.id,commandType:command.type,idempotencyKey:command.idempotencyKey,
    inputDigest:command.digest,resultRef,committedAt:new Date().toISOString(),
  });
  await sql`INSERT INTO data.command_receipts (resource_organization_id,id,workspace_id,actor_principal_id,command_type,idempotency_key,input_digest,record)
    VALUES (${tenant.resourceOrganizationId},${command.commandId},${tenant.workspaceId??null},${tenant.actor.id},${command.type},${command.idempotencyKey},${command.digest},${JSON.stringify(receipt)}::text::jsonb)`;
  return {receipt,replayed:false};
}

export async function appendChange(tx: TenantTransaction, change: {
  command: CommandIdentity; target: EntityRef; eventType: EventEnvelope['type']; changedFields: string[];
  relatedRefs?: EntityRef[]; eventOrdinal?: number;
}): Promise<void> {
  const {tenant,request}=tx.context, now=new Date().toISOString();
  // AuditRecord 契约要求 relatedRefs uniqueItems——去重防止调用方传入重复引用
  const rawRefs=change.relatedRefs??[];
  const seen=new Set<string>();
  const relatedRefs=rawRefs.filter(ref=>{
    const key=`${ref.type}/${ref.id}`;
    if(seen.has(key))return false; seen.add(key); return true;
  });
  const audit: AuditRecord=contract('AuditRecord',{
    auditRef:{type:'abh.audit',id:randomUUID(),version:1},resourceOrganizationId:tenant.resourceOrganizationId,
    actingOrganizationId:tenant.actingOrganizationId,actor:tenant.actor,action:change.command.type,
    targetRef:change.target,outcome:'abh.outcome.committed',relatedRefs,digest:change.command.digest,
    recordedAt:now,correlationId:request.correlationId,
  });
  const event=contract('EventEnvelope',{
    eventId:randomUUID(),type:change.eventType,schemaVersion:'0.1.0',aggregateRef:change.target,
    aggregateVersion:change.target.version,eventOrdinal:change.eventOrdinal??0,occurredAt:now,
    correlationId:request.correlationId,causationId:change.command.commandId,actorRef:tenant.actor,
    actingOrganizationId:tenant.actingOrganizationId,resourceOrganizationId:tenant.resourceOrganizationId,
    ...(tenant.workspaceId?{workspaceId:tenant.workspaceId}:{}),payload:{changedFields:change.changedFields,factRefs:change.relatedRefs??[]},
  });
  await tx.owner('ArtifactStore')`INSERT INTO data.audit_records (resource_organization_id,id,record)
    VALUES (${tenant.resourceOrganizationId},${audit.auditRef.id},${JSON.stringify(audit)}::text::jsonb)`;
  await tx.owner('DurableExecution')`INSERT INTO data.outbox (resource_organization_id,id,aggregate_type,aggregate_id,aggregate_version,event_ordinal,record)
    VALUES (${tenant.resourceOrganizationId},${event.eventId},${event.aggregateRef.type},${event.aggregateRef.id},${event.aggregateVersion},${event.eventOrdinal},${JSON.stringify(event)}::text::jsonb)`;
}
