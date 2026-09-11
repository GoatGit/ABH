import type {PackManifest,PackDataDefinition,PackDataInventory,PackDataChange,PackDataImpact} from '@abh/contracts';
import {canonicalJson,digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

export type {PackDataDefinition,PackDataInventory,PackDataChange,PackDataImpact} from '@abh/contracts';
const key=(entry:Pick<PackDataDefinition,'kind'|'id'>)=>`${entry.kind}/${entry.id}`;
function inventory(input:PackDataInventory):PackDataInventory{
  const result=contract('PackDataInventory',JSON.parse(canonicalJson(input)));
  result.entries.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);return result;
}

/** Deterministic data-impact calculation. No migration execution, database fact, signature or Enable authority is produced here.
 * Callers must bind independently verified compiler inventories to the exact baseline/environment before persisting the result.
 */
export async function assessPackDataImpact(manifest:PackManifest,baseline:PackDataInventory,target:PackDataInventory):Promise<PackDataImpact>{
  const pack=contract('PackManifest',JSON.parse(canonicalJson(manifest))),before=inventory(baseline),after=inventory(target);
  const computed=await digestPackManifest(pack);
  if(computed.packageDigest!==pack.integrity.packageDigest||computed.manifestDigest!==pack.integrity.manifestDigest||computed.artifactSetDigest!==pack.integrity.artifactSetDigest)throw new CoreError('PRECONDITION_FAILED');
  const old=new Map(before.entries.map(entry=>[key(entry),entry])),next=new Map(after.entries.map(entry=>[key(entry),entry]));
  const changes:PackDataChange[]=[];
  for(const name of [...new Set([...old.keys(),...next.keys()])].sort()){
    const previous=old.get(name),current=next.get(name),entry=current??previous!;
    if(previous?.digest===current?.digest)continue;
    changes.push({kind:entry.kind,id:entry.id,change:!previous?'Added':!current?'Removed':'Changed',
      ...(previous?{beforeDigest:previous.digest}:{}),...(current?{afterDigest:current.digest}:{})});
  }
  const migrationRefs=pack.migrations.map(entry=>entry.ref).sort(),reasons:PackDataImpact['reasons']=[];
  if(!before.complete||!after.complete)reasons.push('InventoryIncomplete');
  if(changes.length)reasons.push('DefinitionsChanged');
  if(migrationRefs.length)reasons.push('DeclaredMigrations');
  return contract('PackDataImpact',{subjectDigest:computed.packageDigest,baselineDigest:await digestBytes(new TextEncoder().encode(canonicalJson(before))),
    targetDigest:await digestBytes(new TextEncoder().encode(canonicalJson(after))),
    status:reasons.includes('InventoryIncomplete')?'Incomplete':reasons.length?'Required':'NotApplicable',changes,migrationRefs,reasons});
}

/** Verify an externally supplied result by recomputing the complete diff from independently obtained inventories.
 * Schema-valid status/reasons alone are insufficient. Inventory provenance and deployment freshness remain caller obligations.
 */
export async function verifyPackDataImpact(manifest:PackManifest,baseline:PackDataInventory,target:PackDataInventory,
  report:PackDataImpact):Promise<PackDataImpact>{
  const supplied=contract('PackDataImpact',JSON.parse(canonicalJson(report)));
  const computed=await assessPackDataImpact(manifest,baseline,target);
  // Compare semantic sets in deterministic order; every change field and every commitment remains bound.
  supplied.changes.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  supplied.migrationRefs.sort();supplied.reasons.sort();
  const normalized=structuredClone(computed);normalized.reasons.sort();
  if(canonicalJson(supplied)!==canonicalJson(normalized))throw new CoreError('PRECONDITION_FAILED');
  return computed;
}
