import type {ArtifactRecord,EntityRef,RecordPackConformanceCommand,StoreInlineArtifactPayload} from '@abh/contracts';
import {canonicalJson,digestCommandIntent} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand} from '../data/journal.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {assertCurrentGrants} from '../control/grants.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {migrationWorkOptions,assertMigrationWorkActive} from './migration-work-options.ts';
import {recoverStagedPackInTransaction} from './recover-staged-pack.ts';
import type {PackRecordAdmission} from './record-pack-validation.ts';
import {PackTrustPolicyOwner} from './trust-policies.ts';
import {verifyPackConformance} from './verify-pack-conformance.ts';

export interface PackConformanceArtifactAdmission {
 pack:PackRecordAdmission;
 /** References and actual Artifact ownership/access/retention checks under already declared fences. */
 references(tx:TenantTransaction,refs:readonly EntityRef[]):Promise<void>;
 read(tx:TenantTransaction,artifact:ArtifactRecord):Promise<void>;
}
function snapshotAdmission(admission:PackConformanceArtifactAdmission){
 return {pack:{fenceRefs:admission.pack.fenceRefs.bind(admission.pack),current:admission.pack.current.bind(admission.pack)},references:admission.references.bind(admission),read:admission.read.bind(admission)};
}
async function currentConformance(tx:TenantTransaction,options:TransactionOptions,packRef:EntityRef,root:string,grants:readonly EntityRef[],admission:PackConformanceArtifactAdmission){
 const limits=migrationWorkOptions(tx,options);
 const recovered=await recoverStagedPackInTransaction(tx,limits,packRef,root,grants,admission.pack),metadata=recovered.metadata();
 const governance=await new PackTrustPolicyOwner().current(tx,metadata.manifest.metadata.id);
 const report=await verifyPackConformance(metadata.manifest,recovered.files.proof(metadata.manifest.integrity.conformanceRef),governance.trust.conformance,limits);
 if(report.reportDigest!==metadata.report.conformanceReportDigest||governance.revokedPackIds.includes(metadata.manifest.metadata.id)||
  [metadata.manifest.integrity.packageDigest,metadata.report.conformanceBundleDigest,report.reportDigest].some(digest=>governance.revokedDigests.includes(digest)))throw new CoreError('PRECONDITION_FAILED');
 assertMigrationWorkActive(tx,limits);
 return {installation:recovered.installation(),report,validation:metadata.report};
}
const content=(value:Awaited<ReturnType<typeof currentConformance>>)=>canonicalJson(['abh-pack-conformance-v1',value.report]);
const sources=(value:Awaited<ReturnType<typeof currentConformance>>)=>[value.installation.validationRef,value.installation.governanceRef];

/** Publish the actual independently signed CTK report recovered from staged bytes.
 * Separate CTK-recording and staging Grants are required, including on replay.
 * No package code executes and this does not enable the Pack. */
export async function recordPackConformanceArtifact(database:Database,context:VerifiedContext,options:TransactionOptions,
 input:RecordPackConformanceCommand,root:string,
 grants:{stage:readonly EntityRef[];record:readonly EntityRef[]},admission:PackConformanceArtifactAdmission):Promise<EntityRef>{
 requireVerifiedContext(context);
 const command=contract('RecordPackConformanceCommand',structuredClone(input));
 if(command.target.id!==context.tenant.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 const reference=command.payload.packRef,retention=command.payload.retention,authority=structuredClone(grants),checks=snapshotAdmission(admission),limits={...options};
 const identity={commandId:command.commandId,idempotencyKey:command.idempotencyKey,type:command.type,digest:await digestCommandIntent(command)};
 // Recovery declares every Control fence before acquiring the Pack lock.
 const packChecks={...checks,pack:{...checks.pack,fenceRefs:async(tx:TenantTransaction,evidence:Parameters<PackRecordAdmission['fenceRefs']>[1])=>[...authority.record,...await checks.pack.fenceRefs(tx,evidence)]}};
 return database.transaction(context,limits,async tx=>{
  const work=migrationWorkOptions(tx,limits),owner=new InlineArtifactOwner();let payload:StoreInlineArtifactPayload|undefined;
  const assess=async()=>{
   const value=await currentConformance(tx,work,reference,root,authority.stage,packChecks);
   const scope={type:'abh.organization',id:tx.context.tenant.resourceOrganizationId,version:1};
   await assertCurrentGrants(tx,{objectRef:scope,scopeRefs:[scope],action:identity.type},authority.record);
   const next=contract('StoreInlineArtifactPayload',{...retention,ownerRef:value.installation.packRef,mediaType:'application/json',purposeNames:['abh.pack.manage'],sourceRefs:sources(value),content:content(value)});
   if(payload&&canonicalJson(payload)!==canonicalJson(next))throw new CoreError('VERSION_CONFLICT');payload=next;
   await checks.references(tx,[next.ownerRef,next.retentionPolicyRef,...next.sourceRefs]);assertMigrationWorkActive(tx,work);
  };
  const result=await executeCommand(tx,identity,assess,async()=>{
   if(!payload)throw new CoreError('INTERNAL_ERROR');
   return (await owner.store(tx,identity,payload,refs=>checks.references(tx,refs))).artifactRef;
  });
  if(!payload)throw new CoreError('INTERNAL_ERROR');
  const saved=await owner.read(tx,result.receipt.resultRef,artifact=>checks.read(tx,artifact));
  if(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes)!==payload.content||saved.record.mediaType!==payload.mediaType||
   canonicalJson(saved.record.ownerRef)!==canonicalJson(payload.ownerRef)||canonicalJson(saved.record.sourceRefs)!==canonicalJson(payload.sourceRefs)||
   canonicalJson(saved.record.purposeNames)!==canonicalJson(payload.purposeNames)||saved.record.dataClass!==payload.dataClass||saved.record.region!==payload.region||canonicalJson(saved.record.retentionPolicyRef)!==canonicalJson(payload.retentionPolicyRef))throw new CoreError('PRECONDITION_FAILED');
  await assess();return saved.record.artifactRef;
 });
}

/** Read exact CTK Artifact bytes and reverify the current signed staged report in this UoW.
 * expectedPackRef is supplied independently by the proposal consumer. No Enable authority is returned. */
export async function readPackConformanceArtifact(tx:TenantTransaction,options:TransactionOptions,artifactRef:EntityRef,expectedPackRef:EntityRef,
 root:string,stageGrants:readonly EntityRef[],admission:PackConformanceArtifactAdmission){
 const ref=contract('EntityRef',structuredClone(artifactRef)),pack=contract('EntityRef',structuredClone(expectedPackRef)),grants=structuredClone(stageGrants),checks=snapshotAdmission(admission),work=migrationWorkOptions(tx,options);
 if(ref.type!=='abh.artifact')throw new CoreError('INVALID_ARGUMENT');
 const value=await currentConformance(tx,work,pack,root,grants,checks),owner=new InlineArtifactOwner();await owner.lockSources(tx,[ref]);
 const saved=await owner.read(tx,ref,artifact=>checks.read(tx,artifact));assertMigrationWorkActive(tx,work);
 if(new TextDecoder('utf-8',{fatal:true}).decode(saved.bytes)!==content(value)||saved.record.mediaType!=='application/json'||
  canonicalJson(saved.record.ownerRef)!==canonicalJson(pack)||canonicalJson(saved.record.sourceRefs)!==canonicalJson(sources(value))||canonicalJson(saved.record.purposeNames)!==canonicalJson(['abh.pack.manage']))throw new CoreError('PRECONDITION_FAILED');
 await checks.references(tx,[pack,saved.record.retentionPolicyRef,...sources(value)]);assertMigrationWorkActive(tx,work);
 const latest=await currentConformance(tx,work,pack,root,grants,checks);
 if(canonicalJson(latest)!==canonicalJson(value))throw new CoreError('VERSION_CONFLICT');
 return {artifactRef:saved.record.artifactRef,installation:latest.installation,report:latest.report,validation:latest.validation};
}
