import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';

export interface OfflineCosignKey {
  /** Deployment-controlled, pinned Cosign executable; never supplied by the Pack. */
  executable:string;
  /** Offline public-key policy explicitly does not require transparency-log evidence. */
  mode:'OfflinePublicKey';
  publicKeyPem:string;
}

/** Verify exact original bytes using Cosign, with no shell, remote key lookup or package-provided trust root. */
export async function verifyCosignBlob(payload:Uint8Array,bundle:Uint8Array,key:OfflineCosignKey,options:TransactionOptions):Promise<void>{
  return verifyCosign(payload,bundle,key,options);
}

/** Cosign verifies DSSE signatures and binds in-toto subject claims to the supplied artifact bytes. */
export async function verifyCosignAttestation(payload:Uint8Array,bundle:Uint8Array,key:OfflineCosignKey,options:TransactionOptions):Promise<void>{
  return verifyCosign(payload,bundle,key,options,'https://slsa.dev/provenance/v1');
}

/** Independently signed CTK predicate; subject remains the exact tested Pack artifact. */
export async function verifyCosignConformance(payload:Uint8Array,bundle:Uint8Array,key:OfflineCosignKey,options:TransactionOptions):Promise<void>{
  return verifyCosign(payload,bundle,key,options,'urn:abh:conformance:v1');
}

async function verifyCosign(payload:Uint8Array,bundle:Uint8Array,key:OfflineCosignKey,options:TransactionOptions,predicateType?:string):Promise<void>{
  const config={...key},current={...options,deadline:Math.min(options.deadline,Date.now()+30000)};
  if(config.mode!=='OfflinePublicKey'||!isAbsolute(config.executable)||typeof config.publicKeyPem!=='string'||
    config.publicKeyPem.length>16384||!/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\s*$/.test(config.publicKeyPem))throw new CoreError('INVALID_ARGUMENT');
  if(!(payload instanceof Uint8Array)||!(bundle instanceof Uint8Array)||payload.byteLength>1048576||bundle.byteLength>4194304)throw new CoreError('LIMIT_EXCEEDED');
  const message=Buffer.from(payload),proof=Buffer.from(bundle);
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(proof));}catch{throw new CoreError('INVALID_ARGUMENT');}
  if(!parsed||typeof parsed!=='object'||!('mediaType' in parsed)||parsed.mediaType!=='application/vnd.dev.sigstore.bundle.v0.3+json')throw new CoreError('INVALID_ARGUMENT');
  const check=()=>{if(!Number.isFinite(current.deadline)||current.deadline<=Date.now()||current.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');};
  check();
  const root=await mkdtemp(join(tmpdir(),'abh-cosign-'));
  try{
    await writeFile(join(root,'payload'),message,{mode:0o600});
    await writeFile(join(root,'bundle.json'),proof,{mode:0o600});
    await writeFile(join(root,'key.pem'),config.publicKeyPem,{mode:0o600});
    // Even --offline otherwise initializes Cosign's TUF client. No CA/log roots are authorized by this profile.
    await writeFile(join(root,'root.json'),JSON.stringify({mediaType:'application/vnd.dev.sigstore.trustedroot+json;version=0.1',
      tlogs:[],certificateAuthorities:[],ctlogs:[],timestampAuthorities:[]}),{mode:0o600});
    check();
    await new Promise<void>((resolve,reject)=>{
      // SIGKILL ensures timeout/cancellation waits for process termination before removing its files.
      const child=execFile(config.executable,[predicateType?'verify-blob-attestation':'verify-blob',...(predicateType?['--type',predicateType,'--check-claims=true']:[]),'--offline','--new-bundle-format','--trusted-root',join(root,'root.json'),'--insecure-ignore-tlog=true','--key',join(root,'key.pem'),
        '--bundle',join(root,'bundle.json'),join(root,'payload')],{
        cwd:root,env:{HOME:root,PATH:'/usr/bin:/bin',LANG:'C'},timeout:Math.max(1,current.deadline-Date.now()),
        killSignal:'SIGKILL',maxBuffer:65536,
      },error=>{
        current.signal.removeEventListener('abort',cancel);
        try{check();}catch(error){reject(error);return;}
        if(error)reject(new CoreError('PRECONDITION_FAILED'));else resolve();
      });
      const cancel=()=>{child.kill('SIGKILL');};
      current.signal.addEventListener('abort',cancel,{once:true});
      if(current.signal.aborted)cancel();
    });
  }finally{await rm(root,{recursive:true,force:true});}
}
