exports.up = pgm => {
  pgm.sql(`ALTER TABLE core.runs
    ADD COLUMN progress_budget_seconds bigint NOT NULL DEFAULT 3600
      CHECK(progress_budget_seconds BETWEEN 1 AND 31536000),
    ADD COLUMN progress_deadline timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP + interval '3600 seconds';
  CREATE INDEX runs_stalled_progress_idx ON core.runs(progress_deadline)
    WHERE deleted_at IS NULL AND status IN ('Queued','Running');`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
