/**
 * teacher.repository.js
 *
 * Data-access layer for the `teachers` table. This is the ONLY module
 * allowed to write raw SQL against `teachers`. All queries are
 * parameterized; none of them ever interpolate user input into the SQL
 * string. Every read excludes soft-deleted rows (`deleted_at IS NULL`)
 * unless explicitly documented otherwise.
 */

'use strict';

const db = require('../../config/database');

/**
 * Finds a teacher by email, including sensitive fields (password_hash,
 * status) needed for authentication. This method is for INTERNAL
 * auth-service use only — its result must never be returned directly
 * from a controller.
 *
 * @param {string} email - Normalized (lowercased, trimmed) email address
 * @returns {Promise<Object|null>} Full teacher row, or null if not found/deleted
 */
async function findByEmail(email) {
  const sql = `
    SELECT id, public_id, email, password_hash, institute_name, phone, status,
           email_verified_at, created_at, updated_at
    FROM teachers
    WHERE email = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [email]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Finds a teacher by their public UUID. Returns only fields safe to use
 * for building an API-facing profile response (still excludes
 * password_hash).
 *
 * @param {string} publicId - Teacher's public UUID
 * @returns {Promise<Object|null>} Teacher row (without password_hash), or null
 */
async function findByPublicId(publicId) {
  const sql = `
    SELECT id, public_id, email, institute_name, phone, status,
           email_verified_at, created_at
    FROM teachers
    WHERE public_id = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [publicId]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Finds a teacher by internal numeric id. Used internally by services
 * that already hold a numeric FK (e.g. after joining through
 * refresh_tokens) and need full teacher context without a second lookup
 * by public_id.
 *
 * @param {number} id - Internal auto-increment teacher id
 * @returns {Promise<Object|null>} Full teacher row, or null if not found/deleted
 */
async function findByIdInternal(id) {
  const sql = `
    SELECT id, public_id, email, password_hash, institute_name, phone, status,
           email_verified_at, created_at, updated_at
    FROM teachers
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Checks whether an email address is already registered (and not
 * soft-deleted), without fetching the full row. Used for the uniqueness
 * check during registration.
 *
 * @param {string} email - Normalized email address
 * @returns {Promise<boolean>} True if a teacher with this email already exists
 */
async function existsByEmail(email) {
  const sql = `SELECT id FROM teachers WHERE email = ? AND deleted_at IS NULL LIMIT 1`;
  const [rows] = await db.query(sql, [email]);
  return rows.length > 0;
}

/**
 * Inserts a new teacher row. Can optionally run on a caller-supplied
 * transaction connection so registration can be composed atomically with
 * the initial refresh token insert.
 *
 * @param {Object} teacherData
 * @param {string} teacherData.publicId - Pre-generated UUIDv7 public identifier
 * @param {string} teacherData.email - Normalized email address
 * @param {string} teacherData.passwordHash - bcrypt password hash
 * @param {string} teacherData.instituteName - Institute/coaching center name
 * @param {string|null} [teacherData.phone] - Optional phone number
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<number>} The internal auto-increment id of the newly created teacher
 */
/**
 * Inserts a new teacher row. Can optionally run on a caller-supplied
 * transaction connection so registration can be composed atomically with
 * the initial refresh token insert.
 *
 * @param {Object} teacherData
 * @param {string} teacherData.publicId - Pre-generated UUIDv7 public identifier
 * @param {string} teacherData.email - Normalized email address
 * @param {string} teacherData.passwordHash - bcrypt password hash
 * @param {string} teacherData.instituteName - Institute/coaching center name
 * @param {string|null} [teacherData.phone] - Optional phone number
 * @param {string} [teacherData.status] - Initial account status (default 'active')
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<number>} The internal auto-increment id of the newly created teacher
 */
async function createTeacher(
  { publicId, email, passwordHash, instituteName, phone = null, status = 'active' },
  connection = null
) {
  const executor = connection || db;
  const sql = `
    INSERT INTO teachers (public_id, email, password_hash, institute_name, phone, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const [result] = await executor.query(sql, [publicId, email, passwordHash, instituteName, phone, status]);
  return result.insertId;
}

module.exports = {
  findByEmail,
  findByPublicId,
  findByIdInternal,
  existsByEmail,
  createTeacher,
};
