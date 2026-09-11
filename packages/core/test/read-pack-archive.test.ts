import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm,symlink,link,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPackArchive} from '../src/extensions/read-pack-archive.ts';
const options=()=>({deadline:Date.now()+3000,signal:new AbortController().signal});
test('archive file snapshot rejects oversized, linked and non-regular inputs',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'abh-archive-file-'))),path=join(root,'pack.tar');
 try{
  const content=Buffer.alloc(131073,0x61);await writeFile(path,content);
  const bytes=await readPackArchive(path,content.length,options());assert.deepEqual(Buffer.from(bytes),content);
  bytes[0]=0;assert.equal((await readFile(path))[0],0x61);
  await assert.rejects(readPackArchive(path,content.length-1,options()),{code:'LIMIT_EXCEEDED'});
  await symlink(path,join(root,'symbolic'));await assert.rejects(readPackArchive(join(root,'symbolic'),content.length,options()),{code:'INVALID_ARGUMENT'});
  await link(path,join(root,'hard'));await assert.rejects(readPackArchive(path,content.length,options()),{code:'INVALID_ARGUMENT'});
  await assert.rejects(readPackArchive(root,content.length,options()),{code:'INVALID_ARGUMENT'});
  await assert.rejects(readPackArchive(join(root,'missing'),content.length,options()),{code:'INVALID_ARGUMENT'});
  await assert.rejects(readPackArchive(path,content.length,{...options(),signal:AbortSignal.abort()}),{code:'DEPENDENCY_TIMEOUT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
