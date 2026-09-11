exports.up = pgm => pgm.sql(`
  CREATE TABLE data.object_staging_attempts (
    resource_organization_id uuid NOT NULL,attempt_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    artifact_id uuid NOT NULL,artifact_version bigint NOT NULL CHECK(artifact_version BETWEEN 1 AND 9007199254740991),
    tracking_id uuid,tracking_version bigint CHECK(tracking_version IS NULL OR tracking_version BETWEEN 1 AND 9007199254740991),
    tracking_ref jsonb CHECK(tracking_ref IS NULL OR jsonb_typeof(tracking_ref)='object'),
    object_id uuid,object_version bigint CHECK(object_version IS NULL OR object_version BETWEEN 1 AND 9007199254740991),
    object_ref jsonb CHECK(object_ref IS NULL OR jsonb_typeof(object_ref)='object'),
    proof_id uuid,proof_version bigint CHECK(proof_version IS NULL OR proof_version BETWEEN 1 AND 9007199254740991),
    delete_idempotency_key text CHECK(delete_idempotency_key IS NULL OR length(delete_idempotency_key) BETWEEN 1 AND 200),
    status text NOT NULL,
    CONSTRAINT object_staging_status_check CHECK (status IN ('Pending','Tracked','Recorded','Ready','Published','CleanupQueued','CleanupCompleted')),
    CHECK((object_ref IS NULL)=(object_id IS NULL)),
    CHECK((object_ref IS NULL)=(object_version IS NULL)),
    CHECK((tracking_ref IS NULL)=(tracking_id IS NULL)),
    CHECK((tracking_ref IS NULL)=(tracking_version IS NULL)),
    CHECK(tracking_ref IS NULL OR ((tracking_ref->>'id')=tracking_id::text AND (tracking_ref->>'type')='abh.artifact'
      AND (tracking_ref->>'version')=tracking_version::text)),
    CHECK(object_ref IS NULL OR ((object_ref->>'id')=object_id::text AND (object_ref->>'type')='abh.stored-object'
      AND (object_ref->>'version')=object_version::text)),
    CHECK((status='Pending' AND tracking_ref IS NULL AND object_ref IS NULL)
      OR (status='Tracked' AND tracking_ref IS NOT NULL AND object_ref IS NULL)
      OR (status='Recorded' AND tracking_ref IS NULL AND object_ref IS NOT NULL)
      OR status='Published'
      OR (status IN ('Ready','CleanupQueued','CleanupCompleted') AND object_ref IS NOT NULL)),
    CHECK(status NOT IN ('CleanupQueued','CleanupCompleted') OR (object_ref IS NOT NULL AND proof_id IS NOT NULL
      AND proof_version IS NOT NULL AND delete_idempotency_key IS NOT NULL)),
    PRIMARY KEY(resource_organization_id,attempt_id),
    UNIQUE(resource_organization_id,artifact_id,artifact_version),
    UNIQUE(resource_organization_id,object_id)
  );
  CREATE INDEX object_staging_cleanup_idx ON data.object_staging_attempts
    (resource_organization_id, attempt_id) WHERE (status IN ('Tracked','Recorded','Ready','CleanupQueued'));
  ALTER TABLE data.object_staging_attempts OWNER TO abh_core_owner;
  ALTER TABLE data.object_staging_attempts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE data.object_staging_attempts FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON data.object_staging_attempts TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON data.object_staging_attempts TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
