exports.up = pgm => pgm.sql(`
  CREATE TABLE runtime.waits (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),owner_type text NOT NULL,owner_id uuid NOT NULL,wait_key text NOT NULL,due_at timestamptz NOT NULL,status text NOT NULL,
    CONSTRAINT durable_wait_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Succeeded', 'Cancelled')), 
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,owner_type,owner_id,wait_key));
  CREATE INDEX waits_pending_scan ON runtime.waits(resource_organization_id,id) WHERE status='Pending' AND deleted_at IS NULL;
  ALTER TABLE runtime.waits OWNER TO abh_core_owner;
  ALTER TABLE runtime.waits ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.waits FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.waits TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON runtime.waits TO abh_runtime;

  CREATE TABLE runtime.wakeups (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),wait_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,wait_id));
  ALTER TABLE runtime.wakeups OWNER TO abh_core_owner;
  ALTER TABLE runtime.wakeups ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.wakeups FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.wakeups TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON runtime.wakeups TO abh_runtime;

`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
