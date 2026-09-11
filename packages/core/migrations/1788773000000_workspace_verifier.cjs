exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE control.workspaces (
      resource_organization_id uuid NOT NULL,
      id uuid NOT NULL,
      version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id', true), '')::uuid,
      updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id', true), '')::uuid,
      workspace_id uuid,
      purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use', true)] CHECK (cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
      deleted_at timestamptz,
      participant_organization_ids uuid[] NOT NULL CHECK (cardinality(participant_organization_ids) BETWEEN 2 AND 100 AND resource_organization_id=ANY(participant_organization_ids)),
      scope_epoch bigint NOT NULL CHECK (scope_epoch BETWEEN 1 AND 9007199254740991),
      valid_until timestamptz NOT NULL,
      record jsonb NOT NULL CHECK (jsonb_typeof(record)='object'),
      status text NOT NULL,
      CONSTRAINT access_record_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired')),
      PRIMARY KEY (resource_organization_id,id)
    );
    ALTER TABLE control.workspaces OWNER TO abh_core_owner;
    ALTER TABLE control.workspaces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE control.workspaces FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON control.workspaces TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT,UPDATE ON control.workspaces TO abh_runtime;
    CREATE ROLE abh_control_verifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    GRANT USAGE ON SCHEMA identity,control TO abh_control_verifier;
    GRANT SELECT (resource_organization_id,id,version,status,deleted_at) ON identity.organizations TO abh_control_verifier;
    GRANT SELECT (resource_organization_id,id,version,status,identity_kind,credential_epoch,deleted_at) ON identity.principals TO abh_control_verifier;
    GRANT SELECT (resource_organization_id,id,version,principal_id,status,membership_epoch,deleted_at) ON identity.memberships TO abh_control_verifier;
    GRANT SELECT (resource_organization_id,id,version,participant_organization_ids,scope_epoch,valid_until,status,deleted_at) ON control.workspaces TO abh_control_verifier;
    GRANT SELECT (resource_organization_id,id,version,scope_type,scope_id,epoch,stop_flag,deleted_at), UPDATE(epoch) ON control.fences TO abh_control_verifier;
  `);
  for (const table of ['identity.organizations','identity.principals','identity.memberships','control.workspaces','control.fences']) {
    // NOLOGIN helper is reachable only through the fixed function. WITH CHECK false forbids writes.
    pgm.sql(`CREATE POLICY control_verifier ON ${table} TO abh_control_verifier USING (true) WITH CHECK (false);`);
  }
  pgm.sql(`
    CREATE FUNCTION control.verify_workspace_membership(p_workspace uuid, p_membership uuid, p_membership_version bigint, p_local_grant_ids uuid[])
    RETURNS TABLE (membership_id uuid, membership_version bigint, membership_epoch bigint, principal_version bigint,
      credential_epoch bigint, identity_kind text, workspace_version bigint, workspace_epoch bigint, fence_vector jsonb)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $function$
    DECLARE
      resource_org uuid := NULLIF(current_setting('abh.resource_organization_id',true),'')::uuid;
      acting_org uuid := NULLIF(current_setting('abh.acting_organization_id',true),'')::uuid;
      actor_id uuid := NULLIF(current_setting('abh.actor_id',true),'')::uuid;
      workspace_context uuid := NULLIF(current_setting('abh.workspace_id',true),'')::uuid;
      workspace_row record;
      member_row record;
      fence_row record;
      vector jsonb := '[]'::jsonb;
      fence_count integer := 0;
      required_count integer;
    BEGIN
      IF resource_org IS NULL OR acting_org IS NULL OR actor_id IS NULL OR acting_org=resource_org
        OR workspace_context IS DISTINCT FROM p_workspace OR p_membership_version<1
        OR p_local_grant_ids IS NULL OR cardinality(p_local_grant_ids)>100
        OR array_position(p_local_grant_ids,NULL) IS NOT NULL THEN
        RETURN;
      END IF;
      -- Validate the relationship before exposing or locking any foreign identity facts.
      SELECT w.id,w.version,w.scope_epoch INTO workspace_row FROM control.workspaces w
        WHERE w.resource_organization_id=resource_org AND w.id=p_workspace AND w.status='Active'
          AND w.deleted_at IS NULL AND w.valid_until>clock_timestamp()
          AND acting_org=ANY(w.participant_organization_ids) AND resource_org=ANY(w.participant_organization_ids);
      IF NOT FOUND THEN RETURN; END IF;
      SELECT 5+count(DISTINCT g)::integer INTO required_count FROM unnest(p_local_grant_ids) g;
      FOR fence_row IN
        WITH required(org,scope_type,scope_id) AS (
          VALUES (acting_org,'abh.organization',acting_org), (acting_org,'abh.principal',actor_id),
            (resource_org,'abh.organization',resource_org), (resource_org,'abh.workspace',p_workspace),
            (acting_org,'abh.membership',p_membership)
          UNION SELECT resource_org,'abh.grant',g FROM unnest(p_local_grant_ids) g
        )
        SELECT f.resource_organization_id,f.scope_type,f.scope_id,f.epoch,f.stop_flag
          FROM control.fences f JOIN required r ON r.org=f.resource_organization_id AND r.scope_type=f.scope_type AND r.scope_id=f.scope_id
          WHERE f.deleted_at IS NULL
          ORDER BY f.resource_organization_id::text COLLATE "C",f.scope_type COLLATE "C",f.scope_id::text COLLATE "C"
          FOR UPDATE OF f
      LOOP
        IF fence_row.stop_flag THEN RETURN; END IF;
        fence_count:=fence_count+1;
        vector:=vector||jsonb_build_array(jsonb_build_object('organizationId',fence_row.resource_organization_id,
          'type',fence_row.scope_type,'id',fence_row.scope_id,'epoch',fence_row.epoch));
      END LOOP;
      IF fence_count<>required_count THEN RETURN; END IF;
      -- READ COMMITTED: reread Workspace and source membership after all shared fences are locked.
      SELECT w.id,w.version,w.scope_epoch INTO workspace_row FROM control.workspaces w
        WHERE w.resource_organization_id=resource_org AND w.id=p_workspace AND w.status='Active'
          AND w.deleted_at IS NULL AND w.valid_until>clock_timestamp()
          AND acting_org=ANY(w.participant_organization_ids) AND resource_org=ANY(w.participant_organization_ids);
      IF NOT FOUND THEN RETURN; END IF;
      IF (SELECT count(*) FROM identity.organizations o WHERE o.resource_organization_id IN (resource_org,acting_org)
          AND o.id=o.resource_organization_id AND o.status='Active' AND o.deleted_at IS NULL)<>2 THEN RETURN; END IF;
      SELECT m.id,m.version,m.membership_epoch,p.version AS principal_version,p.credential_epoch,p.identity_kind INTO member_row
        FROM identity.memberships m JOIN identity.principals p ON p.resource_organization_id=m.resource_organization_id AND p.id=m.principal_id
        WHERE m.resource_organization_id=acting_org AND m.id=p_membership AND m.version=p_membership_version AND m.principal_id=actor_id
          AND m.status='Active' AND p.status='Active' AND m.deleted_at IS NULL AND p.deleted_at IS NULL;
      IF NOT FOUND THEN RETURN; END IF;
      RETURN QUERY SELECT member_row.id,member_row.version,member_row.membership_epoch,member_row.principal_version,
        member_row.credential_epoch,member_row.identity_kind,workspace_row.version,workspace_row.scope_epoch,vector;
    END $function$;
    ALTER FUNCTION control.verify_workspace_membership(uuid,uuid,bigint,uuid[]) OWNER TO abh_control_verifier;
    REVOKE ALL ON FUNCTION control.verify_workspace_membership(uuid,uuid,bigint,uuid[]) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION control.verify_workspace_membership(uuid,uuid,bigint,uuid[]) TO abh_runtime;
  `);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
