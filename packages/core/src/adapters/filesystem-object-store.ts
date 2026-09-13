import {createHash, randomUUID} from 'node:crypto';
import {mkdir, open as openFile, readFile, rename, rm, stat as fileStat, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {dirname, join} from 'node:path';
import {contract} from '../data/journal.ts';
import type {ArtifactRef,Digest,EntityRef,PutObjectRequest,ReadObjectRequest,StatObjectRequest,
  DeleteObjectRequest,StoredObjectRef} from '@abh/contracts';
import type {ObjectStorePort,PortCallOptions} from '@abh/contracts/ports';

type ObjectPutResult=Awaited<ReturnType<ObjectStorePort['put']>>;
type ObjectReadResult=Awaited<ReturnType<ObjectStorePort['read']>>;
type ObjectStatResult=Awaited<ReturnType<ObjectStorePort['stat']>>;
type ObjectDeleteResult=Awaited<ReturnType<ObjectStorePort['delete']>>;
type ObjectRejection=Extract<ObjectStatResult,{status:'Rejected'}>['error'];

interface PutReceipt {
  readonly objectRef:StoredObjectRef;
  readonly digest:Digest;
  readonly sizeBytes:number;
  readonly mediaType:string;
}
interface DeleteReceipt { readonly receiptRef:EntityRef }
interface ObjectMetadata extends PutReceipt {}

const safeKey=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');

function notFound(message:string):ObjectRejection {
  return {success:false,error:{code:'RESOURCE_NOT_FOUND',category:'NotFound',message,retryable:false,correlationId:randomUUID()}};
}

/** Durable single-host ObjectStore adapter: streaming writes, atomic publication and idempotent receipts. */
export class FilesystemObjectStore implements ObjectStorePort {
  readonly #root:string;

  constructor(root:string) {
    if(root.length===0||root==='/')throw new Error('object store root required');
    this.#root=root;
  }

  #objectPath(object:StoredObjectRef):string {
    return join(this.#root,'objects',object.id.slice(0,2),`${object.id}-v${object.version}`);
  }
  #putReceiptPath(request:{stagedArtifactRef:ArtifactRef;idempotencyKey:string}):string {
    return join(this.#root,'puts',request.stagedArtifactRef.id,`${safeKey(request.idempotencyKey)}.json`);
  }
  #deleteReceiptPath(request:{objectRef:StoredObjectRef;idempotencyKey:string}):string {
    return join(this.#root,'deletes',request.objectRef.id,`${safeKey(request.idempotencyKey)}.json`);
  }
  #metadataPath(object:StoredObjectRef):string {
    return join(this.#root,'metadata',object.id.slice(0,2),`${object.id}.json`);
  }

  async #readJson<T>(path:string):Promise<T|undefined> {
    try { return JSON.parse(await readFile(path,'utf8')) as T; }
    catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined; throw error; }
  }

  async #writeJsonAtomic(path:string,value:unknown):Promise<void> {
    await mkdir(dirname(path),{recursive:true});
    const temporary=`${path}.${randomUUID()}.tmp`,encoded=JSON.stringify(value);
    const metadataHandle=await openFile(temporary,'w');
    try {
      await metadataHandle.writeFile(encoded);await metadataHandle.sync();
      await rename(temporary,path);await metadataHandle.sync();
    } catch(error) { await rm(temporary,{force:true}); throw error; }
    finally { await metadataHandle.close(); }
  }

  async put(request:PutObjectRequest,options:PortCallOptions,content:AsyncIterable<Uint8Array>):Promise<ObjectPutResult> {
    const staged=contract('ArtifactRef',structuredClone(request.stagedArtifactRef));
    const receiptPath=this.#putReceiptPath({stagedArtifactRef:staged,idempotencyKey:request.idempotencyKey});
    const existing=await this.#readJson<PutReceipt>(receiptPath);
    if(existing) {
      const object=contract('StoredObjectRef',existing.objectRef);
      try {
        const file=await fileStat(this.#objectPath(object));
        if(!file.isFile())throw new Error('published object missing');
        return {status:'Completed',data:{...existing,objectRef:object}};
      } catch { await rm(receiptPath,{force:true}); }
    }

    const objectRef:StoredObjectRef={type:'abh.stored-object',id:randomUUID(),version:1};
    const objectPath=this.#objectPath(objectRef),temporary=`${objectPath}.${randomUUID()}.tmp`;
    const hash=createHash('sha256');let size=0;
    await mkdir(dirname(temporary),{recursive:true});
    const fileHandle=await openFile(temporary,'wx');
    try {
      for await(const chunk of content) {
        if(options.signal.aborted)throw new Error('object upload cancelled');
        const bytes=new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength);
        if(bytes.byteLength===0)continue;
        hash.update(bytes);await fileHandle.writeFile(bytes);size+=bytes.byteLength;
        if(!Number.isSafeInteger(size))throw new Error('object size overflow');
      }
      if(size===0||size!==request.sizeBytes)throw new Error('object size mismatch');
      const digest=`sha256:${hash.digest('hex')}`;
      if(digest!==request.digest)throw new Error('object digest mismatch');
      await fileHandle.sync();await rename(temporary,objectPath);
    } catch(error) {
      await rm(temporary,{force:true});throw error;
    } finally { await fileHandle.close(); }

    const receipt:PutReceipt={objectRef,digest:request.digest,sizeBytes:size,mediaType:request.mediaType};
    try {
      await this.#writeJsonAtomic(this.#metadataPath(objectRef),receipt);
      await this.#writeJsonAtomic(receiptPath,receipt);
    } catch { return {status:'Tracked',trackingRef:staged}; }
    return {status:'Completed',data:{...receipt,objectRef}};
  }

  async read(request:ReadObjectRequest,options:PortCallOptions):Promise<ObjectReadResult> {
    const object=contract('StoredObjectRef',structuredClone(request.objectRef));
    const path=this.#objectPath(object),metadata=await this.#readJson<ObjectMetadata>(this.#metadataPath(object));
    if(!metadata)return {status:'Rejected',error:notFound('object metadata missing')};
    try {
      const file=await fileStat(path);
      const start=request.range?.start??0,endInclusive=request.range?.endInclusive??file.size-1;
      if(!Number.isInteger(start)||!Number.isInteger(endInclusive)||start<0||start>endInclusive||endInclusive>=file.size)
        throw new Error('object range out of bounds');
      const content=createReadStream(path,{start,end:endInclusive,signal:options.signal});
      const data={object:{objectRef:object,digest:metadata.digest,sizeBytes:metadata.sizeBytes,mediaType:metadata.mediaType},
        content,...(request.range?{range:{start,endInclusive}}:{})};
      return {status:'Completed',data};
    } catch { return {status:'Rejected',error:notFound('object read failed')}; }
  }

  async stat(request:StatObjectRequest,_options:PortCallOptions):Promise<ObjectStatResult> {
    const object=contract('StoredObjectRef',structuredClone(request.objectRef));
    const metadata=await this.#readJson<ObjectMetadata>(this.#metadataPath(object)),path=this.#objectPath(object);
    if(metadata) {
      try {
        const file=await fileStat(path);
        if(file.isFile())return {status:'Completed',data:{objectRef:object,digest:metadata.digest,sizeBytes:metadata.sizeBytes,mediaType:metadata.mediaType}};
      } catch {}
    }
    return {status:'Rejected',error:notFound('object not found')};
  }

  async delete(request:DeleteObjectRequest,_options:PortCallOptions):Promise<ObjectDeleteResult> {
    const object=contract('StoredObjectRef',structuredClone(request.objectRef)),receiptPath=this.#deleteReceiptPath(request);
    const existing=await this.#readJson<DeleteReceipt>(receiptPath);
    if(existing)return {status:'Completed',data:{objectRef:object,receiptRef:existing.receiptRef}};
    const receiptRef:EntityRef={type:'abh.deletion-proof',id:request.deletionProofRef.id,version:1};
    await rm(this.#objectPath(object),{force:true});
    await this.#writeJsonAtomic(receiptPath,{receiptRef});
    return {status:'Completed',data:{objectRef:object,receiptRef}};
  }
}
