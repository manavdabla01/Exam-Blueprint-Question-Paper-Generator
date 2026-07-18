-- ============================================================
-- Migration: 005_add_queued_status_to_generated_exams.sql
--
-- Adds 'queued' as a valid value of `generated_exams.status` and makes it
-- the new default. The Task 2 schema's original ENUM
-- ('generating', 'completed', 'failed', 'regenerating') assumed exam
-- generation began synchronously; Task 10 introduces a generation
-- request that is only queued for later AI processing (the actual Claude
-- call is implemented in a future task), so a newly created
-- generated_exams row now starts life as 'queued' rather than
-- 'generating'.
--
-- This is an additive ENUM extension — no existing value is removed and
-- no existing row's status changes, so it is safe to run against a table
-- with existing rows.
-- ============================================================

ALTER TABLE generated_exams
  MODIFY COLUMN status ENUM('queued', 'generating', 'completed', 'failed', 'regenerating')
    NOT NULL DEFAULT 'queued';
