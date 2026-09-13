exports.up = pgm => pgm.sql(`
  CREATE TABLE core.evaluation_profiles (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    asset_kind text NOT NULL,risk text NOT NULL,approved_at timestamptz NOT NULL,
    PRIMARY KEY(resource_organization_id,id));
  ALTER TABLE core.evaluation_profiles OWNER TO abh_core_owner;
  ALTER TABLE core.evaluation_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE core.evaluation_profiles FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.evaluation_profiles TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON core.evaluation_profiles TO abh_runtime;

  CREATE TABLE core.evaluation_runs (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    candidate_id uuid NOT NULL,profile_id uuid NOT NULL,status text NOT NULL,receipt_id uuid NOT NULL,result_id uuid,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,receipt_id),UNIQUE(resource_organization_id,result_id));
  ALTER TABLE core.evaluation_runs OWNER TO abh_core_owner;
  ALTER TABLE core.evaluation_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE core.evaluation_runs FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.evaluation_runs TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON core.evaluation_runs TO abh_runtime;

  CREATE TABLE core.evaluation_results (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    run_id uuid NOT NULL,status text NOT NULL,receipt_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,receipt_id),UNIQUE(resource_organization_id,run_id));
  ALTER TABLE core.evaluation_results OWNER TO abh_core_owner;
  ALTER TABLE core.evaluation_results ENABLE ROW LEVEL SECURITY;
  ALTER TABLE core.evaluation_results FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.evaluation_results TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON core.evaluation_results TO abh_runtime;

  CREATE TABLE core.learning_gates (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    candidate_id uuid NOT NULL,profile_id uuid NOT NULL,verdict text NOT NULL,receipt_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,receipt_id),UNIQUE(resource_organization_id,candidate_id));
  ALTER TABLE core.learning_gates OWNER TO abh_core_owner;
  ALTER TABLE core.learning_gates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE core.learning_gates FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.learning_gates TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON core.learning_gates TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
