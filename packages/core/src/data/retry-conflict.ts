import postgres from 'postgres';
import {setTimeout as delay} from 'node:timers/promises';
import type {TransactionOptions} from './uow.ts';
import {CoreError} from '../internal/errors.ts';

/** Opt-in for idempotent database workflows only. Never wrap Provider effects,
 * queue fetch/ack, or inspection attempts. The failed UoW must have settled first. */
export async function retryDatabaseConflict<T>(options:TransactionOptions,work:(options:TransactionOptions)=>Promise<T>):Promise<T>{
 const deadline=options.deadline;
 if(!Number.isSafeInteger(deadline))throw new CoreError('INVALID_ARGUMENT');
 const signal=AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,Math.min(2147483647,Math.ceil(deadline-Date.now()))))]);
 const limits={...options,deadline,signal};
 for(let retry=0;;retry++){
  if(signal.aborted||Date.now()>=deadline)throw new CoreError('DEPENDENCY_TIMEOUT');
  try{return await work(limits);}catch(error){
   if(signal.aborted||Date.now()>=deadline)throw new CoreError('DEPENDENCY_TIMEOUT');
   if(!(error instanceof postgres.PostgresError)||!['55P03','40P01','40001'].includes(error.code)||retry===3)throw error;
   const milliseconds=Math.round(1000*2**retry*(0.8+Math.random()*0.4));
   if(Date.now()+milliseconds>=deadline)throw error;
   try{await delay(milliseconds,undefined,{signal});}catch{throw new CoreError('DEPENDENCY_TIMEOUT');}
  }
 }
}
