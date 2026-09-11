import {boundedCallback} from '../internal/bounded-callback.ts';
import {queryPackOnce} from './query-pack-once.ts';
import type {QueryCaptureRecord} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {queryOnce,type QueryObservation} from './query-transport.ts';
import {captureQuery,type QueryCaptureChecks} from './query-capture.ts';

export interface QueryCaptureDestination {
  /** Obtain a fresh independent observation Context and bounded transaction after transport completes. */
  context(options:TransactionOptions):Promise<VerifiedContext>;
  options():TransactionOptions;
  checks:QueryCaptureChecks;
}
export interface PendingQueryCapture {readonly kind:'PendingQueryCapture'}
export type QueryCaptureResult={status:'Captured';capture:QueryCaptureRecord}|{status:'CapturePending';pending:PendingQueryCapture};
const pending=new WeakMap<PendingQueryCapture,{database:Database;observation:QueryObservation}>();

/** Retry handle is process-local and contains no printable Provider payload or credentials. Process loss recovers by query. */
export async function retryQueryCapture(handle:PendingQueryCapture,destination:QueryCaptureDestination):Promise<QueryCaptureResult>{
  const value=pending.get(handle);if(!value)throw new CoreError('PRECONDITION_FAILED');
  try{
    const limits={...destination.options()},refresh=destination.context.bind(destination),checks=destination.checks;
    const context=await boundedCallback(options=>refresh(options),limits);
    const capture=await captureQuery(value.database,context,limits,value.observation,checks);
    pending.delete(handle);return {status:'Captured',capture};
  }catch{return {status:'CapturePending',pending:handle};}
}

/** One committed exit, one Connector invocation, then independent durable evidence ingress. */
export async function queryAndCapture(args:Parameters<typeof queryOnce>,destination:QueryCaptureDestination):Promise<QueryCaptureResult>{
  const database=args[0],observation=await queryOnce(...args);
  return captureObserved(database,observation,destination);
}

/** Pack admission is completed before transport; persistence retries reuse only its observation. */
export async function queryPackAndCapture(args:Parameters<typeof queryPackOnce>,destination:QueryCaptureDestination):Promise<QueryCaptureResult>{
  const database=args[0],observation=await queryPackOnce(...args);
  return captureObserved(database,observation,destination);
}

function captureObserved(database:Database,observation:QueryObservation,destination:QueryCaptureDestination):Promise<QueryCaptureResult>{
  const handle=Object.freeze({kind:'PendingQueryCapture' as const});
  pending.set(handle,{database,observation});return retryQueryCapture(handle,destination);
}
