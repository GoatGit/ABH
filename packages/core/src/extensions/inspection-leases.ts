import {randomUUID} from 'node:crypto';
import type {Digest,EntityRef,InstalledPackRecord,WorkLeaseRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {WorkLeaseOwner} from '../durable/work-leases.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InstalledPackOwner} from './installed-packs.ts';
export interface PackInspectionLeaseToken {leaseRef:EntityRef;workerId:string;fencingToken:number}
type Change={kind:'Claim';workerId:string;leaseSeconds:number}|{kind:'Renew';token:PackInspectionLeaseToken;leaseSeconds:number}|{kind:'Release';token:PackInspectionLeaseToken};
function snapshot(candidate:InstalledPackRecord,grants:readonly EntityRef[]){
 const pack=contract('InstalledPackRecord',structuredClone(candidate));
 if(pack.status!=='Staged')throw new CoreError('PRECONDITION_FAILED');
 return {pack,grants:structuredClone(grants)};
}
function management(context:VerifiedContext){
 const c=context.tenant;
 if(c.actor.type!=='Service'||c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
}
async function admit(tx:TenantTransaction,pack:InstalledPackRecord,grants:readonly EntityRef[]){
 management(tx.context);const scope={type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1};
 await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:'abh.packs.record-data-impact'},grants);
 const actual=await new InstalledPackOwner().read(tx,pack.packRef,async()=>{});
 if(canonicalJson(actual)!==canonicalJson(pack))throw new CoreError('VERSION_CONFLICT');
 tx.assertActive();
}
function token(value:PackInspectionLeaseToken):PackInspectionLeaseToken{
 const ref=contract('EntityRef',structuredClone(value.leaseRef));
 if(ref.type!=='abh.work-lease')throw new CoreError('INVALID_ARGUMENT');
 return {leaseRef:ref,workerId:contract('UUID',value.workerId),fencingToken:contract('Version',value.fencingToken)};
}
/** Management work ownership only, not migration execution or Enable authority.
 * Every mutation uses the existing WorkLease Owner/Command/Audit transaction and
 * rereads the actual staged installation and current Service management Grant.
 */
async function change(database:Database,context:VerifiedContext,options:TransactionOptions,candidate:InstalledPackRecord,grantRefs:readonly EntityRef[],input:Change):Promise<WorkLeaseRecord>{
 management(context);const fixed=snapshot(candidate,grantRefs),limits={...options},leases=new WorkLeaseOwner();
 const operation=input.kind==='Claim'?{kind:'Claim' as const,payload:contract('ClaimWorkLeasePayload',{targetRef:fixed.pack.packRef,workerId:input.workerId,leaseSeconds:input.leaseSeconds})}:
  input.kind==='Renew'?{kind:'Renew' as const,token:token(input.token),payload:contract('RenewWorkLeasePayload',{workerId:input.token.workerId,fencingToken:input.token.fencingToken,leaseSeconds:input.leaseSeconds})}:
  {kind:'Release' as const,token:token(input.token),payload:contract('ReleaseWorkLeasePayload',{workerId:input.token.workerId,fencingToken:input.token.fencingToken})};
 const command={type:`abh.work-leases.${operation.kind.toLowerCase()}`,commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(operation.kind==='Claim'?operation.payload:{leaseRef:operation.token.leaseRef,...operation.payload})};
 const active=(tx:TenantTransaction)=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
 return database.transaction(context,limits,async tx=>{
  let produced:WorkLeaseRecord|undefined;
  const result=await executeCommand(tx,command,async()=>{await admit(tx,fixed.pack,fixed.grants);active(tx);},async()=>{
   if(operation.kind==='Claim')produced=await leases.claim(tx,command,operation.payload,async()=>['abh.pack.manage']);
   else{
    const current=await leases.get(tx,operation.token.leaseRef);
    if(canonicalJson(current.targetRef)!==canonicalJson(fixed.pack.packRef))throw new CoreError('PRECONDITION_FAILED');
    produced=operation.kind==='Renew'?await leases.renew(tx,command,operation.token.leaseRef,operation.token.workerId,operation.token.fencingToken,operation.payload.leaseSeconds):
     await leases.release(tx,command,operation.token.leaseRef,operation.token.workerId,operation.token.fencingToken);
   }
   return produced.leaseRef;
  });
  await admit(tx,fixed.pack,fixed.grants);active(tx);
  const current=await leases.get(tx,result.receipt.resultRef);
  if(!produced||canonicalJson(produced)!==canonicalJson(current))throw new CoreError('VERSION_CONFLICT');
  active(tx);return current;
 });
}
export function claimPackInspectionLease(database:Database,context:VerifiedContext,options:TransactionOptions,pack:InstalledPackRecord,grants:readonly EntityRef[],workerId:string,leaseSeconds=30){
 return change(database,context,options,pack,grants,{kind:'Claim',workerId,leaseSeconds});
}
export function renewPackInspectionLease(database:Database,context:VerifiedContext,options:TransactionOptions,pack:InstalledPackRecord,grants:readonly EntityRef[],lease:PackInspectionLeaseToken,leaseSeconds=30){
 return change(database,context,options,pack,grants,{kind:'Renew',token:lease,leaseSeconds});
}
export function releasePackInspectionLease(database:Database,context:VerifiedContext,options:TransactionOptions,pack:InstalledPackRecord,grants:readonly EntityRef[],lease:PackInspectionLeaseToken){
 return change(database,context,options,pack,grants,{kind:'Release',token:lease});
}
/** Call after acquiring all other control/deployment locks, before committing
 * authoritative inspection state. Locks the existing lease aggregate; expiry or
 * takeover rejects even when the supplied Artifact or queue receipt is valid.
 */
export async function requirePackInspectionLease(tx:TenantTransaction,options:TransactionOptions,candidate:InstalledPackRecord,grantRefs:readonly EntityRef[],input:PackInspectionLeaseToken){
 const fixed=snapshot(candidate,grantRefs),lease=token(input),limits={...options};
 if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
 await admit(tx,fixed.pack,fixed.grants);
 const current=await new WorkLeaseOwner().requireCurrent(tx,lease.leaseRef,lease.workerId,lease.fencingToken,fixed.pack.packRef);
 if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');tx.assertActive();return current;
}

export interface PackInspectionLeaseBinding {installation:InstalledPackRecord;grants:readonly EntityRef[];token:PackInspectionLeaseToken}
export function snapshotPackInspectionLease(input:PackInspectionLeaseBinding):PackInspectionLeaseBinding{
 const fixed=snapshot(input.installation,input.grants);return {installation:fixed.pack,grants:fixed.grants,token:token(input.token)};
}
/** The fenced target must be the producer's actual Pack, not another valid lease. */
export async function requireObservationLease(tx:TenantTransaction,options:TransactionOptions,input:PackInspectionLeaseBinding,ownerRef:EntityRef,packageDigest:Digest){
 if(canonicalJson(input.installation.packRef)!==canonicalJson(ownerRef)||input.installation.manifest.integrity.packageDigest!==packageDigest)throw new CoreError('PRECONDITION_FAILED');
 return requirePackInspectionLease(tx,options,input.installation,input.grants,input.token);
}
