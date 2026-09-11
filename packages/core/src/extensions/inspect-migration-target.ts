import {guardMigrationConnection} from './guard-migration-connection.ts';
import type postgres from 'postgres';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {CoreError} from '../internal/errors.ts';
const used=new WeakSet<object>();
export interface MigrationInspectionTarget {connection:postgres.ReservedSql;dispose():Promise<void>}
/** Takes exclusive ownership of a fresh dedicated connection. dispose must destroy
 * its pool/socket, never release it into a shared pool. No caller transaction is
 * joined. Inspection uses query text, not the driver file loader (which dispatches
 * asynchronously outside the guarded handler). Inspection callbacks are trusted host code, not a sandbox or SQL parser.
 * Returns only after the read-only snapshot has ended and disposal is acknowledged.
 */
export async function inspectMigrationTarget<T>(tx:TenantTransaction,target:MigrationInspectionTarget,options:TransactionOptions,
 inspect:(connection:postgres.ReservedSql,options:TransactionOptions)=>Promise<T>):Promise<T>{
 const connection=target.connection,dispose=target.dispose.bind(target),run=inspect,deadline=options.deadline;
 const lifetime=new AbortController(),signal=AbortSignal.any([options.signal,tx.signal,lifetime.signal]);
 let active=true,timer:ReturnType<typeof setTimeout>|undefined,stop!:()=>void;
 const check=()=>{if(!active||signal.aborted||!Number.isSafeInteger(deadline)||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');tx.assertActive();};
 const sql=guardMigrationConnection(connection,check);
 const interrupted=new Promise<never>((_,reject)=>{stop=()=>{active=false;lifetime.abort();reject(new CoreError('DEPENDENCY_TIMEOUT'));};});
 const work=async()=>{
  check();if(used.has(connection))throw new CoreError('PRECONDITION_FAILED');used.add(connection);
  await sql.unsafe('DISCARD ALL',[],{prepare:false}).simple();check();
  await sql`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;check();
  await sql`SELECT set_config('statement_timeout',${String(Math.min(2147483647,Math.max(1,deadline-Date.now())))},true),set_config('lock_timeout','5000',true)`;
  const identity=async()=>{const [row]=await sql`SELECT pg_catalog.pg_backend_pid() AS pid,pg_catalog.transaction_timestamp()::text AS started,pg_catalog.pg_current_snapshot()::text AS snapshot,current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only`;check();if(!row||row.isolation!=='repeatable read'||row.read_only!=='on')throw new CoreError('PRECONDITION_FAILED');return JSON.stringify(row);};
  const initial=await identity(),result=await run(sql,{deadline,signal});check();
  if(await identity()!==initial)throw new CoreError('PRECONDITION_FAILED');
  await sql`ROLLBACK`;check();return result;
 };
 options.signal.addEventListener('abort',stop,{once:true});tx.signal.addEventListener('abort',stop,{once:true});
 timer=setTimeout(stop,Math.min(2147483647,Math.max(0,deadline-Date.now())));
 let result:T|undefined,error:unknown,failed=false;
 try{result=await Promise.race([work(),interrupted]);}catch(cause){failed=true;error=cause;}
 finally{active=false;lifetime.abort();clearTimeout(timer);options.signal.removeEventListener('abort',stop);tx.signal.removeEventListener('abort',stop);}
 await requireMigrationInspectionDisposal(dispose,failed?{error}:undefined);
 tx.assertActive();if(options.signal.aborted||tx.signal.aborted||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');
 return result as T;
}

/** Also used when the management transaction fails before taking target ownership. */
export async function disposeMigrationInspectionTarget(dispose:()=>Promise<void>):Promise<boolean>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 const closed=await Promise.race([Promise.resolve().then(dispose).then(()=>true,()=>false),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);
 clearTimeout(timer);return closed;
}

/** Cleanup acknowledgement is separate from the inspection outcome. No claim is
 * made that an unacknowledged target has stopped; never overwrite the first fault. */
export class MigrationInspectionCleanupError extends CoreError {
 constructor(){super('DEPENDENCY_TIMEOUT');this.name='MigrationInspectionCleanupError';}
}
export async function requireMigrationInspectionDisposal(dispose:()=>Promise<void>,prior?:{error:unknown}):Promise<void>{
 const closed=await disposeMigrationInspectionTarget(dispose);
 if(!closed){
  const cleanup=new MigrationInspectionCleanupError();
  if(prior)throw new AggregateError([prior.error,cleanup],'Inspection and target cleanup failed');
  throw cleanup;
 }
 if(prior)throw prior.error;
}
