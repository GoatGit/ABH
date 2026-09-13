exports.up = pgm => pgm.sql(`
  CREATE TABLE runtime.suspension_sweeps (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    event_id uuid NOT NULL,capability_digest text NOT NULL CHECK(capability_digest ~ '^sha256:[0-9a-f]{64}$'),
    scope_id text NOT NULL,generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
    complete boolean NOT NULL,cursor_id uuid,
    PRIMARY KEY(resource_organization_id,id),
    UNIQUE(resource_organization_id,event_id,capability_digest,scope_id,generation));
  CREATE UNIQUE INDEX suspension_sweeps_active_key ON runtime.suspension_sweeps(resource_organization_id,event_id,capability_digest,scope_id)
    WHERE deleted_at IS NULL AND complete=false;
  ALTER TABLE runtime.suspension_sweeps OWNER TO abh_core_owner;
  ALTER TABLE runtime.suspension_sweeps ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.suspension_sweeps FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.suspension_sweeps TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON runtime.suspension_sweeps TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
