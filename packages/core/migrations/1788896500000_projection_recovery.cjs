exports.up = pgm => {
  pgm.sql(`ALTER TABLE read.projections
    ADD COLUMN purpose_names text[] NOT NULL DEFAULT ARRAY['abh.mission.manage'],
    ADD COLUMN source_version_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN built_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE read.projections ALTER COLUMN purpose_names DROP DEFAULT;
  ALTER TABLE read.projections ALTER COLUMN source_version_vector DROP DEFAULT;
  ALTER TABLE read.projections ALTER COLUMN built_at DROP DEFAULT;
  ALTER TABLE read.projections ADD CONSTRAINT projection_purpose_names_check
    CHECK (cardinality(purpose_names)>0 AND array_position(purpose_names,NULL) IS NULL);
  ALTER TABLE read.projections ADD CONSTRAINT projection_source_vector_check
    CHECK (jsonb_typeof(source_version_vector)='object');`);
};
exports.down = () => { throw new Error('Destructive rollback requires a separate reviewed maintenance migration.'); };
