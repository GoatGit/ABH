exports.up = pgm => pgm.sql(`
 ALTER TABLE extension.data_impact_reports
  ADD COLUMN signature_bundle bytea,
  ADD COLUMN signer_key_digest text,
  ADD COLUMN bundle_digest text,
  ADD CONSTRAINT impact_signature_complete CHECK (
    (signature_bundle IS NULL AND signer_key_digest IS NULL AND bundle_digest IS NULL) OR
    (signature_bundle IS NOT NULL AND octet_length(signature_bundle) BETWEEN 1 AND 4194304
     AND signer_key_digest IS NOT NULL AND signer_key_digest ~ '^sha256:[0-9a-f]{64}$'
     AND bundle_digest IS NOT NULL AND bundle_digest ~ '^sha256:[0-9a-f]{64}$'));
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
