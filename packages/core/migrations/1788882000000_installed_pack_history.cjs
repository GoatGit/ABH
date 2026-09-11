exports.up=pgm=>pgm.sql(`
 CREATE TABLE extension.installed_pack_history (
  resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL CHECK(version=1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
  workspace_id uuid CHECK(workspace_id IS NULL),purpose_names text[] NOT NULL CHECK(purpose_names=ARRAY['abh.pack.manage']),
  deleted_at timestamptz CHECK(deleted_at IS NULL),record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
  CHECK(record#>>'{packRef,type}' IS NOT NULL AND record#>>'{packRef,type}'='abh.installed-pack'),
  CHECK(record#>>'{packRef,id}' IS NOT NULL AND record#>>'{packRef,id}'=id::text),
  CHECK(record#>>'{packRef,version}' IS NOT NULL AND record#>>'{packRef,version}'=version::text),
  CHECK(record->>'status' IS NOT NULL AND record->>'status'='Staged'),
  PRIMARY KEY(resource_organization_id,id,version)
 );
 INSERT INTO extension.installed_pack_history(resource_organization_id,id,version,created_at,updated_at,created_by,updated_by,purpose_names,record)
 SELECT resource_organization_id,id,version,created_at,updated_at,created_by,updated_by,ARRAY['abh.pack.manage'],record FROM extension.installed_packs;
 ALTER TABLE extension.installed_pack_history OWNER TO abh_core_owner;
 ALTER TABLE extension.installed_pack_history ENABLE ROW LEVEL SECURITY;
 ALTER TABLE extension.installed_pack_history FORCE ROW LEVEL SECURITY;
 CREATE POLICY tenant_isolation ON extension.installed_pack_history TO abh_runtime
  USING(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid)
  WITH CHECK(resource_organization_id=NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid);
 GRANT SELECT,INSERT ON extension.installed_pack_history TO abh_runtime;
`);
exports.down=()=>{throw new Error('Destructive rollback requires a separate reviewed maintenance migration.');};
