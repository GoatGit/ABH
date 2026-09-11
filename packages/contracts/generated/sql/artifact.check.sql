-- Generated constraint fragment for the Artifact Owner migration; not a migration.
CONSTRAINT artifact_state_check CHECK (status IS NOT NULL AND status IN ('Staged', 'Available', 'Quarantined', 'Tombstoned'))
