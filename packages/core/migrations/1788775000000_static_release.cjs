exports.up = pgm => {
  pgm.sql(`CREATE SCHEMA release AUTHORIZATION abh_core_owner;
    REVOKE ALL ON SCHEMA release FROM PUBLIC;
    GRANT USAGE ON SCHEMA release TO abh_runtime;`);
  const tables=[
    ['releases',true,`status text NOT NULL, CONSTRAINT release_state_check CHECK (status IS NOT NULL AND status IN ('Draft', 'Ready', 'Retired', 'Revoked'))`],
    ['assignments',true,`release_id uuid NOT NULL, status text NOT NULL, selectable boolean NOT NULL, execution_allowed boolean NOT NULL,
      CONSTRAINT assignment_state_check CHECK (status IS NOT NULL AND status IN ('Shadow', 'Canary', 'Active', 'Paused', 'Retired'))`],
    ['pin_sets',false,`subject_type text NOT NULL CHECK(subject_type IN ('abh.action','abh.run')),subject_id uuid NOT NULL,
      subject_input_digest text NOT NULL CHECK(subject_input_digest ~ '^sha256:[0-9a-f]{64}$'),
      required_slots_digest text NOT NULL CHECK(required_slots_digest ~ '^sha256:[0-9a-f]{64}$'),
      UNIQUE(resource_organization_id,subject_type,subject_id)`],
  ];
  for(const [name,mutable,fields] of tables) pgm.sql(`CREATE TABLE release.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use',true)] CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields},
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE release.${name} OWNER TO abh_core_owner;
    ALTER TABLE release.${name} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE release.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON release.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT${mutable?',UPDATE':''} ON release.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
