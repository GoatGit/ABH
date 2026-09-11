import postgres from 'postgres';
import { validateContract } from '@abh/contracts/schema';
import type { Digest, IdentityLocationRecord } from '@abh/contracts';
import { requireVerifiedContext, type VerifiedContext } from '../internal/context.ts';
import { CoreError } from '../internal/errors.ts';
import { verifyDatabase } from './readiness.ts';
import { databaseManifest } from './manifest.ts';
import { ConnectionAdmission } from './connection-admission.ts';

type Owner = typeof databaseManifest.tables[number]['owner'];
type Parameter = postgres.ParameterOrFragment<never>;
export interface Query {
  <Rows extends postgres.Row[] = postgres.Row[]>(strings: TemplateStringsArray, ...parameters: Parameter[]): Promise<postgres.RowList<Rows>>;
}
export interface TransactionOptions {
  readonly deadline: number;
  readonly signal: AbortSignal;
  readonly readOnly?: boolean;
}

/** Scoped handle, never exported from the public package. Invalid after its UoW completes. */
export class TenantTransaction {
  readonly context: VerifiedContext;
  readonly signal: AbortSignal;
  #sql: postgres.TransactionSql;
  #active = true;
  #pending = new Set<Promise<unknown> & { cancel(): void }>();
  #lastLock = '';
  #locks = new Set<string>();
  #incomplete=new Set<symbol>();
  constructor(sql: postgres.TransactionSql, context: VerifiedContext, signal: AbortSignal) {
    this.#sql = sql; this.context = context; this.signal = signal;
  }
  assertActive(): void {
    if (!this.#active) throw new CoreError('TENANT_CONTEXT_REQUIRED');
    if (this.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
    requireVerifiedContext(this.context);
  }
  /** Composite Owner writes cannot commit until their paired owner transition consumes the issued result. */
  requireCompletion():()=>void{
    this.assertActive();const key=Symbol();this.#incomplete.add(key);
    return ()=>{this.assertActive();this.#incomplete.delete(key);};
  }
  assertComplete():void{this.assertActive();if(this.#incomplete.size)throw new CoreError('INTERNAL_ERROR');}
  owner(owner: Owner): Query {
    if (!databaseManifest.tables.some(t=>t.owner===owner)) throw new CoreError('INTERNAL_ERROR');
    return async <Rows extends postgres.Row[]>(strings: TemplateStringsArray, ...parameters: Parameter[]) => {
      this.assertActive();
      const pending = this.#sql<Rows>(strings, ...parameters);
      this.#pending.add(pending);
      try { return await pending; } finally { this.#pending.delete(pending); }
    };
  }
  /** Lock order: command dedupe, control fences, resource fences, ledgers, aggregates. */
  async lock(stage: 0 | 1 | 2 | 3 | 4, key: string, acquire: () => Promise<unknown>): Promise<void> {
    this.assertActive();
    const canonical = `${stage}:${key}`;
    if (this.#locks.has(canonical)) return;
    if (canonical < this.#lastLock) throw new CoreError('INTERNAL_ERROR');
    await acquire();
    this.#lastLock = canonical;
    this.#locks.add(canonical);
  }
  async lockMany<T>(stage: 0 | 1 | 2 | 3 | 4, keys: readonly string[], acquire: () => Promise<T>): Promise<T> {
    this.assertActive();
    const canonical=[...new Set(keys)].sort().map(key=>`${stage}:${key}`);
    const added=canonical.filter(key=>!this.#locks.has(key));
    if (added.some(key=>key<this.#lastLock)) throw new CoreError('INTERNAL_ERROR');
    const result=await acquire();
    for (const key of added) {this.#locks.add(key);this.#lastLock=key;}
    return result;
  }
  close(): void { this.#active = false; }
  async cancel(): Promise<void> {
    this.close();
    const pending = [...this.#pending];
    for (const query of pending) query.cancel();
    await Promise.allSettled(pending);
  }
}

export interface DatabaseOptions { max?: number; statementTimeoutMs?: number; lockTimeoutMs?: number }
export class Database {
  #pool: postgres.Sql;
  #statementTimeout: number;
  #lockTimeout: number;
  #admission: ConnectionAdmission;
  private constructor(pool: postgres.Sql, options: DatabaseOptions) {
    this.#pool = pool;
    this.#statementTimeout = options.statementTimeoutMs ?? 5000;
    this.#lockTimeout = options.lockTimeoutMs ?? 1000;
    this.#admission = new ConnectionAdmission(options.max ?? 10);
  }
  static async connect(url: string, options: DatabaseOptions = {}): Promise<Database> {
    const statement = options.statementTimeoutMs ?? 5000;
    const lock = options.lockTimeoutMs ?? 1000;
    if (!Number.isInteger(options.max ?? 10) || (options.max ?? 10) < 1 || (options.max ?? 10) > 1000) throw new CoreError('INVALID_ARGUMENT');
    if (!Number.isInteger(statement) || statement < 100 || statement > 30000 || !Number.isInteger(lock) || lock < 1 || lock > 5000 || lock > statement) throw new CoreError('INVALID_ARGUMENT');
    const pool = postgres(url, { max: options.max ?? 10, connect_timeout: 5, idle_timeout: 20, onnotice: () => {}, connection: { application_name: 'abh-runtime', statement_timeout: statement } });
    try { await verifyDatabase(pool); return new Database(pool, options); }
    catch (error) { await pool.end({ timeout: 1 }); throw error; }
  }
  /** Pre-context identity lookup: immutable, minimal locator fields only. Never a business query. */
  async locateIdentity(identityDigest: Digest, options: TransactionOptions): Promise<IdentityLocationRecord[]> {
    const release = await this.#admission.acquire(options);
    try { return await this.#locateIdentity(identityDigest,options); }
    finally { release(); }
  }
  async #locateIdentity(identityDigest: Digest, options: TransactionOptions): Promise<IdentityLocationRecord[]> {
    if (!validateContract('Digest',identityDigest).success) throw new CoreError('INVALID_ARGUMENT');
    if (!Number.isFinite(options.deadline) || options.deadline <= Date.now() || options.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, Math.min(options.deadline - Date.now(), this.#statementTimeout)))]);
    const pending = this.#pool`SELECT resource_organization_id,principal_id,principal_version FROM deployment.identity_locations WHERE identity_digest=${identityDigest} ORDER BY resource_organization_id LIMIT 101`;
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new CoreError('DEPENDENCY_TIMEOUT'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    let rows: postgres.RowList<postgres.Row[]>;
    try {
      rows = await Promise.race([pending, aborted]);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
    } catch (error) {
      // Cancel queued acquisition as well as an active SELECT, and consume its
      // completion before returning so the pool never retains abandoned work.
      pending.cancel();
      await Promise.allSettled([pending]);
      if (signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      throw error;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (rows.length > 100) throw new CoreError('LIMIT_EXCEEDED');
    return rows.map(row=>({identityDigest,resourceOrganizationId:row.resource_organization_id,principalRef:{type:'abh.principal',id:row.principal_id,version:Number(row.principal_version)}}));
  }
  async verify(): Promise<void> {
    const release = await this.#admission.acquire({deadline:Date.now()+30000,signal:new AbortController().signal});
    try { await verifyDatabase(this.#pool); } finally { release(); }
  }
  async close(): Promise<void> { this.#admission.close(); await this.#pool.end({ timeout: 5 }); }

  async transaction<T>(context: VerifiedContext, options: TransactionOptions, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    requireVerifiedContext(context);
    if (!Number.isFinite(options.deadline) || options.deadline <= Date.now() || options.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
    const deadline = Math.min(options.deadline, Date.parse(context.tenant.contextExpiresAt));
    const release = await this.#admission.acquire({...options,deadline});
    try {
    // begin owns one pooled connection. The callback's failure rolls back before reuse.
    return await this.#pool.begin(options.readOnly ? 'READ ONLY' : '', async sql => {
      requireVerifiedContext(context);
      const remaining = deadline - Date.now();
      if (remaining <= 0 || options.signal.aborted) throw new CoreError('DEPENDENCY_TIMEOUT');
      const [initial] = await sql`SELECT current_setting('abh.resource_organization_id', true) AS tenant`;
      if (initial?.tenant) throw new CoreError('INTERNAL_ERROR');
      const tenant = context.tenant;
      await sql`SELECT
        set_config('abh.resource_organization_id', ${tenant.resourceOrganizationId}, true),
        set_config('abh.acting_organization_id', ${tenant.actingOrganizationId}, true),
        set_config('abh.request_id', ${tenant.requestId}, true),
        set_config('abh.actor_id', ${tenant.actor.id}, true),
        set_config('abh.workspace_id', ${tenant.workspaceId ?? ''}, true),
        set_config('abh.purpose_of_use', ${tenant.purposeOfUse}, true),
        set_config('abh.session_epoch', ${String(tenant.sessionEpoch)}, true),
        set_config('abh.scope_epoch', ${String(tenant.scopeEpoch)}, true),
        set_config('statement_timeout', ${String(Math.min(remaining, this.#statementTimeout))}, true),
        set_config('lock_timeout', ${String(Math.min(remaining, this.#lockTimeout))}, true)`;
      const signal = AbortSignal.any([options.signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]);
      const tx = new TenantTransaction(sql, context, signal);
      let onAbort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => { reject(new CoreError('DEPENDENCY_TIMEOUT')); };
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
      try {
        const result = await Promise.race([Promise.resolve().then(()=>work(tx)), aborted]);
        tx.assertComplete();
        return result;
      } catch (error) {
        await tx.cancel();
        throw error;
      } finally {
        tx.close();
        signal.removeEventListener('abort', onAbort);
      }
    }) as T;
    } finally { release(); }
  }
}
