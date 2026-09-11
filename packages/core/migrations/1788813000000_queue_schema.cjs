exports.up = pgm => pgm.sql(`
  CREATE SCHEMA abh_pgboss AUTHORIZATION abh_queue;
  REVOKE ALL ON SCHEMA abh_pgboss FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE abh_queue REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE abh_queue REVOKE USAGE ON TYPES FROM PUBLIC;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
