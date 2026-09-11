import postgres from 'postgres';
import type {TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
import type {MigrationInspectionTarget} from './inspect-migration-target.ts';
/** Trusted deployment URL only, never Pack-provided connection configuration.
 * Owns exactly one fresh pool and reserves its sole connection. Actual direct-role,
 * database, schema and privilege admission remains mandatory in execution/inspection.
 * Acquisition cancellation destroys the pool; returned target owns it until dispose.
 */
export async function connectMigrationTarget(url:string,options:TransactionOptions):Promise<MigrationInspectionTarget>{
 const deadline=options.deadline,signal=options.signal;
 if(!Number.isSafeInteger(deadline)||deadline<=Date.now()||signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
 // Avoid surfacing a parser error containing deployment credentials.
 let parsed:URL;try{parsed=new URL(url);}catch{throw new CoreError('INVALID_ARGUMENT');}
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||parsed.pathname.length<2)throw new CoreError('INVALID_ARGUMENT');
 let expectedRole:string,expectedDatabase:string;
 try{expectedRole=decodeURIComponent(parsed.username);expectedDatabase=decodeURIComponent(parsed.pathname.slice(1));}catch{throw new CoreError('INVALID_ARGUMENT');}
 if(!expectedRole||!expectedDatabase)throw new CoreError('INVALID_ARGUMENT');
 let pool:postgres.Sql;
 try{pool=postgres(url,{max:1,connect_timeout:Math.max(1,Math.min(5,Math.ceil((deadline-Date.now())/1000))),onnotice:()=>{},connection:{application_name:'abh-pack-migration'}});}catch{throw new CoreError('INVALID_ARGUMENT');}
 let closed:Promise<void>|undefined;
 const dispose=()=>closed??=pool.end({timeout:0});
 let stop!:()=>void;
 const cancelled=new Promise<never>((_,reject)=>{stop=()=>{reject(new CoreError('DEPENDENCY_TIMEOUT'));};});
 signal.addEventListener('abort',stop,{once:true});
 const timer=setTimeout(stop,Math.min(2147483647,Math.max(0,deadline-Date.now())));
 try{
  if(signal.aborted)stop();
  const acquire=async()=>{
   const connection=await pool.reserve();
   if(signal.aborted||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
   const [identity]=await connection`SELECT session_user AS session,current_user AS actor,current_database() AS database`;
   if(!identity||identity.session!==expectedRole||identity.actor!==expectedRole||identity.database!==expectedDatabase)throw new CoreError('PRECONDITION_FAILED');
   return connection;
  };
  const connection=await Promise.race([acquire(),cancelled]);
  if(signal.aborted||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
  return {connection,dispose};
 }catch(error){
  await dispose();
  if(error instanceof CoreError)throw error;
  // Driver diagnostics can contain endpoint or authentication details.
  throw new CoreError('DEPENDENCY_UNAVAILABLE');
 }finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
}
