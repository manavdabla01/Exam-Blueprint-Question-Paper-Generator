/**
 * refreshToken.repository.js
 *
 * Data-access layer for the `refresh_tokens` table. Refresh tokens are
 * NEVER stored in plaintext: only a SHA-256 hash of the signed JWT is
 * persisted (see auth.service.js `hashToken`), consistent with the
 * `token_hash` column defined in the Task 2 schema. This means even a
 * full database compromise does not yield usable refresh tokens.
 *
 * Rotation is implemented as "revoke old, insert new" rather than
 * updating a row in place, so every issued token retains its own audit
 * row (created_at/revoked_at) for security investigation purposes.
 */

'use strict';

const db = require('../../config/database');

/**
 * Inserts a new refresh token record.
 *
 * @param {Object} tokenData
 * @param {number} tokenData.teacherId - Internal auto-increment teacher id
 * @param {string} tokenData.tokenHash - SHA-256 hash of the signed refresh JWT
 * @param {Date} tokenData.expiresAt - Expiry timestamp of the token
 * @param {string|null} [tokenData.ipAddress] - IP address the token was issued to
 * @param {string|null} [tokenData.userAgent] - User-Agent header of the issuing request
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<number>} The internal auto-increment id of the newly created token row
 */
async function create(
  { teacherId, tokenHash, expiresAt, ipAddress = null, userAgent = null },
  connection = null
) {
  const executor = connection || db;
  const sql = `
    INSERT INTO refresh_tokens (teacher_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await executor.query(sql, [teacherId, tokenHash, expiresAt, ipAddress, userAgent]);
  return result.insertId;
}

/**
 * Finds an active (non-revoked, non-expired) refresh token record by its
 * hash. Used to validate an incoming refresh token before rotating it.
 *
 * @param {string} tokenHash - SHA-256 hash of the refresh JWT to look up
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<Object|null>} The token row if valid, or null if not found/revoked/expired
 */
async function findActiveByTokenHash(tokenHash, connection = null) {
  const executor = connection || db;
  const sql = `
    SELECT id, teacher_id, token_hash, expires_at, revoked_at
    FROM refresh_tokens
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
    LIMIT 1
  `;
  const [rows] = await executor.query(sql, [tokenHash]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Finds a refresh token record by its hash regardless of revoked/expired
 * state. Used for logout, where we want to revoke a token even if it is
 * already close to expiry (idempotent logout).
 *
 * @param {string} tokenHash - SHA-256 hash of the refresh JWT to look up
 * @returns {Promise<Object|null>} The token row, or null if not found
 */
async function findByTokenHash(tokenHash) {
  const sql = `
    SELECT id, teacher_id, token_hash, expires_at, revoked_at
    FROM refresh_tokens
    WHERE token_hash = ?
    LIMIT 1
  `;
  const [rows] = await db.query(sql, [tokenHash]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Revokes a refresh token by its internal id (sets revoked_at = NOW()).
 * Idempotent: revoking an already-revoked token is a harmless no-op.
 *
 * @param {number} id - Internal auto-increment refresh_tokens id
 * @param {import('mysql2/promise').PoolConnection|null} [connection] - Optional transaction connection
 * @returns {Promise<void>}
 */
async function revokeById(id, connection = null) {
  const executor = connection || db;
  const sql = `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE id = ? AND revoked_at IS NULL
  `;
  await executor.query(sql, [id]);
}

module.exports = {
  create,
  findActiveByTokenHash,
  findByTokenHash,
  revokeById,
};
