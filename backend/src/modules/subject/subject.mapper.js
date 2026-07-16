/**
 * subject.mapper.js
 *
 * Converts a raw `subjects` table row into the shape safe to return over
 * the API. Excludes the internal auto-increment `id` and `teacher_id`
 * (the requester already knows who they are; exposing another tenant's
 * numeric id space is never necessary) and any timestamp not part of the
 * public contract.
 */

'use strict';

/**
 * @param {Object} subjectRow - Raw row as returned by subject.repository.js
 * @returns {{ id: string, name: string, grade: string, createdAt: string, updatedAt: string }}
 */
function toPublicSubject(subjectRow) {
  return {
    id: subjectRow.public_id,
    name: subjectRow.name,
    grade: subjectRow.grade,
    createdAt: subjectRow.created_at,
    updatedAt: subjectRow.updated_at,
  };
}

module.exports = {
  toPublicSubject,
};
