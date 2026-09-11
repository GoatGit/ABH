import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {digestPackManifest} from '@abh/contracts/digest';
import {verifyPackProvenance,type PackProvenancePolicy} from '../src/extensions/verify-pack-provenance.ts';
import {packManifest} from './pack-fixture.ts';
const directory=new URL('./fixtures/pack-signature/',import.meta.url);
const options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
async function fixture(){return {proof:await readFile(new URL('provenance.json',directory)),policy:{mode:'OfflinePublicKey',
 executable:process.env.ABH_TEST_COSIGN??'/nonexistent/cosign',packId:'org.example.hello',subjectName:'payload',
 publicKeyPem:await readFile(new URL('builder.pub',directory),'utf8'),builderId:'https://example.org/builders/release',buildType:'https://example.org/build/v1',
 source:{uri:'git+https://example.org/hello.git',digest:{gitCommit:'0123456789abcdef0123456789abcdef01234567'}}} satisfies PackProvenancePolicy};}

test('actual Cosign authenticates DSSE provenance and independently pins subject, builder, build type and source',
 {skip:!process.env.ABH_TEST_COSIGN},async()=>{
 const {proof,policy}=await fixture(),manifest=await packManifest();
 assert.equal((await verifyPackProvenance(manifest,proof,policy,options())).packageDigest,manifest.integrity.packageDigest);
 const changed=structuredClone(manifest);changed.metadata.version='1.0.1';const digests=await digestPackManifest(changed);
 for(const field of ['manifestDigest','artifactSetDigest','packageDigest'] as const)changed.integrity[field]=digests[field];
 await assert.rejects(verifyPackProvenance(changed,proof,policy,options()),{code:'PRECONDITION_FAILED'});
 for(const override of [{subjectName:'other'},{builderId:'https://other.example/builder'},{buildType:'https://other.example/build'},
   {source:{...policy.source,digest:{gitCommit:'ffffffffffffffffffffffffffffffffffffffff'}}},
   {source:{...policy.source,uri:'git+https://other.example/repo.git'}}])
  await assert.rejects(verifyPackProvenance(manifest,proof,{...policy,...override},options()),{code:'PRECONDITION_FAILED'});
 // A valid Pack release signature does not authorize the independent build attestation.
 const releaseKey=await readFile(new URL('signer.pub',directory),'utf8');
 await assert.rejects(verifyPackProvenance(manifest,proof,{...policy,publicKeyPem:releaseKey},options()),{code:'PRECONDITION_FAILED'});
 const forged=JSON.parse(proof.toString());const statement=JSON.parse(Buffer.from(forged.dsseEnvelope.payload,'base64').toString());
 statement.subject[0].digest.sha256='0'.repeat(64);forged.dsseEnvelope.payload=Buffer.from(JSON.stringify(statement)).toString('base64');
 await assert.rejects(verifyPackProvenance(manifest,Buffer.from(JSON.stringify(forged)),policy,options()),{code:'PRECONDITION_FAILED'});
 const mutableProof=Uint8Array.from(proof),mutablePolicy=structuredClone(policy);
 const pending=verifyPackProvenance(manifest,mutableProof,mutablePolicy,options());
 mutableProof.fill(0);mutablePolicy.source.digest.gitCommit='f'.repeat(40);
 assert.equal((await pending).packageDigest,manifest.integrity.packageDigest);
});

test('unsigned source JSON and a mismatched Pack publisher policy cannot supply provenance evidence',async()=>{
 const {proof,policy}=await fixture(),manifest=await packManifest();policy.executable='/nonexistent/cosign';
 await assert.rejects(verifyPackProvenance(manifest,Buffer.from('{"subject":[]}'),policy,options()),{code:'INVALID_ARGUMENT'});
 await assert.rejects(verifyPackProvenance(manifest,proof,{...policy,packId:'org.other.pack'},options()),{code:'FORBIDDEN'});
});
