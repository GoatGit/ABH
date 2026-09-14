import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';
import {packManifest} from './pack-fixture.ts';
import {signPackManifest} from '../src/extensions/sign-pack-manifest.ts';
import {verifyPackSignature} from '../src/extensions/verify-pack-signature.ts';

const options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
const privateKey='-----BEGIN TEST PRIVATE KEY-----\nabc\n-----END TEST PRIVATE KEY-----\n';
const signer=(overrides:Partial<{executable:string;privateKeyPem:string;publicKeyPem:string;expectedPackId:string}>={})=>{
  return {executable:'/nonexistent/abh-cosign',privateKeyPem:privateKey,
    publicKeyPem:'-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n',expectedPackId:'org.example.hello',...overrides};
};

test('pack signing rejects identity digest key and cancellation drift before external execution',async()=>{
  const manifest=await packManifest();
  await assert.rejects(signPackManifest(manifest,signer({expectedPackId:'org.other.pack'}),options()),{code:'FORBIDDEN'});
  const changed=structuredClone(manifest);changed.integrity.packageDigest='sha256:'+'0'.repeat(64);
  await assert.rejects(signPackManifest(changed,signer(),options()),{code:'PRECONDITION_FAILED'});
  await assert.rejects(signPackManifest(manifest,signer({privateKeyPem:'not-a-key'}),options()),{code:'INVALID_ARGUMENT'});
  await assert.rejects(signPackManifest(manifest,signer(),{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
});

test('stalled signer is killed by deadline',async t=>{
  const root=await mkdtemp(join(tmpdir(),'abh-pack-sign-stall-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const executable=join(root,'stall');await writeFile(executable,'#!/bin/sh\nwhile :; do :; done\n',{mode:0o700});
  await assert.rejects(signPackManifest(await packManifest(),signer({executable}),
    {...options(),deadline:Date.now()+100}),{code:'DEPENDENCY_TIMEOUT'});
});

test('actual Cosign signing round-trips through the existing verifier',{skip:!process.env.ABH_TEST_COSIGN},async t=>{
  const root=await mkdtemp(join(tmpdir(),'abh-pack-sign-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const executable=process.env.ABH_TEST_COSIGN!,run=promisify(execFile);
  await run(executable,['generate-key-pair','--output-key-prefix',join(root,'pack')],{env:{...process.env,COSIGN_PASSWORD:''},timeout:10000});
  const manifest=await packManifest(),signed=await signPackManifest(manifest,
    {executable,privateKeyPem:await readFile(join(root,'pack.key'),'utf8'),
      publicKeyPem:await readFile(join(root,'pack.pub'),'utf8'),password:'',expectedPackId:manifest.metadata.id},options());
  assert.equal(signed.diagnostic.packageDigest,manifest.integrity.packageDigest);
  const verified=await verifyPackSignature(manifest,signed.bundle,{executable,mode:'OfflinePublicKey',
    publicKeyPem:await readFile(join(root,'pack.pub'),'utf8'),packId:manifest.metadata.id},options());
  assert.equal(verified.packageDigest,manifest.integrity.packageDigest);
  // Tamper inside the valid bundle JSON (corrupt the base64 signature) so the failure is
  // cryptographic verification, not transport parsing.
  const bundleDocument=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(signed.bundle)) as
    {messageSignature?:{signature?:string}};
  const signature=bundleDocument.messageSignature?.signature;
  assert.ok(signature&&signature.length>2);
  const replacement=signature[0]==='A'?'B':'A';
  bundleDocument.messageSignature.signature=replacement+signature.slice(1);
  const tamperedBytes=new TextEncoder().encode(JSON.stringify(bundleDocument));
  await assert.rejects(verifyPackSignature(manifest,tamperedBytes,{executable,mode:'OfflinePublicKey',
    publicKeyPem:await readFile(join(root,'pack.pub'),'utf8'),packId:manifest.metadata.id},options()),{code:'PRECONDITION_FAILED'});
});
