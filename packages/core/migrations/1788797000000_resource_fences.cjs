exports.up = pgm => pgm.sql(`
  CREATE TABLE execution.resource_fences (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    connection_id uuid NOT NULL,account_type text NOT NULL,account_id uuid NOT NULL,resource_key text NOT NULL,
    fencing_token bigint NOT NULL CHECK(fencing_token BETWEEN 1 AND 9007199254740991),unresolved_operation_id uuid,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,connection_id,account_type,account_id,resource_key));
  ALTER TABLE execution.resource_fences OWNER TO abh_core_owner;
  ALTER TABLE execution.resource_fences ENABLE ROW LEVEL SECURITY;
  ALTER TABLE execution.resource_fences FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON execution.resource_fences TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON execution.resource_fences TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
