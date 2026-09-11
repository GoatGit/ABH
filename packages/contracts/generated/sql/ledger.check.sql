-- Generated constraint fragment for the Ledger Owner migration; not a migration.
CONSTRAINT ledger_state_check CHECK (status IS NOT NULL AND status IN ('Open', 'Frozen', 'Closed'))
