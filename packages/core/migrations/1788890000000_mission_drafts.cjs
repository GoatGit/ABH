exports.up = pgm => {
  pgm.sql(`CREATE SCHEMA core AUTHORIZATION abh_core_owner;
    REVOKE ALL ON SCHEMA core FROM PUBLIC; GRANT USAGE ON SCHEMA core TO abh_runtime;`);
  for(const [name,mutable,fields] of [
    ['missions',true,`status text NOT NULL,goal_revision bigint NOT NULL CHECK(goal_revision BETWEEN 1 AND 9007199254740991),
      stop_epoch bigint NOT NULL CHECK(stop_epoch BETWEEN 0 AND 9007199254740991),
      CONSTRAINT mission_state_check CHECK (status IS NOT NULL AND status IN ('Draft', 'Active', 'Paused', 'Blocked', 'Completed', 'Cancelled'))`],
    ['mission_conditions',false,`mission_id uuid NOT NULL,goal_revision bigint NOT NULL CHECK(goal_revision BETWEEN 1 AND 9007199254740991),UNIQUE(resource_organization_id,mission_id,goal_revision)`],
  ])pgm.sql(`CREATE TABLE core.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields},PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.${name} OWNER TO abh_core_owner;
    ALTER TABLE core.${name} ENABLE ROW LEVEL SECURITY; ALTER TABLE core.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT${mutable?',UPDATE':''} ON core.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
