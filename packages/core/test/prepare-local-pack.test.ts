import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packManifest} from './pack-fixture.ts';
import {prepareLocalPack} from '../src/extensions/prepare-local-pack.ts';
import type {PackDeploymentPolicy} from '../src/extensions/pack-policy.ts';
const options=()=>({deadline:Date.now()+3000,signal:new AbortController().signal});
const limits={maxFileBytes:1024,maxTotalBytes:4096,maxEntries:20};
const policy=():PackDeploymentPolicy=>({abhVersion:'0.1.0',packId:'org.example.hello',allowedModes:['Declarative'],allowedLicenses:['Apache-2.0'],permissions:{dataClasses:[],purposes:[],commands:[],toolCapabilities:[],networkEgress:[],secretClasses:[]},hostProfileRefs:[],sharedNamespaces:[]});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'abh-prepared-pack-'));await mkdir(join(root,'proof'));await writeFile(join(root,'input.json'),'abc');for(const name of ['signature','source','ctk'])await writeFile(join(root,`proof/${name}.json`),'{}');return realpath(root);}
test('local Pack preparation admits policy and returns the exact verified snapshot for later trust verification',async()=>{
 const root=await fixture();try{
  const manifest=await packManifest(),config=policy(),pending=prepareLocalPack({root,manifest,policy:config,limits},options());
  manifest.metadata.id='org.changed.pack';config.allowedModes=[];
  const prepared=await pending;assert.equal(prepared.manifest().metadata.id,'org.example.hello');
  assert.equal(prepared.integrity().packageDigest,manifest.integrity.packageDigest);
  const changed=prepared.manifest();changed.metadata.version='9.0.0';assert.equal(prepared.manifest().metadata.version,'1.0.0');
  await writeFile(join(root,'input.json'),'def');const stream=await prepared.files.payload.open('input.json',options());let text='';for await(const bytes of stream)text+=new TextDecoder().decode(bytes);assert.equal(text,'abc');
  assert.equal(Object.isFrozen(prepared.files.payload),true);assert.equal(new TextDecoder().decode(prepared.files.proof('proof/ctk.json')),'{}');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('policy rejection precedes filesystem access and byte mismatch prevents candidate return',async()=>{
 const manifest=await packManifest();await assert.rejects(prepareLocalPack({root:'/nonexistent/abh-pack',manifest,policy:{...policy(),allowedModes:[]},limits},options()),{code:'FORBIDDEN'});
 const root=await fixture();try{await writeFile(join(root,'input.json'),'abd');await assert.rejects(prepareLocalPack({root,manifest,policy:policy(),limits},options()),{code:'PRECONDITION_FAILED'});}finally{await rm(root,{recursive:true,force:true});}
});
