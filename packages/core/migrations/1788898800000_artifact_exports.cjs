exports.up = pgm => pgm.sql(`
  CREATE TABLE data.artifact_exports (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    state text NOT NULL CHECK(state IN ('Pending','Running','Completed','Failed','Expired')),
    scope_ref jsonb NOT NULL CHECK(jsonb_typeof(scope_ref)='object'),
    evidence_ref jsonb NOT NULL CHECK(jsonb_typeof(evidence_ref)='object'),
    redaction_policy_ref jsonb,manifest_ref jsonb,watermark timestamptz,
    manifest_digest text CHECK(manifest_digest IS NULL OR manifest_digest ~ '^sha256:[0-9a-f]{64}$'),
    file_count bigint NOT NULL DEFAULT 0 CHECK(file_count>=0),
    output_bytes bigint NOT NULL DEFAULT 0 CHECK(output_bytes>=0),
    error_code text,worker_id uuid,fencing_token bigint NOT NULL DEFAULT 0 CHECK(fencing_token>=0),
    lease_until timestamptz,expires_at timestamptz,completed_at timestamptz,
    PRIMARY KEY(resource_organization_id,id),
    CHECK(state<>'Running' OR worker_id IS NOT NULL AND lease_until IS NOT NULL),
    CHECK((state='Completed')=(manifest_ref IS NOT NULL AND manifest_digest IS NOT NULL AND watermark IS NOT NULL
      AND completed_at IS NOT NULL)),
    CHECK(state<>'Failed' OR error_code IS NOT NULL)
  );
  CREATE INDEX artifact_exports_worker_idx ON data.artifact_exports
    (resource_organization_id,state,lease_until,id) WHERE state IN ('Pending','Running');
  CREATE INDEX artifact_exports_expiry_idx ON data.artifact_exports
    (resource_organization_id,expires_at) WHERE state IN ('Pending','Running','Completed');
  ALTER TABLE data.artifact_exports OWNER TO abh_core_owner;
  ALTER TABLE data.artifact_exports ENABLE ROW LEVEL SECURITY;
  ALTER TABLE data.artifact_exports FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON data.artifact_exports TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON data.artifact_exports TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
