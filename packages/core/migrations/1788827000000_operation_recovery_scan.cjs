exports.up = pgm => pgm.sql(`
  CREATE INDEX operations_pending_reconciliation ON execution.operations(resource_organization_id,id)
    WHERE deleted_at IS NULL AND lifecycle IN ('Dispatching','Observing');
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
