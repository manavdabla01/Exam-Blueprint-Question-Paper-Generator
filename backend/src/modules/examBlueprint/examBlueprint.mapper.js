/**
 * examBlueprint.mapper.js
 *
 * Converts a raw `exam_blueprints` row (joined with `subjects` for its
 * public_id) into the shape safe to return over the API. Excludes
 * internal auto-increment ids (`id`, `teacher_id`, `subject_id`) in favor
 * of their public UUID equivalents.
 */

'use strict';

/**
 * @param {Object} row - Raw joined row as returned by examBlueprint.repository.js
 * @returns {Object} Public-safe exam blueprint representation
 */
function toPublicBlueprint(row) {
  return {
    id: row.public_id,
    subjectId: row.subject_public_id,
    name: row.name,
    boardReference: row.board_reference,
    totalMarks: row.total_marks,
    structure: row.structure_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  toPublicBlueprint,
};
