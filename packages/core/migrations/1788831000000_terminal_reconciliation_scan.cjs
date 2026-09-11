exports.up = pgm => pgm.sql(`
  CREATE INDEX operations_closed_reconciliation ON execution.operations(resource_organization_id,id)
    WHERE lifecycle='Closed' AND deleted_at IS NULL;
  CREATE INDEX reconciliations_operation_version ON execution.reconciliations(resource_organization_id,operation_id,(record->'operationRef'->>'version'))
    WHERE deleted_at IS NULL;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
