-- Project.status is now fully derived from step completion (4 states:
-- PENDING | IN_PROGRESS | IN_REVIEW | DELIVERED) instead of a value chosen
-- freely at creation. New projects now start PENDING instead of IN_PROGRESS.
-- Existing rows' actual `status` values are backfilled separately (one-off
-- script recomputing from each project's real steps), not by this migration
-- — a DEFAULT change alone doesn't touch existing rows.
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'PENDING';
