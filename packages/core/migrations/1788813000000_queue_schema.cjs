exports.up = pgm => pgm.sql(`
  -- The queue schema may already exist (queue role bootstraps pg-boss on first start);
  -- ownership must still be the restricted queue role either way.
  DO $migration$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'abh_pgboss') THEN
      CREATE SCHEMA abh_pgboss AUTHORIZATION abh_queue;
    ELSE
      ALTER SCHEMA abh_pgboss OWNER TO abh_queue;
    END IF;
  END $migration$;
  REVOKE ALL ON SCHEMA abh_pgboss FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE abh_queue REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE abh_queue REVOKE USAGE ON TYPES FROM PUBLIC;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
