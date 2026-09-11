-- Generated constraint fragment for the Mission Owner migration; not a migration.
CONSTRAINT mission_state_check CHECK (status IS NOT NULL AND status IN ('Draft', 'Active', 'Paused', 'Blocked', 'Completed', 'Cancelled'))
