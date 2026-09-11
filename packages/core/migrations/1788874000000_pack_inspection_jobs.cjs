exports.up = pgm => pgm.sql(`
  CREATE TABLE extension.inspection_jobs (
    resource_organization_id uuid NOT NULL, id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid CHECK(workspace_id IS NULL),
    purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz CHECK(deleted_at IS NULL),
    record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    pack_id uuid NOT NULL, package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
    environment_digest text NOT NULL CHECK(environment_digest ~ '^sha256:[0-9a-f]{64}$'),
    deployment_version bigint NOT NULL CHECK(deployment_version BETWEEN 1 AND 9007199254740991),
    status text NOT NULL,
    CONSTRAINT pack_inspection_job_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Running', 'Waiting', 'Succeeded', 'Failed', 'Cancelled')),
    CONSTRAINT inspection_job_identity_check CHECK (
      (record->>'resourceOrganizationId'=resource_organization_id::text AND
       record#>>'{jobRef,type}'='abh.pack-inspection-job' AND record#>>'{jobRef,id}'=id::text AND
       record#>>'{jobRef,version}'=version::text AND record#>>'{packRef,type}'='abh.installed-pack' AND
       record#>>'{packRef,id}'=pack_id::text AND record#>>'{packRef,version}'='1' AND
       record->>'packageDigest'=package_digest AND record->>'environmentDigest'=environment_digest AND
       record->>'deploymentVersion'=deployment_version::text AND record->>'status'=status) IS TRUE),
    PRIMARY KEY(resource_organization_id,id));
  ALTER TABLE extension.inspection_jobs OWNER TO abh_core_owner;
  ALTER TABLE extension.inspection_jobs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE extension.inspection_jobs FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON extension.inspection_jobs TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid);
  GRANT SELECT,INSERT,UPDATE ON extension.inspection_jobs TO abh_runtime;
  CREATE INDEX inspection_jobs_pending_idx ON extension.inspection_jobs(resource_organization_id,id)
    WHERE status IN ('Pending','Running','Waiting');
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
