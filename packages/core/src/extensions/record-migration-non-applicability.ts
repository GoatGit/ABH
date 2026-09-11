import type {ArtifactRecord,EntityRef,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {prepareInstalledPack} from './prepare-installed-pack.ts';
import type {PackDataImpactAdmission} from './data-impact-reports.ts';
type Retention=Pick<StoreInlineArtifactPayload,'dataClass'|'region'|'retentionPolicyRef'>;
export interface MigrationNonApplicabilityAdmission {
 impact:PackDataImpactAdmission;
 /** Evidence ownership/retention admission; no new Control locks after impact recovery. */
 references(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
/** Persist a checked no-change report from current signed compiler inventories and
 * actual staged bytes. No SQL connection, empty migration or job is created.
 * This Artifact records non-applicability only; it does not enable the Pack.
 * Replays require current impact/trust/source authority and byte-for-byte evidence. */
export async function recordMigrationNonApplicability(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:{commandId:string;idempotencyKey:string;impactRef:EntityRef;retention:Retention},root:string,grantRefs:readonly EntityRef[],admission:MigrationNonApplicabilityAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const commandId=contract('UUID',input.commandId),idempotencyKey=contract('IdempotencyKey',input.idempotencyKey),impactRef=contract('EntityRef',structuredClone(input.impactRef)),retention=structuredClone(input.retention),grants=structuredClone(grantRefs),limits={...options};
 const policy=admission.impact,checks={signer:policy.signer.bind(policy),source:policy.source.bind(policy),fenceRefs:policy.fenceRefs.bind(policy),current:policy.current.bind(policy)},references=admission.references.bind(admission),read=admission.read.bind(admission);
 const identity={commandId,idempotencyKey,type:'abh.artifacts.store-inline',digest:await inputDigest(['abh-pack-migration-not-applicable-v1',impactRef,retention])};
 return database.transaction(context,limits,async tx=>{
  const owner=new InlineArtifactOwner();let payload:StoreInlineArtifactPayload|undefined;
  const assess=async()=>{
   const value=await prepareInstalledPack(tx,limits,impactRef,root,grants,checks);
   if(value.status!=='NotApplicable')throw new CoreError('PRECONDITION_FAILED');
   const proposed=contract('StoreInlineArtifactPayload',{...retention,ownerRef:value.installation.packRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:[...new Map([impactRef,value.impact.baselineSourceRef,value.impact.targetSourceRef].map(ref=>[canonicalJson(ref),ref])).values()],content:canonicalJson(['abh-pack-migration-not-applicable-v1',contract('PackMigrationNonApplicabilityReport',value.impact)])});
   if(payload&&canonicalJson(payload)!==canonicalJson(proposed))throw new CoreError('VERSION_CONFLICT');
   payload=proposed;
  };
  const result=await executeCommand(tx,identity,assess,async()=>{
   if(!payload)throw new CoreError('INTERNAL_ERROR');
   return (await owner.store(tx,identity,payload,refs=>references(tx,structuredClone(refs)))).artifactRef;
  });
  if(!payload)throw new CoreError('INTERNAL_ERROR');
  const saved=await owner.read(tx,result.receipt.resultRef,artifact=>read(tx,artifact));
  if(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes)!==payload.content||saved.record.mediaType!==payload.mediaType||
   canonicalJson(saved.record.ownerRef)!==canonicalJson(payload.ownerRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson(payload.sourceRefs)||
   canonicalJson(saved.record.purposeNames)!==canonicalJson(payload.purposeNames)||saved.record.dataClass!==payload.dataClass||saved.record.region!==payload.region||canonicalJson(saved.record.retentionPolicyRef)!==canonicalJson(payload.retentionPolicyRef))throw new CoreError('PRECONDITION_FAILED');
  await references(tx,[payload.ownerRef,payload.retentionPolicyRef,...payload.sourceRefs]);await assess();tx.assertActive();return saved.record.artifactRef;
 });
}
