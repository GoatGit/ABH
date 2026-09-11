exports.up = pgm => pgm.sql(`
  CREATE TABLE control.execution_authorities (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use',true)] CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    execution_principal_id uuid NOT NULL,evidence_type text NOT NULL,evidence_id uuid NOT NULL,effect_key text NOT NULL,
    input_digest text NOT NULL CHECK(input_digest ~ '^sha256:[0-9a-f]{64}$'),
    valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL CHECK(valid_until>valid_from),status text NOT NULL,
    CONSTRAINT execution_authority_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired')),
    PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,evidence_type,evidence_id,effect_key)
  );
  ALTER TABLE control.execution_authorities OWNER TO abh_core_owner;
  ALTER TABLE control.execution_authorities ENABLE ROW LEVEL SECURITY;
  ALTER TABLE control.execution_authorities FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON control.execution_authorities TO abh_runtime
    USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
    WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
  GRANT SELECT,INSERT,UPDATE ON control.execution_authorities TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
