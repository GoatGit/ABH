import { randomUUID } from 'node:crypto';
import type { EntityRef, LedgerRecord, ReservationRecord, LedgerEntryRecord, CommitmentRecord, SettlementRecord, OpenCommitmentPayload,
  LedgerUnitRecord, LedgerPeriodRecord, LedgerCorrectionRecord } from '@abh/contracts';
import type { TenantTransaction } from '../data/uow.ts';
import { appendChange, contract, inputDigest, type CommandIdentity } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';
import {lifecyclePurposes} from '../data/purposes.ts';

const ref = (type: string,id: string,version: number): EntityRef => ({type,id,version});
const negative = (amount: string): string => /^0(?:\.0+)?$/.test(amount)?'0':`-${amount}`;
function amount(value: string, positive=false): string {
  contract('NonnegativeDecimal',value);
  if (positive && /^0(?:\.0+)?$/.test(value)) throw new CoreError('INVALID_ARGUMENT');
  return value;
}
export function ledgerRecord(row: Record<string,unknown>): LedgerRecord {
  return contract('LedgerRecord',{
    ledgerRef:ref('abh.ledger',row.id as string,Number(row.version)),resourceOrganizationId:row.resource_organization_id,
    scopeRef:row.scope_ref,resourceType:row.resource_type,meteringMode:row.metering_mode,unit:row.unit,
    ...(row.currency?{currency:row.currency}:{}),periodRef:row.period_ref,limit:row.limit_amount,
    confirmedUsage:row.confirmed_usage,heldReservation:row.held_reservation,openCommitment:row.open_commitment,status:row.status,
  });
}
function reservationRecord(row: Record<string,unknown>): ReservationRecord {
  return contract('ReservationRecord',{
    reservationRef:ref('abh.reservation',row.id as string,Number(row.version)),resourceOrganizationId:row.resource_organization_id,
    requestRef:row.request_ref,ledgerRef:ref('abh.ledger',row.ledger_id as string,Number(row.ledger_version)),
    amount:row.amount,expiresAt:(row.expires_at as Date).toISOString(),bindingRef:row.binding_ref,status:row.status,
  });
}

function ledgerUnitRecord(row:Record<string,unknown>):LedgerUnitRecord{
  return contract('LedgerUnitRecord',{unitRef:ref('abh.unit',row.id as string,Number(row.version)),
    resourceOrganizationId:row.resource_organization_id,name:row.name,kind:row.kind,
    ...(row.currency?{currency:row.currency}:{}),precision:Number(row.precision),recordedAt:(row.created_at as Date).toISOString()});
}

function ledgerPeriodRecord(row:Record<string,unknown>):LedgerPeriodRecord{
  return contract('LedgerPeriodRecord',{periodRef:ref('abh.period',row.id as string,Number(row.version)),
    resourceOrganizationId:row.resource_organization_id,startsAt:(row.starts_at as Date).toISOString(),
    endsAt:(row.ends_at as Date).toISOString(),recordedAt:(row.created_at as Date).toISOString()});
}

function ledgerCorrectionRecord(row:Record<string,unknown>):LedgerCorrectionRecord{return contract('LedgerCorrectionRecord',row.record);}

function decimalScale(value:string):number{
  if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))contract('Decimal',value);
  return (value.split('.')[1]??'').length;
}

/** Immutable resource vocabulary. Configuration must resolve both entries before a Ledger can admit usage. */
export class LedgerCatalogOwner {
  async registerUnit(tx:TenantTransaction,command:CommandIdentity,input:{id:string;name:string;kind:'monetary'|'quantity';
    currency?:string;precision:number;purposeNames?:string[]}):Promise<LedgerUnitRecord>{
    contract('UUID',input.id);const {id:_id,...payload}=input;contract('RegisterLedgerUnitPayload',payload);
    if(input.kind==='monetary'&&!input.currency)throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,purposeNames=lifecyclePurposes(input.purposeNames??[c.purposeOfUse],c.purposeOfUse);
    const record=contract('LedgerUnitRecord',{unitRef:ref('abh.unit',input.id,1),resourceOrganizationId:c.resourceOrganizationId,
      name:input.name,kind:input.kind,...(input.currency?{currency:input.currency}:{}),precision:input.precision,
      recordedAt:new Date().toISOString()});
    await tx.owner('ResourceLedger')`INSERT INTO resource.units
      (resource_organization_id,id,workspace_id,purpose_names,record,name,kind,precision)
      VALUES (${c.resourceOrganizationId},${input.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(record)}::text::jsonb,
        ${input.name},${input.kind},${input.precision})`;
    await appendChange(tx,{command,target:record.unitRef,eventType:'abh.ledger-unit.registered',changedFields:['name','kind']});
    return record;
  }

  async registerPeriod(tx:TenantTransaction,command:CommandIdentity,input:{id:string;startsAt:string;endsAt:string;
    purposeNames?:string[]}):Promise<LedgerPeriodRecord>{
    contract('UUID',input.id);const {id:_id,...payload}=input;contract('RegisterLedgerPeriodPayload',payload);
    if(Date.parse(input.endsAt)<=Date.parse(input.startsAt))throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,purposeNames=lifecyclePurposes(input.purposeNames??[c.purposeOfUse],c.purposeOfUse);
    const record=contract('LedgerPeriodRecord',{periodRef:ref('abh.period',input.id,1),resourceOrganizationId:c.resourceOrganizationId,
      startsAt:input.startsAt,endsAt:input.endsAt,recordedAt:new Date().toISOString()});
    await tx.owner('ResourceLedger')`INSERT INTO resource.periods
      (resource_organization_id,id,workspace_id,purpose_names,record,starts_at,ends_at)
      VALUES (${c.resourceOrganizationId},${input.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(record)}::text::jsonb,
        ${input.startsAt},${input.endsAt})`;
    await appendChange(tx,{command,target:record.periodRef,eventType:'abh.ledger-period.registered',changedFields:['startsAt','endsAt']});
    return record;
  }

  async getUnitByName(tx:TenantTransaction,name:string):Promise<LedgerUnitRecord>{
    contract('RegisteredName',name);const c=tx.context.tenant;
    const rows=await tx.owner('ResourceLedger')`SELECT * FROM resource.units WHERE resource_organization_id=${c.resourceOrganizationId}
      AND name=${name} AND deleted_at IS NULL`;
    if(!rows[0])throw new CoreError('RESOURCE_NOT_FOUND');
    return ledgerUnitRecord(rows[0]);
  }

  async getPeriod(tx:TenantTransaction,periodRef:EntityRef):Promise<LedgerPeriodRecord>{
    contract('EntityRef',periodRef);if(periodRef.type!=='abh.period')throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant;
    const rows=await tx.owner('ResourceLedger')`SELECT * FROM resource.periods WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${periodRef.id} AND deleted_at IS NULL`;
    const row=rows[0];if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=ledgerPeriodRecord(row);
    if(record.periodRef.version!==periodRef.version)throw new CoreError('VERSION_CONFLICT');
    return record;
  }
}

/** Internal Owner; Control admission and command dedupe run first in the same UoW. */
export class LedgerOwner {
  #maxLedgers: number;
  constructor(options: {maxLedgersPerReservation?: number} = {}) {
    this.#maxLedgers=options.maxLedgersPerReservation??16;
    if (!Number.isInteger(this.#maxLedgers) || this.#maxLedgers<1 || this.#maxLedgers>64) throw new CoreError('INVALID_ARGUMENT');
  }
  async get(tx: TenantTransaction, id: string): Promise<LedgerRecord> {
    contract('UUID',id);
    const c=tx.context.tenant;
    const rows=await tx.owner('ResourceLedger')`SELECT * FROM resource.ledgers WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
      AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if (!rows[0]) throw new CoreError('RESOURCE_NOT_FOUND');
    return ledgerRecord(rows[0]);
  }
  async #lock(tx: TenantTransaction, ids: string[]): Promise<void> {
    const c=tx.context.tenant,sql=tx.owner('ResourceLedger');
    for (const id of [...new Set(ids)].sort()) {
      contract('UUID',id);
      await tx.lock(3,`ResourceLedger/abh.ledger/${id}`,async()=> {
        const rows=await sql`SELECT id FROM resource.ledgers WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id}
          AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names)
          AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid) FOR UPDATE`;
        if (!rows[0]) throw new CoreError('RESOURCE_NOT_FOUND');
      });
    }
  }
  /** Composite T1 acquires all ledger locks before any Action aggregate lock and reuses them in ReserveAll. */
  async lockCurrent(tx:TenantTransaction,ids:string[]):Promise<LedgerRecord[]>{
    if(ids.length>this.#maxLedgers)throw new CoreError('LIMIT_EXCEEDED');
    await this.#lock(tx,ids);const result:LedgerRecord[]=[];
    for(const id of [...new Set(ids)].sort())result.push(await this.get(tx,id));return result;
  }
  async #entry(tx: TenantTransaction, command: CommandIdentity, ledger: EntityRef, kind: LedgerEntryRecord['kind'], sourceRef: EntityRef,
    deltas: Partial<Pick<LedgerEntryRecord,'limitDelta'|'usageDelta'|'heldDelta'|'commitmentDelta'>>, evidenceRefs: EntityRef[]=[]): Promise<void> {
    const record=contract('LedgerEntryRecord',{
      entryRef:ref('abh.ledger-entry',randomUUID(),1),resourceOrganizationId:tx.context.tenant.resourceOrganizationId,
      ledgerRef:ledger,entryKey:`${command.commandId}:${kind}:${sourceRef.id}`,kind,
      limitDelta:'0',usageDelta:'0',heldDelta:'0',commitmentDelta:'0',...deltas,sourceRef,evidenceRefs,
      effectiveAt:new Date().toISOString(),recordedAt:new Date().toISOString(),
    });
    await tx.owner('ResourceLedger')`INSERT INTO resource.entries (resource_organization_id,id,ledger_id,entry_key,record)
      VALUES (${record.resourceOrganizationId},${record.entryRef.id},${ledger.id},${record.entryKey},${JSON.stringify(record)}::text::jsonb)`;
  }
  async configure(tx: TenantTransaction, command: CommandIdentity, input: Pick<LedgerRecord,'scopeRef'|'resourceType'|'meteringMode'|'unit'|'currency'|'periodRef'|'limit'> & {id: string;purposeNames?:string[]}): Promise<LedgerRecord> {
    const c=tx.context.tenant;
    const unit=await new LedgerCatalogOwner().getUnitByName(tx,input.unit);
    const period=await new LedgerCatalogOwner().getPeriod(tx,input.periodRef);
    if(unit.kind==='monetary'?input.currency!==unit.currency:Boolean(input.currency))throw new CoreError('INVALID_ARGUMENT');
    if(decimalScale(input.limit)>unit.precision)throw new CoreError('INVALID_ARGUMENT');
    const purposeNames=lifecyclePurposes(input.purposeNames??[c.purposeOfUse],c.purposeOfUse);
    const record=contract('LedgerRecord',{
      ledgerRef:ref('abh.ledger',input.id,1),resourceOrganizationId:c.resourceOrganizationId,
      scopeRef:input.scopeRef,resourceType:input.resourceType,meteringMode:input.meteringMode,unit:input.unit,
      ...(input.currency?{currency:input.currency}:{}),periodRef:input.periodRef,limit:input.limit,
      confirmedUsage:'0',heldReservation:'0',openCommitment:'0',status:'Open',
    });
    await tx.owner('ResourceLedger')`INSERT INTO resource.ledgers (resource_organization_id,id,workspace_id,purpose_names,scope_ref,resource_type,metering_mode,unit,currency,period_ref,limit_amount,confirmed_usage,held_reservation,open_commitment,status)
      VALUES (${c.resourceOrganizationId},${input.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(input.scopeRef)}::text::jsonb,${input.resourceType},${input.meteringMode},${input.unit},${input.currency??null},${JSON.stringify(input.periodRef)}::text::jsonb,${input.limit},0,0,0,'Open')`;
    await this.#entry(tx,command,record.ledgerRef,'Configure',input.scopeRef,{limitDelta:input.limit});
    await appendChange(tx,{command,target:record.ledgerRef,eventType:'abh.ledger.created',changedFields:['limit','status']});
    return record;
  }
  async reserveAll(tx: TenantTransaction, command: CommandIdentity, input: {
    requestRef: EntityRef; bindingRef: EntityRef; expiresAt: string; purposeNames?:string[];
    requirements: {ledgerRef: EntityRef; amount: string}[];
  }): Promise<ReservationRecord[]> {
    contract('EntityRef',input.requestRef); contract('EntityRef',input.bindingRef); contract('Time',input.expiresAt);
    if (Date.parse(input.expiresAt)<=Date.now() || Date.parse(input.expiresAt)>Date.now()+3_600_000 || input.requirements.length<1 || input.requirements.length>this.#maxLedgers || new Set(input.requirements.map(r=>r.ledgerRef.id)).size!==input.requirements.length) throw new CoreError('INVALID_ARGUMENT');
    for (const requirement of input.requirements) {
      contract('EntityRef',requirement.ledgerRef); amount(requirement.amount,true);
      if (requirement.ledgerRef.type!=='abh.ledger') throw new CoreError('INVALID_ARGUMENT');
    }
    const purposeNames=lifecyclePurposes(input.purposeNames??[tx.context.tenant.purposeOfUse],tx.context.tenant.purposeOfUse);
    const sorted=[...input.requirements].sort((a,b)=>a.ledgerRef.id<b.ledgerRef.id?-1:1);
    await this.#lock(tx,sorted.map(r=>r.ledgerRef.id));
    const c=tx.context.tenant,sql=tx.owner('ResourceLedger'),result: ReservationRecord[]=[];
    for (const requirement of sorted) {
      const ledger=await this.get(tx,requirement.ledgerRef.id);
      const duplicates=await sql`SELECT * FROM resource.reservations WHERE resource_organization_id=${c.resourceOrganizationId}
        AND ledger_id=${requirement.ledgerRef.id} AND request_ref->>'type'=${input.requestRef.type} AND request_ref->>'id'=${input.requestRef.id}`;
      if (duplicates[0]) throw new CoreError('IDEMPOTENCY_CONFLICT');
      if (ledger.ledgerRef.version!==requirement.ledgerRef.version) throw new CoreError('VERSION_CONFLICT');
      if (ledger.status!=='Open') throw new CoreError('RESOURCE_EXHAUSTED');
      const balances=await sql`UPDATE resource.ledgers SET held_reservation=held_reservation+${requirement.amount}::numeric,
        version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
        WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ledger.ledgerRef.id} AND version=${ledger.ledgerRef.version}
        AND limit_amount-held_reservation-confirmed_usage-open_commitment>=${requirement.amount}::numeric RETURNING version`;
      if (!balances[0]) throw new CoreError('RESOURCE_EXHAUSTED');
      const id=randomUUID(),ledgerRef=ref('abh.ledger',ledger.ledgerRef.id,Number(balances[0].version));
      const rows=await sql`INSERT INTO resource.reservations (resource_organization_id,id,workspace_id,purpose_names,request_ref,ledger_id,ledger_version,amount,expires_at,binding_ref,status)
        VALUES (${c.resourceOrganizationId},${id},${c.workspaceId??null},${purposeNames},${JSON.stringify(input.requestRef)}::text::jsonb,${ledgerRef.id},${ledgerRef.version},${requirement.amount},${input.expiresAt},${JSON.stringify(input.bindingRef)}::text::jsonb,'Held') RETURNING *`;
      const reservation=reservationRecord(rows[0]!);
      await this.#entry(tx,command,ledgerRef,'Reserve',reservation.reservationRef,{heldDelta:requirement.amount});
      await appendChange(tx,{command,target:reservation.reservationRef,eventType:'abh.reservation.created',changedFields:['status','amount'],relatedRefs:[ledgerRef]});
      await appendChange(tx,{command,target:ledgerRef,eventType:'abh.ledger.balance-changed',changedFields:['heldReservation'],relatedRefs:[reservation.reservationRef]});
      result.push(reservation);
    }
    return result;
  }
  async getReservation(tx: TenantTransaction,id: string): Promise<ReservationRecord> {
    contract('UUID',id); const c=tx.context.tenant;
    const rows=await tx.owner('ResourceLedger')`SELECT * FROM resource.reservations WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if (!rows[0]) throw new CoreError('RESOURCE_NOT_FOUND');
    return reservationRecord(rows[0]);
  }
  /** Control refresh already proves current Authority/Plan and reuses the same resource responsibility. No balance changes. */
  async extendHeld(tx:TenantTransaction,command:CommandIdentity,reservationRef:EntityRef,expiresAt:string,snapshotRef:EntityRef):Promise<ReservationRecord>{
    contract('EntityRef',reservationRef);contract('EntityRef',snapshotRef);contract('Time',expiresAt);
    if(reservationRef.type!=='abh.reservation'||snapshotRef.type!=='abh.authorization-snapshot')throw new CoreError('INVALID_ARGUMENT');
    const first=await this.getReservation(tx,reservationRef.id);await this.#lock(tx,[first.ledgerRef.id]);const current=await this.getReservation(tx,reservationRef.id);
    if(current.reservationRef.version!==reservationRef.version)throw new CoreError('VERSION_CONFLICT');if(current.status!=='Held')throw new CoreError('OBLIGATION_CONFLICT');
    const [clock]=await tx.owner('ResourceLedger')`SELECT clock_timestamp() AS now`;
    if(Date.parse(expiresAt)<=clock!.now.getTime()||Date.parse(expiresAt)>clock!.now.getTime()+3_600_000)throw new CoreError('INVALID_ARGUMENT');
    if(Date.parse(expiresAt)<=Date.parse(current.expiresAt))return current;
    const c=tx.context.tenant,rows=await tx.owner('ResourceLedger')`UPDATE resource.reservations SET expires_at=${expiresAt},version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${reservationRef.id} AND version=${reservationRef.version} AND status='Held' RETURNING *`;
    if(!rows[0])throw new CoreError('VERSION_CONFLICT');const next=reservationRecord(rows[0]);
    await appendChange(tx,{command,target:next.reservationRef,eventType:'abh.reservation.extended',changedFields:['expiresAt'],relatedRefs:[snapshotRef]});return next;
  }
  async consume(tx: TenantTransaction, command: CommandIdentity, input: {reservationRef: EntityRef; actualUsage: string; receiptRef: EntityRef}): Promise<ReservationRecord> {
    amount(input.actualUsage); contract('EntityRef',input.receiptRef);
    return this.#finish(tx,command,input.reservationRef,'Consumed',input.receiptRef,input.actualUsage);
  }
  /** Evidence must already be verified by Operation/Control; TTL alone is never evidence. */
  async release(tx: TenantTransaction, command: CommandIdentity, input: {reservationRef: EntityRef; evidence: {verdict:'ConfirmedNoEffect'|'Completed'; evidenceRef:EntityRef}}): Promise<ReservationRecord> {
    if (!input.evidence || !['ConfirmedNoEffect','Completed'].includes(input.evidence.verdict)) throw new CoreError('INVALID_ARGUMENT');
    contract('EntityRef',input.evidence.evidenceRef);
    return this.#finish(tx,command,input.reservationRef,'Released',input.evidence.evidenceRef,'0');
  }
  async #finish(tx: TenantTransaction, command: CommandIdentity, reservationRef: EntityRef, status: 'Consumed'|'Released', evidenceRef: EntityRef, actual: string): Promise<ReservationRecord> {
    contract('EntityRef',reservationRef);
    if (reservationRef.type!=='abh.reservation') throw new CoreError('INVALID_ARGUMENT');
    const initial=await this.getReservation(tx,reservationRef.id);
    await this.#lock(tx,[initial.ledgerRef.id]);
    const reservation=await this.getReservation(tx,reservationRef.id);
    if (reservation.reservationRef.version!==reservationRef.version) throw new CoreError('VERSION_CONFLICT');
    if (reservation.status!=='Held') throw new CoreError('OBLIGATION_CONFLICT');
    const ledger=await this.get(tx,reservation.ledgerRef.id);
    if (ledger.meteringMode==='capacity' && status==='Consumed') throw new CoreError('INVALID_ARGUMENT');
    const c=tx.context.tenant,sql=tx.owner('ResourceLedger');
    const balances=await sql`UPDATE resource.ledgers SET held_reservation=held_reservation-${reservation.amount}::numeric,
      confirmed_usage=confirmed_usage+${actual}::numeric,version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id},
      status=CASE WHEN confirmed_usage+${actual}::numeric+open_commitment+held_reservation-${reservation.amount}::numeric>limit_amount THEN 'Frozen' ELSE status END
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ledger.ledgerRef.id} AND version=${ledger.ledgerRef.version} RETURNING *`;
    if (!balances[0]) throw new CoreError('VERSION_CONFLICT');
    const updated=ledgerRecord(balances[0]);
    const rows=await sql`UPDATE resource.reservations SET status=${status},version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${reservationRef.id} AND version=${reservationRef.version} RETURNING *`;
    if (!rows[0]) throw new CoreError('VERSION_CONFLICT');
    const result=reservationRecord(rows[0]);
    await this.#entry(tx,command,updated.ledgerRef,status==='Consumed'?'Consume':'Release',result.reservationRef,{heldDelta:negative(reservation.amount),usageDelta:actual},[evidenceRef]);
    await appendChange(tx,{command,target:result.reservationRef,eventType:status==='Consumed'?'abh.reservation.consume':'abh.reservation.release',changedFields:['status'],relatedRefs:[updated.ledgerRef,evidenceRef]});
    await appendChange(tx,{command,target:updated.ledgerRef,eventType:ledger.status!=='Frozen' && updated.status==='Frozen'?'abh.ledger.freeze':'abh.ledger.balance-changed',changedFields:['heldReservation','confirmedUsage','status'],relatedRefs:[result.reservationRef]});
    return result;
  }

  async getCommitment(tx:TenantTransaction,id:string):Promise<CommitmentRecord>{
    contract('UUID',id);const c=tx.context.tenant;
    const rows=await tx.owner('ResourceLedger')`SELECT record,version,status,remaining,upper_bound FROM resource.commitments WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${id}
      AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    const row=rows[0];if(!row)throw new CoreError('RESOURCE_NOT_FOUND');
    const record=contract('CommitmentRecord',row.record);
    if(record.commitmentRef.id!==id || record.commitmentRef.version!==Number(row.version) || record.status!==row.status || record.remaining!==row.remaining || record.upperBound!==row.upper_bound)throw new CoreError('INTERNAL_ERROR');
    return record;
  }
  async openCommitment(tx:TenantTransaction,command:CommandIdentity,input:OpenCommitmentPayload):Promise<CommitmentRecord>{
    contract('OpenCommitmentPayload',input);amount(input.upperBound,true);
    if(new Set(input.reservationRefs.map(ref=>ref.id)).size!==input.reservationRefs.length)throw new CoreError('INVALID_ARGUMENT');
    await this.#lock(tx,[input.ledgerRef.id]);const ledger=await this.get(tx,input.ledgerRef.id);
    if(ledger.ledgerRef.version!==input.ledgerRef.version)throw new CoreError('VERSION_CONFLICT');
    if(ledger.meteringMode!=='cumulative'||ledger.status!=='Open')throw new CoreError('OBLIGATION_CONFLICT');
    const reservations:ReservationRecord[]=[];
    for(const reservationRef of input.reservationRefs){
      const r=await this.getReservation(tx,reservationRef.id);
      if(r.reservationRef.version!==reservationRef.version)throw new CoreError('VERSION_CONFLICT');
      if(r.status!=='Held'||r.ledgerRef.id!==input.ledgerRef.id||r.bindingRef.type!==input.subjectRef.type||r.bindingRef.id!==input.subjectRef.id)throw new CoreError('OBLIGATION_CONFLICT');
      reservations.push(r);
    }
    const c=tx.context.tenant,sql=tx.owner('ResourceLedger'),ids=input.reservationRefs.map(ref=>ref.id);
    const [sum]=await sql`SELECT sum(amount)::text AS held FROM resource.reservations WHERE resource_organization_id=${c.resourceOrganizationId} AND id=ANY(${ids}::uuid[])`;
    const held=sum!.held as string;
    const balances=await sql`UPDATE resource.ledgers SET held_reservation=held_reservation-${held}::numeric,open_commitment=open_commitment+${input.upperBound}::numeric,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ledger.ledgerRef.id} AND version=${ledger.ledgerRef.version}
        AND limit_amount-confirmed_usage-open_commitment-held_reservation+${held}::numeric>=${input.upperBound}::numeric RETURNING *`;
    if(!balances[0])throw new CoreError('RESOURCE_EXHAUSTED');
    const updated=ledgerRecord(balances[0]);
    const record=contract('CommitmentRecord',{commitmentRef:ref('abh.commitment',randomUUID(),1),resourceOrganizationId:c.resourceOrganizationId,
      ledgerRef:updated.ledgerRef,subjectRef:input.subjectRef,policyRef:input.policyRef,upperBound:input.upperBound,remaining:input.upperBound,evidenceRefs:input.evidenceRefs,status:'Open'});
    await sql`INSERT INTO resource.commitments(resource_organization_id,id,workspace_id,ledger_id,remaining,upper_bound,status,record)
      VALUES (${c.resourceOrganizationId},${record.commitmentRef.id},${c.workspaceId??null},${record.ledgerRef.id},${record.remaining},${record.upperBound},'Open',${JSON.stringify(record)}::text::jsonb)`;
    for(const reservation of reservations){
      const changed=await sql`UPDATE resource.reservations SET status='Committed',version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
        WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${reservation.reservationRef.id} AND version=${reservation.reservationRef.version} RETURNING version`;
      if(!changed[0])throw new CoreError('VERSION_CONFLICT');
      await appendChange(tx,{command,target:{...reservation.reservationRef,version:Number(changed[0].version)},eventType:'abh.reservation.commit',changedFields:['status'],relatedRefs:[record.commitmentRef]});
    }
    await this.#entry(tx,command,updated.ledgerRef,'OpenCommitment',record.commitmentRef,{heldDelta:negative(held),commitmentDelta:record.remaining},input.evidenceRefs);
    await appendChange(tx,{command,target:record.commitmentRef,eventType:'abh.commitment.created',changedFields:['remaining','status'],relatedRefs:[updated.ledgerRef,...input.reservationRefs]});
    await appendChange(tx,{command,target:updated.ledgerRef,eventType:'abh.ledger.balance-changed',changedFields:['heldReservation','openCommitment'],relatedRefs:[record.commitmentRef]});
    return record;
  }
  async settleCommitment(tx:TenantTransaction,command:CommandIdentity,input:{commitmentRef:EntityRef;sourceRef:EntityRef;actualUsage:string}):Promise<SettlementRecord>{
    contract('EntityRef',input.commitmentRef);contract('EntityRef',input.sourceRef);amount(input.actualUsage);
    if(input.commitmentRef.type!=='abh.commitment')throw new CoreError('INVALID_ARGUMENT');
    const initial=await this.getCommitment(tx,input.commitmentRef.id);await this.#lock(tx,[initial.ledgerRef.id]);
    const commitment=await this.getCommitment(tx,input.commitmentRef.id),ledger=await this.get(tx,commitment.ledgerRef.id),c=tx.context.tenant,sql=tx.owner('ResourceLedger');
    // Source-level dedupe survives different caller command IDs and later aggregate versions.
    const digest=await inputDigest({commitmentId:commitment.commitmentRef.id,sourceRef:input.sourceRef,actualUsage:input.actualUsage});
    const existing=await sql`SELECT record FROM resource.settlements WHERE resource_organization_id=${c.resourceOrganizationId} AND ledger_id=${ledger.ledgerRef.id}
      AND source_type=${input.sourceRef.type} AND source_id=${input.sourceRef.id} AND source_version=${input.sourceRef.version}`;
    if(existing[0]){const record=contract('SettlementRecord',existing[0].record);if(record.inputDigest!==digest)throw new CoreError('IDEMPOTENCY_CONFLICT');return record;}
    if(commitment.commitmentRef.version!==input.commitmentRef.version)throw new CoreError('VERSION_CONFLICT');
    if(commitment.status==='Closed'||ledger.status==='Closed')throw new CoreError('OBLIGATION_CONFLICT');
    const [delta]=await sql`SELECT least(${input.actualUsage}::numeric,${commitment.remaining}::numeric)::text AS reduction,
      greatest(0,${commitment.remaining}::numeric-${input.actualUsage}::numeric)::text AS remaining,
      greatest(0,${input.actualUsage}::numeric-${commitment.remaining}::numeric)::text AS overrun`;
    const reduction=delta!.reduction as string,remaining=delta!.remaining as string;
    const balances=await sql`UPDATE resource.ledgers SET confirmed_usage=confirmed_usage+${input.actualUsage}::numeric,open_commitment=open_commitment-${reduction}::numeric,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id},status=CASE
        WHEN ${input.actualUsage}::numeric>${commitment.remaining}::numeric OR confirmed_usage+${input.actualUsage}::numeric+open_commitment-${reduction}::numeric+held_reservation>limit_amount THEN 'Frozen' ELSE status END
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ledger.ledgerRef.id} AND version=${ledger.ledgerRef.version} RETURNING *`;
    if(!balances[0])throw new CoreError('VERSION_CONFLICT');const updated=ledgerRecord(balances[0]);
    const next=contract('CommitmentRecord',{...commitment,commitmentRef:{...commitment.commitmentRef,version:commitment.commitmentRef.version+1},ledgerRef:updated.ledgerRef,remaining});
    const changed=await sql`UPDATE resource.commitments SET remaining=${remaining},version=version+1,record=${JSON.stringify(next)}::text::jsonb,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${commitment.commitmentRef.id} AND version=${commitment.commitmentRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    const record=contract('SettlementRecord',{settlementRef:ref('abh.settlement',randomUUID(),1),resourceOrganizationId:c.resourceOrganizationId,ledgerRef:updated.ledgerRef,
      commitmentRef:next.commitmentRef,sourceRef:input.sourceRef,usageAmount:input.actualUsage,commitmentDelta:negative(reduction),overrunAmount:delta!.overrun,inputDigest:digest,recordedAt:new Date().toISOString()});
    await sql`INSERT INTO resource.settlements(resource_organization_id,id,ledger_id,source_type,source_id,source_version,record)
      VALUES (${c.resourceOrganizationId},${record.settlementRef.id},${updated.ledgerRef.id},${input.sourceRef.type},${input.sourceRef.id},${input.sourceRef.version},${JSON.stringify(record)}::text::jsonb)`;
    await this.#entry(tx,command,updated.ledgerRef,'Settle',record.settlementRef,{usageDelta:input.actualUsage,commitmentDelta:negative(reduction)},[input.sourceRef]);
    await appendChange(tx,{command,target:next.commitmentRef,eventType:'abh.commitment.balance-changed',changedFields:['remaining'],relatedRefs:[record.settlementRef]});
    await appendChange(tx,{command,target:record.settlementRef,eventType:'abh.settlement.created',changedFields:['usageAmount','commitmentDelta'],relatedRefs:[next.commitmentRef]});
    await appendChange(tx,{command,target:updated.ledgerRef,eventType:ledger.status!=='Frozen'&&updated.status==='Frozen'?'abh.ledger.freeze':'abh.ledger.balance-changed',changedFields:['confirmedUsage','openCommitment','status'],relatedRefs:[record.settlementRef]});
    return record;
  }

  /** Signed usage corrections append history; the frozen Domain callback owns refund recovery and FX direction. */
  async applyCorrection(tx:TenantTransaction,command:CommandIdentity,
    input:{ledgerRef:EntityRef;sourceRef:EntityRef;kind:'Refund'|'FxRevaluation';usageDelta:string;
      conversionRef?:EntityRef;evidenceRefs:EntityRef[]},
    verifyDomainRule:(ledger:LedgerRecord,input:{kind:'Refund'|'FxRevaluation';usageDelta:string;conversionRef?:EntityRef;
      evidenceRefs:EntityRef[]})=>Promise<void>):Promise<LedgerCorrectionRecord>{
    contract('ApplyLedgerCorrectionPayload',input);contract('UUID',input.ledgerRef.id);
    contract('Decimal',input.usageDelta);contract('EntityRef',input.sourceRef);
    if(input.usageDelta==='0'||/^-(?:0(?:\.0+)?)$/.test(input.usageDelta))throw new CoreError('INVALID_ARGUMENT');
    if(input.kind==='FxRevaluation'?!input.conversionRef:Boolean(input.conversionRef))throw new CoreError('INVALID_ARGUMENT');
    for(const evidenceRef of input.evidenceRefs)contract('EntityRef',evidenceRef);
    const initial=await this.get(tx,input.ledgerRef.id);
    await this.#lock(tx,[initial.ledgerRef.id]);
    const ledger=await this.get(tx,input.ledgerRef.id),c=tx.context.tenant,sql=tx.owner('ResourceLedger');
    if(ledger.meteringMode!=='cumulative'||ledger.status==='Closed')throw new CoreError('OBLIGATION_CONFLICT');
    await verifyDomainRule(ledger,input);
    const digest=await inputDigest({ledgerId:ledger.ledgerRef.id,sourceRef:input.sourceRef,kind:input.kind,
      usageDelta:input.usageDelta,...(input.conversionRef?{conversionRef:input.conversionRef}:{}),
      evidenceRefs:input.evidenceRefs});
    const existing=await sql`SELECT record FROM resource.corrections WHERE resource_organization_id=${c.resourceOrganizationId}
      AND ledger_id=${ledger.ledgerRef.id} AND source_type=${input.sourceRef.type} AND source_id=${input.sourceRef.id}
      AND source_version=${input.sourceRef.version}`;
    if(existing[0]){
      const replay=ledgerCorrectionRecord(existing[0]);
      if(replay.inputDigest!==digest)throw new CoreError('IDEMPOTENCY_CONFLICT');
      return replay;
    }
    if(initial.ledgerRef.version!==input.ledgerRef.version)throw new CoreError('VERSION_CONFLICT');
    const balances=await sql`UPDATE resource.ledgers SET confirmed_usage=confirmed_usage+${input.usageDelta}::numeric,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id},status=CASE
        WHEN confirmed_usage+${input.usageDelta}::numeric+held_reservation+open_commitment>limit_amount THEN 'Frozen' ELSE status END
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ledger.ledgerRef.id} AND version=${ledger.ledgerRef.version}
        AND confirmed_usage+${input.usageDelta}::numeric>=0 RETURNING *`;
    if(!balances[0])throw new CoreError('RESOURCE_EXHAUSTED');
    const updated=ledgerRecord(balances[0]);
    const unsigned={correctionRef:ref('abh.ledger-correction',randomUUID(),1),resourceOrganizationId:c.resourceOrganizationId,
      ledgerRef:updated.ledgerRef,sourceRef:input.sourceRef,kind:input.kind,usageDelta:input.usageDelta,
      ...(input.conversionRef?{conversionRef:input.conversionRef}:{}),inputDigest:digest,recordedAt:new Date().toISOString()};
    const record=contract('LedgerCorrectionRecord',unsigned);
    await sql`INSERT INTO resource.corrections
      (resource_organization_id,id,workspace_id,purpose_names,record,ledger_id,source_type,source_id,source_version)
      VALUES (${c.resourceOrganizationId},${record.correctionRef.id},${c.workspaceId??null},ARRAY[${c.purposeOfUse}],
        ${JSON.stringify(record)}::text::jsonb,${updated.ledgerRef.id},${input.sourceRef.type},${input.sourceRef.id},${input.sourceRef.version})`;
    await this.#entry(tx,command,updated.ledgerRef,'Correct',record.correctionRef,{usageDelta:input.usageDelta},input.evidenceRefs);
    await appendChange(tx,{command,target:record.correctionRef,eventType:'abh.ledger-correction.applied',
      changedFields:['usageDelta'],relatedRefs:[input.sourceRef,...input.evidenceRefs]});
    await appendChange(tx,{command,target:updated.ledgerRef,eventType:'abh.ledger.balance-changed',
      changedFields:['confirmedUsage','status'],relatedRefs:[record.correctionRef]});
    return record;
  }

  async adjustCommitment(tx:TenantTransaction,command:CommandIdentity,input:{commitmentRef:EntityRef;newUpperBound:string;evidenceRef:EntityRef},
    verifyEvidence:(commitment:CommitmentRecord,evidence:EntityRef)=>Promise<void>):Promise<CommitmentRecord>{
    return this.#changeCommitment(tx,command,input.commitmentRef,input.newUpperBound,input.evidenceRef,'Adjust',verifyEvidence);
  }
  async beginCloseCommitment(tx:TenantTransaction,command:CommandIdentity,input:{commitmentRef:EntityRef;tailBound:string;evidenceRef:EntityRef},
    verifyStop:(commitment:CommitmentRecord,evidence:EntityRef)=>Promise<void>):Promise<CommitmentRecord>{
    return this.#changeCommitment(tx,command,input.commitmentRef,input.tailBound,input.evidenceRef,'BeginClose',verifyStop);
  }
  async closeCommitment(tx:TenantTransaction,command:CommandIdentity,input:{commitmentRef:EntityRef;evidenceRef:EntityRef},
    verifyStableWatermark:(commitment:CommitmentRecord,evidence:EntityRef)=>Promise<void>):Promise<CommitmentRecord>{
    return this.#changeCommitment(tx,command,input.commitmentRef,'0',input.evidenceRef,'Close',verifyStableWatermark);
  }
  async #changeCommitment(tx:TenantTransaction,command:CommandIdentity,commitmentRef:EntityRef,bound:string,evidenceRef:EntityRef,mode:'Adjust'|'BeginClose'|'Close',
    verifyEvidence:(commitment:CommitmentRecord,evidence:EntityRef)=>Promise<void>):Promise<CommitmentRecord>{
    contract('EntityRef',commitmentRef);contract('EntityRef',evidenceRef);amount(bound);
    if(commitmentRef.type!=='abh.commitment')throw new CoreError('INVALID_ARGUMENT');
    const initial=await this.getCommitment(tx,commitmentRef.id);await this.#lock(tx,[initial.ledgerRef.id]);
    const current=await this.getCommitment(tx,commitmentRef.id),ledger=await this.get(tx,current.ledgerRef.id);
    if(current.commitmentRef.version!==commitmentRef.version)throw new CoreError('VERSION_CONFLICT');
    if(ledger.status==='Closed'||(mode==='Close'?current.status!=='Closing'||!/^0(?:\.0+)?$/.test(current.remaining):current.status!=='Open'))throw new CoreError('OBLIGATION_CONFLICT');
    await verifyEvidence(current,evidenceRef);
    const c=tx.context.tenant,sql=tx.owner('ResourceLedger');
    const [difference]=await sql`SELECT (${bound}::numeric-${current.remaining}::numeric)::text AS delta,
      ${bound}::numeric>${current.remaining}::numeric AS expanding`;
    if(difference!.expanding&&(mode!=='Adjust'||ledger.status!=='Open'))throw new CoreError('RESOURCE_EXHAUSTED');
    const balances=await sql`UPDATE resource.ledgers SET open_commitment=open_commitment+${difference!.delta}::numeric,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${ledger.ledgerRef.id} AND version=${ledger.ledgerRef.version}
        AND (${difference!.delta}::numeric<=0 OR limit_amount-confirmed_usage-held_reservation-open_commitment>=${difference!.delta}::numeric) RETURNING *`;
    if(!balances[0])throw new CoreError('RESOURCE_EXHAUSTED');const updated=ledgerRecord(balances[0]);
    const next=contract('CommitmentRecord',{...current,commitmentRef:{...current.commitmentRef,version:current.commitmentRef.version+1},ledgerRef:updated.ledgerRef,
      remaining:bound,upperBound:mode==='Adjust'?bound:current.upperBound,status:mode==='Close'?'Closed':mode==='BeginClose'?'Closing':'Open'});
    const changed=await sql`UPDATE resource.commitments SET remaining=${next.remaining},upper_bound=${next.upperBound},status=${next.status},record=${JSON.stringify(next)}::text::jsonb,
      version=version+1,updated_at=clock_timestamp(),updated_by=${c.actor.id}
      WHERE resource_organization_id=${c.resourceOrganizationId} AND id=${commitmentRef.id} AND version=${commitmentRef.version} RETURNING id`;
    if(!changed[0])throw new CoreError('VERSION_CONFLICT');
    await this.#entry(tx,command,updated.ledgerRef,'AdjustCommitment',next.commitmentRef,{commitmentDelta:difference!.delta},[evidenceRef]);
    await appendChange(tx,{command,target:next.commitmentRef,eventType:mode==='Close'?'abh.commitment.close':mode==='BeginClose'?'abh.commitment.close-requested':'abh.commitment.balance-changed',changedFields:['remaining','status'],relatedRefs:[evidenceRef]});
    await appendChange(tx,{command,target:updated.ledgerRef,eventType:'abh.ledger.balance-changed',changedFields:['openCommitment'],relatedRefs:[next.commitmentRef]});
    return next;
  }
}
