exports.up = pgm => pgm.sql(`
  CREATE TABLE human.exception_resolution_effects (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    resolution_id uuid NOT NULL,exception_id uuid NOT NULL,correction_application_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,resolution_id));
  ALTER TABLE human.exception_resolution_effects OWNER TO abh_core_owner;
  ALTER TABLE human.exception_resolution_effects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE human.exception_resolution_effects FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON human.exception_resolution_effects TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON human.exception_resolution_effects TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
