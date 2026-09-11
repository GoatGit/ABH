exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS core.runs (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    mission_id uuid NOT NULL,trigger_key text NOT NULL,status text NOT NULL,
    goal_revision bigint NOT NULL,stop_epoch bigint NOT NULL DEFAULT 0,
    CONSTRAINT run_state_check CHECK (status IS NOT NULL AND status IN ('Queued', 'Running', 'Waiting', 'Paused', 'Completed', 'Failed', 'Cancelled')),
    PRIMARY KEY(resource_organization_id,id));
  CREATE UNIQUE INDEX runs_active_trigger_idx ON core.runs(resource_organization_id,mission_id,trigger_key)
    WHERE deleted_at IS NULL AND status NOT IN ('Completed','Failed','Cancelled');
    ALTER TABLE core.runs OWNER TO abh_core_owner;
    ALTER TABLE core.runs ENABLE ROW LEVEL SECURITY; ALTER TABLE core.runs FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.runs TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON core.runs TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.tasks (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    run_id uuid NOT NULL,node_key text NOT NULL,status text NOT NULL,
    CONSTRAINT task_status_check CHECK (status IN ('Pending','Ready','Running','Verifying','Succeeded','Failed','Skipped','Cancelled')),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.tasks OWNER TO abh_core_owner;
    ALTER TABLE core.tasks ENABLE ROW LEVEL SECURITY; ALTER TABLE core.tasks FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.tasks TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON core.tasks TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
