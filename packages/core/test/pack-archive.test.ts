import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pack,type Header} from 'tar-stream';
import {gzipSync} from 'node:zlib';
import {validatePackArchive} from '../src/extensions/validate-pack-archive.ts';
export async function archiveFiles(entries:{header:Partial<Header>&{name:string};body?:string|Buffer}[]):Promise<Buffer>{
 const archive=pack(),chunks:Buffer[]=[];const read=(async()=>{for await(const chunk of archive){assert.ok(Buffer.isBuffer(chunk));chunks.push(Buffer.from(chunk));}})();
 for(const {header,body} of entries)archive.entry(header,body??'');archive.finalize();await read;return Buffer.concat(chunks);
}
test('archive rejects traversal, links, aliases, duplicates, unsupported files and expansion limits before governance',async()=>{
 const limits={maxArchiveBytes:1048576,maxExpandedBytes:1048576,maxFileBytes:65536,maxTotalBytes:131072,maxEntries:20};
 let calls=0;const source={async current():Promise<never>{calls++;throw Error('must not read governance');}};
 const run=(bytes:Buffer,format:'tar'|'tar.gz'='tar',bounds=limits)=>validatePackArchive({bytes,format,manifest:{ref:'manifest.json',format:'json'},limits:bounds},source,{deadline:Date.now()+3000,signal:new AbortController().signal});
 for(const entries of [
  [{header:{name:'../escape'},body:'x'}],
  [{header:{name:'/absolute'},body:'x'}],
  [{header:{name:'link',type:'symlink' as const,linkname:'/tmp'}}],
  [{header:{name:'link',type:'link' as const,linkname:'file'}}],
  [{header:{name:'a'},body:'x'},{header:{name:'a'},body:'y'}],
  [{header:{name:'A'},body:'x'},{header:{name:'a'},body:'y'}],
  [{header:{name:'file',type:'fifo' as const}}],
 ])await assert.rejects(run(await archiveFiles(entries)),{code:'INVALID_ARGUMENT'});
 const large=await archiveFiles([{header:{name:'large'},body:Buffer.alloc(65536)}]);
 await assert.rejects(run(gzipSync(large),'tar.gz',{...limits,maxExpandedBytes:1024}),{code:'LIMIT_EXCEEDED'});
 await assert.rejects(run(large,'tar',{...limits,maxFileBytes:10}),{code:'LIMIT_EXCEEDED'});
  await assert.rejects(run(large.subarray(0,600)));
  await assert.rejects(run(large.subarray(0,large.length-1024)),{code:'INVALID_ARGUMENT'});
  await assert.rejects(run(large.subarray(0,large.length-512)),{code:'INVALID_ARGUMENT'});
  assert.equal(calls,0);
});
test('PAX metadata before or after payload cannot bypass the archive entry budget',async()=>{
 const pax=await archiveFiles([{header:{name:'file',pax:{comment:'metadata'}},body:'x'}]);
 // One PAX header + its padded body, followed by the regular file header/body and terminator.
 const metadata=pax.subarray(0,1024);
 assert.equal(String.fromCharCode(metadata[156]!), 'x');
 const limits={maxArchiveBytes:1048576,maxExpandedBytes:1048576,maxFileBytes:65536,maxTotalBytes:131072,maxEntries:2};
 let calls=0;const source={async current():Promise<never>{calls++;throw Error('must not read governance');}};
 for(const bytes of [pax,Buffer.concat([metadata,metadata,pax.subarray(1024)]),
   Buffer.concat([pax.subarray(1024,-1024),metadata,Buffer.alloc(1024)])])
  await assert.rejects(validatePackArchive({bytes,format:'tar',manifest:{ref:'manifest.json',format:'json'},limits},source,
   {deadline:Date.now()+3000,signal:new AbortController().signal}),{code:'LIMIT_EXCEEDED'});
 assert.equal(calls,0);
});
test('archive cancellation aborts extraction before governance',async()=>{
 const bytes=gzipSync(await archiveFiles([{header:{name:'large'},body:Buffer.alloc(1048576)}]));
 const stop=new AbortController();let calls=0;
 const pending=validatePackArchive({bytes,format:'tar.gz',manifest:{ref:'manifest.json',format:'json'},
  limits:{maxArchiveBytes:1048576,maxExpandedBytes:2097152,maxFileBytes:1048576,maxTotalBytes:2097152,maxEntries:20}},
  {async current():Promise<never>{calls++;throw Error();}},{deadline:Date.now()+3000,signal:stop.signal});
 stop.abort();await assert.rejects(pending,{code:'DEPENDENCY_TIMEOUT'});assert.equal(calls,0);
});
