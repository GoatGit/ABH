exports.up = pgm => {
  pgm.sql(`CREATE SCHEMA human AUTHORIZATION abh_core_owner;REVOKE ALL ON SCHEMA human FROM PUBLIC;GRANT USAGE ON SCHEMA human TO abh_runtime;`);
  const tables=[
    ['responsibilities',true,`principal_id uuid NOT NULL,valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL CHECK(valid_until>valid_from),status text NOT NULL,
      CONSTRAINT access_record_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired'))`],
    ['requests',true,`route_revision bigint NOT NULL CHECK(route_revision BETWEEN 1 AND 9007199254740991),expires_at timestamptz NOT NULL,status text NOT NULL,
      CONSTRAINT responsibility_request_state_check CHECK (status IS NOT NULL AND status IN ('Unresolved', 'Open', 'Closed', 'Withdrawn'))`],
    ['decisions',true,`request_id uuid NOT NULL,route_revision bigint NOT NULL CHECK(route_revision BETWEEN 1 AND 9007199254740991),slot_id text NOT NULL,seat_id text NOT NULL,valid_until timestamptz NOT NULL,status text NOT NULL,
      UNIQUE(resource_organization_id,request_id,route_revision,slot_id,seat_id),
      CONSTRAINT decision_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Approved', 'Rejected', 'Expired', 'Superseded', 'Withdrawn'))`],
    ['completion_evidence',false,`request_id uuid NOT NULL,route_revision bigint NOT NULL CHECK(route_revision BETWEEN 1 AND 9007199254740991),UNIQUE(resource_organization_id,request_id,route_revision)`],
  ];
  for(const [name,mutable,fields] of tables) pgm.sql(`CREATE TABLE human.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use',true)] CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields},PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE human.${name} OWNER TO abh_core_owner;
    ALTER TABLE human.${name} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE human.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON human.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT${mutable?',UPDATE':''} ON human.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
