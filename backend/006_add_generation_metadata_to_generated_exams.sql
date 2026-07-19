-- ============================================================
-- Migration: 006_add_generation_metadata_to_generated_exams.sql
--
-- Adds the minimum columns needed to track the AI generation lifecycle
-- of a generated exam: how long generation took, when it actually
-- completed (distinct from `created_at`, which marks when the request
-- was queued), and why generation failed, if it did.
--
-- Additive only — no existing column altered or removed, all new
-- columns nullable, safe to run against a table with existing rows.
-- ============================================================

ALTER TABLE generated_exams
  ADD COLUMN generation_duration_ms INT UNSIGNED NULL AFTER generation_attempts,
  ADD COLUMN generated_at DATETIME NULL AFTER generation_duration_ms,
  ADD COLUMN failure_reason VARCHAR(500) NULL AFTER generated_at;
