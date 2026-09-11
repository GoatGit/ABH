import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm,symlink,link,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packManifest} from './pack-fixture.ts';
import {readLocalPackFiles} from '../src/extensions/local-pack-source.ts';
import {verifyPackContent} from '../src/extensions/verify-pack-content.ts';
const options=()=>({deadline:Date.now()+3000,signal:new AbortController().signal});
const limits={maxFileBytes:1024,maxTotalBytes:4096,maxEntries:20};
async function fixture(){const root=await mkdtemp(join(tmpdir(),'abh-pack-'));await mkdir(join(root,'proof'));await writeFile(join(root,'input.json'),'abc');for(const name of ['signature','source','ctk'])await writeFile(join(root,`proof/${name}.json`),'{}');return realpath(root);}
test('local Pack snapshots declared files and proofs, then verifies actual payload bytes',async()=>{
 const root=await fixture();try{const manifest=await packManifest(),files=await readLocalPackFiles(root,manifest,options(),limits);
 await writeFile(join(root,'input.json'),'changed');
 assert.equal((await verifyPackContent(manifest,files.payload,options(),{...limits,maxFiles:10})).packageDigest,manifest.integrity.packageDigest);
 const proof=files.proof('proof/ctk.json');proof[0]=0;assert.equal(new TextDecoder().decode(files.proof('proof/ctk.json')),'{}');
 assert.throws(()=>files.proof('input.json'));await assert.rejects(files.payload.open('proof/ctk.json',options()));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('local Pack refuses symlinks, hardlinks, undeclared and missing proof files',async()=>{
 for(const mode of ['symlink','hardlink','extra','missing']){const root=await fixture();try{
 if(mode==='extra')await writeFile(join(root,'extra'),'x');else if(mode==='missing')await rm(join(root,'proof/ctk.json'));else{await rm(join(root,'input.json'));if(mode==='symlink')await symlink('proof/ctk.json',join(root,'input.json'));else await link(join(root,'proof/ctk.json'),join(root,'input.json'));}
 await assert.rejects(readLocalPackFiles(root,await packManifest(),options(),limits));
 }finally{await rm(root,{recursive:true,force:true});}}
});
test('local Pack bounds bytes, entry count and cancellation',async()=>{
 const root=await fixture();try{const manifest=await packManifest();
 for(const bounds of [{...limits,maxFileBytes:2},{...limits,maxEntries:2},{...limits,maxTotalBytes:4,maxFileBytes:4}])await assert.rejects(readLocalPackFiles(root,manifest,options(),bounds),{code:'LIMIT_EXCEEDED'});
 await assert.rejects(readLocalPackFiles(root,manifest,{...options(),signal:AbortSignal.abort()},limits),{code:'DEPENDENCY_TIMEOUT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
