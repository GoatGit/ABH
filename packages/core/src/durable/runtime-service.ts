import type {DrainQueueRequest,DrainReport} from '@abh/contracts';
import {validatePortRequest,validatePortResult,type DurableExecutionPort} from '@abh/contracts/ports';
import {CoreError} from '../internal/errors.ts';
import {joinRuntimeLoops} from './runtime-host.ts';

export interface RuntimeServiceOptions {
  signal:AbortSignal;
  /** Must synchronously stop accepting new commands, then resolve after admitted requests settle. */
  stopIngress?():Promise<void>;
  loops:readonly ((signal:AbortSignal)=>Promise<void>)[];
  queue:Pick<DurableExecutionPort,'drain'>&{close():Promise<void>};
  database:{close():Promise<void>};
  /** Installed admission must issue a fresh drain Context with an independent bounded deadline. */
  drainRequest():Promise<DrainQueueRequest>;
  releaseDrainRequest?(request:DrainQueueRequest):void;
  /** Persist/export the actual report before dependencies close, including undrained Ref evidence. */
  recordDrain(report:DrainReport):Promise<void>;
}

/** Owns dependency lifetime. Stop/join work, record native drain outcome, close queue, then close database. */
export async function runRuntimeService(input:RuntimeServiceOptions):Promise<DrainReport>{
  // Own the originally installed resources even if the caller later reuses its configuration object.
  // Bind Port methods to their instance so private fields and adapter state retain their receiver.
  const queue=input.queue,database=input.database;
  input={signal:input.signal,loops:[...input.loops],queue:{drain:queue.drain.bind(queue),close:queue.close.bind(queue)},
    database:{close:database.close.bind(database)},drainRequest:input.drainRequest.bind(input),recordDrain:input.recordDrain.bind(input),
    ...(input.stopIngress?{stopIngress:input.stopIngress.bind(input)}:{}),
    ...(input.releaseDrainRequest?{releaseDrainRequest:input.releaseDrainRequest.bind(input)}:{})};
  const errors:unknown[]=[];let report:DrainReport|undefined;
  const stop=new AbortController();let ingress:Promise<void>|undefined,stopping=false;
  const shutdown=()=>{
    if(stopping)return;stopping=true;
    // Invoke before aborting Workers; async request draining may continue alongside loop cleanup.
    try{ingress=Promise.resolve(input.stopIngress?.()).catch(error=>{errors.push(error);});}
    catch(error){errors.push(error);ingress=Promise.resolve();}
    stop.abort(input.signal.reason);
  };
  input.signal.addEventListener('abort',shutdown,{once:true});
  if(input.signal.aborted)shutdown();
  try{
    await joinRuntimeLoops(stop.signal,input.loops.map(loop=>async signal=>{
      try{await loop(signal);if(!signal.aborted)throw new Error('RUNTIME_LOOP_EXITED');}
      catch(error){shutdown();throw error;}
    }));
  }catch(error){errors.push(error);}
  finally{shutdown();input.signal.removeEventListener('abort',shutdown);}
  await ingress;
  let request:DrainQueueRequest|undefined;
  try{
    request=await input.drainRequest();
    if(!validatePortRequest('DurableExecutionPort.drain',request).success)throw new CoreError('INVALID_ARGUMENT');
    const milliseconds=Date.parse(request.context.deadline)-Date.now();
    if(!Number.isFinite(milliseconds)||milliseconds<=0||milliseconds>60000)throw new CoreError('INVALID_ARGUMENT');
    // The work signal is already stopped. Draining has its own live deadline and authority.
    // Port deadline ends waiting for work; allow a bounded 250 ms to return its final report.
    const signal=AbortSignal.timeout(Math.max(1,Math.ceil(milliseconds)+250));
    let abort=()=>{};
    const expired=new Promise<never>((_resolve,reject)=>{abort=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});});
    let response;
    try{response=await Promise.race([input.queue.drain(request,{signal}),expired]);}
    finally{signal.removeEventListener('abort',abort);}
    const result=validatePortResult('DurableExecutionPort.drain',response);
    if(!result.success)throw new CoreError('INTERNAL_ERROR');
    if(result.data.status!=='Completed')throw new CoreError('PRECONDITION_FAILED');
    report=result.data.data;await input.recordDrain(structuredClone(report));
  }catch(error){errors.push(error);}
  finally{if(request)try{input.releaseDrainRequest?.(request);}catch(error){errors.push(error);}}
  try{await input.queue.close();}catch(error){errors.push(error);}
  try{await input.database.close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Runtime shutdown failed',{cause:report});
  return report!;
}
