exports.up = pgm => pgm.sql(`
  CREATE TABLE human.decision_effects (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),request_id uuid NOT NULL,route_revision bigint NOT NULL CHECK(route_revision BETWEEN 1 AND 9007199254740991),effect_key text NOT NULL,originating_command_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,request_id,route_revision,effect_key));
  CREATE INDEX decision_effects_origin ON human.decision_effects(resource_organization_id,originating_command_id);
  ALTER TABLE human.decision_effects OWNER TO abh_core_owner;
  ALTER TABLE human.decision_effects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE human.decision_effects FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON human.decision_effects TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT ON human.decision_effects TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
