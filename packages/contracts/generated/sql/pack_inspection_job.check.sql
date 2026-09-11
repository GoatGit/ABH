-- Generated constraint fragment for the PackInspectionJob Owner migration; not a migration.
CONSTRAINT pack_inspection_job_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Running', 'Waiting', 'Succeeded', 'Failed', 'Cancelled'))
