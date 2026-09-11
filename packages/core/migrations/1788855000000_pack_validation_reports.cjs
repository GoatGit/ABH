exports.up = pgm => pgm.sql(`
  CREATE SCHEMA extension AUTHORIZATION abh_core_owner;
  REVOKE ALL ON SCHEMA extension FROM PUBLIC;
  GRANT USAGE ON SCHEMA extension TO abh_runtime;
  CREATE TABLE extension.validation_reports (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    governance_ref jsonb NOT NULL CHECK(jsonb_typeof(governance_ref)='object'),
    governance_digest text NOT NULL CHECK(governance_digest ~ '^sha256:[0-9a-f]{64}$'),
    report_digest text NOT NULL CHECK(report_digest ~ '^sha256:[0-9a-f]{64}$'),
    CHECK(record->>'reportDigest' IS NOT NULL AND record->>'reportDigest'=report_digest),
    PRIMARY KEY(resource_organization_id,id));
  ALTER TABLE extension.validation_reports OWNER TO abh_core_owner;
  ALTER TABLE extension.validation_reports ENABLE ROW LEVEL SECURITY;
  ALTER TABLE extension.validation_reports FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON extension.validation_reports TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON extension.validation_reports TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
