exports.up = pgm => {
  pgm.sql(`CREATE UNIQUE INDEX tasks_active_node_key_idx
    ON core.tasks(resource_organization_id,run_id,node_key)
    WHERE deleted_at IS NULL
      AND status IN ('Pending','Ready','Running','Verifying');`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
