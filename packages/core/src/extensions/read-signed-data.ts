import type {ArtifactRecord,EntityRef} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {contract} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';
import type {MigrationDataBinding} from './verify-registered-migration-data.ts';
import {verifyDataSignature,matchDataSignature,dataSignaturePayload,type MigrationDataReport,type MigrationDataSigner} from './verify-data-signature.ts';
export interface StoredDataAdmission {
 signer(report:MigrationDataReport):Promise<MigrationDataSigner>;
 source(artifact:ArtifactRecord,role:'Report'|'Bundle'):Promise<void>;
}
/** Actual immutable Artifact bytes, source locks and independent signature. Host
 * authenticates installation/deployment and source authority under retained fences.
 * This reads an expected data invariant report, not an actual result or Enable proof.
 */
export async function readSignedDataExpectation(tx:TenantTransaction,options:TransactionOptions,binding:MigrationDataBinding,ownerRef:EntityRef,reportRef:EntityRef,bundleRef:EntityRef,admission:StoredDataAdmission){
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
 let value:MigrationDataReport;
 try{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(stored.bytes),envelope=JSON.parse(text);
  if(!Array.isArray(envelope)||envelope.length!==2||envelope[0]!=='abh-pack-migration-data-expectation-v1'||dataSignaturePayload(envelope[1])!==text)throw new Error();
  value=envelope[1];
 }catch{throw new CoreError('PRECONDITION_FAILED');}
 if(canonicalJson(value.binding)!==canonicalJson(expected))throw new CoreError('PRECONDITION_FAILED');
 const config=structuredClone(await signer(structuredClone(value)));active();
 const signature=await artifacts.read(tx,bundle,artifact=>inspect(artifact,'Bundle'));active();
 const proof=await verifyDataSignature(value,signature.bytes,config,{...limits,signal:AbortSignal.any([limits.signal,tx.signal])});active();
 await source(structuredClone(stored.record),'Report');active();await source(structuredClone(signature.record),'Bundle');active();
 if(canonicalJson(await signer(structuredClone(value)))!==canonicalJson(config))throw new CoreError('VERSION_CONFLICT');active();
 matchDataSignature(proof,value,expected);
 return {report:value,reportRef:report,bundleRef:bundle,proof};
}
