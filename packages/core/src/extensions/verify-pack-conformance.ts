import type {PackConformancePolicy} from '@abh/contracts';
import type {ConformanceReport} from '@abh/contracts';
import {canonicalJson,digestContract,digestPackManifest} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {verifyCosignConformance} from './cosign-blob.ts';

export type {PackConformancePolicy} from '@abh/contracts';

/** Verify independently signed complete CTK evidence; never run package-supplied tests in the host. */
export async function verifyPackConformance(manifest:unknown,bundle:Uint8Array,policy:PackConformancePolicy,options:TransactionOptions):Promise<ConformanceReport>{
  if(!(bundle instanceof Uint8Array)||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const config=JSON.parse(canonicalJson(policy)) as PackConformancePolicy,proof=Uint8Array.from(bundle),current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  const checked=validateContract('PackManifest',JSON.parse(canonicalJson(manifest)));
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const pack=checked.data;
  if(pack.metadata.id!==config.packId)throw new CoreError('FORBIDDEN');
  if(typeof config.subjectName!=='string'||!config.subjectName||!Number.isSafeInteger(config.maxAgeMs)||config.maxAgeMs<1||
    !validateContract('ConformanceEnvironment',config.environment).success||!Array.isArray(config.cases)||config.cases.length<1||config.cases.length>10000||
    config.cases.some(item=>!validateContract('RegisteredName',item.caseId).success||!['Passed','Skipped'].includes(item.status))||
    new Set(config.cases.map(item=>item.caseId)).size!==config.cases.length||!Array.isArray(config.claimedCapabilities)||
    config.claimedCapabilities.some(claim=>!validateContract('ConformanceCapabilityClaim',claim).success))throw new CoreError('INVALID_ARGUMENT');
  const computed=await digestPackManifest(pack);
  for(const field of ['manifestDigest','artifactSetDigest','packageDigest'] as const)
    if(computed[field]!==pack.integrity[field])throw new CoreError('PRECONDITION_FAILED');
  await verifyCosignConformance(new TextEncoder().encode(computed.signaturePayload),proof,config,current);
  let report:ConformanceReport;
  try{
    const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(proof)).dsseEnvelope;
    if(envelope.payloadType!=='application/vnd.in-toto+json'||typeof envelope.payload!=='string')throw new Error();
    const statement=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(envelope.payload,'base64')));
    canonicalJson(statement);
    if(!['https://in-toto.io/Statement/v1','https://in-toto.io/Statement/v0.1'].includes(statement._type)||statement.predicateType!=='urn:abh:conformance:v1'||
      !Array.isArray(statement.subject)||statement.subject.length!==1||statement.subject[0].name!==config.subjectName||
      canonicalJson(statement.subject[0].digest)!==canonicalJson({sha256:computed.packageDigest.slice(7)}))throw new Error();
    const result=validateContract('ConformanceReport',statement.predicate);
    if(!result.success)throw new Error();report=result.data;
  }catch{throw new CoreError('PRECONDITION_FAILED');}
  const sorted=(values:unknown[])=>values.map(value=>canonicalJson(value)).sort();
  const profiles={DomainPack:'Domain',ConnectorPack:'Connector',RuntimeAdapter:'Adapter',WorkbenchExtension:'Workbench'};
  const now=Date.now(),finished=Date.parse(report.finishedAt);
  if(report.status!=='Complete'||report.subjectDigest!==computed.packageDigest||report.suiteVersion!==pack.conformance.suiteVersion||
    report.suiteVersion!==config.suiteVersion||report.signatureRef!==pack.integrity.conformanceRef||report.environment.profile!==profiles[pack.kind]||
    canonicalJson(report.environment)!==canonicalJson(config.environment)||finished>now||now-finished>config.maxAgeMs||report.knownDeviations.length!==0||
    canonicalJson(sorted(report.caseResults.map(({caseId,status})=>({caseId,status}))))!==canonicalJson(sorted(config.cases))||
    canonicalJson(sorted(report.claimedCapabilities))!==canonicalJson(sorted(config.claimedCapabilities))||
    canonicalJson(sorted(report.claimedCapabilities.filter(claim=>claim.claimed).map(({claimed,...identity})=>identity)))!==canonicalJson(sorted(pack.capabilities.provides))||
    await digestContract('ConformanceReport',report)!==report.reportDigest)throw new CoreError('PRECONDITION_FAILED');
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return structuredClone(report);
}
