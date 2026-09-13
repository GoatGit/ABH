exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS core.invocations (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    run_id uuid NOT NULL,task_id uuid NOT NULL,attempt_ordinal integer NOT NULL CHECK(attempt_ordinal BETWEEN 1 AND 1000),
    task_spec_digest text NOT NULL,status text NOT NULL,
    CONSTRAINT invocation_state_check CHECK (status IS NOT NULL AND status IN ('Created', 'Running', 'Succeeded', 'Failed', 'Cancelled')),
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,task_id,attempt_ordinal));
  ALTER TABLE core.invocations OWNER TO abh_core_owner;
  ALTER TABLE core.invocations ENABLE ROW LEVEL SECURITY; ALTER TABLE core.invocations FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.invocations TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON core.invocations TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.checkpoints (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    run_id uuid NOT NULL,task_id uuid NOT NULL,sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100000),
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,run_id,sequence));
  ALTER TABLE core.checkpoints OWNER TO abh_core_owner;
  ALTER TABLE core.checkpoints ENABLE ROW LEVEL SECURITY; ALTER TABLE core.checkpoints FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.checkpoints TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON core.checkpoints TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
