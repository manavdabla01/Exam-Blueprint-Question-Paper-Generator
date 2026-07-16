/**
 * subject.repository.js
 *
 * Data-access layer for the `subjects` table. Every query in this file is
 * scoped by `teacher_id` in addition to the resource's own identifier, so
 * a teacher can never read or mutate another tenant's subject through
 * this repository — there is no code path here that queries `subjects`
 * by public_id alone. All queries are parameterized; none interpolate
 * caller-supplied values into the SQL string. Soft-deleted rows
 * (`deleted_at IS NOT NULL`) are excluded from every read.
 */

'use strict';

const db = require('../../config/database');

const SORTABLE_COLUMNS = Object.freeze({
  name: 'name',
  grade: 'grade',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/**
 * Inserts a new subject row for the given teacher.
 *
 * @param {Object} data
 * @param {number} data.teacherId - Internal auto-increment teacher id
 * @param {string} data.publicId - Pre-generated UUIDv7 public identifier
 * @param {string} data.name - Subject name
 * @param {string} data.grade - Grade/class label
 * @returns {Promise<number>} The internal auto-increment id of the newly created subject
 */
async function create({ teacherId, publicId, name, grade }) {
  const sql = `
    INSERT INTO subjects (public_id, teacher_id, name, grade)
    VALUES (?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [publicId, teacherId, name, grade]);
  return result.insertId;
}

/**
 * Finds a single subject by its public_id, scoped to the owning teacher.
 * Returns null both when the subject does not exist and when it belongs
 * to a different teacher — the two cases are indistinguishable by design.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Subject's public UUID
 * @returns {Promise<Object|null>} Subject row, or null if not found/not owned/deleted
 */
async function findByPublicId(teacherId, publicId) {
  const sql = `
    SELECT id, public_id, teacher_id, name, grade, created_at, updated_at
    FROM subjects
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [publicId, teacherId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Counts the total number of a teacher's non-deleted subjects matching an
 * optional search term, for pagination metadata.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {string|null} [params.search] - Optional case-insensitive search term (matches name or grade)
 * @returns {Promise<number>} Total matching row count
 */
async function countByTeacher({ teacherId, search = null }) {
  const conditions = ['teacher_id = ?', 'deleted_at IS NULL'];
  const params = [teacherId];

  if (search) {
    conditions.push('(name LIKE ? OR grade LIKE ?)');
    const likeTerm = `%${search}%`;
    params.push(likeTerm, likeTerm);
  }

  const sql = `SELECT COUNT(*) AS total FROM subjects WHERE ${conditions.join(' AND ')}`;
  const [rows] = await db.query(sql, params);
  return rows[0].total;
}

/**
 * Lists a teacher's non-deleted subjects with search, sorting, and
 * pagination applied. `sortBy` is validated against a fixed whitelist of
 * real column names before being placed into the SQL string, since MySQL
 * does not support parameter binding for identifiers (column names) —
 * this is the one place a non-parameterized value is used, and it is
 * never derived from raw user input.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {string|null} [params.search] - Optional case-insensitive search term
 * @param {'name'|'grade'|'createdAt'|'updatedAt'} [params.sortBy] - Field to sort by (default 'createdAt')
 * @param {'asc'|'desc'} [params.sortOrder] - Sort direction (default 'desc')
 * @param {number} params.limit - Max rows to return
 * @param {number} params.offset - Rows to skip
 * @returns {Promise<Array<Object>>} Matching subject rows
 */
async function listByTeacher({ teacherId, search = null, sortBy = 'createdAt', sortOrder = 'desc', limit, offset }) {
  const conditions = ['teacher_id = ?', 'deleted_at IS NULL'];
  const params = [teacherId];

  if (search) {
    conditions.push('(name LIKE ? OR grade LIKE ?)');
    const likeTerm = `%${search}%`;
    params.push(likeTerm, likeTerm);
  }

  const sortColumn = SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS.createdAt;
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT id, public_id, teacher_id, name, grade, created_at, updated_at
    FROM subjects
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortColumn} ${direction}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * Updates a subject's mutable fields. Only columns present in `fields`
 * are included in the SET clause, so a partial update (name only, or
 * grade only) does not overwrite the other column. Scoped by teacher_id
 * so a teacher cannot update another tenant's subject.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Subject's public UUID
 * @param {Object} fields
 * @param {string} [fields.name] - New subject name
 * @param {string} [fields.grade] - New grade/class label
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function updateByPublicId(teacherId, publicId, fields) {
  const setClauses = [];
  const params = [];

  if (fields.name !== undefined) {
    setClauses.push('name = ?');
    params.push(fields.name);
  }
  if (fields.grade !== undefined) {
    setClauses.push('grade = ?');
    params.push(fields.grade);
  }

  if (setClauses.length === 0) {
    return 0;
  }

  params.push(publicId, teacherId);

  const sql = `
    UPDATE subjects
    SET ${setClauses.join(', ')}
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, params);
  return result.affectedRows;
}

/**
 * Soft-deletes a subject by setting `deleted_at = NOW()`. Scoped by
 * teacher_id so a teacher cannot delete another tenant's subject.
 * Idempotent: deleting an already-deleted subject affects 0 rows rather
 * than erroring.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Subject's public UUID
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function softDeleteByPublicId(teacherId, publicId) {
  const sql = `
    UPDATE subjects
    SET deleted_at = NOW()
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, [publicId, teacherId]);
  return result.affectedRows;
}

module.exports = {
  create,
  findByPublicId,
  countByTeacher,
  listByTeacher,
  updateByPublicId,
  softDeleteByPublicId,
};
