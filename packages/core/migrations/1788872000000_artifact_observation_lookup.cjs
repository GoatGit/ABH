exports.up = pgm => pgm.sql(`
  -- Hashes are bounded lookup keys only. Every query must retain exact JSON
  -- equality checks; Artifact integrity remains independently SHA-256 verified.
  ALTER TABLE data.artifacts
    ADD COLUMN owner_lookup bigint GENERATED ALWAYS AS (jsonb_hash_extended(record->'ownerRef',0)) STORED,
    ADD COLUMN sources_lookup bigint GENERATED ALWAYS AS (jsonb_hash_extended(record->'sourceRefs',0)) STORED;
  CREATE INDEX artifacts_owner_sources_scan_idx ON data.artifacts
    (resource_organization_id, owner_lookup, sources_lookup, id)
    WHERE deleted_at IS NULL AND status='Available' AND record->>'mediaType'='application/json';
`);
exports.down = pgm => pgm.sql('DROP INDEX data.artifacts_owner_sources_scan_idx; ALTER TABLE data.artifacts DROP COLUMN owner_lookup, DROP COLUMN sources_lookup');
