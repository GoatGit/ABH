import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {lstat,mkdir,open,realpath,rename,rm} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import type {Digest,EntityRef,PackManifest,PackValidationReport,LocalPackStagingReceipt} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import {contract} from '../data/journal.ts';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import {requireGovernedLocalPack,type GovernedLocalPack} from './validate-current-pack.ts';
import {readLocalPackFiles,type LocalPackFiles} from './local-pack-source.ts';
import {verifyPackContent} from './verify-pack-content.ts';

/** Persist this receipt in the installation transaction; an unreferenced snapshot is not installed. */
export type {LocalPackStagingReceipt} from '@abh/contracts';
export interface LocalPackStagingMetadata {
  manifest:PackManifest;
  report:PackValidationReport;
  governanceRef:EntityRef;
  governanceDigest:Digest;
}
export interface RecoveredLocalPackSnapshot {
  metadata():LocalPackStagingMetadata;
  files:LocalPackFiles;
}
const limits={maxFileBytes:67108864,maxTotalBytes:67108864,maxEntries:10000};
const metadataLimit=2097152;
const encoder=new TextEncoder();
function lifetime(options:TransactionOptions){
  const current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  const live=()=>{if(current.signal.aborted||!Number.isFinite(current.deadline)||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');};
  live();return {current,live};
}
async function directory(path:string){
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path||
    (stat.mode&0o077)!==0||typeof process.getuid==='function'&&stat.uid!==process.getuid())throw new CoreError('FORBIDDEN');
}
async function rootPath(root:string){
  if(!isAbsolute(root)||resolve(root)!==root)throw new CoreError('INVALID_ARGUMENT');
  await directory(root);return root;
}
async function syncDirectory(path:string){
  const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
}
async function checkMetadata(value:LocalPackStagingMetadata){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='governanceDigest,governanceRef,manifest,report')throw new CoreError('INVALID_ARGUMENT');
  const manifest=contract('PackManifest',value.manifest),report=contract('PackValidationReport',value.report);
  contract('EntityRef',value.governanceRef);contract('Digest',value.governanceDigest);
  if(value.governanceRef.type!=='abh.pack-trust-policy'||report.packId!==manifest.metadata.id||report.packVersion!==manifest.metadata.version||
    report.subjectDigest!==manifest.integrity.packageDigest||report.manifestDigest!==manifest.integrity.manifestDigest||
    report.artifactSetDigest!==manifest.integrity.artifactSetDigest||await digestContract('PackValidationReport',report)!==report.reportDigest)throw new CoreError('PRECONDITION_FAILED');
}
async function checkProofs(metadata:LocalPackStagingMetadata,files:LocalPackFiles){
  const {manifest,report}=metadata;
  for(const [ref,digest] of [[manifest.integrity.signatureRef,report.signatureBundleDigest],
    [manifest.integrity.provenanceRef,report.provenanceBundleDigest],[manifest.integrity.conformanceRef,report.conformanceBundleDigest]] as const)
    if(await digestBytes(files.proof(ref))!==digest)throw new CoreError('PRECONDITION_FAILED');
}

/** Deployment-owned durable local filesystem only. Ancestors must remain protected from concurrent writers.
 * fsync files and directories before atomic publication; never executes content or writes installation state.
 */
export async function stageLocalPackSnapshot(root:string,candidate:GovernedLocalPack,options:TransactionOptions):Promise<LocalPackStagingReceipt>{
  requireGovernedLocalPack(candidate);
  const {current,live}=lifetime(options),base=await rootPath(root);
  const metadata:LocalPackStagingMetadata={manifest:candidate.manifest(),report:candidate.validation(),governanceRef:candidate.governanceRef(),governanceDigest:candidate.governanceDigest()};
  await checkMetadata(metadata);live();
  if(Date.parse(metadata.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
  const bytes=encoder.encode(canonicalJson(metadata));if(bytes.length>metadataLimit)throw new CoreError('LIMIT_EXCEEDED');
  const receipt={id:randomUUID(),metadataDigest:await digestBytes(bytes)};
  const temporary=join(base,`.pending-${receipt.id}`),destination=join(base,receipt.id);
  await mkdir(temporary,{mode:0o700});let published=false;
  try{
    const payload=join(temporary,'payload');await mkdir(payload,{mode:0o700});
    const directories=new Set([temporary,payload]);
    async function write(path:string,content:AsyncIterable<Uint8Array>){
      const missing:string[]=[];let parent=dirname(path);
      while(!directories.has(parent)){missing.push(parent);parent=dirname(parent);}
      for(const dir of missing.reverse()){live();await mkdir(dir,{mode:0o700});directories.add(dir);}
      const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{for await(const chunk of content){live();await file.writeFile(chunk);}live();await file.sync();}finally{await file.close();}
    }
    async function* one(bytes:Uint8Array){yield bytes;}
    for(const entry of [...metadata.manifest.artifacts,...metadata.manifest.migrations]){
      live();await write(join(payload,entry.ref),await candidate.files.payload.open(entry.ref,current));
    }
    for(const ref of [metadata.manifest.integrity.signatureRef,metadata.manifest.integrity.provenanceRef,metadata.manifest.integrity.conformanceRef])
      await write(join(payload,ref),one(candidate.files.proof(ref)));
    await write(join(temporary,'metadata.json'),one(bytes));
    // Read back the actual stored snapshot before it becomes visible, including its proof hashes.
    const files=await readLocalPackFiles(payload,metadata.manifest,current,limits);
    await verifyPackContent(metadata.manifest,files.payload,current,{...limits,maxFiles:limits.maxEntries});await checkProofs(metadata,files);
    for(const dir of [...directories].sort((a,b)=>b.length-a.length)){live();await syncDirectory(dir);}
    live();if(Date.parse(metadata.report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
    await rename(temporary,destination);published=true;
    await syncDirectory(base);live();return receipt;
  }finally{
    // Once renamed, an uncertain completion remains for reconciliation; never erase potentially committed content.
    if(!published)await rm(temporary,{recursive:true,force:true});
  }
}

/** Verify a control-plane receipt against durable bytes after restart. This is content recovery, not current trust admission.
 * The caller must recheck policy, expiry, revocations and installation state before any use.
 */
export async function recoverLocalPackSnapshot(root:string,receipt:LocalPackStagingReceipt,options:TransactionOptions):Promise<RecoveredLocalPackSnapshot>{
  const {current,live}=lifetime(options);
  const input=JSON.parse(canonicalJson(receipt)) as LocalPackStagingReceipt;
  contract('UUID',input.id);contract('Digest',input.metadataDigest);
  if(Object.keys(input).sort().join(',')!=='id,metadataDigest')throw new CoreError('INVALID_ARGUMENT');
  const base=await rootPath(root),path=join(base,input.id);await directory(path);
  const metadataPath=join(path,'metadata.json'),before=await lstat(metadataPath);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>metadataLimit)throw new CoreError('INVALID_ARGUMENT');
  const file=await open(metadataPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let bytes:Uint8Array;
  try{
    const opened=await file.stat();
    if(!opened.isFile()||opened.nlink!==1||opened.ino!==before.ino||opened.dev!==before.dev||opened.size!==before.size)throw new CoreError('PRECONDITION_FAILED');
    bytes=new Uint8Array(opened.size);let offset=0;
    while(offset<bytes.length){live();const read=await file.read(bytes,offset,Math.min(65536,bytes.length-offset),offset);if(!read.bytesRead)throw new CoreError('PRECONDITION_FAILED');offset+=read.bytesRead;}
    const after=await file.stat();
    if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||after.nlink!==1)throw new CoreError('PRECONDITION_FAILED');
  }finally{await file.close();}
  live();if(await digestBytes(bytes)!==input.metadataDigest)throw new CoreError('PRECONDITION_FAILED');
  let metadata:LocalPackStagingMetadata;
  try{metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as LocalPackStagingMetadata;}catch{throw new CoreError('INVALID_ARGUMENT');}
  await checkMetadata(metadata);
  if(canonicalJson(metadata)!==new TextDecoder().decode(bytes))throw new CoreError('PRECONDITION_FAILED');
  const files=await readLocalPackFiles(join(path,'payload'),metadata.manifest,current,limits);
  await verifyPackContent(metadata.manifest,files.payload,current,{...limits,maxFiles:limits.maxEntries});await checkProofs(metadata,files);live();
  return Object.freeze({metadata:()=>structuredClone(metadata),files:Object.freeze({payload:Object.freeze(files.payload),proof:files.proof.bind(files)})});
}
