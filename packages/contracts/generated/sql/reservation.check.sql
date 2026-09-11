-- Generated constraint fragment for the Reservation Owner migration; not a migration.
CONSTRAINT reservation_state_check CHECK (status IS NOT NULL AND status IN ('Held', 'Consumed', 'Committed', 'Released', 'Expired'))
