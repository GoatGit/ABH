import type {PackProvenancePolicy} from '@abh/contracts';
import {canonicalJson,digestPackManifest} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignAttestation} from './cosign-blob.ts';

export type {PackProvenancePolicy} from '@abh/contracts';

/** Accept only independently signed SLSA v1 evidence for the exact Pack digest and deployment-pinned source/builder. */
export async function verifyPackProvenance(manifest:unknown,bundle:Uint8Array,policy:PackProvenancePolicy,options:TransactionOptions):Promise<{packageDigest:string;builderId:string}>{
  if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const config=JSON.parse(canonicalJson(policy)) as PackProvenancePolicy,proof=Uint8Array.from(bundle),current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  const checked=validateContract('PackManifest',JSON.parse(canonicalJson(manifest)));
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  if(checked.data.metadata.id!==config.packId)throw new CoreError('FORBIDDEN');
  if(![config.subjectName,config.builderId,config.buildType,config.source?.uri].every(value=>typeof value==='string'&&value.length>0)||
    !config.source.digest||Object.keys(config.source.digest).length===0||!Object.values(config.source.digest).every(value=>typeof value==='string'&&value.length>0))throw new CoreError('INVALID_ARGUMENT');
  const computed=await digestPackManifest(checked.data);
  for(const field of ['manifestDigest','artifactSetDigest','packageDigest'] as const)
    if(computed[field]!==checked.data.integrity[field])throw new CoreError('PRECONDITION_FAILED');
  await verifyCosignAttestation(new TextEncoder().encode(computed.signaturePayload),proof,config,current);
  // Parse only after Cosign authenticates DSSE. No policy or executable content is evaluated.
  try{
    const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(proof)).dsseEnvelope;
    if(envelope.payloadType!=='application/vnd.in-toto+json'||typeof envelope.payload!=='string')throw new Error();
    const statement=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(envelope.payload,'base64')));
    canonicalJson(statement); // Common bounded, inert JSON constraints also apply to signed statements.
    if(!['https://in-toto.io/Statement/v1','https://in-toto.io/Statement/v0.1'].includes(statement._type)||statement.predicateType!=='https://slsa.dev/provenance/v1'||
      !Array.isArray(statement.subject)||statement.subject.length!==1||statement.subject[0].name!==config.subjectName||
      canonicalJson(statement.subject[0].digest)!==canonicalJson({sha256:computed.packageDigest.slice(7)})||
      statement.predicate.runDetails.builder.id!==config.builderId||statement.predicate.buildDefinition.buildType!==config.buildType||
      !Array.isArray(statement.predicate.buildDefinition.resolvedDependencies)||
      !statement.predicate.buildDefinition.resolvedDependencies.some((dependency:{uri?:unknown;digest?:unknown})=>
        dependency.uri===config.source.uri&&canonicalJson(dependency.digest)===canonicalJson(config.source.digest)))throw new Error();
  }catch{throw new CoreError('PRECONDITION_FAILED');}
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return Object.freeze({packageDigest:computed.packageDigest,builderId:config.builderId});
}
