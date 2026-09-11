exports.up = pgm => pgm.sql(`
  CREATE TABLE extension.installed_packs (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid CHECK(workspace_id IS NULL),purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz CHECK(deleted_at IS NULL),record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    pack_id text NOT NULL,pack_version text NOT NULL,package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
    deployment_version bigint NOT NULL CHECK(deployment_version BETWEEN 1 AND 9007199254740991),status text NOT NULL DEFAULT 'Staged',
    CONSTRAINT installed_pack_state_check CHECK (status IS NOT NULL AND status IN ('Staged', 'Enabled', 'Suspended', 'Retired')),
    CHECK(status='Staged'),
    CHECK(record->>'status' IS NOT NULL AND record->>'status'=status),
    CHECK(record#>>'{packRef,id}' IS NOT NULL AND record#>>'{packRef,id}'=id::text),
    CHECK(record#>>'{manifest,metadata,id}' IS NOT NULL AND record#>>'{manifest,metadata,id}'=pack_id),
    CHECK(record#>>'{manifest,metadata,version}' IS NOT NULL AND record#>>'{manifest,metadata,version}'=pack_version),
    CHECK(record#>>'{manifest,integrity,packageDigest}' IS NOT NULL AND record#>>'{manifest,integrity,packageDigest}'=package_digest),
    CHECK(record->>'deploymentVersion' IS NOT NULL AND record->>'deploymentVersion'=deployment_version::text),
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,pack_id,pack_version),UNIQUE(resource_organization_id,deployment_version));
  ALTER TABLE extension.installed_packs OWNER TO abh_core_owner;
  ALTER TABLE extension.installed_packs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE extension.installed_packs FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON extension.installed_packs TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON extension.installed_packs TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
