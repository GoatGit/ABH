-- Generated constraint fragment for the DecisionEffect Owner migration; not a migration.
CONSTRAINT decision_effect_state_check CHECK (status IS NOT NULL AND status IN ('Pending', 'Applied', 'Blocked', 'Abandoned'))
