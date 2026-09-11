-- Generated constraint fragment for the ExternalObservation Owner migration; not a migration.
CONSTRAINT external_observation_state_check CHECK (status IS NOT NULL AND status IN ('Received', 'Normalized', 'Quarantined'))
