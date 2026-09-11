import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';

/** Snapshot a regular archive in deployment-controlled storage; never follow links or stream special files. */
export async function readPackArchive(path:string,maxBytes:number,options:TransactionOptions):Promise<Uint8Array>{
  const current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>104857600)throw new CoreError('INVALID_ARGUMENT');
  const check=()=>{if(current.signal.aborted||!Number.isFinite(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
  check();
  try{
    const expected=await lstat(path);check();
    if(!expected.isFile()||expected.nlink!==1||await realpath(path)!==path)throw new CoreError('INVALID_ARGUMENT');
    if(expected.size>maxBytes)throw new CoreError('LIMIT_EXCEEDED');
    check();const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const before=await handle.stat();check();
      if(!before.isFile()||before.nlink!==1||before.dev!==expected.dev||before.ino!==expected.ino||before.size!==expected.size||
        before.mtimeMs!==expected.mtimeMs||before.ctimeMs!==expected.ctimeMs)throw new CoreError('PRECONDITION_FAILED');
      const bytes=new Uint8Array(before.size);let offset=0;
      while(offset<bytes.length){
        check();const {bytesRead}=await handle.read(bytes,offset,Math.min(65536,bytes.length-offset),offset);
        if(!bytesRead)throw new CoreError('PRECONDITION_FAILED');offset+=bytesRead;
      }
      const after=await handle.stat();check();
      if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||after.nlink!==1)throw new CoreError('PRECONDITION_FAILED');
      return bytes;
    }finally{await handle.close();}
  }catch(error){check();if(error instanceof CoreError)throw error;throw new CoreError('INVALID_ARGUMENT');}
}
