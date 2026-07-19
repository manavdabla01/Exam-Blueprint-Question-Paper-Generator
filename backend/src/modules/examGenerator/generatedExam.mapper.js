/**
 * generatedExam.mapper.js
 *
 * Converts a raw `generated_exams` row into the shape safe to return over
 * the API. Excludes internal auto-increment ids in favor of their public
 * UUID equivalents.
 */

'use strict';

/**
 * @param {Object} row - Raw joined row as returned by generatedExam.repository.js
 * @param {boolean} [includeContent] - Whether to include content_json (only for single-resource GET, not list view)
 * @returns {Object} Public-safe generated exam representation
 */
function toPublicGeneratedExam(row, includeContent = false) {
  const base = {
    id: row.public_id,
    subjectId: row.subject_public_id,
    blueprintId: row.blueprint_public_id,
    title: row.title,
    status: row.status,
    claudeModelUsed: row.claude_model_used,
    generationAttempts: row.generation_attempts,
    generationDurationMs: row.generation_duration_ms,
    generatedAt: row.generated_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includeContent) {
    base.content = row.content_json;
  }

  return base;
}

module.exports = {
  toPublicGeneratedExam,
};
