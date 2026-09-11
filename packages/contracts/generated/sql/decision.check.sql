-- Generated constraint fragment for the Decision Owner migration; not a migration.
CONSTRAINT decision_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Approved', 'Rejected', 'Expired', 'Superseded', 'Withdrawn'))
