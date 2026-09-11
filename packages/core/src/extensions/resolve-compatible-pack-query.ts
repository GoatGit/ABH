import type {EntityRef,QueryExitRecord} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {readQueryExit} from '../execution/query-exit.ts';
import {StaticReleaseOwner} from '../release/static.ts';
import {CoreError} from '../internal/errors.ts';
import type {resolvePackCapability,InstalledCapabilityImplementation,ResolvePackCapabilityAdmission} from './resolve-pack-capability.ts';
import {resolveEnabledPackCapability} from './resolve-enabled-pack-capability.ts';

/** Internal read-only recovery resolution. A replacement never acquires a Pin
 * or dispatch authority. Call only after claiming the query exit in this UoW. */
export async function resolveCompatiblePackQuery<T>(tx:TenantTransaction,options:TransactionOptions,
 input:Parameters<typeof resolvePackCapability>[2],binding:InstalledCapabilityImplementation<T>,grants:readonly EntityRef[],
 admission:ResolvePackCapabilityAdmission,claimed:QueryExitRecord){
 const original=structuredClone(input),exit=contract('QueryExitRecord',structuredClone(claimed)),exact=structuredClone(binding.exactRef);
 if(tx.context.tenant.purposeOfUse!=='abh.operation.reconcile'||tx.context.tenant.actor.type!=='Service')throw new CoreError('FORBIDDEN');
 if(original.request.subjectRef.type!==exit.actionRef.type||original.request.subjectRef.id!==exit.actionRef.id)throw new CoreError('PIN_INPUT_CONFLICT');
 if(!exit.queryConnectorRef||!exit.compatibilityEvidenceRef||!exit.compatibilityEvidenceDigest
  ||exact.kind!=='Connector'||canonicalJson(exact)!==canonicalJson(exit.queryConnectorRef)
  ||canonicalJson(original.exactRef)!==canonicalJson(exit.connectorRef))throw new CoreError('PIN_INPUT_CONFLICT');
 const artifacts=new InlineArtifactOwner(),release=new StaticReleaseOwner();
 return resolveEnabledPackCapability(tx,options,{exactRef:exact},binding,grants,admission,async()=>{
  await artifacts.lockSources(tx,[exit.compatibilityEvidenceRef!]);
  if(canonicalJson(await readQueryExit(tx,exit.exitRef))!==canonicalJson(exit))throw new CoreError('OPERATION_FACT_CONFLICT');
  await release.requireHistoricalQueryPin(tx,original.pinSet,original.request,original.behaviorSlot,original.exactRef);
  const saved=await artifacts.read(tx,exit.compatibilityEvidenceRef!,async()=>{});
  if(saved.record.mediaType!=='application/json'||canonicalJson(saved.record.ownerRef)!==canonicalJson(exit.operationRef)
   ||saved.record.contentDigest!==exit.compatibilityEvidenceDigest)throw new CoreError('PIN_INPUT_CONFLICT');
  let proof;try{proof=contract('CompatibleQueryEvidence',JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes)));}catch{throw new CoreError('PIN_INPUT_CONFLICT');}
  if(canonicalJson(proof.operationRef)!==canonicalJson(exit.operationRef)||canonicalJson(proof.originalConnectorRef)!==canonicalJson(exit.connectorRef)
   ||canonicalJson(proof.queryConnectorRef)!==canonicalJson(exact)||canonicalJson(proof.connectionRef)!==canonicalJson(exit.connectionRef)
   ||canonicalJson(proof.accountRef)!==canonicalJson(exit.accountRef))throw new CoreError('PIN_INPUT_CONFLICT');
  const [clock]=await tx.owner('OperationController')`SELECT clock_timestamp() AS now`;
  if(Math.min(Date.parse(exit.expiresAt),Date.parse(proof.expiresAt))<=clock!.now.getTime())throw new CoreError('AUTHORITY_REQUIRED');
 });
}
