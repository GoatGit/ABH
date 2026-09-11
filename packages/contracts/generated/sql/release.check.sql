-- Generated constraint fragment for the Release Owner migration; not a migration.
CONSTRAINT release_state_check CHECK (status IS NOT NULL AND status IN ('Draft', 'Ready', 'Retired', 'Revoked'))
