exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS core.graph_revisions (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    run_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 1000),
    base_revision bigint NOT NULL CHECK(base_revision BETWEEN 0 AND 999),
    patch_digest text NOT NULL,
    PRIMARY KEY(resource_organization_id,id),
    UNIQUE(resource_organization_id,run_id,revision),
    CHECK(patch_digest LIKE 'sha256:%'));
  ALTER TABLE core.graph_revisions OWNER TO abh_core_owner;
  ALTER TABLE core.graph_revisions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE core.graph_revisions FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON core.graph_revisions TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON core.graph_revisions TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
