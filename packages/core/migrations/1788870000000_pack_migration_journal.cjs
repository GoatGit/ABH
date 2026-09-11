exports.up = pgm => pgm.sql(`
  -- Physical schema migrations are global even when several organizations install
  -- the same Pack. Tenant identity is evidence attribution, never the replay key.
  CREATE TABLE extension.migration_packages (
    pack_id text NOT NULL,
    pack_version text NOT NULL,
    package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
    PRIMARY KEY(pack_id,pack_version),
    UNIQUE(pack_id,pack_version,package_digest));
  CREATE TABLE extension.migration_attempts (
    id uuid PRIMARY KEY,
    pack_id text NOT NULL,
    pack_version text NOT NULL,
    migration_ref text NOT NULL,
    package_digest text NOT NULL CHECK(package_digest ~ '^sha256:[0-9a-f]{64}$'),
    record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    maintenance_actor text NOT NULL DEFAULT session_user,
    UNIQUE(pack_id,pack_version,migration_ref),
    FOREIGN KEY(pack_id,pack_version,package_digest) REFERENCES extension.migration_packages(pack_id,pack_version,package_digest));
  CREATE TABLE extension.migration_observations (
    id uuid PRIMARY KEY,
    attempt_id uuid NOT NULL REFERENCES extension.migration_attempts(id),
    kind text NOT NULL CHECK(kind IN ('CommitAcknowledged','OutcomeUnknown')),
    record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    maintenance_actor text NOT NULL DEFAULT session_user,
    UNIQUE(attempt_id,kind));
  ALTER TABLE extension.migration_packages OWNER TO abh_core_owner;
  ALTER TABLE extension.migration_attempts OWNER TO abh_core_owner;
  ALTER TABLE extension.migration_observations OWNER TO abh_core_owner;
  REVOKE ALL ON extension.migration_packages,extension.migration_attempts,extension.migration_observations FROM PUBLIC,abh_runtime,abh_queue,abh_control_verifier;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
