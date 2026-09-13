exports.up = pgm => pgm.sql(`
  CREATE TABLE resource.units (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    name text NOT NULL,kind text NOT NULL CHECK(kind IN ('monetary','quantity')),
    precision smallint NOT NULL CHECK(precision BETWEEN 0 AND 12),
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,name));
  ALTER TABLE resource.units OWNER TO abh_core_owner;
  ALTER TABLE resource.units ENABLE ROW LEVEL SECURITY;
  ALTER TABLE resource.units FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON resource.units TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON resource.units TO abh_runtime;

  CREATE TABLE resource.periods (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,starts_at,ends_at));
  ALTER TABLE resource.periods OWNER TO abh_core_owner;
  ALTER TABLE resource.periods ENABLE ROW LEVEL SECURITY;
  ALTER TABLE resource.periods FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON resource.periods TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON resource.periods TO abh_runtime;

  CREATE TABLE resource.corrections (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    ledger_id uuid NOT NULL,source_type text NOT NULL,source_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version>0),
    PRIMARY KEY(resource_organization_id,id),
    UNIQUE(resource_organization_id,ledger_id,source_type,source_id,source_version));
  ALTER TABLE resource.corrections OWNER TO abh_core_owner;
  ALTER TABLE resource.corrections ENABLE ROW LEVEL SECURITY;
  ALTER TABLE resource.corrections FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON resource.corrections TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON resource.corrections TO abh_runtime;
`);

exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
