import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digestPackManifest} from '@abh/contracts/digest';
import {verifyPackSignature} from '../src/extensions/verify-pack-signature.ts';
import {verifyCosignBlob} from '../src/extensions/cosign-blob.ts';
import {packManifest} from './pack-fixture.ts';
const directory=new URL('./fixtures/pack-signature/',import.meta.url);
const options=()=>({deadline:Date.now()+5000,signal:new AbortController().signal});
async function fixture(){return {proof:await readFile(new URL('bundle.json',directory)),policy:{mode:'OfflinePublicKey' as const,
  executable:process.env.ABH_TEST_COSIGN??'/nonexistent/cosign',packId:'org.example.hello',publicKeyPem:await readFile(new URL('signer.pub',directory),'utf8')}};}

test('actual Cosign verifies reconstructed Pack bytes and rejects tampering, wrong keys and signature substitution',
 {skip:!process.env.ABH_TEST_COSIGN},async()=>{
  const {proof,policy}=await fixture(),manifest=await packManifest();
  assert.equal((await verifyPackSignature(manifest,proof,policy,options())).packageDigest,manifest.integrity.packageDigest);
  const changed=structuredClone(manifest);changed.metadata.version='1.0.1';const digests=await digestPackManifest(changed);
  for(const field of ['manifestDigest','artifactSetDigest','packageDigest'] as const)changed.integrity[field]=digests[field];
  await assert.rejects(verifyPackSignature(changed,proof,policy,options()),{code:'PRECONDITION_FAILED'});
  const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'}).toString();
  await assert.rejects(verifyPackSignature(manifest,proof,{...policy,publicKeyPem:other},options()),{code:'PRECONDITION_FAILED'});
  const forged=JSON.parse(proof.toString());forged.messageSignature.signature=Buffer.alloc(72).toString('base64');
  await assert.rejects(verifyPackSignature(manifest,Buffer.from(JSON.stringify(forged)),policy,options()),{code:'PRECONDITION_FAILED'});
 });

test('deployment Pack binding, format and cancellation fail before invoking Cosign',async()=>{
 const {proof,policy}=await fixture(),manifest=await packManifest();policy.executable='/nonexistent/cosign';
 await assert.rejects(verifyPackSignature(manifest,proof,{...policy,packId:'org.other.pack'},options()),{code:'FORBIDDEN'});
 await assert.rejects(verifyPackSignature(manifest,Buffer.from('{}'),policy,options()),{code:'INVALID_ARGUMENT'});
 await assert.rejects(verifyPackSignature(manifest,proof,policy,{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
});

test('stalled verifier is killed on deadline and external cancellation',async()=>{
 const {proof,policy}=await fixture(),root=await mkdtemp(join(tmpdir(),'abh-cosign-stall-'));
 try{
  const executable=join(root,'stall');await writeFile(executable,'#!/bin/sh\nwhile :; do :; done\n',{mode:0o700});
  await assert.rejects(verifyCosignBlob(new Uint8Array(),proof,{...policy,executable},{...options(),deadline:Date.now()+100}),{code:'DEPENDENCY_TIMEOUT'});
  const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),100);
  try{await assert.rejects(verifyCosignBlob(new Uint8Array(),proof,{...policy,executable},{...options(),signal:stop.signal}),{code:'DEPENDENCY_TIMEOUT'});}finally{clearTimeout(timer);}
 }finally{await rm(root,{recursive:true,force:true});}
});
