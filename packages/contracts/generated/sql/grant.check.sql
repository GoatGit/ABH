-- Generated constraint fragment for the Grant Owner migration; not a migration.
CONSTRAINT grant_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired'))
