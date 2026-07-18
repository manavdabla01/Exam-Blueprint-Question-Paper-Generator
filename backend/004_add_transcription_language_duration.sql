-- ============================================================
-- Migration: 004_add_transcription_language_duration.sql
--
-- Adds `language` and `processing_duration_ms` to `transcriptions`.
-- Additive only — no existing column altered or removed, both new
-- columns nullable, safe to run against a table with existing rows.
--
-- `confidence` and `status` required by Task 9 already map onto the
-- existing `legibility_score` and `gatekeeper_status` columns from the
-- Task 2 schema, so no new columns are needed for those.
-- ============================================================

ALTER TABLE transcriptions
  ADD COLUMN language VARCHAR(10) NULL AFTER transcribed_text,
  ADD COLUMN processing_duration_ms INT UNSIGNED NULL AFTER language;
