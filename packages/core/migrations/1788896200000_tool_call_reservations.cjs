exports.up = pgm => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS core.tool_call_reservations (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,call_id uuid NOT NULL,reservation_id uuid NOT NULL,
    budget_ledger_id uuid NOT NULL,amount numeric NOT NULL CHECK(amount>0),status text NOT NULL DEFAULT 'Linked',
    CONSTRAINT tool_call_reservation_status_check CHECK (status IN ('Linked','Consumed','Released')),
    UNIQUE(resource_organization_id,call_id),UNIQUE(resource_organization_id,reservation_id),
    PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE core.tool_call_reservations OWNER TO abh_core_owner;
    ALTER TABLE core.tool_call_reservations ENABLE ROW LEVEL SECURITY; ALTER TABLE core.tool_call_reservations FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON core.tool_call_reservations TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON core.tool_call_reservations TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
