-- Generated constraint fragment for the InstalledPack Owner migration; not a migration.
CONSTRAINT installed_pack_state_check CHECK (status IS NOT NULL AND status IN ('Staged', 'Enabled', 'Suspended', 'Retired'))
