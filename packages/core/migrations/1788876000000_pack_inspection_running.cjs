exports.up = pgm => pgm.sql(`
  CREATE UNIQUE INDEX inspection_jobs_running_pack_idx ON extension.inspection_jobs(resource_organization_id,pack_id)
    WHERE status='Running';
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
