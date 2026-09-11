exports.up = pgm => {
  pgm.sql(`CREATE SCHEMA IF NOT EXISTS read AUTHORIZATION abh_core_owner;
    REVOKE ALL ON SCHEMA read FROM PUBLIC; GRANT USAGE ON SCHEMA read TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.learning_signals (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    signal_type text NOT NULL,
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.learning_signals OWNER TO abh_core_owner;
    ALTER TABLE core.learning_signals ENABLE ROW LEVEL SECURITY; ALTER TABLE core.learning_signals FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.learning_signals TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT ON core.learning_signals TO abh_runtime;
  CREATE TABLE IF NOT EXISTS read.projections (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id uuid,deleted_at timestamptz,
    record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    projection_type text NOT NULL,subject_id uuid NOT NULL,
    watermark bigint NOT NULL DEFAULT 0,stale boolean NOT NULL DEFAULT false,
    UNIQUE(resource_organization_id,projection_type,subject_id),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE read.projections OWNER TO abh_core_owner;
    ALTER TABLE read.projections ENABLE ROW LEVEL SECURITY; ALTER TABLE read.projections FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON read.projections TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON read.projections TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
