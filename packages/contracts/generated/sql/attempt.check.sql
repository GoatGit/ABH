-- Generated constraint fragment for the Attempt Owner migration; not a migration.
CONSTRAINT attempt_state_check CHECK (status IS NOT NULL AND status IN ('Created', 'Sent', 'Responded', 'TransportFailed', 'Interrupted'))
