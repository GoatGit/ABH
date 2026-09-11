import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import type {CapabilityRef,ClaimDispatchExitPayload,DispatchPermitRecord,EntityRef} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {Database,type TenantTransaction,type TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {InlineArtifactOwner} from '../data/artifacts.ts';
import {DispatchAuthorizationResolver,type DispatchSourceChecks} from '../control/dispatch.ts';
import {DispatchExitOwner,type ClaimedExit} from './exit.ts';

/** Deployment-installed Connector; implementation must make one native request with SDK automatic retries disabled. */
export interface ConnectorTransport {
  readonly capabilityRef:CapabilityRef;
  send(input:{permit:DispatchPermitRecord;payload:Uint8Array;signal:AbortSignal}):Promise<Uint8Array>;
}
export type TransportObservation=
  | {status:'Responded';permit:DispatchPermitRecord;raw:Uint8Array}
  | {status:'TransportFailed'|'Interrupted';permit:DispatchPermitRecord};

export interface TransportOrigin {exitRef:EntityRef;observedAt:string;rawDigest?:string;status:TransportObservation['status'];permitDigest:string}
const origins=new WeakMap<TransportObservation,TransportOrigin>();
async function observed(claim:ClaimedExit,value:TransportObservation):Promise<TransportObservation>{
  origins.set(value,{exitRef:claim.exit.exitRef,observedAt:new Date().toISOString(),status:value.status,permitDigest:claim.permit.digest,
    ...(value.status==='Responded'?{rawDigest:await digestBytes(value.raw)}:{})});return value;
}
/** Only actual in-process observations qualify for automatic capture; authenticated remote ingress uses ReceiptOwner. */
export async function requireTransportOrigin(value:TransportObservation):Promise<Readonly<TransportOrigin>>{
  const origin=origins.get(value);
  if(!origin||origin.status!==value.status||origin.permitDigest!==value.permit.digest
    ||(value.status==='Responded'&&await digestBytes(value.raw)!==origin.rawDigest))throw new CoreError('OPERATION_FACT_CONFLICT');
  return structuredClone(origin);
}

/** Commit the one-use exit before calling the Provider. Durable replay never invokes transport again. */
export async function dispatchOnce(database:Database,context:VerifiedContext,options:TransactionOptions,value:{permitRef:EntityRef;claim:ClaimDispatchExitPayload;command?:CommandIdentity},
  resolver:DispatchAuthorizationResolver,checks:DispatchSourceChecks,connector:ConnectorTransport,admitExit?:(tx:TenantTransaction,permit:DispatchPermitRecord)=>Promise<void>):Promise<TransportObservation>{
  value=structuredClone(value);options={...options};
  const capability=contract('CapabilityRef',structuredClone(connector.capabilityRef)),send=connector.send.bind(connector),authorizeExit=resolver.authorizeExit.bind(resolver),readArtifact=checks.artifact.bind(checks);
  const finalAdmission=admitExit;
  const bindings=checks.bindings;
  checks={fenceRefs:checks.fenceRefs.bind(checks),sources:checks.sources.bind(checks),artifact:readArtifact,obligations:checks.obligations.bind(checks),target:checks.target.bind(checks),
    ...(bindings?{bindings:{outputs:bindings.outputs.bind(bindings),validate:bindings.validate.bind(bindings)}}:{})};
  const command=value.command??{type:'abh.operations.claim-exit',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest({permitRef:value.permitRef,claim:value.claim})};
  if(command.type!=='abh.operations.claim-exit')throw new CoreError('INVALID_ARGUMENT');
  let prepared:{claim:ClaimedExit;payload:Uint8Array}|undefined;
  // Subtract the entire transaction duration from database remaining time. Conservative clock skew handling can only deny an exit.
  const started=performance.now();
  const result=await database.transaction(context,options,tx=>executeCommand(tx,command,async()=>{},async()=>{
    const claim=await new DispatchExitOwner().claim(tx,command,value.permitRef,value.claim,tx=>authorizeExit(tx,command,value.permitRef,checks));
    if(canonicalJson(claim.permit.connectorRef)!==canonicalJson(capability))throw new CoreError('PIN_INPUT_CONFLICT');
    const artifact=await new InlineArtifactOwner().read(tx,claim.permit.payloadRef,record=>readArtifact(tx,record));
    if(artifact.record.contentDigest!==claim.permit.payloadDigest)throw new CoreError('ACTION_DOMAIN_INVALID');
    await finalAdmission?.(tx,structuredClone(claim.permit));
    prepared={claim,payload:new Uint8Array(artifact.bytes)};return claim.exit.exitRef;
  }));
  if(result.replayed||!prepared)throw new CoreError('PRECONDITION_FAILED');
  const remaining=Math.floor(Math.min(prepared.claim.remainingMs-(performance.now()-started),options.deadline-Date.now()));
  if(remaining<=0||options.signal.aborted) return observed(prepared.claim,{status:'Interrupted',permit:prepared.claim.permit});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(remaining)]);
  let onAbort=()=>{};
  const interrupted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));signal.addEventListener('abort',onAbort,{once:true});});
  try {
    // Invocation starts synchronously here, outside every PostgreSQL transaction. Abort cannot establish no remote effect.
    signal.throwIfAborted();
    const raw=await Promise.race([send({permit:structuredClone(prepared.claim.permit),payload:prepared.payload,signal}),interrupted]);
    signal.throwIfAborted();
    return observed(prepared.claim,{status:'Responded',permit:prepared.claim.permit,raw:new Uint8Array(raw)});
  }catch{
    // Never expose credentials or arbitrary provider exception text to logs/ordinary callers.
    return observed(prepared.claim,{status:signal.aborted?'Interrupted':'TransportFailed',permit:prepared.claim.permit});
  }finally{signal.removeEventListener('abort',onAbort);}
}
