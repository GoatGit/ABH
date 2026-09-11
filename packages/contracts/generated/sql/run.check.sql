-- Generated constraint fragment for the Run Owner migration; not a migration.
CONSTRAINT run_state_check CHECK (status IS NOT NULL AND status IN ('Queued', 'Running', 'Waiting', 'Paused', 'Completed', 'Failed', 'Cancelled'))
