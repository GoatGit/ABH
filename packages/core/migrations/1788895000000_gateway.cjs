exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS core.tool_bindings (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    invocation_id uuid NOT NULL,status text NOT NULL DEFAULT 'Active',
    CONSTRAINT tool_binding_status_check CHECK (status IN ('Active','Expired','Revoked')),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.tool_bindings OWNER TO abh_core_owner;
    ALTER TABLE core.tool_bindings ENABLE ROW LEVEL SECURITY; ALTER TABLE core.tool_bindings FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.tool_bindings TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON core.tool_bindings TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.tool_calls (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    binding_id uuid NOT NULL,call_key text NOT NULL,status text NOT NULL DEFAULT 'Pending',
    CONSTRAINT tool_call_status_check CHECK (status IN ('Pending','Completed','Failed')),
    UNIQUE(resource_organization_id,binding_id,call_key),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.tool_calls OWNER TO abh_core_owner;
    ALTER TABLE core.tool_calls ENABLE ROW LEVEL SECURITY; ALTER TABLE core.tool_calls FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.tool_calls TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON core.tool_calls TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.model_routes (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.model_routes OWNER TO abh_core_owner;
    ALTER TABLE core.model_routes ENABLE ROW LEVEL SECURITY; ALTER TABLE core.model_routes FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.model_routes TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,SELECT ON core.model_routes TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.model_calls (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    route_id uuid NOT NULL,status text NOT NULL DEFAULT 'Prepared',
    CONSTRAINT model_call_status_check CHECK (status IN ('Prepared','InFlight','Completed','Failed')),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.model_calls OWNER TO abh_core_owner;
    ALTER TABLE core.model_calls ENABLE ROW LEVEL SECURITY; ALTER TABLE core.model_calls FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.model_calls TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON core.model_calls TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
