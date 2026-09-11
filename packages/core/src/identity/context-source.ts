import type {TransactionOptions} from '../data/uow.ts';
import {requireVerifiedContext,type VerifiedContext} from '../internal/context.ts';
import {CoreError} from '../internal/errors.ts';

/** Installed ingress receives a fresh deadline and the host's cancellation signal. */
export type ContextSource = (options:TransactionOptions)=>Promise<VerifiedContext>;

export async function requestVerifiedContext(source:ContextSource,options:TransactionOptions):Promise<VerifiedContext>{
  if(!Number.isFinite(options.deadline)||options.deadline<=Date.now()||options.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
  const deadline=Math.min(options.deadline,Date.now()+30000);
  const stop=new AbortController(),cancel=()=>stop.abort(options.signal.reason);
  const timer=setTimeout(()=>stop.abort(),Math.max(1,deadline-Date.now()));
  options.signal.addEventListener('abort',cancel,{once:true});
  let onAbort=()=>{};
  const aborted=new Promise<never>((_,reject)=>{
    onAbort=()=>reject(new CoreError('DEPENDENCY_TIMEOUT'));
    stop.signal.addEventListener('abort',onAbort,{once:true});
  });
  try{
    const current=await Promise.race([Promise.resolve().then(()=>{
      if(stop.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
      return source({...options,deadline,signal:stop.signal});
    }),aborted]);
    if(stop.signal.aborted||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
    requireVerifiedContext(current);
    return current;
  }finally{
    clearTimeout(timer);
    options.signal.removeEventListener('abort',cancel);
    stop.signal.removeEventListener('abort',onAbort);
  }
}
