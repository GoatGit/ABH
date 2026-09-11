-- Generated constraint fragment for the ExecutionAuthority Owner migration; not a migration.
CONSTRAINT execution_authority_state_check CHECK (status IS NOT NULL AND status IN ('Active', 'Revoked', 'Expired'))
