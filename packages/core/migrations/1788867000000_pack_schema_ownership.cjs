exports.up = pgm => pgm.sql(`
  -- PostgreSQL roles and schemas are deployment-global, never tenant claims.
  CREATE TABLE extension.schema_roles (
    database_role text PRIMARY KEY CHECK(database_role ~ '^[a-z][a-z0-9_]{0,62}$'
      AND database_role !~ '^(pg_|abh_)' AND database_role <> 'postgres'),
    pack_id text NOT NULL CHECK(length(pack_id) BETWEEN 1 AND 255),
    UNIQUE(database_role,pack_id));
  CREATE TABLE extension.schema_ownership (
    schema_name text PRIMARY KEY CHECK(schema_name ~ '^[a-z][a-z0-9_]{0,62}$'
      AND schema_name !~ '^(pg_|abh_)'
      AND schema_name NOT IN ('public','information_schema','identity','control','resource','data','deployment','release','human','execution','runtime','extension')),
    pack_id text NOT NULL,
    database_role text NOT NULL,
    migration_version bigint NOT NULL DEFAULT 0 CHECK(migration_version=0),
    review_ref jsonb NOT NULL CHECK(jsonb_typeof(review_ref)='object'),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    maintenance_actor text NOT NULL DEFAULT session_user,
    FOREIGN KEY(database_role,pack_id) REFERENCES extension.schema_roles(database_role,pack_id));
  ALTER TABLE extension.schema_roles OWNER TO abh_core_owner;
  ALTER TABLE extension.schema_ownership OWNER TO abh_core_owner;
  REVOKE ALL ON extension.schema_roles,extension.schema_ownership FROM PUBLIC;
  GRANT SELECT ON extension.schema_roles,extension.schema_ownership TO abh_runtime;
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
