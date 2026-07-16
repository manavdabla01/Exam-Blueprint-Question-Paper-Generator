/**
 * tokenHash.util.js
 *
 * Provides a fast, deterministic hash for refresh tokens before they are
 * persisted in `refresh_tokens.token_hash`.
 *
 * Design decision — SHA-256 instead of bcrypt for refresh tokens:
 *  - Refresh tokens (unlike passwords) are high-entropy, machine-generated
 *    JWTs (256+ bits of randomness from the signing process plus a random
 *    `jti`), so they are not vulnerable to dictionary/brute-force guessing
 *    the way human-chosen passwords are — bcrypt's deliberate slowness
 *    defends against guessing attacks on low-entropy secrets, which does
 *    not apply here.
 *  - The refresh endpoint must look up the presented token by exact match
 *    on every single API call that refreshes a session. bcrypt hashes are
 *    salted per-call and are NOT directly comparable via an indexed
 *    equality lookup (`WHERE token_hash = ?`) — you would have to fetch
 *    and bcrypt-compare against every stored hash, which does not scale.
 *    SHA-256 is deterministic, so `WHERE token_hash = ?` works with a
 *    standard unique index, giving O(1) lookup instead of O(n) compares.
 *  - We still never store the raw refresh token — only its SHA-256 digest
 *    — so a database compromise does not directly expose usable session
 *    tokens.
 */

'use strict';

const crypto = require('crypto');

/**
 * Computes the SHA-256 hex digest of a raw refresh token string.
 *
 * @param {string} rawToken - The raw JWT refresh token string
 * @returns {string} 64-character lowercase hex-encoded SHA-256 digest
 * @throws {Error} If rawToken is not a non-empty string
 */
function hashToken(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length === 0) {
    throw new Error('Token to hash must be a non-empty string');
  }
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

module.exports = {
  hashToken,
};
