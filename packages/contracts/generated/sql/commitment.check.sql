-- Generated constraint fragment for the Commitment Owner migration; not a migration.
CONSTRAINT commitment_state_check CHECK (status IS NOT NULL AND status IN ('Open', 'Closing', 'Closed'))
