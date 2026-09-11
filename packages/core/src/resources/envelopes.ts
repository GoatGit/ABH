import {randomUUID} from 'node:crypto';
import type {EntityRef,ImpactUpperBound,LedgerRecord,ResourceEnvelopeRecord} from '@abh/contracts';
import {digestContract} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {appendChange,contract,type CommandIdentity} from '../data/journal.ts';
import {lifecyclePurposes} from '../data/purposes.ts';
import {lockFences} from '../control/fences.ts';
import {CoreError} from '../internal/errors.ts';
import {LedgerOwner} from './ledger.ts';

const same=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id&&a.version===b.version;
const decimal=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole!)*10n**12n+BigInt(fraction.padEnd(12,'0'));};
const formatted=(value:bigint)=>`${value/10n**12n}.${(value%10n**12n).toString().padStart(12,'0')}`;

/** Immutable resource-to-ledger constraints. Multiple envelopes always reference the same real ledgers, never copied balances. */
export class ResourceEnvelopeOwner {
  async get(tx:TenantTransaction,ref:EntityRef):Promise<ResourceEnvelopeRecord>{
    contract('EntityRef',ref);if(ref.type!=='abh.resource-envelope')throw new CoreError('INVALID_ARGUMENT');const c=tx.context.tenant;
    const rows=await tx.owner('ResourceLedger')`SELECT record,version FROM resource.envelopes WHERE resource_organization_id=${c.resourceOrganizationId}
      AND id=${ref.id} AND deleted_at IS NULL AND ${c.purposeOfUse}=ANY(purpose_names) AND (workspace_id IS NULL OR workspace_id=${c.workspaceId??null}::uuid)`;
    if(!rows[0])throw new CoreError('AUTHORITY_REQUIRED');const envelope=contract('ResourceEnvelopeRecord',rows[0].record);
    if(!same(envelope.envelopeRef,ref)||envelope.envelopeRef.version!==Number(rows[0].version)||envelope.resourceOrganizationId!==c.resourceOrganizationId||await digestContract('ResourceEnvelopeRecord',envelope)!==envelope.digest)throw new CoreError('AUTHORITY_REQUIRED');return envelope;
  }
  async configure(tx:TenantTransaction,command:CommandIdentity,envelope:ResourceEnvelopeRecord,verify:(tx:TenantTransaction,envelope:ResourceEnvelopeRecord)=>Promise<void>):Promise<ResourceEnvelopeRecord>{
    contract('ResourceEnvelopeRecord',envelope);const c=tx.context.tenant,purposeNames=lifecyclePurposes(envelope.purposeNames,c.purposeOfUse);
    if(envelope.resourceOrganizationId!==c.resourceOrganizationId||envelope.envelopeRef.version!==1||await digestContract('ResourceEnvelopeRecord',envelope)!==envelope.digest)throw new CoreError('INVALID_ARGUMENT');
    await verify(tx,envelope);const fences=await lockFences(tx,envelope.scopeRefs);
    if(fences.some(fence=>fence.stopFlag))throw new CoreError('EPOCH_REVOKED');
    if(new Set(envelope.bindings.map(binding=>`${binding.resourceRef.id}/${binding.ledgerRef.id}`)).size!==envelope.bindings.length)throw new CoreError('INVALID_ARGUMENT');
    const ledgers=await new LedgerOwner().lockCurrent(tx,envelope.bindings.map(binding=>binding.ledgerRef.id));
    for(const binding of envelope.bindings){
      const ledger=ledgers.find(ledger=>ledger.ledgerRef.id===binding.ledgerRef.id)!;
      if(!same(ledger.ledgerRef,binding.ledgerRef)||ledger.unit!==binding.unit||!envelope.scopeRefs.some(scope=>same(scope,ledger.scopeRef)))throw new CoreError('INVALID_ARGUMENT');
    }
    await tx.owner('ResourceLedger')`INSERT INTO resource.envelopes(resource_organization_id,id,workspace_id,purpose_names,record)
      VALUES (${c.resourceOrganizationId},${envelope.envelopeRef.id},${c.workspaceId??null},${purposeNames},${JSON.stringify(envelope)}::text::jsonb)`;
    await tx.owner('Control')`INSERT INTO control.fences(resource_organization_id,id,scope_type,scope_id,epoch)
      VALUES (${c.resourceOrganizationId},${randomUUID()},'abh.resource-envelope',${envelope.envelopeRef.id},1)`;
    await appendChange(tx,{command,target:envelope.envelopeRef,eventType:'abh.resource-envelope.created',changedFields:['bindings','scopeRefs'],relatedRefs:envelope.evidenceRefs});return envelope;
  }
  async resolve(tx:TenantTransaction,envelope:ResourceEnvelopeRecord,impact:ImpactUpperBound):Promise<{ledgers:LedgerRecord[];requirements:{ledgerRef:EntityRef;amount:string}[]}>{
    contract('ResourceEnvelopeRecord',envelope);contract('ImpactUpperBound',impact);
    if(impact.maxMoney.length||impact.scopeRefs.some(scope=>!envelope.scopeRefs.some(allowed=>same(scope,allowed))))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    // Monetary/continuous liabilities need their registered ResourcePolicy conversion, never an implicit zero-cost mapping.
    const totals=new Map<string,bigint>();
    for(const resource of impact.resourceRequirements){
      const bindings=envelope.bindings.filter(binding=>same(binding.resourceRef,resource.resourceRef));
      if(!bindings.length)throw new CoreError('AUTHORITY_REQUIRED');
      for(const binding of bindings){
        if(binding.unit!==resource.unit||decimal(resource.quantity)>decimal(binding.maxQuantity))throw new CoreError('RESOURCE_EXHAUSTED');
        totals.set(binding.ledgerRef.id,(totals.get(binding.ledgerRef.id)??0n)+decimal(resource.quantity));
      }
    }
    const ledgers=await new LedgerOwner().lockCurrent(tx,[...totals.keys()]);
    for(const ledger of ledgers){
      if(ledger.status!=='Open'||!envelope.scopeRefs.some(scope=>same(scope,ledger.scopeRef))||envelope.bindings.some(binding=>binding.ledgerRef.id===ledger.ledgerRef.id&&binding.unit!==ledger.unit))throw new CoreError('RESOURCE_EXHAUSTED');
    }
    return {ledgers,requirements:ledgers.filter(ledger=>totals.get(ledger.ledgerRef.id)!>0n).map(ledger=>({ledgerRef:ledger.ledgerRef,amount:formatted(totals.get(ledger.ledgerRef.id)!)}))};
  }
}
