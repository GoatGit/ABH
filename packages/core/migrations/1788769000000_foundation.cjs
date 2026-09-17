/* Immutable migration snapshot; CHECK clauses copied from contracts 0.1.0 generation. */
exports.up = pgm => {
  pgm.sql(`
    -- Roles live at cluster scope while migrations run per database; re-provisioning a
    -- database on an existing cluster must not fail on pre-existing roles.
    DO $migration$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'abh_core_owner') THEN
        CREATE ROLE abh_core_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'abh_runtime') THEN
        CREATE ROLE abh_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'abh_queue') THEN
        CREATE ROLE abh_queue LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      END IF;
    END $migration$;
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    DO $migration$ BEGIN
      EXECUTE format('REVOKE CREATE, TEMP ON DATABASE %I FROM PUBLIC', current_database());
    END $migration$;
  `);
  for (const schema of ['identity', 'control', 'resource', 'data']) {
    pgm.sql(`CREATE SCHEMA ${schema} AUTHORIZATION abh_core_owner;
      REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC;
      GRANT USAGE ON SCHEMA ${schema} TO abh_runtime;`);
  }
  const access = "CONSTRAINT access_record_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired'))";
  const tables = [
    ['identity.organizations', `name text NOT NULL, home_region text NOT NULL, status text NOT NULL, ${access}`],
    ['identity.principals', `display_name text NOT NULL, identity_kind text NOT NULL CHECK (identity_kind IN ('Human','Service')), credential_epoch bigint NOT NULL CHECK (credential_epoch >= 0 AND credential_epoch <= 9007199254740991), status text NOT NULL, ${access}`],
    ['identity.memberships', `principal_id uuid NOT NULL, membership_epoch bigint NOT NULL CHECK (membership_epoch > 0 AND membership_epoch <= 9007199254740991), status text NOT NULL, ${access}, UNIQUE (resource_organization_id, principal_id)`],
    ['control.grants', `principal_id uuid NOT NULL, record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'), valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL CHECK (valid_until > valid_from), status text NOT NULL,
      CONSTRAINT grant_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired'))`],
    ['control.fences', `scope_type text NOT NULL, scope_id uuid NOT NULL, epoch bigint NOT NULL CHECK (epoch > 0 AND epoch <= 9007199254740991), UNIQUE (resource_organization_id, scope_type, scope_id)`],
    ['resource.ledgers', `scope_ref jsonb NOT NULL, resource_type text NOT NULL, metering_mode text NOT NULL CHECK (metering_mode IN ('cumulative','capacity')), unit text NOT NULL, currency text CHECK (currency ~ '^[A-Z]{3}$'), period_ref jsonb NOT NULL,
      limit_amount numeric NOT NULL CHECK (limit_amount >= 0 AND limit_amount < 1e26 AND scale(limit_amount) <= 12),
      confirmed_usage numeric NOT NULL CHECK (confirmed_usage >= 0 AND confirmed_usage < 1e26 AND scale(confirmed_usage) <= 12),
      held_reservation numeric NOT NULL CHECK (held_reservation >= 0 AND held_reservation < 1e26 AND scale(held_reservation) <= 12),
      open_commitment numeric NOT NULL CHECK (open_commitment >= 0 AND open_commitment < 1e26 AND scale(open_commitment) <= 12), status text NOT NULL,
      CHECK (metering_mode <> 'capacity' OR (confirmed_usage = 0 AND open_commitment = 0)),
      CONSTRAINT ledger_state_check CHECK (status IS NOT NULL AND status IN ('Open', 'Frozen', 'Closed'))`],
    ['resource.reservations', `request_ref jsonb NOT NULL, ledger_id uuid NOT NULL, ledger_version bigint NOT NULL CHECK (ledger_version > 0), amount numeric NOT NULL CHECK (amount > 0 AND amount < 1e26 AND scale(amount) <= 12), expires_at timestamptz NOT NULL, binding_ref jsonb NOT NULL, status text NOT NULL,
      CONSTRAINT reservation_state_check CHECK (status IS NOT NULL AND status IN ('Held', 'Consumed', 'Committed', 'Released', 'Expired'))`],
  ];
  const appendOnly = [
    ['resource.entries', `ledger_id uuid NOT NULL, entry_key text NOT NULL, record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'), UNIQUE (resource_organization_id, ledger_id, entry_key)`],
    ['data.audit_records', `record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object')`],
    ['data.command_receipts', `actor_principal_id uuid NOT NULL, command_type text NOT NULL, idempotency_key text NOT NULL, input_digest text NOT NULL CHECK (input_digest ~ '^sha256:[0-9a-f]{64}$'), record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'), UNIQUE (resource_organization_id, actor_principal_id, command_type, idempotency_key)`],
    ['data.outbox', `aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, aggregate_version bigint NOT NULL CHECK (aggregate_version > 0), event_ordinal integer NOT NULL CHECK (event_ordinal BETWEEN 0 AND 1000), record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'), UNIQUE (resource_organization_id, aggregate_type, aggregate_id, aggregate_version, event_ordinal)`],
  ];
  for (const [table, fields] of [...tables, ...appendOnly]) {
    // Identifier interpolation is from the static inventory above, never external input.
    const mutable = tables.some(([name]) => name === table);
    pgm.sql(`CREATE TABLE ${table} (
      resource_organization_id uuid NOT NULL,
      id uuid NOT NULL,
      version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id', true), '')::uuid,
      updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id', true), '')::uuid,
      workspace_id uuid,
      purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use', true)] CHECK (cardinality(purpose_names) > 0 AND array_position(purpose_names, NULL) IS NULL),
      deleted_at timestamptz,
      ${fields},
      PRIMARY KEY (resource_organization_id, id)
    );
    ALTER TABLE ${table} OWNER TO abh_core_owner;
    ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON ${table} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT, INSERT${mutable ? ', UPDATE' : ''} ON ${table} TO abh_runtime;`);
  }
  pgm.sql("CREATE UNIQUE INDEX reservation_request ON resource.reservations (resource_organization_id, ledger_id, (request_ref->>'type'), (request_ref->>'id'));");
};

exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
