/**
 * processing.repository.js
 *
 * Data-access layer for the processing lifecycle of `source_materials`
 * rows. Distinct from sourceMaterial.repository.js (which handles CRUD
 * of the descriptive metadata) — this module owns only the
 * processing-state columns (status, processing_started_at,
 * processing_completed_at, processing_attempts, failure_reason) and the
 * row-locking needed to claim an item exactly once.
 *
 * All queries are parameterized. Every teacher-scoped query filters by
 * `teacher_id` so a teacher can never claim or observe another tenant's
 * source material.
 */

'use strict';

const db = require('../../config/database');

/**
 * Finds a source material by public_id, scoped to the owning teacher, and
 * takes a row lock (`FOR UPDATE`) on it within the caller's transaction.
 * This must be called inside an active transaction on `connection` —
 * the lock is only meaningful for the lifetime of that transaction and is
 * released on COMMIT/ROLLBACK.
 *
 * Locking here is what prevents two concurrent "start processing"
 * requests for the same source material from both successfully claiming
 * it: the second request's `FOR UPDATE` blocks until the first
 * transaction commits, at which point the row's status is no longer
 * 'pending' and the second request is correctly rejected.
 *
 * @param {import('mysql2/promise').PoolConnection} connection - Active transaction connection
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {string} publicId - Source material's public UUID
 * @returns {Promise<Object|null>} Locked row, or null if not found/not owned/deleted
 */
async function findByPublicIdForUpdate(connection, teacherId, publicId) {
  const sql = `
    SELECT id, public_id, teacher_id, subject_id, source_type, status,
           processing_started_at, processing_completed_at, processing_attempts, failure_reason
    FROM source_materials
    WHERE public_id = ? AND teacher_id = ? AND deleted_at IS NULL
    FOR UPDATE
  `;
  const [rows] = await connection.query(sql, [publicId, teacherId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Finds a source material by its internal numeric id, scoped to the
 * owning teacher, without locking. Used to read back the current
 * processing state after a transaction has committed.
 *
 * @param {number} teacherId - Internal auto-increment teacher id of the requester
 * @param {number} id - Internal auto-increment source material id
 * @returns {Promise<Object|null>} Row, or null if not found/not owned/deleted
 */
async function findByIdForOwner(teacherId, id) {
  const sql = `
    SELECT id, public_id, teacher_id, subject_id, source_type, status,
           processing_started_at, processing_completed_at, processing_attempts, failure_reason
    FROM source_materials
    WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [id, teacherId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Claims the next globally pending source material for processing,
 * locking it within the caller's transaction. Uses `FOR UPDATE SKIP
 * LOCKED` (MySQL 8+) so multiple concurrent workers can each claim a
 * different pending row without blocking on one another — a row already
 * locked by another in-flight claim is simply skipped rather than
 * awaited. Not used by the manual `/start` endpoint (which targets a
 * specific source material), but provided as the foundation for a future
 * background worker.
 *
 * @param {import('mysql2/promise').PoolConnection} connection - Active transaction connection
 * @returns {Promise<Object|null>} The claimed row, or null if no pending items exist
 */
async function findNextPendingForUpdate(connection) {
  const sql = `
    SELECT id, public_id, teacher_id, subject_id, source_type, status,
           processing_started_at, processing_completed_at, processing_attempts, failure_reason
    FROM source_materials
    WHERE status = 'pending' AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  const [rows] = await connection.query(sql);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Transitions a source material into 'processing': sets
 * `processing_started_at = NOW()` and increments `processing_attempts`.
 * Must be called within the same transaction as the preceding
 * `findByPublicIdForUpdate`/`findNextPendingForUpdate` lock.
 *
 * @param {import('mysql2/promise').PoolConnection} connection - Active transaction connection
 * @param {number} id - Internal auto-increment source material id
 * @returns {Promise<void>}
 */
async function markProcessing(connection, id) {
  const sql = `
    UPDATE source_materials
    SET status = 'processing',
        processing_started_at = NOW(),
        processing_attempts = processing_attempts + 1,
        failure_reason = NULL
    WHERE id = ?
  `;
  await connection.query(sql, [id]);
}

/**
 * Transitions a source material into 'processed': sets
 * `processing_completed_at = NOW()` and clears any prior failure_reason.
 *
 * @param {number} id - Internal auto-increment source material id
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<void>}
 */
async function markProcessed(id, connection = null) {
  const executor = connection || db;
  const sql = `
    UPDATE source_materials
    SET status = 'processed',
        processing_completed_at = NOW(),
        failure_reason = NULL
    WHERE id = ?
  `;
  await executor.query(sql, [id]);
}

/**
 * Transitions a source material into a failure status ('error' or
 * 'failed_legibility'), recording the failure reason and completion
 * timestamp.
 *
 * @param {number} id - Internal auto-increment source material id
 * @param {string} status - The failure status to set ('error' | 'failed_legibility')
 * @param {string} failureReason - Human-readable, length-bounded failure description
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<void>}
 */
async function markFailed(id, status, failureReason, connection = null) {
  const executor = connection || db;
  const sql = `
    UPDATE source_materials
    SET status = ?,
        processing_completed_at = NOW(),
        failure_reason = ?
    WHERE id = ?
  `;
  await executor.query(sql, [status, failureReason, id]);
}

module.exports = {
  findByPublicIdForUpdate,
  findByIdForOwner,
  findNextPendingForUpdate,
  markProcessing,
  markProcessed,
  markFailed,
};
