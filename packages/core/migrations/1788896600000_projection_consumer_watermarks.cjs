exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS read.projection_consumer_watermarks (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,
    consumer_id text NOT NULL,projection_type text NOT NULL,
    last_event_created_at timestamptz NOT NULL,last_event_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id),
    UNIQUE(resource_organization_id,consumer_id,projection_type),
    CHECK(length(consumer_id)>0),CHECK(projection_type<>'' AND last_event_id<>'00000000-0000-0000-0000-000000000000'::uuid));
  ALTER TABLE read.projection_consumer_watermarks OWNER TO abh_core_owner;
  ALTER TABLE read.projection_consumer_watermarks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE read.projection_consumer_watermarks FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON read.projection_consumer_watermarks TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON read.projection_consumer_watermarks TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
