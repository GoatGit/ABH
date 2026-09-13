exports.up = pgm => pgm.sql(`
  ALTER TABLE data.object_artifacts DROP CONSTRAINT object_artifacts_size_bytes_check;
  ALTER TABLE data.object_artifacts ADD CONSTRAINT object_artifacts_size_bytes_check
    CHECK(size_bytes BETWEEN 1 AND 9007199254740991);
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed migration.'); };
