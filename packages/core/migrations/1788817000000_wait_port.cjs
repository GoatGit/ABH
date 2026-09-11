exports.up = pgm => pgm.sql(`
  CREATE TABLE runtime.wait_port_receipts (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),wait_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id));
  ALTER TABLE runtime.wait_port_receipts OWNER TO abh_core_owner;
  ALTER TABLE runtime.wait_port_receipts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.wait_port_receipts FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.wait_port_receipts TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON runtime.wait_port_receipts TO abh_runtime;

  CREATE TABLE execution.action_waits (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),wait_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,wait_id));
  ALTER TABLE execution.action_waits OWNER TO abh_core_owner;
  ALTER TABLE execution.action_waits ENABLE ROW LEVEL SECURITY;
  ALTER TABLE execution.action_waits FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON execution.action_waits TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON execution.action_waits TO abh_runtime;

`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
