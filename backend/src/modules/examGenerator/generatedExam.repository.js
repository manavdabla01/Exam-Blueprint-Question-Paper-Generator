/**
 * generatedExam.repository.js
 *
 * Data-access layer for the `generated_exams` table. Every query is
 * scoped by `teacher_id` (denormalized onto this table per the Task 2
 * schema decision, avoiding a join through `exam_blueprints` for tenant
 * isolation). All queries are parameterized. `content_json` is stored as
 * a JSON column; stringified on write, defensively parsed on read.
 */

'use strict';

const db = require('../../config/database');

const SORTABLE_COLUMNS = Object.freeze({
  title: 'title',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/**
 * Parses a raw `content_json` value into a JS object regardless of
 * whether the driver already deserialized it.
 *
 * @param {Object|string} rawValue - The value as returned by mysql2 for the content_json column
 * @returns {Object} Parsed content object
 */
function parseContentJson(rawValue) {
  if (typeof rawValue === 'string') {
    return JSON.parse(rawValue);
  }
  return rawValue;
}

/**
 * Inserts a new generated exam row.
 *
 * @param {Object} data
 * @param {number} data.teacherId - Internal auto-increment teacher id (denormalized owner)
 * @param {number} data.subjectId - Internal auto-increment subject id (denormalized, matches the blueprint's subject)
 * @param {number} data.blueprintId - Internal auto-increment exam_blueprints id this generation is based on
 * @param {string} data.publicId - Pre-generated UUIDv7 public identifier
 * @param {string} data.title - Human-facing title for this generated exam
 * @param {Object} data.content - The content_json payload (a queued-state placeholder at creation time; populated by a future AI generation task)
 * @param {string} data.status - One of the generated_exams.status ENUM values
 * @returns {Promise<number>} The internal auto-increment id of the newly created row
 */
async function create({ teacherId, subjectId, blueprintId, publicId, title, content, status }) {
  const sql = `
    INSERT INTO generated_exams (public_id, teacher_id, subject_id, blueprint_id, title, content_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [
    publicId,
    teacherId,
    subjectId,
    blueprintId,
    title,
    JSON.stringify(content),
    status,
  ]);
  return result.insertId;
}

/**
 * Finds a single generated exam by its public_id, scoped to the owning
 * teacher. Returns null both when it does not exist and when it belongs
 * to a different teacher.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Generated exam's public UUID
 * @returns {Promise<Object|null>} Row with parsed content_json, or null if not found/not owned/deleted
 */
async function findByPublicId(teacherId, publicId) {
  const sql = `
    SELECT ge.id, ge.public_id, ge.teacher_id, ge.subject_id, sub.public_id AS subject_public_id,
           ge.blueprint_id, eb.public_id AS blueprint_public_id, ge.title, ge.content_json, ge.status,
           ge.claude_model_used, ge.generation_attempts, ge.generation_duration_ms, ge.generated_at,
           ge.failure_reason, ge.created_at, ge.updated_at
    FROM generated_exams ge
    INNER JOIN subjects sub ON sub.id = ge.subject_id
    INNER JOIN exam_blueprints eb ON eb.id = ge.blueprint_id
    WHERE ge.public_id = ? AND ge.teacher_id = ? AND ge.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [publicId, teacherId]);
  if (rows.length === 0) return null;
  const row = rows[0];
  row.content_json = parseContentJson(row.content_json);
  return row;
}

/**
 * Counts a teacher's non-deleted generated exams matching optional
 * subject/blueprint filters, for pagination metadata.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {number|null} [params.subjectId] - Optional internal subject id to filter by
 * @param {string|null} [params.search] - Optional case-insensitive search term (matches title)
 * @returns {Promise<number>} Total matching row count
 */
async function countByTeacher({ teacherId, subjectId = null, search = null }) {
  const conditions = ['teacher_id = ?', 'deleted_at IS NULL'];
  const params = [teacherId];

  if (subjectId) {
    conditions.push('subject_id = ?');
    params.push(subjectId);
  }

  if (search) {
    conditions.push('title LIKE ?');
    params.push(`%${search}%`);
  }

  const sql = `SELECT COUNT(*) AS total FROM generated_exams WHERE ${conditions.join(' AND ')}`;
  const [rows] = await db.query(sql, params);
  return rows[0].total;
}

/**
 * Lists a teacher's non-deleted generated exams with optional subject
 * filter, search, sorting, and pagination.
 *
 * @param {Object} params
 * @param {number} params.teacherId - Internal auto-increment teacher id
 * @param {number|null} [params.subjectId] - Optional internal subject id to filter by
 * @param {string|null} [params.search] - Optional case-insensitive search term
 * @param {'title'|'status'|'createdAt'|'updatedAt'} [params.sortBy] - Field to sort by
 * @param {'asc'|'desc'} [params.sortOrder] - Sort direction
 * @param {number} params.limit - Max rows to return
 * @param {number} params.offset - Rows to skip
 * @returns {Promise<Array<Object>>} Matching generated exam rows (content_json omitted from list view for payload size)
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
  const conditions = ['ge.teacher_id = ?', 'ge.deleted_at IS NULL'];
  const params = [teacherId];

  if (subjectId) {
    conditions.push('ge.subject_id = ?');
    params.push(subjectId);
  }

  if (search) {
    conditions.push('ge.title LIKE ?');
    params.push(`%${search}%`);
  }

  const sortColumn = `ge.${SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS.createdAt}`;
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT ge.id, ge.public_id, ge.teacher_id, ge.subject_id, sub.public_id AS subject_public_id,
           ge.blueprint_id, eb.public_id AS blueprint_public_id, ge.title, ge.status,
           ge.claude_model_used, ge.generation_attempts, ge.generation_duration_ms, ge.generated_at,
           ge.failure_reason, ge.created_at, ge.updated_at
    FROM generated_exams ge
    INNER JOIN subjects sub ON sub.id = ge.subject_id
    INNER JOIN exam_blueprints eb ON eb.id = ge.blueprint_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortColumn} ${direction}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * Soft-deletes a generated exam by setting `deleted_at = NOW()`. Scoped
 * by teacher_id. Idempotent.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Generated exam's public UUID
 * @returns {Promise<number>} Number of rows affected (0 or 1)
 */
async function softDeleteByPublicId(teacherId, publicId) {
  const sql = `
    UPDATE generated_exams
    SET deleted_at = NOW()
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
  `;
  const [result] = await db.query(sql, [publicId, teacherId]);
  return result.affectedRows;
}

/**
 * Finds a single generated exam by its internal auto-increment id,
 * scoped to the owning teacher. Used by the generation pipeline to read
 * back current state without needing the public UUID at every step.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {number} id - Internal auto-increment generated_exams id
 * @returns {Promise<Object|null>} Row with parsed content_json, or null if not found/not owned/deleted
 */
async function findByIdForOwner(teacherId, id) {
  const sql = `
    SELECT ge.id, ge.public_id, ge.teacher_id, ge.subject_id, sub.public_id AS subject_public_id,
           ge.blueprint_id, eb.public_id AS blueprint_public_id, ge.title, ge.content_json, ge.status,
           ge.claude_model_used, ge.generation_attempts, ge.generation_duration_ms, ge.generated_at,
           ge.failure_reason, ge.created_at, ge.updated_at
    FROM generated_exams ge
    INNER JOIN subjects sub ON sub.id = ge.subject_id
    INNER JOIN exam_blueprints eb ON eb.id = ge.blueprint_id
    WHERE ge.id = ? AND ge.teacher_id = ? AND ge.deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [id, teacherId]);
  if (rows.length === 0) return null;
  const row = rows[0];
  row.content_json = parseContentJson(row.content_json);
  return row;
}

/**
 * Transitions a generated exam into 'generating': increments
 * `generation_attempts`. Only valid from 'queued' (enforced by the
 * service layer's status check before calling this, not by the SQL
 * itself, matching the pattern used by processing.repository.js).
 *
 * @param {number} id - Internal auto-increment generated_exams id
 * @returns {Promise<void>}
 */
async function markGenerating(id) {
  const sql = `
    UPDATE generated_exams
    SET status = 'generating',
        generation_attempts = generation_attempts + 1,
        failure_reason = NULL
    WHERE id = ?
  `;
  await db.query(sql, [id]);
}

/**
 * Transitions a generated exam into 'completed': persists the validated
 * content_json, the Claude model used, generation duration, and
 * completion timestamp. Only ever called after the generated content has
 * passed full structural/blueprint validation — never with partial or
 * unvalidated content.
 *
 * @param {number} id - Internal auto-increment generated_exams id
 * @param {Object} data
 * @param {Object} data.content - The validated generated exam content
 * @param {string} data.claudeModelUsed - The Claude model identifier used
 * @param {number} data.generationDurationMs - Total generation duration in milliseconds
 * @returns {Promise<void>}
 */
async function markCompleted(id, { content, claudeModelUsed, generationDurationMs }) {
  const sql = `
    UPDATE generated_exams
    SET status = 'completed',
        content_json = ?,
        claude_model_used = ?,
        generation_duration_ms = ?,
        generated_at = NOW(),
        failure_reason = NULL
    WHERE id = ?
  `;
  await db.query(sql, [JSON.stringify(content), claudeModelUsed, generationDurationMs, id]);
}

/**
 * Transitions a generated exam into 'failed', recording the failure
 * reason. Deliberately does NOT touch `content_json` — a failed
 * generation never overwrites the existing (queued-placeholder) content
 * with partial or invalid output.
 *
 * @param {number} id - Internal auto-increment generated_exams id
 * @param {string} failureReason - Human-readable, length-bounded failure description
 * @returns {Promise<void>}
 */
async function markFailed(id, failureReason) {
  const sql = `
    UPDATE generated_exams
    SET status = 'failed',
        failure_reason = ?
    WHERE id = ?
  `;
  await db.query(sql, [failureReason, id]);
}

/**
 * Claims the next globally queued generated exam for generation, locking
 * it within the caller's transaction. Uses `FOR UPDATE SKIP LOCKED`
 * (MySQL 8+), mirroring processing.repository.js's
 * `findNextPendingForUpdate` — multiple concurrent callers can each
 * claim a different queued row without blocking on one another. Used by
 * the background generation worker (src/workers/generation.worker.js),
 * never by any HTTP-facing controller.
 *
 * @param {import('mysql2/promise').PoolConnection} connection - Active transaction connection
 * @returns {Promise<Object|null>} A minimal row ({ id, public_id, teacher_id }), or null if no queued items exist
 */
async function findNextQueuedForUpdate(connection) {
  const sql = `
    SELECT id, public_id, teacher_id
    FROM generated_exams
    WHERE status = 'queued' AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  const [rows] = await connection.query(sql);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  create,
  findByPublicId,
  findByIdForOwner,
  countByTeacher,
  listByTeacher,
  softDeleteByPublicId,
  markGenerating,
  markCompleted,
  markFailed,
  findNextQueuedForUpdate,
};
