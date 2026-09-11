import { runner } from 'node-pg-migrate';

const url = process.env.ABH_DATABASE_MIGRATION_URL;
if (!url || process.argv.length > 2) {
  console.error('Set ABH_DATABASE_MIGRATION_URL for the dedicated maintenance connection. No CLI arguments are accepted.');
  process.exitCode = 1;
} else {
  try {
    const migrations = await runner({ databaseUrl: url, dir: new URL('../migrations/', import.meta.url).pathname,
      direction: 'up', migrationsTable: 'pgmigrations', migrationsSchema: 'abh_migrations', createMigrationsSchema: true,
      log: ()=>{} });
    console.log(`Applied ${migrations.length} migrations.`);
  } catch {
    console.error('Migration failed; inspect restricted maintenance diagnostics. No runtime fallback was attempted.');
    process.exitCode = 1;
  }
}
