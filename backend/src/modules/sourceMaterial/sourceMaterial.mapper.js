/**
 * sourceMaterial.mapper.js
 *
 * Converts a raw `source_materials` row (as returned by the repository,
 * already joined with `subjects` for its public_id) into the shape safe
 * to return over the API. Excludes internal auto-increment ids
 * (`id`, `teacher_id`, `subject_id`) in favor of their public UUID
 * equivalents, and excludes `file_path` (a server filesystem path, never
 * appropriate to expose to a client).
 */

'use strict';

/**
 * @param {Object} row - Raw joined row as returned by sourceMaterial.repository.js
 * @returns {Object} Public-safe source material representation
 */
function toPublicSourceMaterial(row) {
  return {
    id: row.public_id,
    subjectId: row.subject_public_id,
    sourceType: row.source_type,
    title: row.title,
    description: row.description,
    originalFilename: row.original_filename,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Same as `toPublicSourceMaterial`, but additionally includes the raw
 * text content — used only by the single-resource GET endpoint, never by
 * list endpoints, since returning full text content for every row in a
 * paginated list would be unnecessarily heavy.
 *
 * @param {Object} row - Raw row as returned by sourceMaterial.repository.js findByPublicId
 * @returns {Object} Public-safe source material representation including content
 */
function toPublicSourceMaterialDetail(row) {
  return {
    ...toPublicSourceMaterial(row),
    rawTextContent: row.raw_text_content,
  };
}

module.exports = {
  toPublicSourceMaterial,
  toPublicSourceMaterialDetail,
};
