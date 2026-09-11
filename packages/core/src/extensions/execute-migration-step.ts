import {guardMigrationConnection} from './guard-migration-connection.ts';
import type postgres from 'postgres';
import type {PackManifest,PackMigrationStep,PackMigrationAttemptRecord} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import type {TenantTransaction,TransactionOptions} from '../data/uow.ts';
import {bindMigrationExecutionResult} from './migration-execution-result.ts';
import {CoreError} from '../internal/errors.ts';
import {consumeNewMigrationClaim,type NewMigrationClaim} from './migration-journal.ts';
import {verifyRegisteredPackMigrationDatabase} from './pack-migration-database.ts';

export interface MigrationStepExecutionAdmission {
  /** Fresh governed installed content and current signatures/authority. The host
   * must hold all required fences in tx before entering this primitive. */
  prepare(record:PackMigrationAttemptRecord,signal:AbortSignal):Promise<{manifest:PackManifest;steps:readonly PackMigrationStep[];sql:string}>;
  /** Verify actual target results and current authority before COMMIT. This is
   * still not the separately persisted, signed migration verification result. */
  beforeCommit(record:PackMigrationAttemptRecord,signal:AbortSignal):Promise<void>;
}
const usedConnections=new WeakSet<object>();

/** Internal transactional SQL primitive, not a production installation Command.
 * Requires a fresh reserved direct-role connection, owned exclusively by this call;
 * dispose MUST destroy its dedicated pool/socket, never return it to a shared pool.
 * Consume only this process's original newly committed claim. No automatic retries.
 * Every failure is conservatively Unknown, including lost COMMIT acknowledgement.
 * Acknowledgement is not verification/Enable; caller must persist outcome evidence.
 */
export async function executeNewMigrationClaim(tx:TenantTransaction,target:{connection:postgres.ReservedSql;dispose():Promise<void>},options:TransactionOptions,
  claim:NewMigrationClaim,admission:MigrationStepExecutionAdmission):Promise<{kind:'CommitAcknowledged'|'OutcomeUnknown';sqlStarted:boolean;connectionClosed:boolean}>{
  const connection=target.connection,dispose=target.dispose.bind(target);
  const deadline=options.deadline,signal=options.signal;
  const lifetime=new AbortController();
  let attempt:PackMigrationAttemptRecord|undefined;
  let active=true,sqlStarted=false,timer:ReturnType<typeof setTimeout>|undefined;
  const check=()=>{if(!active||signal.aborted||lifetime.signal.aborted||deadline<=Date.now())throw new CoreError('DEPENDENCY_TIMEOUT');tx.assertActive();};
  const sql=guardMigrationConnection(connection,check);
  let stop!:()=>void;
  const interrupted=new Promise<'OutcomeUnknown'>(resolve=>{stop=()=>{active=false;lifetime.abort();resolve('OutcomeUnknown');};});
  const work=async():Promise<'CommitAcknowledged'|'OutcomeUnknown'>=>{
    try{
      check();
      if(!Number.isSafeInteger(deadline)||usedConnections.has(connection))throw new CoreError('PRECONDITION_FAILED');
      usedConnections.add(connection);
      const record=consumeNewMigrationClaim(claim);attempt=record;
      // PostgreSQL rejects DISCARD ALL in an open (including failed) transaction.
      // Do this before any host preparation: BEGIN alone would silently join a
      // caller transaction and our COMMIT could persist its unrelated writes.
      // A fresh dedicated connection has no application prepared statements.
      await sql.unsafe('DISCARD ALL',[],{prepare:false}).simple();check();
      const prepare=admission.prepare.bind(admission),beforeCommit=admission.beforeCommit.bind(admission);
      const prepared=await prepare(structuredClone(record),lifetime.signal);check();
      // Snapshot the same governed preparation that supplied the SQL, inside the
      // cleanup scope. Invalid snapshots still consume this invocation.
      const pack=JSON.parse(canonicalJson(prepared.manifest)) as PackManifest,plan=JSON.parse(canonicalJson(prepared.steps)) as PackMigrationStep[],text=prepared.sql;
      if(!record.step.transactional||record.organizationId!==tx.context.tenant.resourceOrganizationId||record.packId!==pack.metadata.id||record.packVersion!==pack.metadata.version||record.packageDigest!==pack.integrity.packageDigest||!plan.some(step=>canonicalJson(step)===canonicalJson(record.step)))throw new CoreError('PRECONDITION_FAILED');
      if(typeof text!=='string'||text.includes('\0')||Buffer.byteLength(text)>8388608||await digestBytes(new TextEncoder().encode(text))!==record.step.digest)throw new CoreError('PRECONDITION_FAILED');
      await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,async()=>{});check();
      await sql`BEGIN`;check();
      await sql`SELECT set_config('statement_timeout',${String(Math.max(1,Math.ceil(deadline-Date.now())))},true),set_config('lock_timeout','5000',true)`;check();
      const [start]=await sql`SELECT pg_current_xact_id()::text AS xid`;check();
      sqlStarted=true;
      await sql.unsafe(text,[],{prepare:false}).simple();check();
      const sameTransaction=async()=>{const [current]=await sql`SELECT pg_current_xact_id()::text AS xid`;check();if(current?.xid!==start?.xid)throw new CoreError('PRECONDITION_FAILED');};
      // Trusted/reviewed SQL still cannot silently end the transaction and produce
      // an acknowledgement for a different transaction. This is not a SQL parser.
      await sameTransaction();
      await beforeCommit(structuredClone(record),lifetime.signal);check();
      await verifyRegisteredPackMigrationDatabase(tx,sql,pack,plan,async()=>{});check();
      await sameTransaction();
      const committed=await sql`COMMIT`;check();
      if(committed.command!=='COMMIT')throw new CoreError('PRECONDITION_FAILED');
      return 'CommitAcknowledged';
    }catch{
      // Destroy the exclusive connection to roll back any still-open transaction.
      // Do not enqueue ROLLBACK on a disconnected reserved driver connection.
      // A SQL error may have followed an embedded COMMIT: never claim RolledBack.
      return 'OutcomeUnknown';
    }
  };
  signal.addEventListener('abort',stop,{once:true});tx.signal.addEventListener('abort',stop,{once:true});
  timer=setTimeout(stop,Math.min(2147483647,Math.max(0,deadline-Date.now())));
  let kind:'CommitAcknowledged'|'OutcomeUnknown'='OutcomeUnknown';
  try{kind=await Promise.race([work(),interrupted]);}
  finally{active=false;lifetime.abort();clearTimeout(timer);signal.removeEventListener('abort',stop);tx.signal.removeEventListener('abort',stop);}
  // Bound a broken host disposer; no late prepare callback can dispatch after stop.
  let closeTimer:ReturnType<typeof setTimeout>|undefined;
  const connectionClosed=await Promise.race([Promise.resolve().then(dispose).then(()=>true,()=>false),new Promise<false>(resolve=>{closeTimer=setTimeout(()=>resolve(false),1000);})]);
  clearTimeout(closeTimer);
  const result={kind,sqlStarted,connectionClosed};
  return attempt?bindMigrationExecutionResult(result,attempt):result;
}
