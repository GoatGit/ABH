exports.up = pgm => pgm.sql(`
  CREATE INDEX responsibility_requests_pending_expiry ON human.requests
    (resource_organization_id,id,expires_at)
    WHERE deleted_at IS NULL AND status IN ('Unresolved','Open');
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
