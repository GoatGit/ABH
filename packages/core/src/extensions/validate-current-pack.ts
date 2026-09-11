import type {Digest,EntityRef,PackGovernanceSnapshot} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {validateContract} from '@abh/contracts/schema';
import type {TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {validateLocalPack,type ValidatedLocalPack} from './validate-local-pack.ts';
import {parsePackManifest} from './parse-pack-manifest.ts';

type LocalInput=Parameters<typeof validateLocalPack>[0];
const validatedCandidates=new WeakSet<object>();
/** Internal provenance guard for in-process validation results; persisted evidence requires separate authorization. */
export function requireGovernedLocalPack(value:GovernedLocalPack):void{
  if(!validatedCandidates.has(value))throw new CoreError('FORBIDDEN');
}
export type {PackGovernanceSnapshot} from '@abh/contracts';
/** Shared bounded record-shape checks; policy authorization and crypto validation remain independent. */
export function assertPackGovernanceSnapshot(value:PackGovernanceSnapshot,packId:string):void{
    if(!validateContract('PackGovernanceSnapshot',value).success||value.policy.packId!==packId)throw new CoreError('INVALID_ARGUMENT');
}
export interface PackGovernanceSource {
  /** Must read authenticated current deployment state, not a caller-provided cache. */
  current(packId:string,options:TransactionOptions):Promise<PackGovernanceSnapshot>;
}
export interface GovernedLocalPack extends ValidatedLocalPack {
  governanceRef():EntityRef;
  /** Compare this complete snapshot commitment as well as the policy Ref under the Stage transaction lock. */
  governanceDigest():Digest;
}

/** Check current deployment governance before and after expensive proof verification.
 * Stage must compare the returned governance version and digest atomically in its own transaction.
 */
export async function validateCurrentPack(input:Pick<LocalInput,'root'|'limits'>&({manifest:unknown}|{manifestDocument:{bytes:Uint8Array;format:'json'|'yaml'}}),source:PackGovernanceSource,options:TransactionOptions):Promise<GovernedLocalPack>{
  const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)};
  if('manifest' in input&&'manifestDocument' in input)throw new CoreError('INVALID_ARGUMENT');
  const location=JSON.parse(canonicalJson({root:input.root,limits:input.limits})) as Pick<LocalInput,'root'|'limits'>,read=source.current.bind(source);
  const manifest='manifestDocument' in input?await parsePackManifest(input.manifestDocument.bytes,input.manifestDocument.format,current):JSON.parse(canonicalJson(input.manifest));
  const snapshot={...location,manifest};
  const checked=validateContract('PackManifest',snapshot.manifest);
  if(!checked.success)throw new CoreError('INVALID_ARGUMENT');
  const pack=checked.data;
  async function governance(){
    const value=await boundedCallback(async opts=>JSON.parse(canonicalJson(await read(pack.metadata.id,opts))) as PackGovernanceSnapshot,current);
    assertPackGovernanceSnapshot(value,pack.metadata.id);
    if(value.revokedPackIds.includes(pack.metadata.id)||value.revokedDigests.includes(pack.integrity.packageDigest))throw new CoreError('FORBIDDEN');
    if(value.reservedVersions.some(item=>item.packId===pack.metadata.id&&item.version===pack.metadata.version&&item.packageDigest!==pack.integrity.packageDigest))throw new CoreError('PRECONDITION_FAILED');
    return value;
  }
  const before=await governance();
  const validated=await validateLocalPack({...snapshot,policy:before.policy,trust:before.trust},current);
  const after=await governance();
  if(canonicalJson(before)!==canonicalJson(after))throw new CoreError('PRECONDITION_FAILED');
  const governanceDigest=await digestBytes(new TextEncoder().encode(canonicalJson(after)));
  const report=validated.validation();
  if([report.signatureBundleDigest,report.provenanceBundleDigest,report.conformanceBundleDigest,report.conformanceReportDigest].some(digest=>after.revokedDigests.includes(digest)))throw new CoreError('FORBIDDEN');
  if(Date.parse(report.validUntil)<=Date.now())throw new CoreError('PRECONDITION_FAILED');
  if(current.signal.aborted||current.deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  const result=Object.freeze({...validated,governanceRef:()=>structuredClone(after.policyRef),governanceDigest:()=>governanceDigest});
  validatedCandidates.add(result);return result;
}
