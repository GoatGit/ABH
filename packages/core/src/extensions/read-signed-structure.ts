import type {ArtifactRecord,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import type {MigrationStructureBinding} from './verify-registered-migration-structure.ts';
import {verifyStructureSignature,matchStructureSignature,structureSignaturePayload,type MigrationStructureReport,type MigrationStructureSigner} from './verify-structure-signature.ts';
export interface StoredStructureAdmission {
 signer(report:MigrationStructureReport):Promise<MigrationStructureSigner>;
 source(artifact:ArtifactRecord,role:'Report'|'Bundle'):Promise<void>;
}
/** Actual immutable Artifact bytes, source locks and independent signature. Host
 * authenticates installation/deployment and source authority under retained fences.
 * This reads an expected structure report, not an actual result or Enable proof.
 */
export async function readSignedStructureExpectation(tx:TenantTransaction,options:TransactionOptions,binding:MigrationStructureBinding,ownerRef:EntityRef,reportRef:EntityRef,bundleRef:EntityRef,admission:StoredStructureAdmission){
 const expected=structuredClone(binding),owner=contract('EntityRef',structuredClone(ownerRef)),report=contract('EntityRef',structuredClone(reportRef)),bundle=contract('EntityRef',structuredClone(bundleRef)),limits={...options};
 const signer=admission.signer.bind(admission),source=admission.source.bind(admission),c=tx.context.tenant;
 const active=()=>{tx.assertActive();if(limits.signal.aborted||!Number.isSafeInteger(limits.deadline)||limits.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};active();
 if(c.purposeOfUse!=='abh.pack.manage'||c.workspaceId||c.actingOrganizationId!==c.resourceOrganizationId||expected.organizationId!==c.resourceOrganizationId)throw new CoreError('FORBIDDEN');
 if(canonicalJson(report)===canonicalJson(bundle))throw new CoreError('INVALID_ARGUMENT');
 const artifacts=new InlineArtifactOwner();await artifacts.lockSources(tx,[report,bundle]);active();
 const inspect=async(artifact:ArtifactRecord,role:'Report'|'Bundle')=>{
  if(artifact.mediaType!=='application/json'||artifact.sizeBytes>65536||canonicalJson(artifact.ownerRef)!==canonicalJson(owner)||role==='Bundle'&&!artifact.sourceRefs.some(ref=>canonicalJson(ref)===canonicalJson(report)))throw new CoreError('PRECONDITION_FAILED');
  await source(artifact,role);active();
 };
 const stored=await artifacts.read(tx,report,artifact=>inspect(artifact,'Report'));active();
 let value:MigrationStructureReport;
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes),envelope=JSON.parse(text);
  if(!Array.isArray(envelope)||envelope.length!==2||envelope[0]!=='abh-pack-migration-structure-expectation-v1'||structureSignaturePayload(envelope[1])!==text)throw new Error();
  value=envelope[1];
 }catch{throw new CoreError('PRECONDITION_FAILED');}
 if(canonicalJson(value.binding)!==canonicalJson(expected))throw new CoreError('PRECONDITION_FAILED');
 const config=structuredClone(await signer(structuredClone(value)));active();
 const signature=await artifacts.read(tx,bundle,artifact=>inspect(artifact,'Bundle'));active();
 const proof=await verifyStructureSignature(value,signature.bytes,config,{...limits,signal:AbortSignal.any([limits.signal,tx.signal])});active();
 await source(structuredClone(stored.record),'Report');active();await source(structuredClone(signature.record),'Bundle');active();
 if(canonicalJson(await signer(structuredClone(value)))!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');active();
 matchStructureSignature(proof,value,expected);
 return {report:value,reportRef:report,bundleRef:bundle,proof};
}
