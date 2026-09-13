import assert from 'node:assert/strict';
import {mkdir,mkdtemp,realpath,symlink,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {digestBytes,digestPackManifest} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import {buildPackManifest} from '../src/pack-build.ts';

const options=()=>({deadline:Date.now()+1000,signal:new AbortController().signal});
const draft=()=>({apiVersion:'abh.open/v1',kind:'DomainPack',
  metadata:{id:'org.example.build',version:'1.0.0',license:'Apache-2.0'},
  compatibility:{abh:'>=0.1.0 <1.0.0'},trust:{mode:'Declarative'},capabilities:{provides:[],requires:[]},
  permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},
  resources:{enforcement:'None'},artifacts:[{ref:'data.json',mediaType:'application/json'}],
  migrations:[],conformance:{suiteVersion:'1.0.0'}});

async function fixture(){
  const base=await realpath(await mkdtemp(join(tmpdir(),'abh-pack-build-'))),root=join(base,'pack');
  await mkdir(root,{recursive:true});
  const bytes=new TextEncoder().encode('{"ok":true}');await writeFile(join(root,'data.json'),bytes);
  return {root,bytes,cleanup:()=>rm(base,{recursive:true,force:true})};
}

test('builds deterministic unsigned local manifest from exact payload bytes',async t=>{
  const {root,bytes,cleanup}=await fixture();t.after(cleanup);
  const first=await buildPackManifest({root,draft:draft()},options());
  assert.equal(validateContract('PackManifest',first.manifest).success,true);
  assert.equal(first.manifest.artifacts[0]!.sizeBytes,bytes.length);
  assert.equal(first.manifest.artifacts[0]!.digest,await digestBytes(bytes));
  assert.equal(first.diagnostic.integrity.signaturePayload,await digestPackManifest(first.manifest).then(value=>value.signaturePayload));
  await rm(root,{recursive:true,force:true});await mkdir(root,{recursive:true});await writeFile(join(root,'data.json'),bytes);
  const second=await buildPackManifest({root,draft:draft()},options());
  assert.deepEqual(second.manifest,first.manifest);
});

test('rejects undeclared files links limits and unsafe drafts',async t=>{
  const {root,cleanup}=await fixture();t.after(cleanup);
  await assert.rejects(buildPackManifest({root,draft:{...draft(),integrity:{}}},options()),{code:'INVALID_ARGUMENT'});
  await writeFile(join(root,'extra.txt'),'x');
  await assert.rejects(buildPackManifest({root,draft:draft()},options()),{code:'INVALID_ARGUMENT'});
  await rm(join(root,'extra.txt'));
  await mkdir(join(root,'proof'));await writeFile(join(root,'proof/source.json'),'{}');
  await assert.rejects(buildPackManifest({root,draft:draft()},options()),{code:'INVALID_ARGUMENT'});
  await rm(join(root,'proof'),{recursive:true,force:true});
  await writeFile(join(root,'large.json'),'x'.repeat(4_194_305));
  await assert.rejects(buildPackManifest({root,draft:{...draft(),artifacts:[{ref:'large.json',mediaType:'text/plain'}]}},options()),{code:'LIMIT_EXCEEDED'});
  await rm(join(root,'large.json'));
  await symlink(join(root,'data.json'),join(root,'link.json'));
  await assert.rejects(buildPackManifest({root,draft:{...draft(),artifacts:[{ref:'link.json',mediaType:'text/plain'}]}},options()),{code:'INVALID_ARGUMENT'});
});
