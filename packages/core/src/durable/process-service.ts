import type {DrainReport} from '@abh/contracts';
import {runRuntimeService,type RuntimeServiceOptions} from './runtime-service.ts';

export interface ProcessSignalSource {
  on(event:'SIGTERM'|'SIGINT',listener:()=>void):unknown;
  removeListener(event:'SIGTERM'|'SIGINT',listener:()=>void):unknown;
}

/** Install explicit signal listeners for this service lifetime, never terminate the process or change global exit handlers. */
export async function runProcessService(input:RuntimeServiceOptions,signals:ProcessSignalSource=process):Promise<DrainReport>{
  const stop=new AbortController(),terminate=()=>stop.abort(new Error('SIGTERM')),interrupt=()=>stop.abort(new Error('SIGINT'));
  const external=()=>stop.abort(input.signal.reason);
  signals.on('SIGTERM',terminate);signals.on('SIGINT',interrupt);
  input.signal.addEventListener('abort',external,{once:true});
  if(input.signal.aborted)external();
  try{return await runRuntimeService({...input,signal:stop.signal});}
  finally{
    signals.removeListener('SIGTERM',terminate);signals.removeListener('SIGINT',interrupt);
    input.signal.removeEventListener('abort',external);
  }
}
