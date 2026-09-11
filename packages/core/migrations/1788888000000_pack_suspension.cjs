exports.up=pgm=>{
 const shape=`CHECK ((
   record#>>'{packRef,type}'='abh.installed-pack' AND record#>>'{packRef,version}'=version::text AND
   ((version=1 AND record->>'status'='Staged' AND NOT record ? 'enablement' AND NOT record ? 'suspension') OR
    (((version=2 AND record->>'status'='Enabled' AND NOT record ? 'suspension') OR (version=3 AND record->>'status'='Suspended' AND jsonb_typeof(record->'suspension')='object' AND record#>'{suspension,packRef}'=record#>'{enablement,enabledPackRef}' AND (record#>>'{suspension,expectedDeploymentVersion}')::bigint+1=(record->>'deploymentVersion')::bigint AND (record#>>'{suspension,expectedDeploymentVersion}')::bigint >= (record#>>'{enablement,deploymentVersion}')::bigint AND (record#>>'{suspension,suspendedAt}')::timestamptz >= (record#>>'{enablement,enabledAt}')::timestamptz AND jsonb_typeof(record#>'{suspension,emergency}')='boolean' AND length(record#>>'{suspension,reason}')>0 AND jsonb_array_length(record#>'{suspension,evidenceRefs}')>0)) AND jsonb_typeof(record->'enablement')='object' AND
     record#>>'{enablement,enabledPackRef,type}'='abh.installed-pack' AND record#>>'{enablement,enabledPackRef,id}'=id::text AND record#>>'{enablement,enabledPackRef,version}'='2' AND
     record#>>'{enablement,previousPackRef,type}'='abh.installed-pack' AND
     record#>>'{enablement,previousPackRef,id}'=id::text AND
     record#>>'{enablement,previousPackRef,version}'='1' AND
     record#>'{enablement,proposal,packRef}'=record#>'{enablement,previousPackRef}' AND
     record#>>'{enablement,proposal,resourceOrganizationId}'=resource_organization_id::text AND
     (record->>'status'='Suspended' OR record#>>'{enablement,deploymentVersion}'=record->>'deploymentVersion') AND
     (record#>>'{enablement,proposal,expectedDeploymentVersion}')::bigint+1=(record#>>'{enablement,deploymentVersion}')::bigint AND
     record#>>'{enablement,proposal,subjectDigest}'=record#>>'{manifest,integrity,packageDigest}' AND
     record#>'{enablement,proposal,validationRef}'=record->'validationRef' AND
     record#>'{enablement,proposal,governanceRef}'=record->'governanceRef' AND
     record#>>'{enablement,proposal,governanceDigest}'=record->>'governanceDigest' AND
     (record#>>'{enablement,enabledAt}')::timestamptz >= (record->>'stagedAt')::timestamptz AND
     (record#>>'{enablement,enabledAt}')::timestamptz < (record#>>'{enablement,proposal,expiresAt}')::timestamptz))
  ) IS TRUE)`;
 pgm.sql(`ALTER TABLE extension.installed_packs DROP CONSTRAINT installed_pack_lifecycle_check;
 ALTER TABLE extension.installed_pack_history DROP CONSTRAINT installed_pack_history_lifecycle_check;
 ALTER TABLE extension.installed_packs ADD CONSTRAINT installed_pack_lifecycle_check ${shape};
 ALTER TABLE extension.installed_pack_history ADD CONSTRAINT installed_pack_history_lifecycle_check ${shape};`);
};
exports.down=()=>{throw new Error('Destructive rollback requires a separate reviewed maintenance migration.');};
