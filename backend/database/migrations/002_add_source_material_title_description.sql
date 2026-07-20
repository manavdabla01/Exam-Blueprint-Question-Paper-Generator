-- ============================================================
-- Migration: 002_add_source_material_title_description.sql
--
-- Adds `title` and `description` columns to `source_materials`.
--
-- Rationale: the original Task 2 schema stored only the raw content of a
-- source (text/file/image) with no independent human-facing label. Task 6
-- (Academic Domain Module) requires teachers to give each source material
-- a title and optional description for organization/search purposes,
-- independent of the underlying content type. This is an additive change
-- only — no existing column is altered or removed, and both new columns
-- are nullable so it is safe to run against a table with existing rows.
-- ============================================================

ALTER TABLE source_materials
  ADD COLUMN title VARCHAR(200) NULL AFTER subject_id,
  ADD COLUMN description VARCHAR(1000) NULL AFTER title;

-- Supports title search/sort without a full-table scan once volume grows.
CREATE INDEX idx_source_materials_title ON source_materials (title);
