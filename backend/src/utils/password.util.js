/**
 * password.util.js
 *
 * Centralized password hashing and verification using bcrypt. Salt rounds
 * are configurable via BCRYPT_SALT_ROUNDS (see config/env.js) rather than
 * hardcoded, so the cost factor can be tuned per environment without a
 * code change.
 */

'use strict';

const bcrypt = require('bcrypt');
const config = require('../config/env');

/**
 * Hashes a plaintext password using bcrypt with the configured salt rounds.
 *
 * @param {string} plainPassword - The plaintext password to hash
 * @returns {Promise<string>} The resulting bcrypt hash
 * @throws {Error} If plainPassword is not a non-empty string
 */
async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(plainPassword, config.auth.bcryptSaltRounds);
}

/**
 * Verifies a plaintext password against a previously generated bcrypt hash.
 *
 * @param {string} plainPassword - The plaintext password provided by the user
 * @param {string} passwordHash - The stored bcrypt hash to compare against
 * @returns {Promise<boolean>} True if the password matches the hash
 * @throws {Error} If either argument is not a non-empty string
 */
async function verifyPassword(plainPassword, passwordHash) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
    throw new Error('Password hash must be a non-empty string');
  }
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
