exports.up = pgm => {
  pgm.sql(`CREATE SCHEMA execution AUTHORIZATION abh_core_owner;REVOKE ALL ON SCHEMA execution FROM PUBLIC;GRANT USAGE ON SCHEMA execution TO abh_runtime;`);
  const tables=[
    ['actions',true,`lifecycle text NOT NULL,outcome text NOT NULL,CONSTRAINT action_state_check CHECK (lifecycle IS NOT NULL AND outcome IS NOT NULL AND ((lifecycle = 'Proposed' AND outcome IN ('NotStarted')) OR (lifecycle = 'Validated' AND outcome IN ('NotStarted')) OR (lifecycle = 'Authorized' AND outcome IN ('NotStarted')) OR (lifecycle = 'Executing' AND outcome IN ('Pending', 'Unknown')) OR (lifecycle = 'Reconciling' AND outcome IN ('Pending', 'Unknown')) OR (lifecycle = 'Closed' AND outcome IN ('Succeeded', 'PartiallySucceeded', 'Failed')) OR (lifecycle = 'Rejected' AND outcome IN ('NotStarted')) OR (lifecycle = 'Expired' AND outcome IN ('NotStarted')) OR (lifecycle = 'Cancelled' AND outcome IN ('NotStarted'))))`],
    ['plans',false,`action_id uuid NOT NULL,UNIQUE(resource_organization_id,action_id)`],
    ['operations',true,`action_id uuid NOT NULL,plan_id uuid NOT NULL,node_key text NOT NULL,lifecycle text NOT NULL,outcome text NOT NULL,UNIQUE(resource_organization_id,plan_id,node_key),CONSTRAINT operation_state_check CHECK (lifecycle IS NOT NULL AND outcome IS NOT NULL AND ((lifecycle = 'Pending' AND outcome IN ('NotStarted')) OR (lifecycle = 'Dispatching' AND outcome IN ('Pending', 'Unknown')) OR (lifecycle = 'Observing' AND outcome IN ('Pending', 'Unknown')) OR (lifecycle = 'Closed' AND outcome IN ('Succeeded', 'Failed')) OR (lifecycle = 'Cancelled' AND outcome IN ('NotStarted'))))`],
    ['receipts',false,`operation_id uuid NOT NULL,receipt_key text NOT NULL,UNIQUE(resource_organization_id,operation_id,receipt_key)`],
    ['reconciliations',false,`operation_id uuid NOT NULL`],
  ];
  for(const [name,mutable,fields] of tables) pgm.sql(`CREATE TABLE execution.${name} (
    resource_organization_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    updated_by uuid NOT NULL DEFAULT NULLIF(current_setting('abh.actor_id',true),'')::uuid,
    workspace_id uuid,purpose_names text[] NOT NULL DEFAULT ARRAY[current_setting('abh.purpose_of_use',true)] CHECK(cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL),
    deleted_at timestamptz,record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),${fields},PRIMARY KEY(resource_organization_id,id));
    ALTER TABLE execution.${name} OWNER TO abh_core_owner;
    ALTER TABLE execution.${name} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE execution.${name} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON execution.${name} TO abh_runtime
      USING (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid)
      WITH CHECK (resource_organization_id = NULLIF(current_setting('abh.resource_organization_id', true), '')::uuid);
    GRANT SELECT,INSERT${mutable?',UPDATE':''} ON execution.${name} TO abh_runtime;`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
