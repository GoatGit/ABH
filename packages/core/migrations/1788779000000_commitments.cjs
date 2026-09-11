exports.up = pgm => {
  for(const [name,mutable,fields] of [
    ['commitments',true,`ledger_id uuid NOT NULL,remaining numeric NOT NULL CHECK(remaining>=0 AND remaining<1e26 AND scale(remaining)<=12),
      upper_bound numeric NOT NULL CHECK(upper_bound>=remaining AND upper_bound<1e26 AND scale(upper_bound)<=12),status text NOT NULL,
      CONSTRAINT commitment_state_check CHECK (status IS NOT NULL AND status IN ('Open', 'Closing', 'Closed'))`],
    ['settlements',false,`ledger_id uuid NOT NULL,source_type text NOT NULL,source_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
      UNIQUE(resource_organization_id,ledger_id,source_type,source_id,source_version)`],
  ]) pgm.sql(`CREATE TABLE resource.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use',true)] CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields},PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE resource.${name} OWNER TO abh_core_owner;
    ALTER TABLE resource.${name} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE resource.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON resource.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT${mutable?',UPDATE':''} ON resource.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
