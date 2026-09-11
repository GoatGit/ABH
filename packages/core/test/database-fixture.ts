import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { runner } from 'node-pg-migrate';
import postgres from 'postgres';
import { Database } from '../src/data/uow.ts';
import { deriveVerifiedContext } from '../src/internal/context.ts';

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
    const runtimeUrl = new URL(url); runtimeUrl.username = 'abh_runtime'; runtimeUrl.password = password;
    const queuePassword = randomBytes(24).toString('hex');
    await admin.unsafe(`ALTER ROLE abh_queue PASSWORD '${queuePassword}'`);
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
export function context(organizationId: string = randomUUID(), actorId: string = randomUUID()) {
  return deriveVerifiedContext({ requestId: randomUUID(), correlationId: randomUUID(),
    actingOrganizationId: organizationId, resourceOrganizationId: organizationId,
    actor: { type: 'Human', id: actorId }, purposeOfUse: 'abh.action.prepare', authnStrength: { level: 'SingleFactor' },
    sessionEpoch: 1, scopeEpoch: 1, receivedAt: new Date().toISOString(), contextExpiresAt: new Date(Date.now()+60_000).toISOString() });
}
export const options = () => ({ deadline: Date.now()+10_000, signal: new AbortController().signal });
