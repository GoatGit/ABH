exports.up = pgm => pgm.sql(`
  ALTER TABLE extension.trust_policies
    ADD COLUMN signature_payload text,
    ADD COLUMN signature_bundle jsonb,
    ADD COLUMN signer_key_digest text CHECK(signer_key_digest ~ '^sha256:[0-9a-f]{64}$'),
    ADD COLUMN verified_at timestamptz,
    ADD COLUMN expires_at timestamptz,
    ADD CONSTRAINT policy_signature_evidence CHECK (
      (signature_payload IS NULL AND signature_bundle IS NULL AND signer_key_digest IS NULL AND verified_at IS NULL AND expires_at IS NULL)
      OR (signature_payload IS NOT NULL AND signature_bundle IS NOT NULL AND jsonb_typeof(signature_bundle)='object'
        AND signer_key_digest IS NOT NULL AND verified_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at>verified_at));
`);
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
