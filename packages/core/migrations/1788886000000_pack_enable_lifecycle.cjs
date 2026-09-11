exports.up=pgm=>{
 const shape=`CHECK ((
   record#>>'{packRef,type}'='abh.installed-pack' AND record#>>'{packRef,version}'=version::text AND
   ((version=1 AND record->>'status'='Staged' AND NOT record ? 'enablement') OR
    (version=2 AND record->>'status'='Enabled' AND jsonb_typeof(record->'enablement')='object' AND
     record#>'{enablement,enabledPackRef}'=record->'packRef' AND
     record#>>'{enablement,previousPackRef,type}'='abh.installed-pack' AND
     record#>>'{enablement,previousPackRef,id}'=id::text AND
     record#>>'{enablement,previousPackRef,version}'='1' AND
     record#>'{enablement,proposal,packRef}'=record#>'{enablement,previousPackRef}' AND
     record#>>'{enablement,proposal,resourceOrganizationId}'=resource_organization_id::text AND
     record#>>'{enablement,deploymentVersion}'=record->>'deploymentVersion' AND
     (record#>>'{enablement,proposal,expectedDeploymentVersion}')::bigint+1=(record->>'deploymentVersion')::bigint AND
     record#>>'{enablement,proposal,subjectDigest}'=record#>>'{manifest,integrity,packageDigest}' AND
     record#>'{enablement,proposal,validationRef}'=record->'validationRef' AND
     record#>'{enablement,proposal,governanceRef}'=record->'governanceRef' AND
     record#>>'{enablement,proposal,governanceDigest}'=record->>'governanceDigest' AND
     (record#>>'{enablement,enabledAt}')::timestamptz >= (record->>'stagedAt')::timestamptz AND
     (record#>>'{enablement,enabledAt}')::timestamptz < (record#>>'{enablement,proposal,expiresAt}')::timestamptz))
  ) IS TRUE)`;
 pgm.sql(`
  ALTER TABLE extension.installed_packs DROP CONSTRAINT installed_packs_version_check;
  ALTER TABLE extension.installed_pack_history DROP CONSTRAINT installed_pack_history_version_check;
  DO $migration$ DECLARE item record; BEGIN
   FOR item IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint
    WHERE conrelid IN ('extension.installed_packs'::regclass,'extension.installed_pack_history'::regclass)
     AND contype='c' AND conname<>'installed_pack_state_check' AND pg_get_constraintdef(oid) LIKE '%''Staged''::text%'
   LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.relation,item.conname); END LOOP;
  END $migration$;
  ALTER TABLE extension.installed_packs ADD CONSTRAINT installed_pack_lifecycle_check ${shape};
  ALTER TABLE extension.installed_pack_history ADD CONSTRAINT installed_pack_history_lifecycle_check ${shape};
  GRANT UPDATE(version,updated_at,updated_by,record,deployment_version,status) ON extension.installed_packs TO abh_runtime;
 `);
};
exports.down=()=>{throw new Error('Destructive rollback requires a separate reviewed maintenance migration.');};
