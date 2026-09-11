exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS core.verification_reports (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    task_id uuid NOT NULL,invocation_id uuid NOT NULL,verdict text NOT NULL,
    CONSTRAINT verification_verdict_check CHECK (verdict IN ('Pass','Reject','NeedsResponsibility','Inconclusive')),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.verification_reports OWNER TO abh_core_owner;
    ALTER TABLE core.verification_reports ENABLE ROW LEVEL SECURITY; ALTER TABLE core.verification_reports FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.verification_reports TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT ON core.verification_reports TO abh_runtime;
  CREATE TABLE IF NOT EXISTS core.context_manifests (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    task_id uuid NOT NULL,
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.context_manifests OWNER TO abh_core_owner;
    ALTER TABLE core.context_manifests ENABLE ROW LEVEL SECURITY; ALTER TABLE core.context_manifests FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.context_manifests TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT ON core.context_manifests TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
