exports.up = pgm => pgm.sql(`
  ALTER TABLE control.policy_bindings DROP CONSTRAINT policy_bindings_resource_organization_id_key;
  ALTER TABLE control.policy_bindings ADD COLUMN input_schema_name text NOT NULL DEFAULT 'ActionPolicyInput'
    CHECK(input_schema_name IN ('ActionPolicyInput','ScopeAuthorityPolicyInput'));
  UPDATE control.policy_bindings SET record=record || jsonb_build_object('inputSchemaName','ActionPolicyInput');
  ALTER TABLE control.policy_bindings ADD CONSTRAINT policy_bindings_organization_input_key UNIQUE(resource_organization_id,input_schema_name);
  ALTER TABLE control.policy_bindings ADD CONSTRAINT policy_binding_input_matches_record CHECK(record->>'inputSchemaName'=input_schema_name);
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
