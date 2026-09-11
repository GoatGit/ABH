import {stopHttpIngress,type createHttpApp} from '@abh/adapter-fastify';
import type {DrainReport} from '@abh/contracts';
import {runProcessService,type ProcessSignalSource} from '../durable/process-service.ts';
import type {Database,TransactionOptions} from '../data/uow.ts';
import {boundedCallback} from '../internal/bounded-callback.ts';
import {CoreError} from '../internal/errors.ts';
import {createTenantRuntimeLoops,type TenantRuntimeOptions} from '../durable/runtime-host.ts';
import type {RuntimeServiceOptions} from '../durable/runtime-service.ts';

type HttpApp=ReturnType<typeof createHttpApp>;

/** Internal startup diagnostic; keep the original failure for operators without publishing it in HTTP. */
export class StartupCheckError extends Error {
  readonly checkName:string;
  constructor(checkName:string,cause:unknown){
    super(`Startup check failed: ${checkName}`,{cause});
    this.name='StartupCheckError';this.checkName=checkName;
  }
}
export interface HttpServiceOptions extends Omit<RuntimeServiceOptions,'stopIngress'> {
  /** A fully installed createCoreHttpApp/createHttpApp instance; ownership transfers to this service. */
  app:HttpApp;
  /** Directly supervised tenant workers must share the database whose lifetime this host owns. */
  tenant?:{database:Database;options:Omit<TenantRuntimeOptions,'signal'>};
  /** Explicit binding; port 0 is useful for isolated installations. */
  listen:{host:string;port:number};
  /** Read-only installed capability checks, completed before binding or starting any worker. */
  startup?:{
    timeoutMs?:number;
    checks:readonly {name:string;verify(options:TransactionOptions):Promise<void>}[];
  };
  /** Listen acknowledgement only, not a claim that business dependencies are healthy. */
  onListening?(address:string,signal:AbortSignal):Promise<void>;
}

/** Install process shutdown before listening; bind once, run installed loops, then join ingress and drain dependencies. */
export async function runHttpService(input:HttpServiceOptions,signals:ProcessSignalSource=process):Promise<DrainReport>{
  const {app}=input,listen={...input.listen},loops=[...input.loops],onListening=input.onListening;
  // Configuration errors precede transfer of dependency lifetime to the process service.
  if(typeof listen.host!=='string'||!listen.host.trim()||!Number.isSafeInteger(listen.port)||listen.port<0||listen.port>65535)throw new TypeError('Invalid HTTP listen address');
  if(input.tenant){
    if(input.tenant.database!==input.database)throw new TypeError('Tenant database must be owned by this service');
    loops.push(...createTenantRuntimeLoops(input.tenant.database,input.tenant.options));
  }
  const checks=input.startup?.checks.map(check=>({...check}))??[],timeout=input.startup?.timeoutMs??30000;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>30000||checks.length>100
    ||new Set(checks.map(check=>check.name)).size!==checks.length
    ||checks.some(check=>!/^([a-z][a-z0-9]*)([.-][a-z0-9]+)*$/.test(check.name)||check.name.length>128||typeof check.verify!=='function'))throw new TypeError('Invalid startup checks');
  let listening:Promise<string>|undefined;
  const start=(signal:AbortSignal)=>listening??=(async()=>{
    const deadline=Date.now()+timeout;
    for(const check of checks){
      try{await boundedCallback(options=>check.verify(options),{deadline,signal,readOnly:true});}
      catch(error){throw new StartupCheckError(check.name,error);}
    }
    // A late successful check must never reopen a cancelled service.
    if(signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    return app.listen(listen);
  })();
  return runProcessService({...input,stopIngress:()=>stopHttpIngress(app,listening),loops:[
    ...loops.map(loop=>async(signal:AbortSignal)=>{
      await start(signal);
      if(!signal.aborted)await loop(signal);
    }),
    async signal=>{
      const address=await start(signal);
      if(signal.aborted)return;
      await onListening?.(address,signal);
      if(!signal.aborted)await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
    },
  ]},signals);
}
