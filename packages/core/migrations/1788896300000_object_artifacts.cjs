exports.up = pgm => pgm.sql(`
  ALTER TABLE data.artifacts ALTER COLUMN inline_body DROP NOT NULL;
  CREATE TABLE data.object_artifacts (
    resource_organization_id uuid NOT NULL,artifact_id uuid NOT NULL,artifact_version bigint NOT NULL
      CHECK(artifact_version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,object_id uuid NOT NULL,object_version bigint NOT NULL
      CHECK(object_version BETWEEN 1 AND 9007199254740991),object_ref jsonb NOT NULL CHECK(jsonb_typeof(object_ref)='object'),
    content_digest text NOT NULL CHECK(content_digest ~ '^sha256:[0-9a-f]{64}$'),
    size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 262144),media_type text NOT NULL,
    PRIMARY KEY(resource_organization_id,artifact_id,artifact_version),
    UNIQUE(resource_organization_id,object_id),
    CHECK((object_ref->>'id')=object_id::text AND (object_ref->>'type')='abh.stored-object'
      AND (object_ref->>'version')=object_version::text)
  );
  ALTER TABLE data.object_artifacts OWNER TO abh_core_owner;
  ALTER TABLE data.object_artifacts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE data.object_artifacts FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON data.object_artifacts TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON data.object_artifacts TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
