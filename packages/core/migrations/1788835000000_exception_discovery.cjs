exports.up = pgm => pgm.sql(`
  CREATE INDEX resource_fences_blocked_report ON execution.resource_fences
    (resource_organization_id,(record->'blockedByReportRef'->>'id'))
    WHERE deleted_at IS NULL;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
