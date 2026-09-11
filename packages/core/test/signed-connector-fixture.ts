import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digestBytes,digestContract,digestPackManifest} from '@abh/contracts/digest';
import {contract} from '../src/data/journal.ts';
import {packManifest} from './pack-fixture.ts';
import type {PackContentSource} from '../src/extensions/verify-pack-content.ts';
import type {PackConformancePolicy} from '../src/extensions/verify-pack-conformance.ts';

/** Actual independent ephemeral release/builder/CTK signatures for a nonempty
 * Connector fixture. CTK claims are fixture evidence, not production acceptance. */
export async function signedConnectorFixture(executable:string,packId='org.example.signed',version='1.0.0'){
 const root=await mkdtemp(join(tmpdir(),'abh-signed-connector-'));
 try{
  const run=(args:string[])=>promisify(execFile)(executable,args,{cwd:root,env:{...process.env,COSIGN_PASSWORD:''},timeout:10000,maxBuffer:1048576});
  for(const name of ['release','builder','ctk'])await run(['generate-key-pair','--output-key-prefix',join(root,name)]);
  const schema={type:'object',properties:{message:{type:'string'}},required:['message'],additionalProperties:false};
  const bytes=new TextEncoder().encode(JSON.stringify(schema)),base=await packManifest();
  const capability={kind:'abh.connector',id:packId+'.connector',version};
  const raw={...base,kind:'ConnectorPack',metadata:{...base.metadata,id:packId,version},capabilities:{provides:[capability],requires:[]},
   artifacts:[{ref:'input.json',sizeBytes:bytes.length,mediaType:'application/json',digest:await digestBytes(bytes)}]};
  const {signaturePayload,...digests}=await digestPackManifest(raw);
  const manifest=contract('PackManifest',{...raw,integrity:{...raw.integrity,...digests}});
  await writeFile(join(root,'payload'),signaturePayload);
  await run(['sign-blob','--key',join(root,'release.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,'release.bundle'),join(root,'payload')]);
  const key=async(name:string)=>({executable,mode:'OfflinePublicKey' as const,packId:manifest.metadata.id,publicKeyPem:await readFile(join(root,name+'.pub'),'utf8')});
  const sourceIdentity={uri:'git+https://example.org/signed-connector.git',digest:{gitCommit:'0123456789abcdef0123456789abcdef01234567'}};
  const provenance={buildDefinition:{buildType:'https://example.org/build/v1',externalParameters:{},internalParameters:{},resolvedDependencies:[sourceIdentity]},runDetails:{builder:{id:'https://example.org/builder'},metadata:{invocationId:randomUUID()}}};
  const attest=async(name:string,predicate:unknown,type:string)=>{
   await writeFile(join(root,name+'.json'),JSON.stringify(predicate));
   await run(['attest-blob','--key',join(root,name+'.key'),'--tlog-upload=false','--new-bundle-format','--bundle',join(root,name+'.bundle'),'--predicate',join(root,name+'.json'),'--type',type,join(root,'payload')]);
   return readFile(join(root,name+'.bundle'));
  };
  const provenanceBundle=await attest('builder',provenance,'https://slsa.dev/provenance/v1');
  const now=Date.now(),digest='sha256:'+'0'.repeat(64);
  const report=contract('ConformanceReport',{subjectDigest:manifest.integrity.packageDigest,suiteVersion:'1.0.0',status:'Complete',caseResults:[{caseId:'abh.test.connector-fixture',status:'Passed',reason:null,artifactRefs:[]}],
   claimedCapabilities:[{...capability,claimed:true}],knownDeviations:[],environment:{profile:'Connector',environmentDigest:digest,fixtureSetDigest:digest,seed:'42'},startedAt:new Date(now-1000).toISOString(),finishedAt:new Date(now).toISOString(),artifactRefs:[],reportDigest:digest,signatureRef:'proof/ctk.json'});
  report.reportDigest=await digestContract('ConformanceReport',report);
  const conformanceBundle=await attest('ctk',report,'urn:abh:conformance:v1');
  const conformance:PackConformancePolicy={...await key('ctk'),subjectName:'payload',suiteVersion:report.suiteVersion,environment:report.environment,cases:[{caseId:'abh.test.connector-fixture',status:'Passed'}],claimedCapabilities:[{...capability,claimed:true}],maxAgeMs:300000};
  const ref=(type:string)=>({type,id:randomUUID(),version:1});
  const binding={capability,schemaPath:'input.json',implementationRef:ref('abh.artifact'),healthRef:ref('abh.artifact'),permissionEnvelope:manifest.permissions};
  const source:PackContentSource={refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield Uint8Array.from(bytes);}})};
  return {manifest,bytes,schema,binding,source,releaseBundle:await readFile(join(root,'release.bundle')),provenanceBundle,conformanceBundle,report,
   trust:{signer:await key('release'),provenance:{...await key('builder'),subjectName:'payload',builderId:provenance.runDetails.builder.id,buildType:provenance.buildDefinition.buildType,source:sourceIdentity},conformance}};
 }finally{await rm(root,{recursive:true,force:true});}
}
