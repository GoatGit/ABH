import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { runner } from 'node-pg-migrate';
import postgres from 'postgres';
import { Database } from '../src/data/uow.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';
import type { EntityRef } from '@abh/contracts';

export const postgresImage = 'postgres@sha256:5a65324fe84dc41709ff914e90b07f3e2f577073ed27bf917d4873aca0c9ec51';
export async function createDatabaseFixture() {
  const name=`abh-integration-${randomUUID()}`;
  const container = await new PostgreSqlContainer(postgresImage).withName(name)
    .withDatabase('abh_test').withUsername('migration_runner').withPassword(randomBytes(24).toString('hex'))
    .withLabels({ 'abh.purpose': 'isolated-integration-test' }).start().catch(async startupError=>{
      // Testcontainers 12.1 may throw before returning a handle when host port binding fails.
      // The generated name identifies only this fixture, including that partial-start path.
      try{await promisify(execFile)('docker',['rm','-f',name],{timeout:5000});}
      catch(cleanupError){
        if(!String((cleanupError as {stderr?:string}).stderr).includes('No such container'))throw new AggregateError([startupError,cleanupError],'Test container startup and cleanup failed');
      }
      throw startupError;
    });
  const url = container.getConnectionUri();
  const admin = postgres(url, { max: 1, onnotice: ()=>{} });
  let database: Database | undefined;
  try {
    await runner({ databaseUrl: url, dir: new URL('../migrations/', import.meta.url).pathname,
      direction: 'up', migrationsTable: 'pgmigrations', migrationsSchema: 'abh_migrations', createMigrationsSchema: true,
      log: ()=>{} });
    const password = randomBytes(24).toString('hex');
    // DDL does not accept bind parameters. This value is server-generated hexadecimal only.
    await admin.unsafe(`ALTER ROLE abh_runtime PASSWORD '${password}'`);
    const queuePassword = randomBytes(24).toString('hex');
    await admin.unsafe(`ALTER ROLE abh_queue PASSWORD '${queuePassword}'`);
    const runtimeUrl = new URL(url); runtimeUrl.username = 'abh_runtime'; runtimeUrl.password = password;
    const queueUrl = new URL(url); queueUrl.username = 'abh_queue'; queueUrl.password = queuePassword;
    database = await Database.connect(runtimeUrl.toString(), { max: 1 });
    const raw = postgres(runtimeUrl.toString(), { max: 1, onnotice: ()=>{} });
    const queue = postgres(queueUrl.toString(), { max: 1, onnotice: ()=>{} });
    return { database, admin, raw, queue, runtimeUrl: runtimeUrl.toString(),queueUrl:queueUrl.toString(),
      async close() { await Promise.all([database!.close(), raw.end(), queue.end(), admin.end()]); await container.stop(); } };
  } catch (error) {
    await database?.close(); await admin.end(); await container.stop(); throw error;
  }
}
// One fixture serves a whole test file, so contexts must outlive wall-clock time of slow
// machines and full migrations; tests that need expiry construct their own short contexts.
const TEST_CONTEXT_TTL_MS = 30*60_000;
export function context(organizationId: string = randomUUID(), actorId: string = randomUUID()) {
  return deriveVerifiedContext({ requestId: randomUUID(), correlationId: randomUUID(),
    actingOrganizationId: organizationId, resourceOrganizationId: organizationId,
    actor: { type: 'Human', id: actorId }, purposeOfUse: 'abh.action.prepare', authnStrength: { level: 'SingleFactor' },
    sessionEpoch: 1, scopeEpoch: 1, receivedAt: new Date().toISOString(), contextExpiresAt: new Date(Date.now()+TEST_CONTEXT_TTL_MS).toISOString() });
}
export const options = () => ({ deadline: Date.now()+10_000, signal: new AbortController().signal });

/** Test setup helper for suites that exercise Ledger arithmetic rather than catalog admission itself. */
export async function seedLedgerCatalog(database: Database, unitOrContext: string | ReturnType<typeof context>,
  suppliedUnit?: string, currency?: string) {
  const c = typeof unitOrContext==='string'?context():unitOrContext;
  const unit = typeof unitOrContext==='string'?unitOrContext:suppliedUnit!;
  const unitId = randomUUID(), periodId = randomUUID(), recordedAt = new Date().toISOString();
  const unitRecord = {unitRef:{type:'abh.unit',id:unitId,version:1},resourceOrganizationId:c.tenant.resourceOrganizationId,
    name:unit,kind:currency?'monetary':'quantity',...(currency?{currency}:{}),precision:12,recordedAt};
  const periodRef:EntityRef & {type:'abh.period'}={type:'abh.period',id:periodId,version:1};
  const periodRecord = {periodRef,resourceOrganizationId:c.tenant.resourceOrganizationId,
    startsAt:'2020-01-01T00:00:00Z',endsAt:'2099-01-01T00:00:00Z',recordedAt};
  const existingCatalogRef=await database.transaction<EntityRef & {type:'abh.period'}>(c,options(),async tx=> {
    const existingPeriod=await tx.owner('ResourceLedger')`SELECT record FROM resource.periods
      WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`;
    if(existingPeriod[0])return (existingPeriod[0].record as {periodRef:EntityRef & {type:'abh.period'}}).periodRef;
    const existingUnit=await tx.owner('ResourceLedger')`SELECT record FROM resource.units
      WHERE resource_organization_id=${c.tenant.resourceOrganizationId} AND name=${unit} AND deleted_at IS NULL LIMIT 1`;
    if(existingUnit[0])throw new Error('Ledger unit exists without a reusable period');
    await tx.owner('ResourceLedger')`INSERT INTO resource.units
      (resource_organization_id,id,workspace_id,purpose_names,record,name,kind,precision)
      VALUES (${c.tenant.resourceOrganizationId},${unitId},${c.tenant.workspaceId??null},ARRAY[${c.tenant.purposeOfUse}],
        ${JSON.stringify(unitRecord)}::text::jsonb,${unit},${currency?'monetary':'quantity'},12)`;
    await tx.owner('ResourceLedger')`INSERT INTO resource.periods
      (resource_organization_id,id,workspace_id,purpose_names,record,starts_at,ends_at)
      VALUES (${c.tenant.resourceOrganizationId},${periodId},${c.tenant.workspaceId??null},ARRAY[${c.tenant.purposeOfUse}],
        ${JSON.stringify(periodRecord)}::text::jsonb,${periodRecord.startsAt},${periodRecord.endsAt})`;
    return periodRef;
  });
  return {periodRef:existingCatalogRef!};
}
