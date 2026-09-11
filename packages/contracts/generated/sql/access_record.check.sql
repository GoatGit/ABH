-- Generated constraint fragment for the AccessRecord Owner migration; not a migration.
CONSTRAINT access_record_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired'))
