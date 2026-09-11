exports.up = pgm => pgm.sql(`
 CREATE TABLE extension.deployment_revisions (
  resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  workspace_id uuid CHECK(workspace_id IS NULL),purpose_names text[] NOT NULL DEFAULT ARRAY['abh.pack.manage'] CHECK(purpose_names=ARRAY['abh.pack.manage']),
  deleted_at timestamptz CHECK(deleted_at IS NULL),record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
  deployment_version bigint NOT NULL CHECK(deployment_version BETWEEN 1 AND 9007199254740991),
  previous_deployment_version bigint NOT NULL CHECK(previous_deployment_version=deployment_version-1),
  CHECK(record->>'resourceOrganizationId' IS NOT NULL AND record->>'resourceOrganizationId'=resource_organization_id::text),
  CHECK(record#>>'{revisionRef,type}' IS NOT NULL AND record#>>'{revisionRef,type}'='abh.pack-deployment-revision'),
  CHECK(record#>>'{revisionRef,id}' IS NOT NULL AND record#>>'{revisionRef,id}'=id::text),
  CHECK(record#>>'{revisionRef,version}' IS NOT NULL AND record#>>'{revisionRef,version}'='1'),
  CHECK(record->>'deploymentVersion' IS NOT NULL AND record->>'deploymentVersion'=deployment_version::text),
  CHECK(record->>'previousDeploymentVersion' IS NOT NULL AND record->>'previousDeploymentVersion'=previous_deployment_version::text),
  CHECK(record#>>'{targetRef,type}' IS NOT NULL AND record#>>'{targetRef,type}'='abh.installed-pack'),
  PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,deployment_version)
 );
 -- Preserve every existing Stage revision and its original timestamp; no new deployment is implied.
 INSERT INTO extension.deployment_revisions(resource_organization_id,id,created_at,updated_at,created_by,updated_by,record,deployment_version,previous_deployment_version)
 SELECT resource_organization_id,revision_id,created_at,created_at,created_by,created_by,
  jsonb_build_object('revisionRef',jsonb_build_object('type','abh.pack-deployment-revision','id',revision_id,'version',1),
   'resourceOrganizationId',resource_organization_id,'deploymentVersion',deployment_version,'previousDeploymentVersion',deployment_version-1,
   'targetRef',record->'packRef','recordedAt',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
  deployment_version,deployment_version-1
 FROM (SELECT p.*,gen_random_uuid() AS revision_id FROM extension.installed_packs p) existing;
 ALTER TABLE extension.deployment_revisions OWNER TO abh_core_owner;
 ALTER TABLE extension.deployment_revisions ENABLE ROW LEVEL SECURITY;
 ALTER TABLE extension.deployment_revisions FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_isolation ON extension.deployment_revisions TO abh_runtime
  USING(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid)
  WITH CHECK(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid);
 GRANT SELECT,INSERT ON extension.deployment_revisions TO abh_runtime;
`);
exports.down=()=>{throw new Error('Destructive rollback requires a separate reviewed maintenance migration.');};
