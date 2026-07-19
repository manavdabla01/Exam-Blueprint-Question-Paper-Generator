/**
 * examBlueprint.repository.js
 *
 * Data-access layer for the `exam_blueprints` table. Every query is
 * scoped by `teacher_id` so a teacher can never read or mutate another
 * tenant's blueprint. All queries are parameterized. `structure_json` is
 * stored as a JSON column; this repository stringifies it on write and
 * defensively parses it on read (mysql2 auto-parses JSON columns in most
 * configurations, but a raw string is handled gracefully rather than
 * assumed away).
 */

'use strict';

const db = require('../../config/database');

const SORTABLE_COLUMNS = Object.freeze({
  name: 'name',
  totalMarks: 'total_marks',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/**
 * Inserts a new exam blueprint row.
 *
 * @param {Object} data
 * @param {number} data.teacherId - Internal auto-increment teacher id
 * @param {number} data.subjectId - Internal auto-increment subject id this blueprint targets
 * @param {string} data.publicId - Pre-generated UUIDv7 public identifier
 * @param {string} data.name - Blueprint name (e.g. "Monthly Test - Chapter 1-3")
 * @param {string|null} data.boardReference - Board/curriculum reference (e.g. "CBSE")
 * @param {Object} data.structure - The blueprint structure object (validated upstream by Joi)
 * @param {number} data.totalMarks - Total marks for the exam
 * @returns {Promise<number>} The internal auto-increment id of the newly created row
 */
async function create({ teacherId, subjectId, publicId, name, boardReference, structure, totalMarks }) {
  const sql = `
    INSERT INTO exam_blueprints (public_id, teacher_id, subject_id, name, board_reference, structure_json, total_marks)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [
    publicId,
    teacherId,
    subjectId,
    name,
    boardReference,
    JSON.stringify(structure),
    totalMarks,
  ]);
  return result.insertId;
}

/**
 * Parses a raw `structure_json` value into a JS object regardless of
 * whether the driver already deserialized it.
 *
 * @param {Object|string} rawValue - The value as returned by mysql2 for the structure_json column
 * @returns {Object} Parsed structure object
 */
function parseStructureJson(rawValue) {
  if (typeof rawValue === 'string') {
    return JSON.parse(rawValue);
  }
  return rawValue;
}

/**
 * Finds a single exam blueprint by its public_id, scoped to the owning
 * teacher. Returns null both when it does not exist and when it belongs
 * to a different teacher.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Blueprint's public UUID
 * @returns {Promise<Object|null>} Blueprint row with parsed structure_json, or null if not found/not owned/deleted
 */
async function findByPublicId(teacherId, publicId) {
  const sql = `
    SELECT eb.id, eb.public_id, eb.teacher_id, eb.subject_id, sub.public_id AS subject_public_id,
           eb.name, eb.board_reference, eb.structure_json, eb.total_marks, eb.created_at, eb.updated_at
    FROM exam_blueprints eb
    INNER JOIN subjects sub ON sub.id = eb.subject_id
    WHERE eb.public_id = ? AND eb.teacher_id = ? AND eb.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [publicId, teacherId]);
  if (rows.length === 0) return null;
  const row = rows[0];
  row.structure_json = parseStructureJson(row.structure_json);
  return row;
}

/**
 * Counts a teacher's non-deleted exam blueprints matching an optional
 * search term, for pagination metadata.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {string|null} [params.search] - Optional case-insensitive search term (matches name)
 * @returns {Promise<number>} Total matching row count
 */
async function countByTeacher({ teacherId, search = null }) {
  const conditions = ['teacher_id = ?', 'deleted_at IS NULL'];
  const params = [teacherId];

  if (search) {
    conditions.push('name LIKE ?');
    params.push(`%${search}%`);
  }

  const sql = `SELECT COUNT(*) AS total FROM exam_blueprints WHERE ${conditions.join(' AND ')}`;
  const [rows] = await db.query(sql, params);
  return rows[0].total;
}

/**
 * Lists a teacher's non-deleted exam blueprints with optional subject
 * filter, search, sorting, and pagination.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {number|null} [params.subjectId] - Optional internal subject id to filter by
 * @param {string|null} [params.search] - Optional case-insensitive search term
 * @param {'name'|'totalMarks'|'createdAt'|'updatedAt'} [params.sortBy] - Field to sort by
 * @param {'asc'|'desc'} [params.sortOrder] - Sort direction
 * @param {number} params.limit - Max rows to return
 * @param {number} params.offset - Rows to skip
 * @returns {Promise<Array<Object>>} Matching blueprint rows with parsed structure_json
 */
async function listByTeacher({
  teacherId,
  subjectId = null,
  search = null,
  sortBy = 'createdAt',
  sortOrder = 'desc',
  limit,
  offset,
}) {
  const conditions = ['eb.teacher_id = ?', 'eb.deleted_at IS NULL'];
  const params = [teacherId];

  if (subjectId) {
    conditions.push('eb.subject_id = ?');
    params.push(subjectId);
  }

  if (search) {
    conditions.push('eb.name LIKE ?');
    params.push(`%${search}%`);
  }

  const sortColumn = `eb.${SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS.createdAt}`;
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT eb.id, eb.public_id, eb.teacher_id, eb.subject_id, sub.public_id AS subject_public_id,
           eb.name, eb.board_reference, eb.structure_json, eb.total_marks, eb.created_at, eb.updated_at
    FROM exam_blueprints eb
    INNER JOIN subjects sub ON sub.id = eb.subject_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortColumn} ${direction}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const [rows] = await db.query(sql, params);
  return rows.map((row) => {
    row.structure_json = parseStructureJson(row.structure_json);
    return row;
  });
}

/**
 * Updates a blueprint's mutable fields. Only columns present in `fields`
 * are included in the SET clause. `structure`, if provided, replaces the
 * entire structure_json value (no deep partial merge — see
 * examBlueprint.service.js for the rationale). Scoped by teacher_id.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Blueprint's public UUID
 * @param {Object} fields
 * @param {string} [fields.name] - New blueprint name
 * @param {string|null} [fields.boardReference] - New board/curriculum reference
 * @param {number} [fields.totalMarks] - New total marks
 * @param {Object} [fields.structure] - New complete structure object (replaces structure_json wholesale)
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function updateByPublicId(teacherId, publicId, fields) {
  const setClauses = [];
  const params = [];

  if (fields.name !== undefined) {
    setClauses.push('name = ?');
    params.push(fields.name);
  }
  if (fields.boardReference !== undefined) {
    setClauses.push('board_reference = ?');
    params.push(fields.boardReference);
  }
  if (fields.totalMarks !== undefined) {
    setClauses.push('total_marks = ?');
    params.push(fields.totalMarks);
  }
  if (fields.structure !== undefined) {
    setClauses.push('structure_json = ?');
    params.push(JSON.stringify(fields.structure));
  }

  if (setClauses.length === 0) {
    return 0;
  }

  params.push(publicId, teacherId);

  const sql = `
    UPDATE exam_blueprints
    SET ${setClauses.join(', ')}
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, params);
  return result.affectedRows;
}

/**
 * Soft-deletes an exam blueprint by setting `deleted_at = NOW()`. Scoped
 * by teacher_id. Idempotent.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Blueprint's public UUID
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function softDeleteByPublicId(teacherId, publicId) {
  const sql = `
    UPDATE exam_blueprints
    SET deleted_at = NOW()
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, [publicId, teacherId]);
  return result.affectedRows;
}

/**
 * Finds a single exam blueprint by its internal auto-increment id,
 * scoped to the owning teacher. Used by the generation pipeline, which
 * reaches a blueprint via `generated_exams.blueprint_id` (an internal id)
 * rather than a public UUID.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {number} id - Internal auto-increment blueprint id
 * @returns {Promise<Object|null>} Blueprint row with parsed structure_json, or null if not found/not owned/deleted
 */
async function findByIdForOwner(teacherId, id) {
  const sql = `
    SELECT eb.id, eb.public_id, eb.teacher_id, eb.subject_id, sub.public_id AS subject_public_id,
           eb.name, eb.board_reference, eb.structure_json, eb.total_marks, eb.created_at, eb.updated_at
    FROM exam_blueprints eb
    INNER JOIN subjects sub ON sub.id = eb.subject_id
    WHERE eb.id = ? AND eb.teacher_id = ? AND eb.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [id, teacherId]);
  if (rows.length === 0) return null;
  const row = rows[0];
  row.structure_json = parseStructureJson(row.structure_json);
  return row;
}

module.exports = {
  create,
  findByPublicId,
  findByIdForOwner,
  countByTeacher,
  listByTeacher,
  updateByPublicId,
  softDeleteByPublicId,
};
