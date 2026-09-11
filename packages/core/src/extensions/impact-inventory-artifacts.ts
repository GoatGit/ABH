import type {ArtifactRecord,PackDataImpactRecord,PackDataInventory} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

/** Resolve both inventory source Refs through the real Artifact Owner, including version, purpose and digest checks.
 * Caller must hold the source/governance fences and authorize compiler ownership, region and retention in this transaction.
 * Available content does not by itself prove compiler provenance or the truth of a complete inventory.
 */
export async function verifyImpactInventoryArtifacts(tx:TenantTransaction,report:PackDataImpactRecord,
  authorize:(artifact:ArtifactRecord,role:'Baseline'|'Target')=>Promise<void>):Promise<void>{
  const input=contract('PackDataImpactRecord',JSON.parse(canonicalJson(report)));
  const owner=new InlineArtifactOwner();
  await owner.lockSources(tx,[input.baselineSourceRef,input.targetSourceRef]);
  const normalize=(inventory:PackDataInventory)=>{
    const value=contract('PackDataInventory',inventory);
    value.entries.sort((a,b)=>`${a.kind}/${a.id}`<`${b.kind}/${b.id}`?-1:`${a.kind}/${a.id}`>`${b.kind}/${b.id}`?1:0);
    return canonicalJson(value);
  };
  for(const [role,ref,expected] of [['Baseline',input.baselineSourceRef,input.baseline],['Target',input.targetSourceRef,input.target]] as const){
    const source=await owner.read(tx,ref,async artifact=>{
      if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536)throw new CoreError('INVALID_ARGUMENT');
      await authorize(structuredClone(artifact),role);
    });
    let content:PackDataInventory;
    try{
      const text=new TextDecoder('utf-8',{fatal:true}).decode(source.bytes);
      content=contract('PackDataInventory',JSON.parse(text));
      // Canonical source documents reject duplicate keys and alternate numeric/string encodings.
      if(canonicalJson(content)!==text)throw new CoreError('INVALID_ARGUMENT');
    }catch{throw new CoreError('INVALID_ARGUMENT');}
    if(normalize(content)!==normalize(structuredClone(expected)))throw new CoreError('PRECONDITION_FAILED');
  }
  tx.assertActive();
}
