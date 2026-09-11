exports.up = pgm => pgm.sql(`
  CREATE TABLE runtime.outbox_routings (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),event_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,event_id));
  ALTER TABLE runtime.outbox_routings OWNER TO abh_core_owner;
  ALTER TABLE runtime.outbox_routings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.outbox_routings FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.outbox_routings TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON runtime.outbox_routings TO abh_runtime;

  CREATE TABLE runtime.outbox_deliveries (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),routing_id uuid NOT NULL,consumer_id text NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,routing_id,consumer_id));
  ALTER TABLE runtime.outbox_deliveries OWNER TO abh_core_owner;
  ALTER TABLE runtime.outbox_deliveries ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.outbox_deliveries FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.outbox_deliveries TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON runtime.outbox_deliveries TO abh_runtime;

  CREATE TABLE runtime.outbox_publications (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),routing_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,routing_id));
  ALTER TABLE runtime.outbox_publications OWNER TO abh_core_owner;
  ALTER TABLE runtime.outbox_publications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.outbox_publications FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.outbox_publications TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON runtime.outbox_publications TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
