-- ============================================================
-- Migration: 003_add_processing_columns.sql
--
-- Adds the minimum columns needed to track the AI processing lifecycle
-- of a source material: when processing started/completed, how many
-- attempts have been made, and why the most recent attempt failed (if
-- it did). This is additive only — no existing column is altered or
-- removed, and all new columns are nullable or have safe defaults, so it
-- is safe to run against a table with existing rows.
--
-- Note: no new `status` ENUM values are added. The existing
-- source_materials.status ENUM ('pending', 'processing', 'processed',
-- 'failed_legibility', 'error') already covers every state this
-- pipeline needs — 'error' is used as the generic processing-failure
-- state (see processing.util.js STATUS_TRANSITIONS for the full
-- rationale).
-- ============================================================

ALTER TABLE source_materials
  ADD COLUMN processing_started_at DATETIME NULL AFTER status,
  ADD COLUMN processing_completed_at DATETIME NULL AFTER processing_started_at,
  ADD COLUMN processing_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER processing_completed_at,
  ADD COLUMN failure_reason VARCHAR(500) NULL AFTER processing_attempts;

-- Supports the "find next pending item" query pattern (status + age-order)
-- without a full-table scan once volume grows.
CREATE INDEX idx_source_materials_status_created ON source_materials (status, created_at);
