exports.up = pgm => pgm.sql(`
  CREATE SCHEMA runtime AUTHORIZATION abh_core_owner;
  REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
  GRANT USAGE ON SCHEMA runtime TO abh_runtime;
  CREATE TABLE runtime.work_leases (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    target_type text NOT NULL,target_id uuid NOT NULL,worker_id uuid NOT NULL,principal_id uuid NOT NULL,fencing_token bigint NOT NULL CHECK(fencing_token BETWEEN 1 AND 9007199254740991),lease_until timestamptz NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,target_type,target_id));
  ALTER TABLE runtime.work_leases OWNER TO abh_core_owner;
  ALTER TABLE runtime.work_leases ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runtime.work_leases FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON runtime.work_leases TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON runtime.work_leases TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
