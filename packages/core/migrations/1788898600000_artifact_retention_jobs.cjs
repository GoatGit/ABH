exports.up = pgm => pgm.sql(`
  CREATE TABLE data.artifact_retention_jobs (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    artifact_id uuid NOT NULL,artifact_version bigint NOT NULL CHECK(artifact_version>=2),
    state text NOT NULL CHECK(state IN ('Pending','Deleting','Completed','Failed')),
    policy_evidence jsonb NOT NULL CHECK(jsonb_typeof(policy_evidence)='object'),
    object_ref jsonb,deletion_proof_id uuid NOT NULL,deletion_idempotency_key text NOT NULL,
    attempts bigint NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
    worker_id uuid,fencing_token bigint NOT NULL DEFAULT 0 CHECK(fencing_token>=0),
    lease_until timestamptz,receipt_ref jsonb,completed_at timestamptz,
    PRIMARY KEY(resource_organization_id,id),
    UNIQUE(resource_organization_id,artifact_id),
    CHECK(state<>'Deleting' OR worker_id IS NOT NULL AND lease_until IS NOT NULL),
    CHECK((state='Completed')=(receipt_ref IS NOT NULL AND completed_at IS NOT NULL))
  );
  CREATE INDEX artifact_retention_active_idx ON data.artifact_retention_jobs
    (resource_organization_id,state,lease_until,id) WHERE state IN ('Pending','Deleting');
  ALTER TABLE data.artifact_retention_jobs OWNER TO abh_core_owner;
  ALTER TABLE data.artifact_retention_jobs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE data.artifact_retention_jobs FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON data.artifact_retention_jobs TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON data.artifact_retention_jobs TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
