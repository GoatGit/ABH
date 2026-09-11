-- Generated constraint fragment for the Assignment Owner migration; not a migration.
CONSTRAINT assignment_state_check CHECK (status IS NOT NULL AND status IN ('Shadow', 'Canary', 'Active', 'Paused', 'Retired'))
