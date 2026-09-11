exports.up = pgm => {
  pgm.sql(`
    CREATE SCHEMA deployment AUTHORIZATION abh_core_owner;
    REVOKE ALL ON SCHEMA deployment FROM PUBLIC;
    GRANT USAGE ON SCHEMA deployment TO abh_runtime;
    CREATE TABLE deployment.identity_locations (
      identity_digest text NOT NULL CHECK (identity_digest ~ '^sha256:[0-9a-f]{64}$'),
      resource_organization_id uuid NOT NULL,
      principal_id uuid NOT NULL,
      principal_version bigint NOT NULL CHECK (principal_version BETWEEN 1 AND 9007199254740991),
      PRIMARY KEY (identity_digest, resource_organization_id)
    );
    ALTER TABLE deployment.identity_locations OWNER TO abh_core_owner;
    GRANT SELECT ON deployment.identity_locations TO abh_runtime;
    ALTER TABLE control.fences ADD COLUMN stop_flag boolean NOT NULL DEFAULT false;
  `);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
