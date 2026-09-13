exports.up = pgm => pgm.sql(`
  ALTER TABLE human.corrections DROP CONSTRAINT correction_target_owner_check;
  ALTER TABLE human.corrections ADD CONSTRAINT correction_target_owner_check
    CHECK (target_owner IN ('Domain','Memory','Run','Capability'));
`);
exports.down = pgm => pgm.sql(`
  DELETE FROM human.corrections WHERE target_owner='Capability';
  ALTER TABLE human.corrections DROP CONSTRAINT correction_target_owner_check;
  ALTER TABLE human.corrections ADD CONSTRAINT correction_target_owner_check
    CHECK (target_owner IN ('Domain','Memory','Run'));
`);
