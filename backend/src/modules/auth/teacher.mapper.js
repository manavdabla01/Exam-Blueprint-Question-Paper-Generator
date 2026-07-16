/**
 * teacher.mapper.js
 *
 * Converts a raw `teachers` table row into the shape that is safe to
 * return over the API. This is the single point through which every
 * teacher record must pass before reaching an HTTP response, so that
 * `password_hash`, the internal auto-increment `id`, `deleted_at`, and
 * any other non-public field can never leak by omission-by-forgetting in
 * an individual controller.
 */

'use strict';

/**
 * @param {Object} teacherRow - Raw row as returned by teacher.repository.js
 * @returns {{ id: string, email: string, instituteName: string }}
 */
function toPublicTeacher(teacherRow) {
  return {
    id: teacherRow.public_id,
    email: teacherRow.email,
    instituteName: teacherRow.institute_name,
  };
}

module.exports = {
  toPublicTeacher,
};
