import {checkSignedConnectorInstallation} from './signed-connector-installation.ts';
import {mkdtemp,mkdir,writeFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {PackGovernanceSnapshot} from '@abh/contracts';
import {validateCurrentPack} from '../src/extensions/validate-current-pack.ts';
import {stageLocalPackSnapshot,recoverLocalPackSnapshot} from '../src/extensions/local-pack-staging.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {digestPackManifest} from '@abh/contracts/digest';
import {signedConnectorFixture} from './signed-connector-fixture.ts';
import {verifyPackSignature} from '../src/extensions/verify-pack-signature.ts';
import {verifyPackProvenance} from '../src/extensions/verify-pack-provenance.ts';
import {verifyPackConformance} from '../src/extensions/verify-pack-conformance.ts';
import {preparePackCapabilities} from '../src/extensions/prepare-pack-capabilities.ts';
import {readCapabilitySchema} from '../src/extensions/read-capability-schema.ts';
const options=()=>({deadline:Date.now()+10000,signal:new AbortController().signal});

test('signed nonempty Connector binds independent release, provenance, CTK and actual Schema registration',{skip:!process.env.ABH_TEST_COSIGN},async t=>{
 const f=await signedConnectorFixture(process.env.ABH_TEST_COSIGN!);
 const {manifest,trust}=f;
 assert.equal(manifest.kind,'ConnectorPack');assert.equal(manifest.capabilities.provides.length,1);
 assert.equal((await verifyPackSignature(manifest,f.releaseBundle,trust.signer,options())).packageDigest,manifest.integrity.packageDigest);
 assert.equal((await verifyPackProvenance(manifest,f.provenanceBundle,trust.provenance,options())).packageDigest,manifest.integrity.packageDigest);
 assert.deepEqual(await verifyPackConformance(manifest,f.conformanceBundle,trust.conformance,options()),f.report);
 const packRef={type:'abh.installed-pack',id:randomUUID(),version:1};let schemas=0,implementations=0;
 const checks={schema:async(_binding:unknown,bytes:Uint8Array)=>{schemas++;assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)),f.schema);},implementation:async()=>{implementations++;}};
 const entries=await preparePackCapabilities(manifest,packRef,[f.binding],f.source,options(),checks);
 assert.equal(entries.length,1);assert.equal(schemas,1);assert.equal(implementations,1);assert.equal(entries[0]!.subjectDigest,manifest.integrity.packageDigest);
 assert.deepEqual(await readCapabilitySchema(manifest,entries[0]!,f.source,options()),f.bytes);
 await assert.rejects(preparePackCapabilities(manifest,packRef,[],f.source,options(),checks),{code:'PRECONDITION_FAILED'});
 await assert.rejects(preparePackCapabilities(manifest,packRef,[f.binding],{refs:['input.json'],open:async()=>({async *[Symbol.asyncIterator](){yield new TextEncoder().encode('{}');}})},options(),checks),{code:'PRECONDITION_FAILED'});
 const changed=structuredClone(manifest);changed.capabilities.provides[0]!.version='2.0.0';
 const {signaturePayload:_,...digests}=await digestPackManifest(changed);Object.assign(changed.integrity,digests);
 await assert.rejects(verifyPackSignature(changed,f.releaseBundle,trust.signer,options()),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackProvenance(changed,f.provenanceBundle,trust.provenance,options()),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackConformance(changed,f.conformanceBundle,trust.conformance,options()),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackConformance(manifest,f.conformanceBundle,{...trust.conformance,claimedCapabilities:[]},options()),{code:'PRECONDITION_FAILED'});
 await assert.rejects(verifyPackProvenance(manifest,f.provenanceBundle,{...trust.provenance,publicKeyPem:trust.signer.publicKeyPem},options()),{code:'PRECONDITION_FAILED'});
 await t.test('current validation persists nonempty signed bytes and recovers them in a fresh process',async()=>{
  const root=await mkdtemp(join(tmpdir(),'abh-nonempty-staging-'));
  try{
   const input=join(root,'input'),durable=join(root,'durable');await mkdir(join(input,'proof'),{recursive:true});await mkdir(durable,{mode:0o700});
   await writeFile(join(input,'input.json'),f.bytes);
   for(const [path,bytes] of [['signature',f.releaseBundle],['source',f.provenanceBundle],['ctk',f.conformanceBundle]] as const)await writeFile(join(input,'proof',path+'.json'),bytes);
   const governance:PackGovernanceSnapshot={policyRef:{type:'abh.pack-trust-policy',id:randomUUID(),version:1},policy:{abhVersion:'0.1.0',packId:manifest.metadata.id,allowedModes:['Declarative'],allowedLicenses:['Apache-2.0'],permissions:manifest.permissions,hostProfileRefs:[],sharedNamespaces:[]},trust,revokedPackIds:[],revokedDigests:[],reservedVersions:[]};
   const governed=await validateCurrentPack({root:await realpath(input),manifest,limits:{maxFileBytes:32768,maxTotalBytes:131072,maxEntries:20}},{current:async()=>governance},options());
   assert.equal(governed.validation().subjectDigest,manifest.integrity.packageDigest);
   const receipt=await stageLocalPackSnapshot(await realpath(durable),governed,options());
   const fresh=await promisify(execFile)(process.execPath,[new URL('./fixtures/recover-pack-snapshot.mjs',import.meta.url).pathname,await realpath(durable),JSON.stringify(receipt)],{timeout:10000,maxBuffer:1048576});
   const restarted=JSON.parse(fresh.stdout);assert.deepEqual(JSON.parse(restarted.bytes),f.schema);assert.equal(restarted.grantsTrust,false);
   assert.deepEqual(restarted.metadata.manifest,manifest);assert.deepEqual(restarted.metadata.report,governed.validation());
   const recovered=await recoverLocalPackSnapshot(await realpath(durable),receipt,options());
   const restored=await preparePackCapabilities(recovered.metadata().manifest,packRef,[f.binding],recovered.files.payload,options(),checks);
   assert.deepEqual(restored,entries);
   await checkSignedConnectorInstallation(f,root,await realpath(input),await realpath(durable),governance);
   await writeFile(join(durable,receipt.id,'payload','input.json'),'{}');
   await assert.rejects(recoverLocalPackSnapshot(await realpath(durable),receipt,options()),{code:'PRECONDITION_FAILED'});
   await assert.rejects(validateCurrentPack({root:await realpath(input),manifest,limits:{maxFileBytes:32768,maxTotalBytes:131072,maxEntries:20}},{current:async()=>({...governance,revokedPackIds:[manifest.metadata.id]})},options()),{code:'FORBIDDEN'});
  }finally{await rm(root,{recursive:true,force:true});}
 });

});
