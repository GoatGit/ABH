import type postgres from 'postgres';
import {CoreError} from '../internal/errors.ts';
/** Guard both construction and deferred dispatch for locked postgres 3.4.9.
 * Host code remains trusted; file loading cannot dispatch outside this guard. */
export function guardMigrationConnection(connection:postgres.ReservedSql,check:()=>void):postgres.ReservedSql{
 // postgres 3.4.9 defers dispatch until a PendingQuery is consumed. Guard its
 // actual handler too: a query created while active may be awaited after disposal.
 const pending=new WeakSet<object>();
 const guard=(value:unknown)=>{
  if(value&&typeof value==='object'){
   const query=value as {handler?:Function;reject?:(error:unknown)=>void};
   if(typeof query.handler==='function'&&typeof query.reject==='function'&&!pending.has(value)){
    pending.add(value);
    query.handler=new Proxy(query.handler,{apply(handler,self,args){try{check();return Reflect.apply(handler,self,args);}catch(error){query.reject!(error);}}});
   }
  }
  return value;
 };
 return new Proxy(connection,{apply(fn,self,args){check();return guard(Reflect.apply(fn,self,args));},get(fn,key,receiver){if(key==='file')return ()=>{throw new CoreError('PRECONDITION_FAILED');};const value=Reflect.get(fn,key,receiver);return key==='unsafe'?new Proxy(value,{apply(method,self,args){check();return guard(Reflect.apply(method,self,args));}}):value;}});
}
