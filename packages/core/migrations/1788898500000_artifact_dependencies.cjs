exports.up = pgm => pgm.sql(`
  CREATE TABLE data.artifact_dependencies (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    artifact_id uuid NOT NULL,artifact_version bigint NOT NULL CHECK(artifact_version BETWEEN 2 AND 9007199254740991),
    source_ref jsonb NOT NULL CHECK(jsonb_typeof(source_ref)='object'),
    source_type text NOT NULL,source_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
    observed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(resource_organization_id,id),
    UNIQUE(resource_organization_id,artifact_id,artifact_version,source_ref),
    CHECK((source_ref->>'id')=source_id::text AND (source_ref->>'version')=source_version::text)
  );
  CREATE INDEX artifact_dependencies_reverse_idx ON data.artifact_dependencies
    (resource_organization_id,source_type,source_id,source_version,artifact_id);
  ALTER TABLE data.artifact_dependencies OWNER TO abh_core_owner;
  ALTER TABLE data.artifact_dependencies ENABLE ROW LEVEL SECURITY;
  ALTER TABLE data.artifact_dependencies FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON data.artifact_dependencies TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON data.artifact_dependencies TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
