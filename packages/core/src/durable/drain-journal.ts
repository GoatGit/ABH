import {constants} from 'node:fs';
import {open,link,unlink,mkdir,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {DrainReport} from '@abh/contracts';
import {canonicalJson} from '@abh/contracts/digest';
import {contract,inputDigest} from '../data/journal.ts';
import {CoreError} from '../internal/errors.ts';

export interface LocalDrainJournalOptions {
  /** Existing dedicated local persistent volume. Parent path is deployment-controlled, never a request field. */
  directory:string;
  resourceOrganizationId:string;
  instanceId:string;
}

/** Local operational evidence only. A durable filesystem is required; no cleanup or replay authority is implied. */
export class LocalDrainJournal {
  readonly #options:LocalDrainJournalOptions;
  constructor(options:LocalDrainJournalOptions){
    contract('UUID',options.resourceOrganizationId);contract('UUID',options.instanceId);
    if(!options.directory||options.directory.includes('\0'))throw new CoreError('INVALID_ARGUMENT');
    this.#options={...options,directory:resolve(options.directory)};
  }
  async #directory():Promise<string>{
    const root=this.#options.directory;
    if(!(await lstat(root)).isDirectory())throw new CoreError('INVALID_ARGUMENT');
    const directory=join(root,this.#options.resourceOrganizationId,this.#options.instanceId);
    // Ref-derived components cannot escape the deployment-controlled directory.
    for(const path of [join(root,this.#options.resourceOrganizationId),directory]){
      try{await mkdir(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
      if(!(await lstat(path)).isDirectory())throw new CoreError('INVALID_ARGUMENT');
      const parent=await open(resolve(path,'..'),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      try{await parent.sync();}finally{await parent.close();}
    }
    return directory;
  }
  async save(value:DrainReport):Promise<string>{
    const report=contract('DrainReport',structuredClone(value)),o=this.#options;
    const body=canonicalJson({format:'abh.local-drain.v1',resourceOrganizationId:o.resourceOrganizationId,instanceId:o.instanceId,report});
    const digest=await inputDigest(JSON.parse(body)),name=`${digest.slice(7)}.json`,directory=await this.#directory();
    const path=join(directory,name),temporary=join(directory,`.${randomUUID()}.tmp`);
    const file=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    try{
      await file.writeFile(body,'utf8');await file.sync();await file.close();
      try{await link(temporary,path);}catch(error){
        if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
        const existing=await this.#read(path);
        if(existing!==body)throw new CoreError('IDEMPOTENCY_CONFLICT');
      }
      await unlink(temporary);
      const dir=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      try{await dir.sync();}finally{await dir.close();}
      return digest;
    }finally{await file.close().catch(()=>{});await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}
  }
  async #read(path:string):Promise<string>{
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const stat=await file.stat();if(!stat.isFile()||stat.size>262144)throw new CoreError('INVALID_ARGUMENT');
      return await file.readFile('utf8');
    }finally{await file.close();}
  }
  async read(digest:string):Promise<DrainReport>{
    contract('Digest',digest);
    const o=this.#options,directory=await this.#directory(),body=await this.#read(join(directory,`${digest.slice(7)}.json`));
    let value;try{value=JSON.parse(body);}catch{throw new CoreError('INVALID_ARGUMENT');}
    if(!value||value.format!=='abh.local-drain.v1'||value.resourceOrganizationId!==o.resourceOrganizationId||value.instanceId!==o.instanceId
      ||await inputDigest(value)!==digest||Object.keys(value).sort().join(',')!=='format,instanceId,report,resourceOrganizationId')throw new CoreError('IDEMPOTENCY_CONFLICT');
    return contract('DrainReport',value.report);
  }
}
