import type { EntityRef, ImpactUpperBound, ResourceRequirement } from '@abh/contracts';
import type { TenantTransaction } from '../data/uow.ts';
import { CoreError } from '../internal/errors.ts';

export const sameRef=(a:EntityRef,b:EntityRef)=>a.type===b.type&&a.id===b.id&&a.version===b.version;
export const refKey=(ref:EntityRef)=>`${ref.type}/${ref.id}/${ref.version}`;

/** All child mutations participate in the parent lock, so a complete version vector stays stable. */
export async function lockAction(tx:TenantTransaction,id:string):Promise<void>{
  const key=`${tx.context.tenant.resourceOrganizationId}/ActionEngine/abh.action/${id}`;
  await tx.lock(4,key,()=>tx.owner('ActionEngine')`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
}

const decimal=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole!)*10n**12n+BigInt(fraction.padEnd(12,'0'));};
export function assertResourceBound(items:readonly ResourceRequirement[],bound:readonly ResourceRequirement[]):void{
  const totals=new Map<string,bigint>();
  for(const item of items){
    const ceiling=bound.find(candidate=>sameRef(item.resourceRef,candidate.resourceRef));
    if(!ceiling||ceiling.unit!==item.unit)throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    const key=refKey(item.resourceRef),sum=(totals.get(key)??0n)+decimal(item.quantity);
    if(sum>decimal(ceiling.quantity))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
    totals.set(key,sum);
  }
}
export function assertImpactBound(value:ImpactUpperBound,bound:ImpactUpperBound):void{
  if(value.scopeRefs.some(scope=>!bound.scopeRefs.some(ceiling=>sameRef(scope,ceiling))))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
  assertResourceBound(value.resourceRequirements,bound.resourceRequirements);
  for(const money of value.maxMoney){
    const ceiling=bound.maxMoney.find(candidate=>candidate.currency===money.currency);
    if(!ceiling||decimal(money.amount)>decimal(ceiling.amount))throw new CoreError('ACTION_PLAN_SCOPE_EXCEEDED');
  }
}
