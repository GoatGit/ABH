exports.up=pgm=>pgm.sql(`
 CREATE TABLE extension.capability_sets (
  resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  workspace_id uuid CHECK(workspace_id IS NULL),purpose_names text[] NOT NULL DEFAULT ARRAY['abh.pack.manage'] CHECK(purpose_names=ARRAY['abh.pack.manage']),
  deleted_at timestamptz CHECK(deleted_at IS NULL),record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),pack_id uuid NOT NULL,
  CHECK(record#>>'{setRef,id}' IS NOT NULL AND record#>>'{setRef,id}'=id::text),
  CHECK(record#>>'{setRef,type}' IS NOT NULL AND record#>>'{setRef,type}'='abh.pack-capability-set'),
  CHECK(record#>>'{setRef,version}' IS NOT NULL AND record#>>'{setRef,version}'='1'),
  CHECK(record#>>'{packRef,id}' IS NOT NULL AND record#>>'{packRef,id}'=pack_id::text),
  PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,pack_id)
 );
 CREATE TABLE extension.capabilities (
  resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version=1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  workspace_id uuid CHECK(workspace_id IS NULL),purpose_names text[] NOT NULL DEFAULT ARRAY['abh.pack.manage'] CHECK(purpose_names=ARRAY['abh.pack.manage']),
  deleted_at timestamptz CHECK(deleted_at IS NULL),record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
  pack_id uuid NOT NULL,set_id uuid NOT NULL,kind text NOT NULL,capability_id text NOT NULL,capability_version text NOT NULL,
  CHECK(record#>>'{packRef,id}' IS NOT NULL AND record#>>'{packRef,id}'=pack_id::text),
  CHECK(record#>>'{capability,kind}' IS NOT NULL AND record#>>'{capability,kind}'=kind),
  CHECK(record#>>'{capability,id}' IS NOT NULL AND record#>>'{capability,id}'=capability_id),
  CHECK(record#>>'{capability,version}' IS NOT NULL AND record#>>'{capability,version}'=capability_version),
  PRIMARY KEY(resource_organization_id,id),UNIQUE(resource_organization_id,kind,capability_id,capability_version)
 );
 ALTER TABLE extension.capability_sets OWNER TO abh_core_owner;
 ALTER TABLE extension.capability_sets ENABLE ROW LEVEL SECURITY;
 ALTER TABLE extension.capability_sets FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_isolation ON extension.capability_sets TO abh_runtime
  USING(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid)
  WITH CHECK(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid);
 GRANT SELECT,INSERT ON extension.capability_sets TO abh_runtime;
 ALTER TABLE extension.capabilities OWNER TO abh_core_owner;
 ALTER TABLE extension.capabilities ENABLE ROW LEVEL SECURITY;
 ALTER TABLE extension.capabilities FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_isolation ON extension.capabilities TO abh_runtime
  USING(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid)
  WITH CHECK(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid);
 GRANT SELECT,INSERT ON extension.capabilities TO abh_runtime;
`);
exports.down=()=>{throw new Error('Destructive rollback requires a separate reviewed maintenance migration.');};
