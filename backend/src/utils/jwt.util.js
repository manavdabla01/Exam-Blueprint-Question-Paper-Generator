/**
 * jwt.util.js
 *
 * Centralized JWT generation and verification. This module does NOT read
 * or write the database — token persistence/revocation (refresh_tokens
 * table) is the responsibility of the auth module's repository layer,
 * implemented in a later task. This file only handles the cryptographic
 * concerns: signing, verifying, decoding, and expiry calculation.
 *
 * Secure payload design:
 *  - Access token payload contains only the minimum needed to authorize a
 *    request: `sub` (teacher public_id), `email`, and `role`. It never
 *    contains the password hash or any other sensitive field.
 *  - Refresh token payload contains `sub` and a unique `jti` (JWT ID) so
 *    that a specific refresh token can be looked up/revoked in the
 *    database by its jti without needing to store the raw token.
 *  - Internal auto-increment `id` is never placed in a JWT payload, since
 *    JWTs are client-visible; only the public UUID identifier is used.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

const TOKEN_TYPE = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

/**
 * Generates a signed access token for an authenticated teacher.
 *
 * @param {Object} teacher - Minimal teacher identity to embed in the token
 * @param {string} teacher.publicId - Teacher's public UUID
 * @param {string} teacher.email - Teacher's email address
 * @param {string} [teacher.role] - Teacher's role (defaults to 'teacher')
 * @returns {string} Signed JWT access token
 * @throws {Error} If JWT_ACCESS_SECRET is not configured
 */
function generateAccessToken(teacher) {
  if (!config.auth.jwtAccessSecret) {
    throw new Error('JWT_ACCESS_SECRET is not configured');
  }

  const payload = {
    sub: teacher.publicId,
    email: teacher.email,
    role: teacher.role || 'teacher',
    type: TOKEN_TYPE.ACCESS,
  };

  return jwt.sign(payload, config.auth.jwtAccessSecret, {
    expiresIn: config.auth.jwtAccessExpiry,
  });
}

/**
 * Generates a signed refresh token for an authenticated teacher, along
 * with a unique `jti` identifier that the caller should persist (hashed)
 * in the `refresh_tokens` table for later revocation/rotation lookups.
 *
 * @param {Object} teacher - Minimal teacher identity to embed in the token
 * @param {string} teacher.publicId - Teacher's public UUID
 * @returns {{ token: string, jti: string }} The signed refresh token and its jti
 * @throws {Error} If JWT_REFRESH_SECRET is not configured
 */
function generateRefreshToken(teacher) {
  if (!config.auth.jwtRefreshSecret) {
    throw new Error('JWT_REFRESH_SECRET is not configured');
  }

  const jti = uuidv4();

  const payload = {
    sub: teacher.publicId,
    jti,
    type: TOKEN_TYPE.REFRESH,
  };

  const token = jwt.sign(payload, config.auth.jwtRefreshSecret, {
    expiresIn: config.auth.jwtRefreshExpiry,
  });

  return { token, jti };
}

/**
 * Verifies and decodes an access token.
 *
 * @param {string} token - Raw JWT access token string
 * @returns {Object} Decoded payload ({ sub, email, role, type, iat, exp })
 * @throws {import('jsonwebtoken').TokenExpiredError} If the token has expired
 * @throws {import('jsonwebtoken').JsonWebTokenError} If the token is invalid/malformed
 */
function verifyAccessToken(token) {
  const decoded = jwt.verify(token, config.auth.jwtAccessSecret);
  if (decoded.type !== TOKEN_TYPE.ACCESS) {
    throw new jwt.JsonWebTokenError('Token type mismatch: expected access token');
  }
  return decoded;
}

/**
 * Verifies and decodes a refresh token.
 *
 * @param {string} token - Raw JWT refresh token string
 * @returns {Object} Decoded payload ({ sub, jti, type, iat, exp })
 * @throws {import('jsonwebtoken').TokenExpiredError} If the token has expired
 * @throws {import('jsonwebtoken').JsonWebTokenError} If the token is invalid/malformed
 */
function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, config.auth.jwtRefreshSecret);
  if (decoded.type !== TOKEN_TYPE.REFRESH) {
    throw new jwt.JsonWebTokenError('Token type mismatch: expected refresh token');
  }
  return decoded;
}

/**
 * Decodes a token WITHOUT verifying its signature. Useful only for
 * non-security-critical inspection (e.g. reading `exp` off an already-
 * validated token). Never use this result to authorize a request.
 *
 * @param {string} token - Raw JWT token string
 * @returns {Object|null} Decoded payload, or null if the token cannot be parsed
 */
function decodeTokenUnsafe(token) {
  return jwt.decode(token);
}

/**
 * Computes the expiry Date of a token from its `exp` claim.
 *
 * @param {string} token - Raw JWT token string
 * @returns {Date|null} Expiry date, or null if the token has no valid exp claim
 */
function getTokenExpiryDate(token) {
  const decoded = decodeTokenUnsafe(token);
  if (!decoded || typeof decoded.exp !== 'number') {
    return null;
  }
  return new Date(decoded.exp * 1000);
}

/**
 * Checks whether a decoded/raw token has already expired, based on its
 * `exp` claim, without throwing.
 *
 * @param {string} token - Raw JWT token string
 * @returns {boolean} True if expired or unparsable, false if still valid
 */
function isTokenExpired(token) {
  const expiryDate = getTokenExpiryDate(token);
  if (!expiryDate) return true;
  return expiryDate.getTime() < Date.now();
}

module.exports = {
  TOKEN_TYPE,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeTokenUnsafe,
  getTokenExpiryDate,
  isTokenExpired,
};
