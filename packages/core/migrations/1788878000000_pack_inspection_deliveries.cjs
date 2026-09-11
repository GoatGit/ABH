exports.up = pgm => pgm.sql(`
 CREATE TABLE extension.inspection_deliveries (
  resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  workspace_id uuid CHECK(workspace_id IS NULL),purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
  deleted_at timestamptz CHECK(deleted_at IS NULL),record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
  job_id uuid NOT NULL,job_version bigint NOT NULL CHECK(job_version BETWEEN 1 AND 9007199254740991),event_id uuid NOT NULL,
  CONSTRAINT inspection_delivery_identity_check CHECK ((
   record->>'resourceOrganizationId'=resource_organization_id::text AND record#>>'{deliveryRef,type}'='abh.pack-inspection-delivery' AND
   record#>>'{deliveryRef,id}'=id::text AND record#>>'{deliveryRef,version}'='1' AND
   record#>>'{jobRef,type}'='abh.pack-inspection-job' AND record#>>'{jobRef,id}'=job_id::text AND record#>>'{jobRef,version}'=job_version::text AND
   record#>>'{eventRef,type}'='abh.event' AND record#>>'{eventRef,id}'=event_id::text AND record#>>'{eventRef,version}'='1') IS TRUE),
  PRIMARY KEY(resource_organization_id,id),CONSTRAINT inspection_delivery_event_key UNIQUE(resource_organization_id,event_id),CONSTRAINT inspection_delivery_job_version_key UNIQUE(resource_organization_id,job_id,job_version));
 ALTER TABLE extension.inspection_deliveries OWNER TO abh_core_owner;
 ALTER TABLE extension.inspection_deliveries ENABLE ROW LEVEL SECURITY;
 ALTER TABLE extension.inspection_deliveries FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_isolation ON extension.inspection_deliveries TO abh_runtime
  USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid)
  WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid);
 GRANT SELECT,INSERT ON extension.inspection_deliveries TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
