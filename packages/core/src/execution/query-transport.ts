import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import type {CapabilityRef,ClaimQueryExitPayload,QueryExitRecord} from '@abh/contracts';
import {canonicalJson,digestBytes,digestContract} from '@abh/contracts/digest';
import type {Database,TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {contract,executeCommand,inputDigest,type CommandIdentity} from '../data/journal.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {QueryExitOwner,type InstalledQueryPolicy} from './query-exit.ts';

/** Installed read-only transport: one request, no automatic retries or caller-supplied URL/body. */
export interface QueryTransport {
  readonly capabilityRef:CapabilityRef;
  query(input:{exit:QueryExitRecord;signal:AbortSignal}):Promise<Uint8Array>;
}
export type QueryObservation={status:'Responded';exit:QueryExitRecord;raw:Uint8Array}|{status:'Interrupted'|'TransportFailed';exit:QueryExitRecord};
const origins=new WeakMap<QueryObservation,{exitDigest:string;rawDigest?:string;status:QueryObservation['status'];observedAt:string}>();
async function observed(value:QueryObservation):Promise<QueryObservation>{
  origins.set(value,{exitDigest:value.exit.digest,status:value.status,observedAt:new Date().toISOString(),...(value.status==='Responded'?{rawDigest:await digestBytes(value.raw)}:{})});return value;
}
export async function requireQueryOrigin(value:QueryObservation){
  const origin=origins.get(value);
  if(!origin||origin.status!==value.status||origin.exitDigest!==value.exit.digest||await digestContract('QueryExitRecord',value.exit)!==origin.exitDigest
    ||(value.status==='Responded'&&await digestBytes(value.raw)!==origin.rawDigest))throw new CoreError('OPERATION_FACT_CONFLICT');
  return structuredClone(origin);
}
/** A committed exit is spent even if the process crashes; only a new authorized, budgeted command can query again. */
export async function queryOnce(database:Database,context:VerifiedContext,options:TransactionOptions,input:ClaimQueryExitPayload,policy:InstalledQueryPolicy,transport:QueryTransport,providedCommand?:CommandIdentity,admitExit?:(tx:TenantTransaction,exit:QueryExitRecord)=>Promise<void>):Promise<QueryObservation>{
  // Bind this invocation before digesting or waiting for the transaction; retain installed method receivers.
  input=structuredClone(input);options={...options};
  providedCommand=providedCommand?structuredClone(providedCommand):undefined;
  const capability=contract('CapabilityRef',structuredClone(transport.capabilityRef)),query=transport.query.bind(transport);
  const compatible=policy.compatibility,compatibility=compatible?{evidenceRef:structuredClone(compatible.evidenceRef),authorize:compatible.authorize.bind(compatible)}:undefined;
  policy={...structuredClone({policyRef:policy.policyRef,connectorRef:policy.connectorRef,cost:policy.cost,timeoutMs:policy.timeoutMs,minIntervalMs:policy.minIntervalMs}),authorize:policy.authorize.bind(policy),...(policy.fenceRefs?{fenceRefs:policy.fenceRefs.bind(policy)}:{}),...(policy.lock?{lock:policy.lock.bind(policy)}:{})};
  if(compatibility)policy={...policy,compatibility};
  const command=providedCommand??{type:'abh.operations.claim-query-exit',commandId:randomUUID(),idempotencyKey:randomUUID(),digest:await inputDigest(input)};
  if(command.type!=='abh.operations.claim-query-exit'||command.digest!==await inputDigest(input)||canonicalJson(capability)!==canonicalJson(policy.connectorRef))throw new CoreError('INVALID_ARGUMENT');
  const owner=new QueryExitOwner();let prepared:Awaited<ReturnType<QueryExitOwner['claim']>>|undefined;
  const started=performance.now();
  const result=await database.transaction(context,options,tx=>executeCommand(tx,command,async()=>{await owner.admit(tx,input,policy);},async()=>{
    prepared=await owner.claim(tx,command,input,policy);
    await admitExit?.(tx,structuredClone(prepared.exit));
    return prepared.exit.exitRef;
  }));
  if(result.replayed||!prepared)throw new CoreError('PRECONDITION_FAILED');
  const exit=prepared.exit,remaining=Math.floor(Math.min(prepared.remainingMs-(performance.now()-started),options.deadline-Date.now()));
  if(remaining<=0||options.signal.aborted)return observed({status:'Interrupted',exit});
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(remaining)]);
  let abort:()=>void=()=>{};
  const interrupted=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new CoreError('PRECONDITION_FAILED'));signal.addEventListener('abort',abort,{once:true});});
  try {
    signal.throwIfAborted();const raw=await Promise.race([query({exit:structuredClone(exit),signal}),interrupted]);
    signal.throwIfAborted();return observed({status:'Responded',exit,raw:new Uint8Array(raw)});
  }catch{return observed({status:signal.aborted?'Interrupted':'TransportFailed',exit});}
  finally{signal.removeEventListener('abort',abort);}
}
