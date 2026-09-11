-- Generated constraint fragment for the DurableWait Owner migration; not a migration.
CONSTRAINT durable_wait_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Succeeded', 'Cancelled'))
