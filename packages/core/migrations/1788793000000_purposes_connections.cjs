exports.up = pgm => {
  for(const [schema,name,fields] of [
    ['control','purposes',`name text NOT NULL,UNIQUE(resource_organization_id,name),`],
    ['identity','connections',''],
  ])pgm.sql(`CREATE TABLE ${schema}.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields}status text NOT NULL,
    CONSTRAINT access_record_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired')),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE ${schema}.${name} OWNER TO abh_core_owner;
    ALTER TABLE ${schema}.${name} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${schema}.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${schema}.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON ${schema}.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
