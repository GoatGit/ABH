import {boundedCallback} from '../internal/bounded-callback.ts';
import {dispatchPackOnce} from './dispatch-pack-once.ts';
import type {TransportCaptureRecord} from '@abh/contracts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import type {VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';
import {dispatchOnce,type TransportObservation} from './transport.ts';
import {captureTransport,type TransportCaptureChecks} from './transport-capture.ts';

export interface CaptureDestination {
  /** Obtain a fresh independent observation Context and bounded transaction after transport completes. */
  context(options:TransactionOptions):Promise<VerifiedContext>;
  options():TransactionOptions;
  checks:TransportCaptureChecks;
}
export interface PendingTransportCapture {readonly kind:'PendingTransportCapture'}
export type DispatchCaptureResult={status:'Captured';capture:TransportCaptureRecord}|{status:'CapturePending';pending:PendingTransportCapture};
const pending=new WeakMap<PendingTransportCapture,{database:Database;observation:TransportObservation}>();

/** Retry handle is process-local and contains no printable Provider payload or credentials. Process loss recovers by query. */
export async function retryTransportCapture(handle:PendingTransportCapture,destination:CaptureDestination):Promise<DispatchCaptureResult>{
  const value=pending.get(handle);if(!value)throw new CoreError('PRECONDITION_FAILED');
  try{
    const limits={...destination.options()},refresh=destination.context.bind(destination),checks=destination.checks;
    const context=await boundedCallback(options=>refresh(options),limits);
    const capture=await captureTransport(value.database,context,limits,value.observation,checks);
    pending.delete(handle);return {status:'Captured',capture};
  }catch{return {status:'CapturePending',pending:handle};}
}

/** One committed exit, one Connector invocation, then independent durable evidence ingress. */
export async function dispatchAndCapture(args:Parameters<typeof dispatchOnce>,destination:CaptureDestination):Promise<DispatchCaptureResult>{
  const database=args[0],observation=await dispatchOnce(...args);
  return captureObserved(database,observation,destination);
}

/** Pack admission is completed before transport; persistence retries reuse only its observation. */
export async function dispatchPackAndCapture(args:Parameters<typeof dispatchPackOnce>,destination:CaptureDestination):Promise<DispatchCaptureResult>{
  const database=args[0],observation=await dispatchPackOnce(...args);
  return captureObserved(database,observation,destination);
}

function captureObserved(database:Database,observation:TransportObservation,destination:CaptureDestination):Promise<DispatchCaptureResult>{
  const handle=Object.freeze({kind:'PendingTransportCapture' as const});
  pending.set(handle,{database,observation});return retryTransportCapture(handle,destination);
}
