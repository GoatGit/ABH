-- Generated constraint fragment for the ResponsibilityRequest Owner migration; not a migration.
CONSTRAINT responsibility_request_state_check CHECK (status IS NOT NULL AND status IN ('Unresolved', 'Open', 'Closed', 'Withdrawn'))
