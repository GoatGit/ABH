exports.up = pgm => {
  const tables=[
    ['dispatch_permits',`action_id uuid NOT NULL,operation_id uuid NOT NULL,attempt_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 4),expires_at timestamptz NOT NULL,
      UNIQUE(resource_organization_id,operation_id,ordinal),UNIQUE(resource_organization_id,attempt_id)`],
    ['attempts',`operation_id uuid NOT NULL,permit_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 4),
      UNIQUE(resource_organization_id,operation_id,ordinal),UNIQUE(resource_organization_id,permit_id)`],
    ['attempt_observations',`attempt_id uuid NOT NULL,sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),status text NOT NULL,
      CONSTRAINT attempt_state_check CHECK (status IS NOT NULL AND status IN ('Created', 'Sent', 'Responded', 'TransportFailed', 'Interrupted')),UNIQUE(resource_organization_id,attempt_id,sequence)`],
  ];
  for(const [name,fields] of tables)pgm.sql(`CREATE TABLE execution.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields},PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE execution.${name} OWNER TO abh_core_owner;
    ALTER TABLE execution.${name} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE execution.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON execution.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT ON execution.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
