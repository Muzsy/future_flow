-- Append-only preparation for narrative-v1. Existing immutable periods are
-- unchanged: no default, backfill, index, UPDATE or additional browser grant.
ALTER TABLE aw_periods ADD COLUMN narrative_artifact jsonb;
